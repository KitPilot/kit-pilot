import { describe, it, expect, vi, beforeEach } from "vitest"

import { ClineProvider } from "../ClineProvider"

// Unit-test interruptAndSubmit via prototype.call on a lightweight mock, the
// same pattern the delegation specs use.
const call = (provider: any, text: string, images?: string[]) =>
	(ClineProvider.prototype as any).interruptAndSubmit.call(provider, text, images)

describe("ClineProvider.interruptAndSubmit", () => {
	let addMessage: ReturnType<typeof vi.fn>
	let cancelTask: ReturnType<typeof vi.fn>
	let task: any
	let provider: any

	beforeEach(() => {
		addMessage = vi.fn()
		cancelTask = vi.fn().mockResolvedValue(undefined)
		task = { parentTask: undefined, messageQueueService: { addMessage } }
		provider = {
			interrupting: false,
			getCurrentTask: vi.fn(() => task),
			cancelTask,
			log: vi.fn(),
		}
	})

	it("aborts and rehydrates, then delivers the message to the resumed task", async () => {
		await call(provider, "remove the section instead")

		expect(cancelTask).toHaveBeenCalledTimes(1)
		expect(addMessage).toHaveBeenCalledWith("remove the section instead", undefined)
		// cancel ran before delivery
		expect(cancelTask.mock.invocationCallOrder[0]).toBeLessThan(addMessage.mock.invocationCallOrder[0])
		expect(provider.interrupting).toBe(false)
	})

	it("falls back to queue (no interrupt) when a subtask is active", async () => {
		task.parentTask = { taskId: "parent" }

		await call(provider, "do it differently")

		expect(cancelTask).not.toHaveBeenCalled()
		expect(addMessage).toHaveBeenCalledWith("do it differently", undefined)
	})

	it("falls back to queue when an interrupt is already in flight", async () => {
		provider.interrupting = true

		await call(provider, "second message")

		expect(cancelTask).not.toHaveBeenCalled()
		expect(addMessage).toHaveBeenCalledWith("second message", undefined)
	})

	it("ignores an empty message", async () => {
		await call(provider, "   ")

		expect(cancelTask).not.toHaveBeenCalled()
		expect(addMessage).not.toHaveBeenCalled()
	})

	it("still delivers the message if the abort pipeline throws", async () => {
		cancelTask.mockRejectedValueOnce(new Error("abort failed"))

		await call(provider, "keep this")

		expect(addMessage).toHaveBeenCalledWith("keep this", undefined)
		expect(provider.interrupting).toBe(false)
	})
})
