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

	describe("events that are accepted but never dispatched", () => {
		// A Stop hook used to validate completely clean and then do nothing,
		// because all nine event types are in SUPPORTED_EVENT_TYPES while only
		// three have a fire site.
		it("reports a configured hook on an undispatched event", () => {
			const result = validateHooksText(
				JSON.stringify({ Stop: [{ matcher: "*", hooks: [{ command: "notify-send done" }] }] }),
			)

			expect(result.parseError).toBeUndefined()
			expect(result.problems.join("\n")).toContain('"Stop" is accepted but not yet dispatched')
		})

		it("stays valid and loaded — the hook is reported, not rejected", () => {
			const result = validateHooksText(
				JSON.stringify({ SubagentStop: [{ matcher: "*", hooks: [{ command: "echo hi" }] }] }),
			)

			// Counted like any other group: the config parses and the registry
			// will load it. The message explains the silence, it does not
			// invalidate the file.
			expect(result.groupCounts).toEqual(["SubagentStop×1"])
			expect(result.problems).toHaveLength(1)
		})

		it("says nothing about a declared-but-empty event", () => {
			// `"Stop": []` configures no hook and affects nothing. Warning here
			// would be noise that trains people to skip the report.
			const result = validateHooksText(JSON.stringify({ Stop: [], SessionStart: [] }))

			expect(result.problems).toEqual([])
			expect(result.groupCounts).toEqual(["SessionStart×0", "Stop×0"])
		})

		it("says nothing about dispatched events", () => {
			const result = validateHooksText(
				JSON.stringify({
					PreToolUse: [{ matcher: "*", hooks: [{ command: "exit 0" }] }],
					PostToolUse: [{ matcher: "*", hooks: [{ command: "exit 0" }] }],
					UserPromptSubmit: [{ matcher: "*", hooks: [{ command: "exit 0" }] }],
				}),
			)

			expect(result.problems).toEqual([])
		})
	})
})
