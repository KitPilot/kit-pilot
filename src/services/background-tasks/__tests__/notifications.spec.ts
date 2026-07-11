import { EventEmitter } from "events"

import { TaskStatus } from "@kit-pilot/types"

import { BackgroundTaskRegistry } from "../BackgroundTaskRegistry"
import {
	initBackgroundTaskNotifications,
	drainPendingEvents,
	hasPendingEvents,
	resetBackgroundTaskNotificationsForTests,
	type BackgroundTaskNotificationHost,
} from "../notifications"
import type { KitPilotTerminal, KitPilotTerminalProcess } from "../../../integrations/terminal/types"

const makeProcess = () => {
	const proc = new EventEmitter() as unknown as KitPilotTerminalProcess
	proc.command = "cmd"
	proc.isHot = false
	proc.abort = vi.fn() as never
	return proc
}

const registerTask = (over: Record<string, unknown> = {}) =>
	BackgroundTaskRegistry.register({
		agentTaskId: "agent-1",
		command: "pnpm dev",
		cwd: "/repo",
		terminal: { id: 5 } as unknown as KitPilotTerminal,
		process: makeProcess(),
		executionId: "9",
		...over,
	} as Parameters<typeof BackgroundTaskRegistry.register>[0])

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe("background task notifications", () => {
	let submitUserMessage: ReturnType<typeof vi.fn>
	let taskStatus: TaskStatus
	let hasTask: boolean
	let wakeEnabled: boolean | undefined

	const host: BackgroundTaskNotificationHost = {
		getCurrentTask: () =>
			hasTask
				? ({ taskStatus, submitUserMessage } as unknown as ReturnType<
						BackgroundTaskNotificationHost["getCurrentTask"]
					>)
				: undefined,
		getState: async () => ({ backgroundTaskWakeEnabled: wakeEnabled }),
	}

	beforeEach(() => {
		BackgroundTaskRegistry.resetForTests()
		resetBackgroundTaskNotificationsForTests()
		submitUserMessage = vi.fn().mockResolvedValue(undefined)
		taskStatus = TaskStatus.Idle
		hasTask = true
		wakeEnabled = undefined
		initBackgroundTaskNotifications(host)
	})

	it("wakes an idle task on background exit", async () => {
		const bg = registerTask()
		BackgroundTaskRegistry.appendOutput(bg.id, "boom\n")
		BackgroundTaskRegistry.notifyExit(bg.id, { exitCode: 1 })
		await flush()

		expect(submitUserMessage).toHaveBeenCalledTimes(1)
		const text = submitUserMessage.mock.calls[0][0]
		expect(text).toContain("Background task #1")
		expect(text).toContain("exited with code 1")
		expect(text).toContain("boom")
		// Wake consumed the buffer.
		expect(hasPendingEvents()).toBe(false)
	})

	it("buffers instead of waking while the agent is working", async () => {
		taskStatus = TaskStatus.Running
		const bg = registerTask()
		BackgroundTaskRegistry.notifyExit(bg.id, { exitCode: 0 })
		await flush()

		expect(submitUserMessage).not.toHaveBeenCalled()
		const drained = drainPendingEvents()
		expect(drained).toHaveLength(1)
		expect(drained[0]).toContain("exited with code 0")
	})

	it("never injects while parked at an approval prompt (Interactive)", async () => {
		taskStatus = TaskStatus.Interactive
		const bg = registerTask()
		BackgroundTaskRegistry.notifyExit(bg.id, { exitCode: 0 })
		await flush()

		expect(submitUserMessage).not.toHaveBeenCalled()
		expect(hasPendingEvents()).toBe(true)
	})

	it("buffers when there is no task at all", async () => {
		hasTask = false
		const bg = registerTask()
		BackgroundTaskRegistry.notifyExit(bg.id, { exitCode: 0 })
		await flush()

		expect(submitUserMessage).not.toHaveBeenCalled()
		expect(hasPendingEvents()).toBe(true)
	})

	it("respects backgroundTaskWakeEnabled = false", async () => {
		wakeEnabled = false
		const bg = registerTask()
		BackgroundTaskRegistry.notifyExit(bg.id, { exitCode: 0 })
		await flush()

		expect(submitUserMessage).not.toHaveBeenCalled()
		expect(hasPendingEvents()).toBe(true)
	})

	it("delivers pattern matches and coalesces with a later exit for the same task", async () => {
		taskStatus = TaskStatus.Running
		const bg = registerTask({ notifyOn: /ready/ })

		BackgroundTaskRegistry.appendOutput(bg.id, "server ready\n")
		await flush()
		expect(hasPendingEvents()).toBe(true)

		BackgroundTaskRegistry.notifyExit(bg.id, { exitCode: 2 })
		await flush()

		const drained = drainPendingEvents()
		expect(drained).toHaveLength(1)
		expect(drained[0]).toContain("exited with code 2")
	})

	it("caps idle wakes per minute; overflow stays buffered", async () => {
		for (let i = 0; i < 5; i++) {
			const bg = registerTask()
			BackgroundTaskRegistry.notifyExit(bg.id, { exitCode: 0 })
			await flush()
		}

		expect(submitUserMessage.mock.calls.length).toBeLessThanOrEqual(3)
		expect(hasPendingEvents()).toBe(true)
	})

	it("exit events mark the tail delivered so check_task won't re-send it", async () => {
		const bg = registerTask()
		BackgroundTaskRegistry.appendOutput(bg.id, "tail output\n")
		BackgroundTaskRegistry.notifyExit(bg.id, { exitCode: 0 })
		await flush()

		// markDelivered + exited status → pruned or empty read.
		const read = BackgroundTaskRegistry.readNewOutput(bg.id)
		expect(read === undefined || read.text === "").toBe(true)
	})
})
