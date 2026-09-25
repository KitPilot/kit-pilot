import { describe, expect, it } from "vitest"
import { buildFirstUserMessageText, extractUserPromptText } from "../Task"

const context = "<workspace_context>\noverview\n</workspace_context>\n\n"

describe("buildFirstUserMessageText", () => {
	it("puts the workspace overview first by default", () => {
		expect(buildFirstUserMessageText("fix the bug", context, false)).toBe(
			`${context}<user_message>\nfix the bug\n</user_message>`,
		)
	})

	it("puts the user message first when the experiment is on", () => {
		expect(buildFirstUserMessageText("fix the bug", context, true)).toBe(
			"<user_message>\nfix the bug\n</user_message>\n\n<workspace_context>\noverview\n</workspace_context>",
		)
	})

	it("returns only the user message when there is no overview", () => {
		expect(buildFirstUserMessageText("fix the bug", "", true)).toBe("<user_message>\nfix the bug\n</user_message>")
	})

	it("keeps the user text readable by extractUserPromptText in both orders", () => {
		for (const first of [false, true]) {
			const text = buildFirstUserMessageText("fix the bug", context, first)
			expect(extractUserPromptText([{ type: "text", text }])).toBe("fix the bug")
		}
	})
})
