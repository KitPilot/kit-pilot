import { KitPilotEventName, type KitPilotAPI } from "@kit-pilot/types"

type WaitForOptions = {
	timeout?: number
	interval?: number
}

export const waitFor = (
	condition: (() => Promise<boolean>) | (() => boolean),
	{ timeout = 30_000, interval = 250 }: WaitForOptions = {},
) => {
	let timeoutId: NodeJS.Timeout | undefined = undefined
	// The poll and the timeout race each other. Without this the poll keeps
	// rescheduling itself after the timeout has already won, so every call that
	// timed out leaves a timer running for the life of the process.
	let settled = false

	return Promise.race([
		new Promise<void>((resolve) => {
			const check = async () => {
				if (settled) {
					return
				}

				const result = condition()
				const isSatisfied = result instanceof Promise ? await result : result

				if (settled) {
					return
				}

				if (isSatisfied) {
					settled = true

					if (timeoutId) {
						clearTimeout(timeoutId)
						timeoutId = undefined
					}

					resolve()
				} else {
					setTimeout(check, interval)
				}
			}

			check()
		}),
		new Promise((_, reject) => {
			timeoutId = setTimeout(() => {
				settled = true
				reject(new Error(`Timeout after ${Math.floor(timeout / 1000)}s`))
			}, timeout)
		}),
	])
}

type WaitUntilAbortedOptions = WaitForOptions & {
	api: KitPilotAPI
	taskId: string
}

export const waitUntilAborted = async ({ api, taskId, ...options }: WaitUntilAbortedOptions) => {
	const set = new Set<string>()
	api.on(KitPilotEventName.TaskAborted, (taskId) => set.add(taskId))
	await waitFor(() => set.has(taskId), options)
}

type WaitUntilCompletedOptions = WaitForOptions & {
	api: KitPilotAPI
	taskId: string
}

export const waitUntilCompleted = async ({ api, taskId, ...options }: WaitUntilCompletedOptions) => {
	const set = new Set<string>()
	api.on(KitPilotEventName.TaskCompleted, (taskId) => set.add(taskId))
	await waitFor(() => set.has(taskId), options)
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
