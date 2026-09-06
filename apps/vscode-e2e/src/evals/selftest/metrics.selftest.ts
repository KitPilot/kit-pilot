import * as assert from "assert"

import type { ToolUsage } from "@kit-pilot/types"

import { mergeToolUsage, stat, summarizeCase, summarizeToolUsage, variantOrder } from "../metrics"
import type { TrialResult } from "../types"

function toolsWith(exploratoryCalls: number) {
	return { exploratoryCalls, editCalls: 0, shellCalls: 0, totalCalls: exploratoryCalls, failedCalls: 0, byTool: {} }
}

function trial(overrides: Partial<TrialResult> & { trial: number }): TrialResult {
	return {
		caseId: "case",
		variant: "treatment",
		passed: true,
		behaviorChecked: true,
		detail: "",
		elapsedMs: 1000,
		timedOut: false,
		aborted: false,
		usageMissing: false,
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

	// A trial that reported no usage did not run. Its zeros would lower the
	// median number of calls, which would make a worse implementation look
	// cheaper than it is.
	test("leaves a trial that reported no usage out of the call statistics", () => {
		const trials = [
			trial({ trial: 1, passed: true, tools: toolsWith(10) }),
			trial({ trial: 2, passed: false, usageMissing: true, elapsedMs: 600_000 }),
			trial({ trial: 3, passed: true, tools: toolsWith(12) }),
		]

		const summary = summarizeCase("case", "treatment", "bug-fix", trials)

		assert.strictEqual(summary.trials, 3)
		assert.strictEqual(summary.measured, 2)
		// The pass rate still counts the trial that did not run.
		assert.ok(Math.abs(summary.passRate - 2 / 3) < 0.0001)
		assert.strictEqual(summary.exploratoryCalls.median, 11)
		assert.strictEqual(summary.exploratoryCalls.min, 10)
	})

	test("adds the usage of a task and its subtasks", () => {
		const merged = mergeToolUsage(
			{ read_file: { attempts: 3, failures: 1 } } as unknown as ToolUsage,
			{
				read_file: { attempts: 4, failures: 0 },
				apply_diff: { attempts: 2, failures: 0 },
			} as unknown as ToolUsage,
		)

		assert.deepStrictEqual(merged, {
			read_file: { attempts: 7, failures: 1 },
			apply_diff: { attempts: 2, failures: 0 },
		})
	})

	test("merges when one side is missing", () => {
		const merged = mergeToolUsage(undefined, { read_file: { attempts: 2, failures: 0 } } as unknown as ToolUsage)

		assert.deepStrictEqual(merged, { read_file: { attempts: 2, failures: 0 } })
	})

	// A long run drifts: a model slows down, a cache warms, another program
	// starts. Running every baseline trial and then every treatment trial would
	// put all of that on one side of the comparison.
	test("flips the order of the variants on every trial", () => {
		const variants = ["baseline", "treatment"] as const

		assert.deepStrictEqual(variantOrder(1, variants), ["baseline", "treatment"])
		assert.deepStrictEqual(variantOrder(2, variants), ["treatment", "baseline"])
		assert.deepStrictEqual(variantOrder(3, variants), ["baseline", "treatment"])
		assert.deepStrictEqual(variantOrder(4, variants), ["treatment", "baseline"])
	})

	test("runs each variant the same number of times over an even trial count", () => {
		const counts = { baseline: 0, treatment: 0 }
		for (let trial = 1; trial <= 6; trial++) {
			for (const variant of variantOrder(trial, ["baseline", "treatment"])) {
				counts[variant] += 1
			}
		}

		assert.strictEqual(counts.baseline, 6)
		assert.strictEqual(counts.treatment, 6)
	})

	test("gives each variant the first slot the same number of times", () => {
		let baselineFirst = 0
		for (let trial = 1; trial <= 6; trial++) {
			if (variantOrder(trial, ["baseline", "treatment"])[0] === "baseline") {
				baselineFirst += 1
			}
		}

		assert.strictEqual(baselineFirst, 3)
	})

	// A pass where the grader only read the code is weaker than one that ran it.
	// The summary keeps the count so a reader can tell them apart.
	test("counts the trials whose behavior was run", () => {
		const trials = [
			trial({ trial: 1, passed: true, behaviorChecked: true }),
			trial({ trial: 2, passed: true, behaviorChecked: false }),
			trial({ trial: 3, passed: true, behaviorChecked: true }),
		]

		const summary = summarizeCase("case", "treatment", "cross-file-refactor", trials)

		assert.strictEqual(summary.passed, 3)
		assert.strictEqual(summary.behaviorChecked, 2)
	})

	test("keeps the variant on the summary", () => {
		const summary = summarizeCase("case", "baseline", "bug-fix", [trial({ trial: 1 })])

		assert.strictEqual(summary.variant, "baseline")
	})

	test("summarizes a case", () => {
		const trials = [
			trial({ trial: 1, passed: true, elapsedMs: 10_000 }),
			trial({ trial: 2, passed: false, elapsedMs: 20_000 }),
			trial({ trial: 3, passed: true, elapsedMs: 30_000 }),
		]

		const summary = summarizeCase("case", "treatment", "bug-fix", trials)

		assert.strictEqual(summary.trials, 3)
		assert.strictEqual(summary.passed, 2)
		assert.ok(Math.abs(summary.passRate - 2 / 3) < 0.0001)
		assert.strictEqual(summary.elapsedMs.median, 20_000)
	})
})
