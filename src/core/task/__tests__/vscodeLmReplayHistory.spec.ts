import { describe, expect, it, vi } from "vitest"
import { Task } from "../Task"

const replay = {
	modelId: "claude-sonnet",
	vendor: "copilot",
	parts: [{ id: "t1", value: "Plan.", metadata: { signature: "sig" } }],
}

// A small stand-in for a Task, with only what the two methods read.
function makeTaskLike(withReasoning = true) {
	const record = withReasoning ? replay : undefined
	return {
		apiConfiguration: { apiProvider: "vscode-lm" },
		apiConversationHistory: [] as any[],
		saveApiConversationHistory: vi.fn().mockResolvedValue(undefined),
		api: {
			getModel: () => ({ id: "claude-sonnet", info: {} }),
			takeVsCodeLmReplayRecord: vi.fn(() => record),
		},
	}
}

const addToHistory = (task: object, message: object) =>
	(Task.prototype as any).addToApiConversationHistory.call(task, message)
const buildClean = (task: object, messages: object[]) =>
	(Task.prototype as any).buildCleanConversationHistory.call(task, messages)

describe("VS Code LM reasoning in the task history", () => {
	it("stores the reasoning on the assistant message", async () => {
		const task = makeTaskLike()
		await addToHistory(task, { role: "assistant", content: [{ type: "text", text: "Looking." }] })

		expect(task.apiConversationHistory[0].vscodeLmReplay).toEqual(replay)
		expect(task.apiConversationHistory[0].content).toEqual([{ type: "text", text: "Looking." }])
	})

	it("stores nothing when the provider has no reasoning", async () => {
		const task = makeTaskLike(false)
		await addToHistory(task, { role: "assistant", content: "Done." })

		expect(task.apiConversationHistory[0]).not.toHaveProperty("vscodeLmReplay")
	})

	it("keeps the reasoning on an assistant message when the history is cleaned for a request", () => {
		const clean = buildClean(makeTaskLike(), [
			{ role: "user", content: "Fix it" },
			{ role: "assistant", content: "Looking.", vscodeLmReplay: replay },
			{ role: "user", content: "Go on" },
		])

		expect(clean[1]).toEqual({ role: "assistant", content: "Looking.", vscodeLmReplay: replay })
		expect(clean[0]).not.toHaveProperty("vscodeLmReplay")
	})
})
