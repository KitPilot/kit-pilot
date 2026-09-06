import type { ToolUsage } from "@kit-pilot/types"

import type { CaseSummary, EvalCategory, EvalVariant, Stat, ToolSummary, TrialResult } from "./types"

/**
 * Calls that look for something rather than change something.
 *
 * This is the number that definition and reference lookup (TODO Tier 2 #14) is
 * expected to lower. If the model can ask "where is this defined?", it should
 * need fewer reads and searches to find the same code.
 */
export const EXPLORATORY_TOOLS: readonly string[] = ["read_file", "search_files", "list_files", "codebase_search"]

/** Calls that change a file. */
export const EDIT_TOOLS: readonly string[] = [
	"write_to_file",
	"apply_diff",
	"edit",
	"search_and_replace",
	"search_replace",
	"edit_file",
	"apply_patch",
]

/**
 * Shell calls.
 *
 * These are counted apart from the exploratory calls on purpose. A shell call
 * can be a search (`grep`) or a build (`node test/run.js`), and the tool usage
 * record does not say which. Putting them in either group would make the
 * exploratory number wrong, so the report shows them as their own column.
 */
export const SHELL_TOOLS: readonly string[] = ["execute_command", "read_command_output"]

export function summarizeToolUsage(usage: ToolUsage | undefined): ToolSummary {
	const summary: ToolSummary = {
		exploratoryCalls: 0,
		editCalls: 0,
		shellCalls: 0,
		totalCalls: 0,
		failedCalls: 0,
		byTool: {},
	}

	for (const [name, counts] of Object.entries(usage ?? {})) {
		const attempts = counts?.attempts ?? 0
		const failures = counts?.failures ?? 0
		if (attempts === 0 && failures === 0) {
			continue
		}

		summary.byTool[name] = attempts
		summary.totalCalls += attempts
		summary.failedCalls += failures

		if (EXPLORATORY_TOOLS.includes(name)) {
			summary.exploratoryCalls += attempts
		} else if (EDIT_TOOLS.includes(name)) {
			summary.editCalls += attempts
		} else if (SHELL_TOOLS.includes(name)) {
			summary.shellCalls += attempts
		}
	}

	return summary
}

/**
 * Adds two tool usage records together.
 *
 * A trial can have subtasks, and each task reports its own usage. Summing the
 * latest record of every task gives the usage of the whole run.
 */
export function mergeToolUsage(a: ToolUsage | undefined, b: ToolUsage | undefined): ToolUsage {
	const merged: Record<string, { attempts: number; failures: number }> = {}

	for (const usage of [a, b]) {
		for (const [name, counts] of Object.entries(usage ?? {})) {
			const existing = merged[name] ?? { attempts: 0, failures: 0 }
			merged[name] = {
				attempts: existing.attempts + (counts?.attempts ?? 0),
				failures: existing.failures + (counts?.failures ?? 0),
			}
		}
	}

	return merged as ToolUsage
}

/**
 * The order to run the variants in for a given trial number.
 *
 * A run takes a long time, and a machine does not stay the same throughout: a
 * model can slow down, a cache warms, another program starts. Running every
 * baseline trial and then every treatment trial would put all of that drift on
 * one side of the comparison. Alternating the order spreads it.
 */
export function variantOrder(trial: number, variants: readonly EvalVariant[]): EvalVariant[] {
	return trial % 2 === 0 ? [...variants].reverse() : [...variants]
}

export function stat(values: number[]): Stat {
	if (values.length === 0) {
		return { mean: 0, median: 0, min: 0, max: 0, stdDev: 0 }
	}

	const sorted = [...values].sort((a, b) => a - b)
	const at = (index: number): number => sorted[index] ?? 0
	const mean = values.reduce((sum, value) => sum + value, 0) / values.length
	const middle = Math.floor(sorted.length / 2)
	const median = sorted.length % 2 === 0 ? (at(middle - 1) + at(middle)) / 2 : at(middle)

	// Sample standard deviation. One trial gives no spread, so report 0 rather
	// than divide by zero.
	const stdDev =
		values.length < 2
			? 0
			: Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1))

	return { mean, median, min: at(0), max: at(sorted.length - 1), stdDev }
}

export function summarizeCase(
	caseId: string,
	variant: EvalVariant,
	category: EvalCategory,
	trials: TrialResult[],
): CaseSummary {
	const passed = trials.filter((trial) => trial.passed).length

	// A trial that reported no usage at all did not run. Its zeros would lower
	// the median number of calls and the median cost, which would make a worse
	// implementation look cheaper. Thus the call and cost statistics leave it
	// out, and the summary says how many were left out. The pass rate still
	// counts it, because a trial that did not run did not do the task.
	const measured = trials.filter((trial) => !trial.usageMissing)

	return {
		caseId,
		variant,
		category,
		trials: trials.length,
		passed,
		// A pass whose grader only read the code is weaker than one that ran it.
		behaviorChecked: trials.filter((trial) => trial.behaviorChecked).length,
		passRate: trials.length === 0 ? 0 : passed / trials.length,
		measured: measured.length,
		elapsedMs: stat(measured.map((trial) => trial.elapsedMs)),
		exploratoryCalls: stat(measured.map((trial) => trial.tools.exploratoryCalls)),
		editCalls: stat(measured.map((trial) => trial.tools.editCalls)),
		shellCalls: stat(measured.map((trial) => trial.tools.shellCalls)),
		totalCalls: stat(measured.map((trial) => trial.tools.totalCalls)),
		cost: stat(measured.map((trial) => trial.cost)),
	}
}
