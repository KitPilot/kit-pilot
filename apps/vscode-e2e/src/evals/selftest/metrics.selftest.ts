import * as assert from "assert"

import type { ToolUsage } from "@kit-pilot/types"

import { stat, summarizeCase, summarizeToolUsage } from "../metrics"
import type { TrialResult } from "../types"

function trial(overrides: Partial<TrialResult> & { trial: number }): TrialResult {
	return {
		caseId: "case",
		passed: true,
		detail: "",
		elapsedMs: 1000,
		timedOut: false,
		aborted: false,
		tools: { exploratoryCalls: 0, editCalls: 0, shellCalls: 0, totalCalls: 0, failedCalls: 0, byTool: {} },
		tokensIn: 0,
		tokensOut: 0,
		cost: 0,
		...overrides,
	}
}

suite("evals/metrics", () => {
	test("groups tool calls into exploratory, edit and shell", () => {
		const usage = {
			read_file: { attempts: 7, failures: 1 },
			search_files: { attempts: 3, failures: 0 },
			apply_diff: { attempts: 2, failures: 0 },
			execute_command: { attempts: 4, failures: 2 },
			attempt_completion: { attempts: 1, failures: 0 },
		} as unknown as ToolUsage

		const summary = summarizeToolUsage(usage)

		assert.strictEqual(summary.exploratoryCalls, 10)
		assert.strictEqual(summary.editCalls, 2)
		assert.strictEqual(summary.shellCalls, 4)
		assert.strictEqual(summary.totalCalls, 17)
		assert.strictEqual(summary.failedCalls, 3)
		assert.strictEqual(summary.byTool.read_file, 7)
	})

	test("handles a task that reported no tool usage", () => {
		const summary = summarizeToolUsage(undefined)

		assert.strictEqual(summary.totalCalls, 0)
		assert.deepStrictEqual(summary.byTool, {})
	})

	test("does not count a shell call as exploration", () => {
		// A shell call can search or build, and the record does not say which.
		// Counting it as exploration would make the headline number wrong.
		const usage = { execute_command: { attempts: 5, failures: 0 } } as unknown as ToolUsage

		assert.strictEqual(summarizeToolUsage(usage).exploratoryCalls, 0)
		assert.strictEqual(summarizeToolUsage(usage).shellCalls, 5)
	})

	test("reports the median, the range and the sample standard deviation", () => {
		const result = stat([2, 4, 9])

		assert.strictEqual(result.median, 4)
		assert.strictEqual(result.min, 2)
		assert.strictEqual(result.max, 9)
		assert.strictEqual(result.mean, 5)
		assert.ok(Math.abs(result.stdDev - 3.605551) < 0.0001, String(result.stdDev))
	})

	test("reports no spread for a single trial", () => {
		assert.strictEqual(stat([7]).stdDev, 0)
		assert.strictEqual(stat([]).median, 0)
	})

	test("takes the median of an even number of trials", () => {
		assert.strictEqual(stat([1, 2, 3, 4]).median, 2.5)
	})

	test("summarizes a case", () => {
		const trials = [
			trial({ trial: 1, passed: true, elapsedMs: 10_000 }),
			trial({ trial: 2, passed: false, elapsedMs: 20_000 }),
			trial({ trial: 3, passed: true, elapsedMs: 30_000 }),
		]

		const summary = summarizeCase("case", "bug-fix", trials)

		assert.strictEqual(summary.trials, 3)
		assert.strictEqual(summary.passed, 2)
		assert.ok(Math.abs(summary.passRate - 2 / 3) < 0.0001)
		assert.strictEqual(summary.elapsedMs.median, 20_000)
	})
})
