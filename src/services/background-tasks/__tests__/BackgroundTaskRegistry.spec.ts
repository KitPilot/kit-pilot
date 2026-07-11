import { EventEmitter } from "events"

import { BackgroundTaskRegistry } from "../BackgroundTaskRegistry"
import type { KitPilotTerminal, KitPilotTerminalProcess } from "../../../integrations/terminal/types"

const makeProcess = () => {
	const proc = new EventEmitter() as unknown as KitPilotTerminalProcess & { abort: ReturnType<typeof vi.fn> }
	proc.command = "cmd"
	proc.isHot = false
	proc.abort = vi.fn()
	proc.continue = vi.fn()
	return proc
}

const makeTerminal = (id: number) => ({ id }) as unknown as KitPilotTerminal

const register = (over: Partial<Parameters<typeof BackgroundTaskRegistry.register>[0]> = {}) =>
	BackgroundTaskRegistry.register({
		agentTaskId: "agent-1",
		command: "pnpm dev",
		cwd: "/repo",
		terminal: makeTerminal(7),
		process: makeProcess(),
		executionId: "42",
		...over,
	})

describe("BackgroundTaskRegistry", () => {
	beforeEach(() => {
		BackgroundTaskRegistry.resetForTests()
	})

	it("assigns small monotonic ids", () => {
		expect(register().id).toBe(1)
		expect(register().id).toBe(2)
	})

	it("readNewOutput returns only output since the last read (cursor)", () => {
		const task = register()
		BackgroundTaskRegistry.appendOutput(task.id, "first\n")
		expect(BackgroundTaskRegistry.readNewOutput(task.id)).toEqual({ text: "first\n", skippedBytes: 0 })
		BackgroundTaskRegistry.appendOutput(task.id, "second\n")
		expect(BackgroundTaskRegistry.readNewOutput(task.id)!.text).toBe("second\n")
		expect(BackgroundTaskRegistry.readNewOutput(task.id)!.text).toBe("")
	})

	it("bounds the buffer and reports evicted bytes as skipped", () => {
		const task = register()
		BackgroundTaskRegistry.appendOutput(task.id, "x".repeat(150_000))
		const read = BackgroundTaskRegistry.readNewOutput(task.id)!
		expect(read.text.length).toBe(100_000)
		expect(read.skippedBytes).toBe(50_000)
	})

	it("fires patternMatched exactly once", () => {
		const task = register({ notifyOn: /ready in \d+ms/ })
		const matches: string[] = []
		BackgroundTaskRegistry.events.on("patternMatched", (_t, line) => matches.push(line))

		BackgroundTaskRegistry.appendOutput(task.id, "compiling...\n")
		BackgroundTaskRegistry.appendOutput(task.id, "ready in 320ms\n")
		BackgroundTaskRegistry.appendOutput(task.id, "ready in 999ms\n")

		expect(matches).toEqual(["ready in 320ms"])
	})

	it("emits taskExited once with exit details", () => {
		const task = register()
		const exits: number[] = []
		BackgroundTaskRegistry.events.on("taskExited", (t) => exits.push(t.exitDetails?.exitCode ?? -1))

		BackgroundTaskRegistry.notifyExit(task.id, { exitCode: 1 })
		BackgroundTaskRegistry.notifyExit(task.id, { exitCode: 1 })

		expect(exits).toEqual([1])
		expect(BackgroundTaskRegistry.get(task.id)?.status).toBe("exited")
	})

	it("stop kills the process tree and does NOT emit taskExited", () => {
		const proc = makeProcess()
		const task = register({ process: proc })
		const exited = vi.fn()
		BackgroundTaskRegistry.events.on("taskExited", exited)

		const stopped = BackgroundTaskRegistry.stop(task.id)

		expect(proc.abort).toHaveBeenCalled()
		expect(stopped?.status).toBe("killed")
		expect(exited).not.toHaveBeenCalled()
		// A late exit callback after the kill must not flip status or emit.
		BackgroundTaskRegistry.notifyExit(task.id, { exitCode: 137 })
		expect(exited).not.toHaveBeenCalled()
	})

	it("prunes a finished task once its output is fully read", () => {
		const task = register()
		BackgroundTaskRegistry.appendOutput(task.id, "output\n")
		BackgroundTaskRegistry.notifyExit(task.id, { exitCode: 0 })
		expect(BackgroundTaskRegistry.get(task.id)).toBeDefined()

		BackgroundTaskRegistry.readNewOutput(task.id)
		expect(BackgroundTaskRegistry.get(task.id)).toBeUndefined()
	})

	it("markDelivered advances the cursor so output is not re-delivered", () => {
		const task = register()
		BackgroundTaskRegistry.appendOutput(task.id, "seen by notification\n")
		BackgroundTaskRegistry.markDelivered(task.id)
		expect(BackgroundTaskRegistry.hasUnreadOutput(task.id)).toBe(false)
		expect(BackgroundTaskRegistry.readNewOutput(task.id)!.text).toBe("")
	})

	it("peekTail returns recent output without moving the cursor", () => {
		const task = register()
		BackgroundTaskRegistry.appendOutput(task.id, "abcdef")
		expect(BackgroundTaskRegistry.peekTail(task.id, 3)).toBe("def")
		expect(BackgroundTaskRegistry.readNewOutput(task.id)!.text).toBe("abcdef")
	})

	it("ownedTerminalIds lists registry-owned terminals for env-details dedupe", () => {
		register({ terminal: makeTerminal(3) })
		register({ terminal: makeTerminal(9) })
		expect(BackgroundTaskRegistry.ownedTerminalIds()).toEqual(new Set([3, 9]))
	})

	it("disposeAll kills running tasks and clears state", () => {
		const proc = makeProcess()
		register({ process: proc })
		BackgroundTaskRegistry.disposeAll()
		expect(proc.abort).toHaveBeenCalled()
		expect(BackgroundTaskRegistry.list()).toEqual([])
	})
})
