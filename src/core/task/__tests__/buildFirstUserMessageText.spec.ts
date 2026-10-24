import { describe, expect, it } from "vitest"
import { buildFirstUserMessageText, extractUserPromptText } from "../Task"

const context = "<workspace_context>\noverview\n</workspace_context>\n\n"

describe("buildFirstUserMessageText", () => {
	it("puts the user message before the workspace overview", () => {
		expect(buildFirstUserMessageText("fix the bug", context)).toBe(
			"<user_message>\nfix the bug\n</user_message>\n\n<workspace_context>\noverview\n</workspace_context>",
		)
	})

	it("returns only the user message when there is no overview", () => {
		expect(buildFirstUserMessageText("fix the bug", "")).toBe("<user_message>\nfix the bug\n</user_message>")
	})

	it("keeps the user text readable by extractUserPromptText", () => {
		const text = buildFirstUserMessageText("fix the bug", context)
		expect(extractUserPromptText([{ type: "text", text }])).toBe("fix the bug")
	})
})
