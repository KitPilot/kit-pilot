import * as assert from "assert"

import { renderReport } from "../report"
import type { EvalRun } from "../types"

function run(overrides: Partial<EvalRun> = {}): EvalRun {
	return {
		startedAt: "2026-09-06T00:00:00.000Z",
		label: "baseline",
		modelId: "test-model",
		extensionVersion: "0.2.5",
		vscodeVersion: "1.107.0",
		trialsPerCase: 3,
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
})
