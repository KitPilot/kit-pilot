import * as assert from "assert"

import { renderReport } from "../report"
import type { CaseSummary, EvalRun } from "../types"

const NO_STAT = { mean: 0, median: 0, min: 0, max: 0, stdDev: 0 }

function summary(caseId: string, variant: "baseline" | "treatment"): CaseSummary {
	return {
		caseId,
		variant,
		category: "cross-file-refactor",
		trials: 3,
		passed: 2,
		passRate: 2 / 3,
		measured: 3,
		behaviorChecked: 3,
		elapsedMs: NO_STAT,
		exploratoryCalls: NO_STAT,
		editCalls: NO_STAT,
		shellCalls: NO_STAT,
		totalCalls: NO_STAT,
		cost: NO_STAT,
	}
}

function run(overrides: Partial<EvalRun> = {}): EvalRun {
	return {
		startedAt: "2026-09-06T00:00:00.000Z",
		label: "baseline",
		modelId: "test-model",
		extensionVersion: "0.2.5",
		vscodeVersion: "1.107.0",
		trialsPerCase: 3,
		variants: ["baseline", "treatment"],
		cases: [],
		trialResults: [],
		failures: [],
		...overrides,
	}
}

suite("evals/report", () => {
	// A run that lost a case must not read like a finished run with fewer cases.
	// A missing sign-in or a VS Code that will not start would otherwise produce
	// a clean-looking report with nothing in it.
	test("marks a run incomplete when a case did not run", () => {
		const text = renderReport(
			run({ failures: [{ caseId: "failing-test", reason: "No Copilot model is available" }] }),
		)

		assert.ok(text.includes("## Incomplete"), text)
		assert.ok(text.includes("Do not compare this run with another one"), text)
		assert.ok(text.includes("failing-test"), text)
		assert.ok(text.includes("No Copilot model is available"), text)
	})

	test("says nothing about incompleteness when every case ran", () => {
		assert.ok(!renderReport(run()).includes("## Incomplete"))
	})

	test("names the VS Code version it ran against", () => {
		assert.ok(renderReport(run()).includes("VS Code version: 1.107.0"))
	})

	// The comparison only means something if the reader knows the two variants
	// are the same build with one setting changed.
	test("says what separates the two variants", () => {
		const text = renderReport(run())

		assert.ok(text.includes("Both variants are the same build"), text)
		assert.ok(text.includes("disabledTools"), text)
		assert.ok(text.includes("flips on every trial"), text)
	})

	// The two rename cases use different module systems, and the provider does
	// not behave the same in each. One table for each case keeps them apart.
	test("gives each case its own table with a row for each variant", () => {
		const text = renderReport(
			run({
				cases: [
					summary("reference-rename", "baseline"),
					summary("reference-rename", "treatment"),
					summary("reference-rename-ts", "baseline"),
					summary("reference-rename-ts", "treatment"),
				],
			}),
		)

		assert.ok(text.includes("### reference-rename (cross-file-refactor)"), text)
		assert.ok(text.includes("### reference-rename-ts (cross-file-refactor)"), text)
		assert.ok(text.includes("An average over them would hide that"), text)
	})

	test("says how many trials had their behavior run", () => {
		const text = renderReport(
			run({ cases: [{ ...summary("reference-rename-ts", "treatment"), trials: 3, behaviorChecked: 1 }] }),
		)

		assert.ok(text.includes("| 1/3 |"), text)
		assert.ok(text.includes("The Behavior run column"), text)
	})

	test("marks a passing trial whose code was not run", () => {
		const text = renderReport(
			run({
				trialResults: [
					{
						caseId: "reference-rename-ts",
						variant: "treatment",
						trial: 1,
						passed: true,
						detail: "renamed",
						behaviorChecked: false,
						elapsedMs: 1000,
						timedOut: false,
						aborted: false,
						usageMissing: false,
						tools: {
							exploratoryCalls: 1,
							editCalls: 1,
							shellCalls: 0,
							totalCalls: 2,
							failedCalls: 0,
							byTool: {},
						},
						tokensIn: 10,
						tokensOut: 5,
						cost: 0,
					},
				],
			}),
		)

		assert.ok(text.includes("reference-rename-ts · treatment · trial 1"), text)
		assert.ok(text.includes("the grader read the code and did not run it"), text)
	})
})
