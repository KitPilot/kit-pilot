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

	describe("contract: plain-command", () => {
		// A verification command such as `pnpm check-types` is not a hook script.
		// It can fail with any non-zero code, and it usually writes its errors to
		// stdout. See HookContract in ../types.

		it("does not block on exit 0", async () => {
			const hook = makeHookConfig({ matcher: "*", command: 'echo "all good"; exit 0', contract: "plain-command" })
			const result = await executeHook(hook, baseEvent)
			expect(result.blocked).toBe(false)
			expect(result.error).toBeUndefined()
		})

		it("blocks on a non-zero exit that is not 1", async () => {
			const hook = makeHookConfig({ matcher: "*", command: "exit 2", contract: "plain-command" })
			const result = await executeHook(hook, baseEvent)
			expect(result.exitCode).toBe(2)
			expect(result.blocked).toBe(true)
			expect(result.error).toContain("exited with code 2")
		})

		it("puts stdout in the block reason", async () => {
			const hook = makeHookConfig({
				matcher: "*",
				command: 'echo "src/a.ts(3,1): error TS2304: Cannot find name x"; exit 1',
				contract: "plain-command",
			})
			const result = await executeHook(hook, baseEvent)
			expect(result.blocked).toBe(true)
			expect(result.error).toContain("error TS2304")
		})

		it("puts both streams in the block reason", async () => {
			const hook = makeHookConfig({
				matcher: "*",
				command: 'echo "from stdout"; echo "from stderr" >&2; exit 3',
				contract: "plain-command",
			})
			const result = await executeHook(hook, baseEvent)
			expect(result.error).toContain("from stdout")
			expect(result.error).toContain("from stderr")
		})

		it("states the exit code when the command produces no output", async () => {
			const hook = makeHookConfig({ matcher: "*", command: "exit 7", contract: "plain-command" })
			const result = await executeHook(hook, baseEvent)
			expect(result.error).toBe("exited with code 7 and produced no output")
		})

		it("truncates a block reason that has too many lines", async () => {
			// Approximately 1,600 characters over 200 lines: the line limit applies.
			const hook = makeHookConfig({
				matcher: "*",
				command: 'for i in $(seq 1 200); do echo "err $i"; done; exit 1',
				contract: "plain-command",
			})
			const result = await executeHook(hook, baseEvent)
			expect(result.blocked).toBe(true)
			expect(result.error).toContain("lines omitted")
			// The start and the end both survive, so a compiler error and a test
			// summary are both readable.
			expect(result.error).toContain("err 1\n")
			expect(result.error).toContain("err 200")
			// The full output stays on the result for the transcript.
			expect(result.stdout).toContain("err 100")
		})

		it("truncates a block reason that is too long", async () => {
			// Approximately 9,000 characters: the character limit applies first.
			const hook = makeHookConfig({
				matcher: "*",
				command: 'for i in $(seq 1 500); do echo "failure line $i"; done; exit 1',
				contract: "plain-command",
			})
			const result = await executeHook(hook, baseEvent)
			expect(result.blocked).toBe(true)
			expect(result.error).toContain("characters omitted")
			expect(result.error!.length).toBeLessThan(result.stdout.length)
			expect(result.error).toContain("failure line 1")
			expect(result.error).toContain("failure line 500")
		})

		it("leaves the default hook contract unchanged", async () => {
			const hook = makeHookConfig({ matcher: "*", command: 'echo "on stdout"; exit 2' })
			const result = await executeHook(hook, baseEvent)
			expect(hook.contract).toBe("hook")
			expect(result.blocked).toBe(false)
			expect(result.error).toBeUndefined()
		})
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
