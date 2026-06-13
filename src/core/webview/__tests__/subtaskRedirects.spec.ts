import { describe, expect, it } from "vitest"

import type { ClineMessage } from "@kit-pilot/types"

import { extractUserRedirects, formatUserRedirectNote, augmentSummaryWithRedirects } from "../subtaskRedirects"

const say = (overrides: Partial<ClineMessage>): ClineMessage => ({ type: "say", ts: 1, ...overrides }) as ClineMessage

describe("subtaskRedirects/extractUserRedirects", () => {
	it("returns only user_feedback messages, in order", () => {
		const messages = [
			say({ say: "text", text: "thinking out loud" }),
			say({ say: "user_feedback", text: "just remove the section" }),
			say({ say: "api_req_started", text: "{}" }),
			say({ say: "user_feedback", text: "and skip the commit" }),
		]
		expect(extractUserRedirects(messages)).toEqual(["just remove the section", "and skip the commit"])
	})

	it("returns [] when the subtask received no user messages", () => {
		const messages = [say({ say: "text", text: "working" }), say({ say: "completion_result", text: "done" })]
		expect(extractUserRedirects(messages)).toEqual([])
	})

	it("trims whitespace and drops empty feedback", () => {
		const messages = [
			say({ say: "user_feedback", text: "   keep this   " }),
			say({ say: "user_feedback", text: "   " }),
			say({ say: "user_feedback", text: "" }),
		]
		expect(extractUserRedirects(messages)).toEqual(["keep this"])
	})

	it("annotates attached images", () => {
		expect(extractUserRedirects([say({ say: "user_feedback", text: "use this", images: ["a", "b"] })])).toEqual([
			"use this [+2 image(s)]",
		])
		// Image-only feedback (no text) is still surfaced.
		expect(extractUserRedirects([say({ say: "user_feedback", text: "", images: ["a"] })])).toEqual(["[1 image(s)]"])
	})

	it("length-bounds a very long redirect", () => {
		const long = "x".repeat(2000)
		const [out] = extractUserRedirects([say({ say: "user_feedback", text: long })])
		expect(out.length).toBeLessThan(long.length)
		expect(out.endsWith("… [truncated]")).toBe(true)
	})
})

describe("subtaskRedirects/formatUserRedirectNote", () => {
	it("numbers the messages and includes the anti-revert guard", () => {
		const note = formatUserRedirectNote(["remove the section", "skip the push"])
		expect(note).toContain('1. "remove the section"')
		expect(note).toContain('2. "skip the push"')
		// The guard wording is load-bearing — it's what stops the parent undoing the change.
		expect(note).toContain("do NOT treat a user-requested change as a subtask mistake")
	})
})

describe("subtaskRedirects/augmentSummaryWithRedirects", () => {
	it("returns the raw summary unchanged when there are no redirects", () => {
		expect(augmentSummaryWithRedirects("Removed the section.", [])).toBe("Removed the section.")
	})

	it("appends the framed note after the child's result when redirects exist", () => {
		const out = augmentSummaryWithRedirects("Removed the License section.", ["just remove it altogether"])
		expect(out.startsWith("Removed the License section.")).toBe(true)
		expect(out).toContain('1. "just remove it altogether"')
		expect(out).toContain("do NOT treat a user-requested change as a subtask mistake")
	})
})
