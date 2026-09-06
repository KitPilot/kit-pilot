import { beforeEach, describe, expect, it, vi } from "vitest"

const executeCommand = vi.fn()
const openTextDocument = vi.fn()
const execRipgrep = vi.fn()

vi.mock("vscode", () => {
	class Position {
		constructor(
			public line: number,
			public character: number,
		) {}
	}

	return {
		commands: { executeCommand: (...args: unknown[]) => executeCommand(...args) },
		workspace: { openTextDocument: (...args: unknown[]) => openTextDocument(...args) },
		env: { appRoot: "/app" },
		Uri: { file: (fsPath: string) => ({ scheme: "file", fsPath }) },
		Position,
		SymbolKind: { 11: "Function", 4: "Class", Function: 11, Class: 4 },
	}
})

vi.mock("../../ripgrep", () => ({
	getBinPath: () => Promise.resolve("/app/rg"),
	execRipgrep: (...args: unknown[]) => execRipgrep(...args),
	truncateLine: (line: string) => line,
}))

import { findDefinitions, findReferences, MAX_RESULTS } from "../index"

const CWD = "/repo"

function uri(fsPath: string) {
	return { scheme: "file", fsPath }
}

function symbolAt(name: string, fsPath: string, line: number, character = 0, kind = 11, containerName = "") {
	return {
		name,
		kind,
		containerName,
		location: { uri: uri(fsPath), range: { start: { line, character } } },
	}
}

function documentWith(lines: string[]) {
	return {
		lineCount: lines.length,
		lineAt: (line: number) => ({ text: lines[line] ?? "" }),
	}
}

/** One ripgrep --json match line. */
function rgMatch(fsPath: string, line: number, column: number, text: string) {
	return JSON.stringify({
		type: "match",
		data: {
			path: { text: fsPath },
			line_number: line,
			lines: { text: `${text}\n` },
			submatches: [{ start: column }],
		},
	})
}

beforeEach(() => {
	executeCommand.mockReset()
	openTextDocument.mockReset()
	execRipgrep.mockReset()
	execRipgrep.mockResolvedValue("")
	openTextDocument.mockResolvedValue(documentWith(["// header", "", "function parseConfig(text) {"]))
})

describe("findDefinitions", () => {
	it("returns the definition with its kind and its line", async () => {
		executeCommand.mockResolvedValue([symbolAt("parseConfig", "/repo/src/config/parse.js", 2, 9)])

		const result = await findDefinitions("parseConfig", CWD)

		expect(result.usedFallback).toBe(false)
		expect(result.locations).toEqual([
			{
				path: "src/config/parse.js",
				line: 3,
				column: 10,
				text: "function parseConfig(text) {",
				kind: "Function",
				container: undefined,
			},
		])
	})

	// A workspace symbol provider matches loosely. A near match would send the
	// task to the wrong file, which is worse than no answer.
	it("drops a name that is not exactly the one asked for", async () => {
		executeCommand.mockResolvedValue([
			symbolAt("parseConfigFile", "/repo/src/a.js", 0),
			symbolAt("readConfig", "/repo/src/b.js", 0),
		])

		const result = await findDefinitions("parseConfig", CWD)

		expect(result.locations).toEqual([])
		expect(result.usedFallback).toBe(true)
	})

	it("drops a result in node_modules", async () => {
		executeCommand.mockResolvedValue([symbolAt("parseConfig", "/repo/node_modules/pkg/index.js", 0)])

		expect((await findDefinitions("parseConfig", CWD)).locations).toEqual([])
	})

	it("drops a result outside the workspace", async () => {
		executeCommand.mockResolvedValue([symbolAt("parseConfig", "/elsewhere/parse.js", 0)])

		expect((await findDefinitions("parseConfig", CWD)).locations).toEqual([])
	})

	it("drops a result that .kitpilotignore blocks", async () => {
		executeCommand.mockResolvedValue([symbolAt("parseConfig", "/repo/secret/parse.js", 0)])

		const controller = { validateAccess: vi.fn().mockReturnValue(false) }
		const result = await findDefinitions("parseConfig", CWD, controller as never)

		expect(result.locations).toEqual([])
		expect(controller.validateAccess).toHaveBeenCalledWith("secret/parse.js")
	})

	// A language extension can be missing, still starting, or broken. None of
	// those must stop the task, because the caller falls back to a text search.
	it("reports a fallback when the provider throws", async () => {
		executeCommand.mockRejectedValue(new Error("no provider"))

		const result = await findDefinitions("parseConfig", CWD)

		expect(result.usedFallback).toBe(true)
		expect(result.locations).toEqual([])
	})

	it("caps the list and says how many it left out", async () => {
		const many = Array.from({ length: MAX_RESULTS + 5 }, (_, index) =>
			symbolAt("parseConfig", `/repo/src/file${index}.js`, 0),
		)
		executeCommand.mockResolvedValue(many)

		const result = await findDefinitions("parseConfig", CWD)

		expect(result.locations).toHaveLength(MAX_RESULTS)
		expect(result.omitted).toBe(5)
	})
})

