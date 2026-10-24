import { describe, expect, it, vi } from "vitest"

const hooks = vi.hoisted(() => ({ processHookEvent: vi.fn() }))
vi.mock("../../../services/hooks", async (importOriginal) => ({
	...(await importOriginal<object>()),
	processHookEvent: hooks.processHookEvent,
}))

import { Task } from "../Task"
import { isPlainReplyTurnEnd } from "../plainReplies"

describe("isPlainReplyTurnEnd", () => {
	it("ends the turn for a text reply without a tool", () => {
		expect(isPlainReplyTurnEnd(false, "Which file do you mean?")).toBe(true)
	})

	it("does not end the turn when a tool was used or there is no text", () => {
		expect(isPlainReplyTurnEnd(true, "Reading the file.")).toBe(false)
		expect(isPlainReplyTurnEnd(false, "   \n")).toBe(false)
	})
})

describe("Task.waitForUserAfterPlainReply", () => {
	it("waits with an empty followup ask and passes the user's reply to the model", async () => {
		hooks.processHookEvent.mockResolvedValue({ blocked: false })
		const task = {
			cwd: "/repo",
			taskId: "task-1",
			consecutiveNoToolUseCount: 1,
			userMessageContent: [] as any[],
			ask: vi.fn().mockResolvedValue({ response: "messageResponse", text: "the config file", images: [] }),
			say: vi.fn().mockResolvedValue(undefined),
		}

		await (Task.prototype as any).waitForUserAfterPlainReply.call(task)

		expect(task.ask).toHaveBeenCalledWith("followup", "", false)
		expect(task.say).toHaveBeenCalledWith("user_feedback", "the config file", [])
		expect(task.userMessageContent).toEqual([
			{ type: "text", text: "<user_message>\nthe config file\n</user_message>" },
		])
		expect(task.consecutiveNoToolUseCount).toBe(0)
		expect(hooks.processHookEvent).toHaveBeenCalledWith("/repo", {
			eventType: "UserPromptSubmit",
			toolName: "user_prompt",
			toolArgs: { prompt: "the config file" },
			context: { session_id: "task-1" },
		})
	})

	it("does not send a reply that the UserPromptSubmit hook blocks, and waits again", async () => {
		hooks.processHookEvent
			.mockResolvedValueOnce({ blocked: true, blockingReason: "No secrets in prompts." })
			.mockResolvedValueOnce({ blocked: false })
		const task = {
			cwd: "/repo",
			taskId: "task-1",
			consecutiveNoToolUseCount: 0,
			userMessageContent: [] as any[],
			ask: vi
				.fn()
				.mockResolvedValueOnce({ response: "messageResponse", text: "my password is hunter2", images: [] })
				.mockResolvedValueOnce({ response: "messageResponse", text: "the config file", images: [] }),
			say: vi.fn().mockResolvedValue(undefined),
		}

		await (Task.prototype as any).waitForUserAfterPlainReply.call(task)

		expect(task.ask).toHaveBeenCalledTimes(2)
		expect(task.say).toHaveBeenCalledWith("error", "No secrets in prompts.")
		expect(task.userMessageContent).toEqual([
			{ type: "text", text: "<user_message>\nthe config file\n</user_message>" },
		])
	})
})
