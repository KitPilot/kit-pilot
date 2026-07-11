import { EventEmitter } from "events"

vitest.mock("../../../integrations/terminal/Terminal", () => ({
	Terminal: {
		compressTerminalOutput: vitest.fn((s: string) => s),
	},
}))

import { checkTaskTool } from "../CheckTaskTool"
import { stopTaskTool } from "../StopTaskTool"
import { BackgroundTaskRegistry } from "../../../services/background-tasks/BackgroundTaskRegistry"
import type { KitPilotTerminal, KitPilotTerminalProcess } from "../../../integrations/terminal/types"

const makeProcess = () => {
	const proc = new EventEmitter() as unknown as KitPilotTerminalProcess & { abort: ReturnType<typeof vitest.fn> }
	proc.command = "cmd"
	proc.isHot = false
	proc.abort = vitest.fn()
	return proc
}

const registerTask = (over: Record<string, unknown> = {}) =>
	BackgroundTaskRegistry.register({
		agentTaskId: "agent-1",
		command: "pnpm dev",
		cwd: "/repo",
		terminal: { id: 1 } as unknown as KitPilotTerminal,
		process: makeProcess(),
		executionId: "77",
		...over,
	} as Parameters<typeof BackgroundTaskRegistry.register>[0])

describe("check_task / stop_task tools", () => {
	let mockTask: any
	let pushToolResult: ReturnType<typeof vitest.fn>
	let handleError: ReturnType<typeof vitest.fn>

	const callbacks = () => ({
		askApproval: vitest.fn().mockResolvedValue(true),
		handleError,
		pushToolResult,
	})

	beforeEach(() => {
		BackgroundTaskRegistry.resetForTests()
		pushToolResult = vitest.fn()
		handleError = vitest.fn()
		mockTask = {
			consecutiveMistakeCount: 0,
			recordToolError: vitest.fn(),
			say: vitest.fn().mockResolvedValue(undefined),
		}
	})

	describe("check_task", () => {
		it("returns status and only new output since the last check", async () => {
			const bg = registerTask()
			BackgroundTaskRegistry.appendOutput(bg.id, "first chunk\n")

			await checkTaskTool.execute({ id: bg.id }, mockTask, callbacks() as any)
			expect(pushToolResult.mock.calls[0][0]).toContain("is running")
			expect(pushToolResult.mock.calls[0][0]).toContain("first chunk")

			BackgroundTaskRegistry.appendOutput(bg.id, "second chunk\n")
			pushToolResult.mockClear()

			await checkTaskTool.execute({ id: bg.id }, mockTask, callbacks() as any)
			const result = pushToolResult.mock.calls[0][0]
			expect(result).toContain("second chunk")
			expect(result).not.toContain("first chunk")
		})

		it("reports exit code for finished tasks", async () => {
			const bg = registerTask()
			BackgroundTaskRegistry.appendOutput(bg.id, "done\n")
			BackgroundTaskRegistry.notifyExit(bg.id, { exitCode: 3 })

			await checkTaskTool.execute({ id: bg.id }, mockTask, callbacks() as any)
			expect(pushToolResult.mock.calls[0][0]).toContain("exited with code 3")
		})

		it("errors helpfully on an unknown id", async () => {
			registerTask() // id 1 exists
			await checkTaskTool.execute({ id: 99 }, mockTask, callbacks() as any)

			expect(mockTask.recordToolError).toHaveBeenCalledWith("check_task")
			const result = pushToolResult.mock.calls[0][0]
			expect(result).toContain("No background task with id 99")
			expect(result).toContain("#1")
		})

		it("rejects an invalid wait_for_pattern", async () => {
			const bg = registerTask()
			await checkTaskTool.execute({ id: bg.id, wait_for_pattern: "(bad" }, mockTask, callbacks() as any)
			expect(pushToolResult.mock.calls[0][0]).toContain("Invalid wait_for_pattern")
		})

		it("wait_for_pattern returns early when the pattern arrives", async () => {
			const bg = registerTask()

			const done = checkTaskTool.execute(
				{ id: bg.id, wait_for_pattern: "ready", wait_seconds: 10 },
				mockTask,
				callbacks() as any,
			)
			// Feed the matching output shortly after the wait starts.
			setTimeout(() => BackgroundTaskRegistry.appendOutput(bg.id, "server ready\n"), 300)

			const start = Date.now()
			await done
			expect(Date.now() - start).toBeLessThan(5_000)
			const result = pushToolResult.mock.calls[0][0]
			expect(result).toContain("wait_for_pattern matched")
			expect(result).toContain("server ready")
		})

		it("wait_for_pattern stops early when the process exits", async () => {
			const bg = registerTask()

			const done = checkTaskTool.execute(
				{ id: bg.id, wait_for_pattern: "never-matches", wait_seconds: 30 },
				mockTask,
				callbacks() as any,
			)
			setTimeout(() => BackgroundTaskRegistry.notifyExit(bg.id, { exitCode: 1 }), 300)

			const start = Date.now()
			await done
			expect(Date.now() - start).toBeLessThan(5_000)
			expect(pushToolResult.mock.calls[0][0]).toContain("exited with code 1")
		})
	})

	describe("stop_task", () => {
		it("kills a running task and returns unread output", async () => {
			const proc = makeProcess()
			const bg = registerTask({ process: proc })
			BackgroundTaskRegistry.appendOutput(bg.id, "unread tail\n")

			await stopTaskTool.execute({ id: bg.id }, mockTask, callbacks() as any)

			expect(proc.abort).toHaveBeenCalled()
			const result = pushToolResult.mock.calls[0][0]
			expect(result).toContain(`Killed background task #${bg.id}`)
			expect(result).toContain("unread tail")
		})

		it("reports an already-finished task without killing", async () => {
			const proc = makeProcess()
			const bg = registerTask({ process: proc })
			BackgroundTaskRegistry.notifyExit(bg.id, { exitCode: 0 })

			await stopTaskTool.execute({ id: bg.id }, mockTask, callbacks() as any)

			expect(proc.abort).not.toHaveBeenCalled()
			expect(pushToolResult.mock.calls[0][0]).toContain("Nothing to kill")
		})

		it("errors on an unknown id", async () => {
			await stopTaskTool.execute({ id: 42 }, mockTask, callbacks() as any)
			expect(mockTask.recordToolError).toHaveBeenCalledWith("stop_task")
			expect(pushToolResult.mock.calls[0][0]).toContain("No background task with id 42")
		})
	})
})
