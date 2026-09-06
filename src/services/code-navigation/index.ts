import * as path from "path"
import * as vscode from "vscode"

import type { KitPilotIgnoreController } from "../../core/ignore/KitPilotIgnoreController"
import { execRipgrep, getBinPath, truncateLine } from "../ripgrep"

/**
 * Definition and reference lookup through the language providers that VS Code
 * already has.
 *
 * A task otherwise answers "where is this defined?" and "who calls this?" by
 * reading files until it finds the answer. VS Code exposes the same lookups
 * that a person gets from "Go to Definition" and "Find All References", through
 * its built-in commands. They need no index of our own, no Ollama and no
 * Qdrant. They give an answer only for a language whose extension is installed,
 * so the caller falls back to a text search.
 */

/** The most results to return. A wide reference list must not fill the context. */
export const MAX_RESULTS = 40

/**
 * Where a location came from.
 *
 * "provider" means a language provider resolved it, so it is the symbol that
 * was asked for. "text" means the name appears there. A text match can sit in
 * a comment or a string, and it can be a different symbol that shares the
 * name, thus it needs a look before it is changed.
 */
export type LocationSource = "provider" | "text"

export interface SymbolLocation {
	/** Where the location came from. */
	source: LocationSource
	/** Path relative to the workspace. */
	path: string
	/** One-based line number. */
	line: number
	/** One-based column. */
	column: number
	/** The source line, trimmed. */
	text: string
	/** For a definition: the kind that the provider reported, for example "Function". */
	kind?: string
	/** For a definition: the name of what contains it, when the provider gives one. */
	container?: string
}

export interface LookupResult {
	locations: SymbolLocation[]
	/** How many results were found above MAX_RESULTS. */
	omitted: number
	/** True when no language provider answered. */
	usedFallback: boolean
	/**
	 * True when a text search added a location that the provider missed.
	 *
	 * Measured in VS Code 1.107 on a CommonJS JavaScript project: the reference
	 * provider reported the two uses inside the declaring file and none of the
	 * three uses in other files, even with every file open. The language service
	 * builds no project-wide index across `require` in that setup. A reference
	 * list that is short by three call sites would let a rename look finished
	 * when it is not, thus `findReferences` joins a text search to the provider.
	 */
	joinedTextSearch?: boolean
}

/**
 * Finds where a symbol is defined.
 *
 * `vscode.executeWorkspaceSymbolProvider` searches the whole workspace by name,
 * so it needs no position. It matches loosely, thus this keeps exact names
 * only. A loose match would send the task to the wrong file, which is worse
 * than no answer.
 */
export async function findDefinitions(
	symbol: string,
	cwd: string,
	ignoreController?: KitPilotIgnoreController,
): Promise<LookupResult> {
	const symbols = await executeCommand<vscode.SymbolInformation[]>("vscode.executeWorkspaceSymbolProvider", symbol)

	const exact = (symbols ?? []).filter((entry) => entry.name === symbol)
	const allowed = exact.filter((entry) => isAllowed(entry.location.uri, cwd, ignoreController))

	if (allowed.length === 0) {
		return { locations: [], omitted: 0, usedFallback: true }
	}

	const locations: SymbolLocation[] = []
	for (const entry of allowed.slice(0, MAX_RESULTS)) {
		locations.push({
			...(await describeLocation(entry.location.uri, entry.location.range.start, cwd, "provider")),
			kind: vscode.SymbolKind[entry.kind],
			container: entry.containerName || undefined,
		})
	}

	return { locations, omitted: Math.max(0, allowed.length - MAX_RESULTS), usedFallback: false }
}

/**
 * Finds where a symbol is used.
 *
 * A reference provider needs a position, not a name. Thus this first finds the
 * declaration, then asks at the position of the name on that line. The provider
 * reports the declaration among the references, which is correct and useful, so
 * it stays in the list.
 *
 * The provider alone is not enough. See `joinedTextSearch`. This therefore
 * joins a whole-word text search to the provider's answer and removes the
 * duplicates. The provider finds a use that a text search cannot, such as an
 * import under another name. The text search finds a use in a file that the
 * language service never loaded.
 *
 * Every location keeps the source it came from, because the two are not of
 * equal worth. A text match can sit in a comment or a string, and it can be a
 * different symbol that shares the name. The join raises what the answer
 * covers. It does not prove that the answer is complete, and it cannot show
 * that a rename touched every use.
 */
export async function findReferences(
	symbol: string,
	cwd: string,
	ignoreController?: KitPilotIgnoreController,
): Promise<LookupResult> {
	const [fromProvider, fromText] = await Promise.all([
		referencesFromProvider(symbol, cwd, ignoreController),
		searchIdentifier(symbol, cwd, ignoreController),
	])

	// The text entries go in first, so a location that both found keeps the
	// provider as its source. A resolved location is worth more than a match.
	const merged = new Map<string, SymbolLocation>()
	for (const location of [...fromText, ...fromProvider]) {
		merged.set(`${location.path}:${location.line}:${location.column}`, location)
	}

	const all = [...merged.values()].sort(
		(a, b) => a.path.localeCompare(b.path) || a.line - b.line || a.column - b.column,
	)

	const joinedTextSearch = all.some((location) => location.source === "text")

	return {
		locations: all.slice(0, MAX_RESULTS),
		omitted: Math.max(0, all.length - MAX_RESULTS),
		usedFallback: fromProvider.length === 0,
		joinedTextSearch,
	}
}

