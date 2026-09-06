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

	if (lookup === "references" && result.usedFallback) {
		// The list came from a text search alone, so a use under another name is
		// missing. Say so, because a rename that trusts a short list looks done
		// when it is not.
		lines.push("No language provider answered. This list is from a text search, so a")
		lines.push("use under another name, such as a renamed import, may be missing.")
		lines.push("")
	}

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

	return lines.join("\n")
}

function describe(location: SymbolLocation): string {
	const prefix = location.kind ? `${location.kind} ` : ""
	const suffix = location.container ? ` (in ${location.container})` : ""
	return `${prefix}${location.text}${suffix}`
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