describe("findReferences", () => {
	it("asks the reference provider at the name, not at the start of the range", async () => {
		// The range starts at the `function` keyword. A provider asked there
		// returns nothing, so the lookup has to move to the name.
		openTextDocument.mockResolvedValue(documentWith(["function parseConfig(text) {", "  return 1", "}"]))
		executeCommand.mockImplementation((command: string) => {
			if (command === "vscode.executeWorkspaceSymbolProvider") {
				return Promise.resolve([symbolAt("parseConfig", "/repo/src/config/parse.js", 0, 0)])
			}
			return Promise.resolve([
				{ uri: uri("/repo/src/server/boot.js"), range: { start: { line: 4, character: 8 } } },
			])
		})

		const result = await findReferences("parseConfig", CWD)

		const referenceCall = executeCommand.mock.calls.find((call) => call[0] === "vscode.executeReferenceProvider")
		expect(referenceCall?.[2]).toMatchObject({ line: 0, character: 9 })
		expect(result.locations[0]).toMatchObject({ path: "src/server/boot.js", line: 5, column: 9 })
	})

	it("reports a fallback when the symbol is unknown", async () => {
		executeCommand.mockResolvedValue([])

		const result = await findReferences("parseConfig", CWD)

		expect(result.usedFallback).toBe(true)
		expect(result.locations).toEqual([])
	})

	// Measured in VS Code 1.107 on a CommonJS JavaScript project: the provider
	// reported the two uses inside the declaring file and none of the three uses
	// in other files. A short list would let a rename look finished when it is
	// not, so a text search is joined to the provider.
	it("joins the text search to the provider and removes duplicates", async () => {
		executeCommand.mockImplementation((command: string) =>
			command === "vscode.executeWorkspaceSymbolProvider"
				? Promise.resolve([symbolAt("parseConfig", "/repo/src/config/parse.js", 2, 0)])
				: Promise.resolve([
						{ uri: uri("/repo/src/config/parse.js"), range: { start: { line: 2, character: 9 } } },
					]),
		)
		execRipgrep.mockResolvedValue(
			[
				// The same location the provider gave, one-based from ripgrep.
				rgMatch("/repo/src/config/parse.js", 3, 9, "function parseConfig(text) {"),
				rgMatch("/repo/src/server/boot.js", 5, 12, "const c = parseConfig(t)"),
				rgMatch("/repo/src/cli/main.js", 2, 8, "const { parseConfig } = require(x)"),
			].join("\n"),
		)

		const result = await findReferences("parseConfig", CWD)

		expect(result.locations.map((l) => `${l.path}:${l.line}`)).toEqual([
			"src/cli/main.js:2",
			"src/config/parse.js:3",
			"src/server/boot.js:5",
		])
		expect(result.joinedTextSearch).toBe(true)
		expect(result.usedFallback).toBe(false)
	})

	it("drops a text search hit that .kitpilotignore blocks", async () => {
		executeCommand.mockResolvedValue([])
		execRipgrep.mockResolvedValue(rgMatch("/repo/secret/a.js", 1, 0, "parseConfig()"))

		const controller = { validateAccess: vi.fn().mockReturnValue(false) }
		const result = await findReferences("parseConfig", CWD, controller as never)

		expect(result.locations).toEqual([])
	})

	it("returns the text search alone when no provider answers", async () => {
		executeCommand.mockResolvedValue([])
		execRipgrep.mockResolvedValue(rgMatch("/repo/src/server/boot.js", 5, 12, "parseConfig(t)"))

		const result = await findReferences("parseConfig", CWD)

		expect(result.usedFallback).toBe(true)
		expect(result.locations).toEqual([{ path: "src/server/boot.js", line: 5, column: 13, text: "parseConfig(t)" }])
	})

	it("reports a fallback when the provider returns nothing usable", async () => {
		executeCommand.mockImplementation((command: string) =>
			command === "vscode.executeWorkspaceSymbolProvider"
				? Promise.resolve([symbolAt("parseConfig", "/repo/src/config/parse.js", 0, 0)])
				: Promise.resolve([]),
		)

		expect((await findReferences("parseConfig", CWD)).usedFallback).toBe(true)
	})
})