async function referencesFromProvider(
	symbol: string,
	cwd: string,
	ignoreController?: KitPilotIgnoreController,
): Promise<SymbolLocation[]> {
	const anchor = await findAnchor(symbol, cwd, ignoreController)
	if (!anchor) {
		return []
	}

	const found = await executeCommand<vscode.Location[]>(
		"vscode.executeReferenceProvider",
		anchor.uri,
		anchor.position,
	)

	const allowed = (found ?? []).filter((location) => isAllowed(location.uri, cwd, ignoreController))

	const locations: SymbolLocation[] = []
	for (const location of allowed) {
		locations.push(await describeLocation(location.uri, location.range.start, cwd, "provider"))
	}
	return locations
}

/**
 * A whole-word text search for the name, through ripgrep.
 *
 * Whole words only, because a search for `parse` must not report `parseConfig`.
 * A fixed string, because the name is a name and not a pattern.
 */
async function searchIdentifier(
	symbol: string,
	cwd: string,
	ignoreController?: KitPilotIgnoreController,
): Promise<SymbolLocation[]> {
	let output: string
	try {
		const bin = await getBinPath(vscode.env.appRoot)
		if (!bin) {
			return []
		}
		output = await execRipgrep(bin, ["--json", "--word-regexp", "--fixed-strings", "-e", symbol, cwd])
	} catch {
		return []
	}

	const locations: SymbolLocation[] = []

	for (const line of output.split("\n")) {
		if (!line) {
			continue
		}
		let parsed: RipgrepMatch
		try {
			parsed = JSON.parse(line) as RipgrepMatch
		} catch {
			continue
		}
		if (parsed.type !== "match" || !parsed.data) {
			continue
		}

		const fsPath = parsed.data.path?.text
		if (!fsPath) {
			continue
		}
		if (!isAllowed(vscode.Uri.file(fsPath), cwd, ignoreController)) {
			continue
		}

		const column = (parsed.data.submatches?.[0]?.start ?? 0) + 1
		locations.push({
			source: "text",
			path: toRelative(vscode.Uri.file(fsPath), cwd),
			line: parsed.data.line_number ?? 0,
			column,
			text: truncateLine((parsed.data.lines?.text ?? "").replace(/\r?\n$/, "")).trim(),
		})
	}

	return locations
}

interface RipgrepMatch {
	type?: string
	data?: {
		path?: { text?: string }
		line_number?: number
		lines?: { text?: string }
		submatches?: Array<{ start?: number }>
	}
}

interface Anchor {
	uri: vscode.Uri
	position: vscode.Position
}

/**
 * Finds a position on the symbol's name, which a reference provider needs.
 *
 * A workspace symbol gives the range of the whole declaration, and that range
 * can start at a keyword rather than at the name. Thus this reads the line and
 * moves to the name. A provider asked at the keyword returns nothing.
 */
async function findAnchor(
	symbol: string,
	cwd: string,
	ignoreController?: KitPilotIgnoreController,
): Promise<Anchor | undefined> {
	const symbols = await executeCommand<vscode.SymbolInformation[]>("vscode.executeWorkspaceSymbolProvider", symbol)
	const exact = (symbols ?? []).find(
		(entry) => entry.name === symbol && isAllowed(entry.location.uri, cwd, ignoreController),
	)

	if (!exact) {
		return undefined
	}

	const start = exact.location.range.start
	const line = await readLine(exact.location.uri, start.line)
	const column = line?.indexOf(symbol) ?? -1

	return {
		uri: exact.location.uri,
		position: column === -1 ? start : new vscode.Position(start.line, column),
	}
}

async function describeLocation(
	uri: vscode.Uri,
	position: vscode.Position,
	cwd: string,
	source: LocationSource,
): Promise<SymbolLocation> {
	const line = await readLine(uri, position.line)

	return {
		source,
		path: toRelative(uri, cwd),
		line: position.line + 1,
		column: position.character + 1,
		text: (line ?? "").trim(),
	}
}

async function readLine(uri: vscode.Uri, line: number): Promise<string | undefined> {
	try {
		const document = await vscode.workspace.openTextDocument(uri)
		if (line < 0 || line >= document.lineCount) {
			return undefined
		}
		return document.lineAt(line).text
	} catch {
		return undefined
	}
}

function toRelative(uri: vscode.Uri, cwd: string): string {
	const relative = path.relative(cwd, uri.fsPath)
	return relative.startsWith("..") ? uri.fsPath : relative.split(path.sep).join("/")
}

function isAllowed(uri: vscode.Uri, cwd: string, ignoreController?: KitPilotIgnoreController): boolean {
	if (uri.scheme !== "file") {
		return false
	}
	// A definition in node_modules or outside the workspace is rarely what the
	// task needs, and it makes the list long.
	const relative = path.relative(cwd, uri.fsPath)
	if (relative.startsWith("..") || relative.split(path.sep).includes("node_modules")) {
		return false
	}
	return ignoreController?.validateAccess(relative) ?? true
}

/**
 * Runs a built-in command and treats any failure as "no answer".
 *
 * A language extension can be missing, still starting, or broken. None of those
 * must stop the task, because the caller falls back to a text search.
 */
async function executeCommand<T>(command: string, ...args: unknown[]): Promise<T | undefined> {
	try {
		return await vscode.commands.executeCommand<T>(command, ...args)
	} catch {
		return undefined
	}
}
