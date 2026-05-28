import { describe, expect, it } from "vitest"
import { extractUserPromptText } from "../Task"

describe("extractUserPromptText", () => {
	it("returns the text inside <user_message> tags", () => {
		expect(
			extractUserPromptText([{ type: "text", text: "<user_message>\nhello world\n</user_message>" }]),
		).toBe("hello world")
	})

	it("returns undefined when no <user_message> tag is present", () => {
		expect(
			extractUserPromptText([{ type: "text", text: "just a tool result, no marker" }]),
		).toBeUndefined()
	})

	it("returns undefined for an empty content array", () => {
		expect(extractUserPromptText([])).toBeUndefined()
	})

	it("skips non-text blocks", () => {
		expect(
			extractUserPromptText([
				{ type: "image", source: { type: "base64", media_type: "image/png", data: "fake" } } as any,
				{ type: "text", text: "<user_message>extracted</user_message>" },
			]),
		).toBe("extracted")
	})

	it("returns the first match if multiple blocks contain <user_message>", () => {
		expect(
			extractUserPromptText([
				{ type: "text", text: "<user_message>first</user_message>" },
				{ type: "text", text: "<user_message>second</user_message>" },
			]),
		).toBe("first")
	})

	it("handles multi-line content inside <user_message>", () => {
		expect(
			extractUserPromptText([
				{ type: "text", text: "preamble\n<user_message>\nline 1\nline 2\nline 3\n</user_message>\nepilogue" },
			]),
		).toBe("line 1\nline 2\nline 3")
	})

	it("trims surrounding whitespace", () => {
		expect(
			extractUserPromptText([{ type: "text", text: "<user_message>   spaced   </user_message>" }]),
		).toBe("spaced")
	})

	it("returns undefined for continuation-loop content (no user marker)", () => {
		// Matches the noToolsUsed() fallback path that should NOT trigger UserPromptSubmit
		expect(
			extractUserPromptText([{ type: "text", text: "[ERROR] No tools were used in the previous response." }]),
		).toBeUndefined()
	})
})
