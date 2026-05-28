import { describe, expect, it } from "vitest"
import { HookEngine } from "../HookEngine"
import { injectVerifyCommandHook } from "../config"
import type { HooksConfigDict } from "../registry"

describe("hooks/HookEngine", () => {
	it("returns blocked=false when no hooks registered", async () => {
		const engine = new HookEngine({})
		const result = await engine.processEvent({
			eventType: "PreToolUse",
			toolName: "read_file",
			toolArgs: {},
		})
		expect(result.blocked).toBe(false)
		expect(result.executedHooks).toBe(0)
	})

	it("fires only on matching events and tool names", async () => {
		const config: HooksConfigDict = {
			PreToolUse: [
				{ matcher: "execute_command", hooks: [{ type: "command", command: "exit 0" }] },
			],
		}
		const engine = new HookEngine(config)
		// Non-matching tool
		expect(
			(
				await engine.processEvent({
					eventType: "PreToolUse",
					toolName: "read_file",
					toolArgs: {},
				})
			).executedHooks,
		).toBe(0)
		// Non-matching event
		expect(
			(
				await engine.processEvent({
					eventType: "PostToolUse",
					toolName: "execute_command",
					toolArgs: {},
				})
			).executedHooks,
		).toBe(0)
		// Match
		expect(
			(
				await engine.processEvent({
					eventType: "PreToolUse",
					toolName: "execute_command",
					toolArgs: {},
				})
			).executedHooks,
		).toBe(1)
	})

	it("propagates a blocking result with a reason", async () => {
		const config: HooksConfigDict = {
			PreToolUse: [
				{
					matcher: "execute_command",
					hooks: [{ type: "command", command: 'echo "forbidden" >&2; exit 1' }],
				},
			],
		}
		const engine = new HookEngine(config)
		const result = await engine.processEvent({
			eventType: "PreToolUse",
			toolName: "execute_command",
			toolArgs: {},
		})
		expect(result.blocked).toBe(true)
		expect(result.blockingReason).toContain("forbidden")
	})

	it("marks once-hooks as fired so they don't re-execute", async () => {
		const config: HooksConfigDict = {
			PreToolUse: [
				{ matcher: "*", hooks: [{ type: "command", command: "exit 0", once: true }] },
			],
		}
		const engine = new HookEngine(config)
		const first = await engine.processEvent({
			eventType: "PreToolUse",
			toolName: "anything",
			toolArgs: {},
		})
		expect(first.executedHooks).toBe(1)
		const second = await engine.processEvent({
			eventType: "PreToolUse",
			toolName: "anything",
			toolArgs: {},
		})
		expect(second.executedHooks).toBe(0)
	})

	it("injectVerifyCommandHook adds a synthetic PreToolUse hook on attempt_completion", async () => {
		const config: HooksConfigDict = {}
		injectVerifyCommandHook(config, "exit 1") // fail the verify
		const engine = new HookEngine(config)
		const blocked = await engine.processEvent({
			eventType: "PreToolUse",
			toolName: "attempt_completion",
			toolArgs: {},
		})
		expect(blocked.blocked).toBe(true)
		// Verify hook does NOT fire on other tools
		const passes = await engine.processEvent({
			eventType: "PreToolUse",
			toolName: "read_file",
			toolArgs: {},
		})
		expect(passes.executedHooks).toBe(0)
	})

	it("injectVerifyCommandHook is a no-op when verifyCommand is empty", () => {
		const config: HooksConfigDict = {}
		injectVerifyCommandHook(config, "")
		injectVerifyCommandHook(config, undefined)
		injectVerifyCommandHook(config, "   ")
		expect(config.PreToolUse).toBeUndefined()
	})

	it("UserPromptSubmit hook fires and can block on the prompt content", async () => {
		// Simulates a guardrail hook that blocks prompts mentioning secrets.
		const config: HooksConfigDict = {
			UserPromptSubmit: [
				{
					matcher: "*",
					hooks: [
						{
							type: "command",
							command:
								'if echo "$CLAUDE_TOOL_INPUT" | grep -q "AKIA"; then echo "secret detected" >&2; exit 1; fi; exit 0',
						},
					],
				},
			],
		}
		const engine = new HookEngine(config)

		// Clean prompt → passes
		const clean = await engine.processEvent({
			eventType: "UserPromptSubmit",
			toolName: "user_prompt",
			toolArgs: { prompt: "refactor the auth module" },
		})
		expect(clean.blocked).toBe(false)
		expect(clean.executedHooks).toBe(1)

		// Prompt with leaked AWS key → blocked
		const dirty = await engine.processEvent({
			eventType: "UserPromptSubmit",
			toolName: "user_prompt",
			toolArgs: { prompt: "the key is AKIAIOSFODNN7EXAMPLE, deploy with that" },
		})
		expect(dirty.blocked).toBe(true)
		expect(dirty.blockingReason).toContain("secret detected")
	})
})
