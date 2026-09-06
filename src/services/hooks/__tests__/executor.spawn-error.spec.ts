import { EventEmitter } from "events"
import { beforeEach, describe, expect, it, vi } from "vitest"

const spawn = vi.fn()

vi.mock("child_process", () => ({ spawn: (...args: unknown[]) => spawn(...args) }))

import { executeHook } from "../executor"
import { makeHookConfig } from "../types"

const baseEvent = {
	eventType: "PreToolUse" as const,
	toolName: "attempt_completion",
	toolArgs: {},
}

/**
 * A child process that never starts.
 *
 * Node reports this through an `error` event rather than a `close` event, so
 * there is no exit code at all. A real shell turns a missing command into exit
 * 127 and reaches the close handler instead, which is why this path needs a
 * stub to reach.
 */
function childThatFailsToStart(error: Error) {
	const child = new EventEmitter() as EventEmitter & {
		stdout: EventEmitter
		stderr: EventEmitter
		stdin: EventEmitter & { write: () => void; end: () => void }
		kill: () => void
	}
	child.stdout = new EventEmitter()
	child.stderr = new EventEmitter()
	const stdin = new EventEmitter() as EventEmitter & { write: () => void; end: () => void }
	stdin.write = () => {}
	stdin.end = () => {}
	child.stdin = stdin
	child.kill = () => {}

	setTimeout(() => child.emit("error", error), 0)
	return child
}

beforeEach(() => {
	spawn.mockReset()
})

describe("a plain command that cannot start", () => {
	// The verification hook is the only thing that runs the project's check. A
	// command that never ran has not passed, so it must stop the completion
	// rather than let it through.
	it("blocks the tool call", async () => {
		spawn.mockImplementation(() => childThatFailsToStart(new Error("spawn ENOENT")))

		const hook = makeHookConfig({ matcher: "*", command: "pnpm check-types", contract: "plain-command" })
		const result = await executeHook(hook, baseEvent)

		expect(result.blocked).toBe(true)
	})

	it("gives a reason that names the failure", async () => {
		spawn.mockImplementation(() => childThatFailsToStart(new Error("spawn ENOENT")))

		const hook = makeHookConfig({ matcher: "*", command: "pnpm check-types", contract: "plain-command" })
		const result = await executeHook(hook, baseEvent)

		expect(result.error).toContain("did not start")
		expect(result.error).toContain("spawn ENOENT")
		expect(result.exitCode).toBe(-1)
	})

	// A user's hook script keeps the Claude Code contract, where a hook that
	// cannot start is reported and does not block.
	it("does not block under the hook contract", async () => {
		spawn.mockImplementation(() => childThatFailsToStart(new Error("spawn ENOENT")))

		const hook = makeHookConfig({ matcher: "*", command: "./my-hook.sh" })
		const result = await executeHook(hook, baseEvent)

		expect(result.blocked).toBe(false)
		expect(result.error).toContain("Hook execution error")
	})
})
