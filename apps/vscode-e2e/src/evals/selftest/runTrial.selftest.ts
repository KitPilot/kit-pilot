import * as assert from "assert"
import { EventEmitter } from "events"
import * as fs from "fs/promises"
import * as os from "os"
import * as path from "path"

import { KitPilotEventName, type KitPilotAPI, type TokenUsage, type ToolUsage } from "@kit-pilot/types"

import { didAnyWork, runTrial } from "../runTrial"
import type { EvalCase } from "../types"

const ZERO_TOKENS: TokenUsage = {
	totalTokensIn: 0,
	totalTokensOut: 0,
	totalCost: 0,
	contextTokens: 0,
}

function usage(overrides: Partial<TokenUsage>): TokenUsage {
	return { ...ZERO_TOKENS, ...overrides }
}

/**
 * A stand-in for the extension API.
 *
 * `startNewTask` returns a task id and then emits whatever the test says. It
 * never completes the task, so the trial ends on its timeout.
 */
class FakeApi extends EventEmitter {
	constructor(private readonly onStart: (api: FakeApi, taskId: string) => void) {
		super()
	}

	startNewTask(): Promise<string> {
		const taskId = "task-1"
		setTimeout(() => this.onStart(this, taskId), 10)
		return Promise.resolve(taskId)
	}

	cancelCurrentTask(): Promise<void> {
		return Promise.resolve()
	}

	clearCurrentTask(): Promise<void> {
		return Promise.resolve()
	}
}

function evalCase(): EvalCase {
	return {
		id: "selftest",
		category: "bug-fix",
		intent: "measurement only",
		fixture: "definition-bugfix",
		mode: "code",
		prompt: "does not matter",
		grade: () => Promise.resolve({ passed: false, detail: "not graded", behaviorChecked: false }),
	}
}

async function withWorkspace<T>(body: (dir: string) => Promise<T>): Promise<T> {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kitpilot-runtrial-"))
	try {
		return await body(dir)
	} finally {
		await fs.rm(dir, { recursive: true, force: true })
	}
}

const OPTIONS = { timeoutMs: 1200, modelId: "test-model", maxRequests: 5, variant: "treatment" as const }

suite("evals/runTrial measurement", function () {
	this.timeout(30_000)

	// Task saves the first user message before it asks the model, and the first
	// usage snapshot always counts as a change. Every trial therefore receives
	// an entry of zeros before any work happens. Counting entries would mark a
	// stalled trial as measured, and its zeros would then lower the median
	// number of exploratory calls.
	test("a trial that only received the opening zero snapshot is not measured", async () => {
		const result = await withWorkspace((dir) =>
			runTrial(
				new FakeApi((api, taskId) => {
					api.emit(KitPilotEventName.TaskTokenUsageUpdated, taskId, ZERO_TOKENS, {} as ToolUsage)
				}) as unknown as KitPilotAPI,
				evalCase(),
				dir,
				1,
				OPTIONS,
			),
		)

		assert.strictEqual(result.timedOut, true)
		assert.strictEqual(result.usageMissing, true)
		assert.strictEqual(result.tools.totalCalls, 0)
	})

	test("a trial that ran tools before it timed out is measured", async () => {
		const result = await withWorkspace((dir) =>
			runTrial(
				new FakeApi((api, taskId) => {
					api.emit(KitPilotEventName.TaskTokenUsageUpdated, taskId, ZERO_TOKENS, {} as ToolUsage)
					api.emit(KitPilotEventName.TaskTokenUsageUpdated, taskId, usage({ totalTokensIn: 900 }), {
						read_file: { attempts: 4, failures: 0 },
					} as unknown as ToolUsage)
				}) as unknown as KitPilotAPI,
				evalCase(),
				dir,
				1,
				OPTIONS,
			),
		)

		assert.strictEqual(result.timedOut, true)
		assert.strictEqual(result.usageMissing, false)
		assert.strictEqual(result.tools.exploratoryCalls, 4)
		assert.strictEqual(result.tokensIn, 900)
	})

	test("a subtask adds to the usage of the run", async () => {
		const result = await withWorkspace((dir) =>
			runTrial(
				new FakeApi((api, taskId) => {
					api.emit(KitPilotEventName.TaskTokenUsageUpdated, taskId, usage({ totalTokensIn: 100 }), {
						read_file: { attempts: 2, failures: 0 },
					} as unknown as ToolUsage)
					api.emit(KitPilotEventName.TaskTokenUsageUpdated, "subtask-1", usage({ totalTokensIn: 50 }), {
						read_file: { attempts: 3, failures: 0 },
					} as unknown as ToolUsage)
				}) as unknown as KitPilotAPI,
				evalCase(),
				dir,
				1,
				OPTIONS,
			),
		)

		assert.strictEqual(result.tools.exploratoryCalls, 5)
		assert.strictEqual(result.tokensIn, 150)
	})
})

suite("evals/didAnyWork", () => {
	test("an opening zero snapshot is not work", () => {
		assert.strictEqual(didAnyWork(0, 0, 0), false)
	})

	test("a tool call is work", () => {
		assert.strictEqual(didAnyWork(1, 0, 0), true)
	})

	// Copilot has reported a cost of zero, so a trial that ran must still count
	// when the cost is missing. Cost is therefore not part of the test.
	test("tokens are work even with no tool call", () => {
		assert.strictEqual(didAnyWork(0, 800, 0), true)
		assert.strictEqual(didAnyWork(0, 0, 40), true)
	})
})
