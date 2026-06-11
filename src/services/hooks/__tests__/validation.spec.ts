import { describe, expect, it } from "vitest"

import { validateHooksText } from "../validation"

describe("hooks/validateHooksText", () => {
	it("reports a missing file (null text)", () => {
		const result = validateHooksText(null)
		expect(result.exists).toBe(false)
		expect(result.parseError).toBeUndefined()
		expect(result.problems).toEqual([])
	})

	it("reports a JSON parse error", () => {
		const result = validateHooksText('{ "PreToolUse": [ trailing')
		expect(result.exists).toBe(true)
		expect(result.parseError).toBeTruthy()
	})

	it("reports a non-object root as a parse-level error", () => {
		for (const text of ["[1, 2]", '"hello"', "null", "42"]) {
			const result = validateHooksText(text)
			expect(result.parseError).toContain("JSON object")
		}
	})

	it("flags unknown event types", () => {
		const result = validateHooksText(JSON.stringify({ "post-edit": [] }))
		expect(result.parseError).toBeUndefined()
		expect(result.problems.join("\n")).toContain('"post-edit"')
	})

	it("flags non-array event values", () => {
		const result = validateHooksText(JSON.stringify({ PreToolUse: { matcher: "*" } }))
		expect(result.problems.join("\n")).toContain('"PreToolUse" must be an array')
	})

	it("flags groups without hooks and hooks without commands", () => {
		const result = validateHooksText(
			JSON.stringify({
				PreToolUse: [{ matcher: "*" }, { matcher: "execute_command", hooks: [{ type: "command" }] }],
			}),
		)
		const text = result.problems.join("\n")
		expect(text).toContain('PreToolUse[0] has no "hooks" array')
		expect(text).toContain('PreToolUse[1].hooks[0] is missing a "command"')
	})

	it("flags unsupported hook types", () => {
		const result = validateHooksText(
			JSON.stringify({ PreToolUse: [{ matcher: "*", hooks: [{ type: "shell", command: "exit 0" }] }] }),
		)
		expect(result.problems.join("\n")).toContain('unsupported type "shell"')
	})

	it("accepts a valid config and reports group counts", () => {
		const result = validateHooksText(
			JSON.stringify({
				PreToolUse: [
					{ matcher: "*", hooks: [{ type: "command", command: "exit 0" }] },
					{ matcher: "execute_command", hooks: [{ type: "builtin", command: "force_push_guard" }] },
				],
				PostToolUse: [{ matcher: ".ts", hooks: [{ command: "pnpm tsc" }] }],
			}),
		)
		expect(result.parseError).toBeUndefined()
		expect(result.problems).toEqual([])
		expect(result.groupCounts).toEqual(["PreToolUse×2", "PostToolUse×1"])
	})

	it("accepts an empty object", () => {
		const result = validateHooksText("{}")
		expect(result.parseError).toBeUndefined()
		expect(result.problems).toEqual([])
		expect(result.groupCounts).toEqual([])
	})
})
