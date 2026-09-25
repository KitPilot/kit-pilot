import { describe, expect, it, vi } from "vitest"

const hooks = vi.hoisted(() => ({ processHookEvent: vi.fn() }))
vi.mock("../../../services/hooks", async (importOriginal) => ({
	...(await importOriginal<object>()),
	processHookEvent: hooks.processHookEvent,
}))

import { Task } from "../Task"
import { isPlainReplyTurnEnd } from "../plainReplies"
import { getSharedToolUseSection } from "../../prompts/sections/tool-use"
import { getRulesSection } from "../../prompts/sections/rules"
import { getObjectiveSection } from "../../prompts/sections/objective"

describe("isPlainReplyTurnEnd", () => {
	it("ends the turn for a text reply without a tool when the setting is on", () => {
		expect(isPlainReplyTurnEnd(false, "Which file do you mean?", true)).toBe(true)
	})

	it("does not end the turn when the setting is off, a tool was used, or there is no text", () => {
		expect(isPlainReplyTurnEnd(false, "Which file do you mean?", false)).toBe(false)
		expect(isPlainReplyTurnEnd(true, "Reading the file.", true)).toBe(false)
		expect(isPlainReplyTurnEnd(false, "   \n", true)).toBe(false)
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

describe("prompt text for plain replies", () => {
	it("keeps the tool requirement when the setting is off", () => {
		expect(getSharedToolUseSection()).toContain("You must call at least one tool per assistant response.")
		expect(getRulesSection("/repo")).toContain("You are only allowed to ask the user questions")
		expect(getRulesSection("/repo")).toContain("NOT engage in a back and forth conversation")
		expect(getObjectiveSection("")).toContain("don't end your responses with questions")
	})

	it("allows plain replies when the setting is on", () => {
		const toolUse = getSharedToolUseSection(true)
		expect(toolUse).not.toContain("You must call at least one tool")
		expect(toolUse).toContain("reply in plain text without a tool")

		const rules = getRulesSection("/repo", undefined, true)
		expect(rules).not.toContain("You are only allowed to ask the user questions")
		expect(rules).toContain("ask in plain text")
		expect(rules).toContain("ask the user a short question before you act")
		// The model must not search outside the project to avoid a question.
		expect(rules).not.toContain("to avoid having to ask the user questions")
		expect(rules).toContain("Do not search outside '/repo' unless the user names a location there.")
		// A finished task still ends with attempt_completion.
		expect(rules).toContain("you must use the attempt_completion tool")

		const objective = getObjectiveSection("", true)
		expect(objective).not.toContain("don't end your responses with questions")
		expect(objective).toContain("missing parameters in plain text or with the ask_followup_question tool")
		expect(objective).toContain("you must use the attempt_completion tool")
	})
})
