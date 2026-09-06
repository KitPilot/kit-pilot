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

	if (run.failures.length > 0) {
		lines.push(`## Incomplete`)
		lines.push("")
		lines.push(`${run.failures.length} case(s) did not run. Do not compare this run with another one.`)
		lines.push("")
		for (const failure of run.failures) {
			lines.push(`- **${failure.caseId}**: ${failure.reason}`)
		}
		lines.push("")
	}

	lines.push(
		"Both variants are the same build. The baseline turns `find_symbol` off through the " +
			"`disabledTools` setting, which drops the tool and its description from the request. " +
			"Nothing else differs, and the order of the two flips on every trial.",
	)
	lines.push("")
	lines.push("Each cell gives the median, then the range and the sample standard deviation.")
	lines.push("")

	// One table for each case, so nothing is added across cases. The two rename
	// cases use different module systems and the language provider does not
	// behave the same in each, thus an average over them would hide what they
	// were built to measure.
	for (const caseId of caseIds(run)) {
		const rows = run.cases.filter((summary) => summary.caseId === caseId)
		const category = rows[0]?.category ?? ""

		lines.push(`### ${caseId} (${category})`)
		lines.push("")
		lines.push(
			"| Variant | Pass rate | Behavior run | Measured | Exploratory calls | Edit calls | Shell calls | Elapsed | Cost |",
		)
		lines.push(
			"| ------- | --------- | ------------ | -------- | ----------------- | ---------- | ----------- | ------- | ---- |",
		)

		for (const summary of rows) {
			lines.push(
				[
					"",
					summary.variant,
					`${summary.passed}/${summary.trials}`,
					summary.behaviorChecked === summary.trials ? "all" : `${summary.behaviorChecked}/${summary.trials}`,
					summary.measured === summary.trials ? "all" : `${summary.measured}/${summary.trials}`,
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
	}

	lines.push("")
	lines.push("## Trials")
	lines.push("")

	for (const trial of run.trialResults) {
		const verdict = trial.passed ? "PASS" : "FAIL"
		const notes: string[] = []
		if (trial.timedOut) notes.push("timed out")
		if (trial.aborted) notes.push("aborted")
		if (trial.usageMissing) notes.push("no usage reported, left out of the statistics")
		if (trial.error) notes.push(trial.error)
		if (!trial.behaviorChecked && trial.passed) {
			notes.push("the grader read the code and did not run it")
		}

		lines.push(
			`- **${verdict}** ${trial.caseId} · ${trial.variant} · trial ${trial.trial}: ${trial.detail}` +
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
	lines.push("")
	lines.push(
		"The Measured column says how many trials reported usage. A trial that reported " +
			"none did not run, so it counts against the pass rate but stays out of the call " +
			"and cost statistics, where its zeros would look like a cheap trial.",
	)
	lines.push("")
	lines.push(
		"The Behavior run column says how many trials had their code run by the grader. A pass " +
			"where the grader only read the code is a weaker result, so read a case whose count " +
			"is below its trial count with that in mind.",
	)
	lines.push("")
	lines.push(
		"Read each case on its own. `reference-rename` is CommonJS and `reference-rename-ts` is " +
			"TypeScript with ESM imports, and the language provider does not behave the same in " +
			"the two. An average over them would hide that.",
	)

	return lines.join("\n") + "\n"
}

/** The case ids in the order they first appear, so the report keeps that order. */
function caseIds(run: EvalRun): string[] {
	const seen: string[] = []
	for (const summary of run.cases) {
		if (!seen.includes(summary.caseId)) {
			seen.push(summary.caseId)
		}
	}
	return seen
}

export function countPassed(trials: TrialResult[]): number {
	return trials.filter((trial) => trial.passed).length
}

export function overallPassRate(cases: CaseSummary[]): number {
	const trials = cases.reduce((sum, summary) => sum + summary.trials, 0)
	const passed = cases.reduce((sum, summary) => sum + summary.passed, 0)
	return trials === 0 ? 0 : passed / trials
}
