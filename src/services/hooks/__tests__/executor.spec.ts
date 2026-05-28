import { describe, expect, it } from "vitest"
import { executeHook, executeHooksSequential, getBlockingResult } from "../executor"
import { makeHookConfig } from "../types"

const baseEvent = {
	eventType: "PreToolUse" as const,
	toolName: "execute_command",
	toolArgs: { command: "echo hello" },
}

describe("hooks/executor", () => {
	it("returns success on exit 0", async () => {
		const hook = makeHookConfig({ matcher: "*", command: "exit 0" })
		const result = await executeHook(hook, baseEvent)
		expect(result.exitCode).toBe(0)
		expect(result.blocked).toBe(false)
	})

	it("marks blocked on exit 1 and uses stderr as block reason", async () => {
		const hook = makeHookConfig({ matcher: "*", command: 'echo "nope" >&2; exit 1' })
		const result = await executeHook(hook, baseEvent)
		expect(result.exitCode).toBe(1)
		expect(result.blocked).toBe(true)
		expect(result.stderr).toContain("nope")
		expect(result.error).toContain("nope")
	})

	it("does not block on exit 2 (error feedback, non-blocking)", async () => {
		const hook = makeHookConfig({ matcher: "*", command: 'echo "warn" >&2; exit 2' })
		const result = await executeHook(hook, baseEvent)
		expect(result.exitCode).toBe(2)
		expect(result.blocked).toBe(false)
		expect(result.error).toContain("warn")
	})

	it("times out and marks blocked", async () => {
		const hook = makeHookConfig({ matcher: "*", command: "sleep 1", timeout: 200 })
		const result = await executeHook(hook, baseEvent)
		expect(result.blocked).toBe(true)
		expect(result.error).toMatch(/timed out/)
	})

	it("substitutes ${tool_name} into the command", async () => {
		const hook = makeHookConfig({ matcher: "*", command: 'echo "tool=${tool_name}"' })
		const result = await executeHook(hook, baseEvent)
		expect(result.stdout.trim()).toBe("tool=execute_command")
	})

	it("passes CLAUDE_TOOL_NAME env var to the hook", async () => {
		const hook = makeHookConfig({ matcher: "*", command: 'echo "env=$CLAUDE_TOOL_NAME"' })
		const result = await executeHook(hook, baseEvent)
		expect(result.stdout.trim()).toBe("env=execute_command")
	})

	it("passes the event payload via stdin as JSON", async () => {
		const hook = makeHookConfig({ matcher: "*", command: "cat" })
		const result = await executeHook(hook, baseEvent)
		const payload = JSON.parse(result.stdout)
		expect(payload.hook_event_name).toBe("PreToolUse")
		expect(payload.tool_name).toBe("execute_command")
		expect(payload.tool_input).toEqual({ command: "echo hello" })
	})

	it("stop_on_block halts the sequence", async () => {
		const hooks = [
			makeHookConfig({ matcher: "*", id: "h1", command: "exit 1" }),
			makeHookConfig({ matcher: "*", id: "h2", command: "exit 0" }),
		]
		const results = await executeHooksSequential(hooks, baseEvent, { stopOnBlock: true })
		expect(results).toHaveLength(1)
		expect(results[0].blocked).toBe(true)
		expect(getBlockingResult(results)?.hookId).toBe("h1")
	})
})
