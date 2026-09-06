import { type ClineSayTool } from "@kit-pilot/types"

import { Task } from "../task/Task"
import { findDefinitions, findReferences, type LookupResult, type SymbolLocation } from "../../services/code-navigation"
import type { ToolUse } from "../../shared/tools"

import { BaseTool, ToolCallbacks } from "./BaseTool"

type Lookup = "definition" | "references"

interface FindSymbolParams {
	symbol: string
	lookup: Lookup
}

export class FindSymbolTool extends BaseTool<"find_symbol"> {
	readonly name = "find_symbol" as const

	async execute(params: FindSymbolParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { askApproval, handleError, pushToolResult } = callbacks
		const { symbol, lookup } = params

		if (!symbol?.trim()) {
			task.consecutiveMistakeCount++
			task.recordToolError("find_symbol")
			task.didToolFailInCurrentTurn = true
			pushToolResult(await task.sayAndCreateMissingParamError("find_symbol", "symbol"))
			return
		}

		if (lookup !== "definition" && lookup !== "references") {
			task.consecutiveMistakeCount++
			task.recordToolError("find_symbol")
			task.didToolFailInCurrentTurn = true
			pushToolResult(await task.sayAndCreateMissingParamError("find_symbol", "lookup"))
			return
		}

		task.consecutiveMistakeCount = 0

		const sharedMessageProps: ClineSayTool = {
			tool: "findSymbol",
			symbol: symbol.trim(),
			lookup,
		}

		try {
			const result =
				lookup === "definition"
					? await findDefinitions(symbol.trim(), task.cwd, task.kitpilotIgnoreController)
					: await findReferences(symbol.trim(), task.cwd, task.kitpilotIgnoreController)

			const text = formatResult(symbol.trim(), lookup, result)

			const completeMessage = JSON.stringify({
				...sharedMessageProps,
				content: text,
				matchCount: result.locations.length,
			} satisfies ClineSayTool)

			const didApprove = await askApproval("tool", completeMessage)
			if (!didApprove) {
				return
			}

			pushToolResult(text)
		} catch (error) {
			await handleError("finding the symbol", error as Error)
		}
	}

	override async handlePartial(task: Task, block: ToolUse<"find_symbol">): Promise<void> {
		const partialMessage = JSON.stringify({
			tool: "findSymbol",
			symbol: block.params.symbol ?? "",
			lookup: (block.params.lookup as Lookup) ?? "definition",
			content: "",
		} satisfies ClineSayTool)

		await task.ask("tool", partialMessage, block.partial).catch(() => {})
	}
}

/**
 * Formats the result for the model.
 *
 * When nothing is found the message says what to do next. A tool that answers
 * "no results" and stops there sends the task back to reading files one after
 * another, which is the cost this tool exists to remove.
 */
export function formatResult(symbol: string, lookup: Lookup, result: LookupResult): string {
	const noun = lookup === "definition" ? "definition" : "reference"

	if (result.locations.length === 0) {
		return [
			`No ${noun} found for "${symbol}".`,
			"",
			result.usedFallback
				? "No language provider answered. The language extension may not be installed, or the name may not be a symbol it knows."
				: "The provider answered but every result was outside the workspace or ignored.",
			`Use search_files with the regex "${escapeForMessage(symbol)}" instead.`,
		].join("\n")
	}

	const lines: string[] = []
	const plural = result.locations.length === 1 ? "" : "s"
	lines.push(`${result.locations.length} ${noun}${plural} of "${symbol}":`)
	lines.push("")

	for (const [file, locations] of groupByFile(result.locations)) {
		lines.push(file)
		for (const location of locations) {
			lines.push(`  ${location.line}:${location.column}  ${describe(location)}`)
		}
	}

	if (result.omitted > 0) {
		lines.push("")
		lines.push(`${result.omitted} more not shown. Narrow the search with search_files if you need them all.`)
	}

	if (lookup === "references") {
		lines.push("")
		lines.push(...describeReferenceSources(result))
	}

	return lines.join("\n")
}

/**
 * States where a reference list came from.
 *
 * The two sources are not of equal worth. A provider resolved its locations, so
 * each one is the symbol that was asked for. A text match only shares the name:
 * it can sit in a comment or a string, and it can be a different symbol
 * altogether. Reporting one number for both would hide that.
 *
 * None of this proves the list is complete. It cannot, so the text says so.
 */
function describeReferenceSources(result: LookupResult): string[] {
	const fromProvider = result.locations.filter((location) => location.source === "provider").length
	const fromText = result.locations.length - fromProvider
	const lines: string[] = []

	if (result.usedFallback) {
		lines.push("No language provider answered, so every line above is a text match.")
	} else if (fromText > 0) {
		lines.push(`${fromProvider} came from the language provider, marked [provider].`)
		lines.push(`${fromText} came from a text search alone, marked [text].`)
	} else {
		lines.push("Every line above came from the language provider.")
	}

	if (fromText > 0) {
		lines.push("A text match can be in a comment or a string, and it can be a different")
		lines.push("symbol with the same name. Read each one before you change it.")
	}

	lines.push("This list does not prove that every use is here. Do not treat it as proof")
	lines.push("that a rename is complete.")

	return lines
}

function describe(location: SymbolLocation): string {
	const source = `[${location.source}] `
	const prefix = location.kind ? `${location.kind} ` : ""
	const suffix = location.container ? ` (in ${location.container})` : ""
	return `${source}${prefix}${location.text}${suffix}`
}

function groupByFile(locations: SymbolLocation[]): Map<string, SymbolLocation[]> {
	const grouped = new Map<string, SymbolLocation[]>()
	for (const location of locations) {
		const existing = grouped.get(location.path)
		if (existing) {
			existing.push(location)
		} else {
			grouped.set(location.path, [location])
		}
	}
	return grouped
}

function escapeForMessage(symbol: string): string {
	return symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export const findSymbolTool = new FindSymbolTool()
