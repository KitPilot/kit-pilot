import type { CaseSummary, EvalRun, Stat, TrialResult } from "./types"

function round(value: number, digits = 1): string {
	return value.toFixed(digits)
}

function seconds(ms: number): string {
	return `${round(ms / 1000)}s`
}

function statCell(value: Stat, format: (n: number) => string): string {
	return `${format(value.median)} (${format(value.min)}–${format(value.max)}, sd ${format(value.stdDev)})`
}

/**
 * Writes the report as Markdown.
 *
 * The report states the median, the range and the standard deviation for every
 * measure, not the mean alone. A model gives a different answer each run, so a
 * single number hides how wide the spread is.
 */
export function renderReport(run: EvalRun): string {
	const lines: string[] = []

	lines.push(`# KitPilot evaluation: ${run.label}`)
	lines.push("")
	lines.push(`- Started: ${run.startedAt}`)
	lines.push(`- Extension version: ${run.extensionVersion}`)
	lines.push(`- VS Code version: ${run.vscodeVersion}`)
	lines.push(`- Model: ${run.modelId}`)
	lines.push(`- Trials per case: ${run.trialsPerCase}`)
	lines.push("")
	lines.push("Each cell gives the median, then the range and the sample standard deviation.")
	lines.push("")
	lines.push("| Case | Category | Pass rate | Exploratory calls | Edit calls | Shell calls | Elapsed | Cost |")
	lines.push("| ---- | -------- | --------- | ----------------- | ---------- | ----------- | ------- | ---- |")

	for (const summary of run.cases) {
		lines.push(
			[
				"",
				summary.caseId,
				summary.category,
				`${summary.passed}/${summary.trials}`,
				statCell(summary.exploratoryCalls, (n) => round(n)),
				statCell(summary.editCalls, (n) => round(n)),
				statCell(summary.shellCalls, (n) => round(n)),
				statCell(summary.elapsedMs, seconds),
				statCell(summary.cost, (n) => `$${n.toFixed(3)}`),
				"",
			].join(" | "),
		)
	}

	lines.push("")
	lines.push("## Trials")
	lines.push("")

	for (const trial of run.trialResults) {
		const verdict = trial.passed ? "PASS" : "FAIL"
		const notes: string[] = []
		if (trial.timedOut) notes.push("timed out")
		if (trial.aborted) notes.push("aborted")
		if (trial.error) notes.push(trial.error)

		lines.push(
			`- **${verdict}** ${trial.caseId} trial ${trial.trial}: ${trial.detail}` +
				(notes.length > 0 ? ` (${notes.join("; ")})` : ""),
		)
		lines.push(
			`  - ${trial.tools.exploratoryCalls} exploratory, ${trial.tools.editCalls} edit, ` +
				`${trial.tools.shellCalls} shell, ${trial.tools.totalCalls} calls total, ` +
				`${trial.tools.failedCalls} failed; ${seconds(trial.elapsedMs)}; $${trial.cost.toFixed(4)}`,
		)
		const byTool = Object.entries(trial.tools.byTool)
			.map(([name, count]) => `${name}=${count}`)
			.join(" ")
		if (byTool) {
			lines.push(`  - ${byTool}`)
		}
	}

	lines.push("")
	lines.push("## How to read this")
	lines.push("")
	lines.push(
		"The pass rate is task correctness. A trial passes only if the grader, which reads the " +
			"workspace and not the transcript, says the code does what the prompt asked.",
	)
	lines.push("")
	lines.push(
		"Exploratory calls are `read_file`, `search_files`, `list_files` and `codebase_search`. " +
			"Shell calls are counted apart, because a shell call can search or build and the record " +
			"does not say which.",
	)
	lines.push("")
	lines.push(
		"A change is worth accepting only if the pass rate does not fall. A lower number of " +
			"exploratory calls with a lower pass rate is not an improvement.",
	)

	return lines.join("\n") + "\n"
}

export function countPassed(trials: TrialResult[]): number {
	return trials.filter((trial) => trial.passed).length
}

export function overallPassRate(cases: CaseSummary[]): number {
	const trials = cases.reduce((sum, summary) => sum + summary.trials, 0)
	const passed = cases.reduce((sum, summary) => sum + summary.passed, 0)
	return trials === 0 ? 0 : passed / trials
}
