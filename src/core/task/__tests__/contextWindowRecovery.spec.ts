import { describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ manageContext: vi.fn() }))
vi.mock("../../context-management", async (importOriginal) => ({
	...(await importOriginal<object>()),
	manageContext: mocks.manageContext,
}))
vi.mock("../../environment/getEnvironmentDetails", () => ({
	getEnvironmentDetails: vi.fn().mockResolvedValue("<environment_details />"),
}))

import { Task } from "../Task"

// A small stand-in for a Task, with only what the recovery method reads.
function makeTaskLike(contextTokens: number) {
	const history = [{ role: "user", content: "hi" }]
	return {
		taskId: "task-1",
		apiConfiguration: { apiProvider: "vscode-lm" },
		apiConversationHistory: history,
		providerRef: { deref: () => undefined },
		api: { getModel: () => ({ id: "claude-opus-5", info: { contextWindow: 936_000, maxTokens: -1 } }) },
		getTokenUsage: () => ({ contextTokens }),
		getCurrentProfileId: () => "default",
		getSystemPrompt: vi.fn().mockResolvedValue("rules"),
		overwriteApiConversationHistory: vi.fn(),
		say: vi.fn(),
	}
}

describe("Task.handleContextWindowExceededError", () => {
	it("counts the context as full, because the provider rejected the prompt as too long", async () => {
		// KitPilot's own count (500,000) is below the threshold. That low count
		// is why the prompt grew past the limit of the provider.
		const task = makeTaskLike(500_000)
		mocks.manageContext.mockResolvedValue({ messages: task.apiConversationHistory, summary: "", cost: 0 })

		await (Task.prototype as any).handleContextWindowExceededError.call(task)

		expect(mocks.manageContext).toHaveBeenCalledWith(
			expect.objectContaining({ totalTokens: 936_000, contextWindow: 936_000, autoCondenseContext: true }),
		)
	})

	it("keeps a count that is already above the context window", async () => {
		const task = makeTaskLike(1_100_000)
		mocks.manageContext.mockResolvedValue({ messages: task.apiConversationHistory, summary: "", cost: 0 })

		await (Task.prototype as any).handleContextWindowExceededError.call(task)

		expect(mocks.manageContext).toHaveBeenCalledWith(expect.objectContaining({ totalTokens: 1_100_000 }))
	})
})
