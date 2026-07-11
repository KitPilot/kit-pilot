import { TaskStatus } from "@kit-pilot/types"

import { BackgroundTaskRegistry, type BackgroundTask } from "./BackgroundTaskRegistry"

/**
 * Delivers background-task events (process exited / notify_on matched) into
 * the agent conversation using a pending-buffer model:
 *
 * - Events land in a global buffer.
 * - While the agent is WORKING, the buffer is drained into the next turn's
 *   environment details (`drainPendingEvents`) — free, and safe: it never
 *   interferes with a streaming turn or an open approval prompt.
 * - When the agent is IDLE (parked at an idle-class ask like
 *   completion_result), the event wakes it via `task.submitUserMessage()` —
 *   one billed turn — gated by the `backgroundTaskWakeEnabled` setting and a
 *   global wake-rate cap. submitUserMessage is ONLY safe at idle-class asks:
 *   anywhere else the injected text could be consumed as the answer to the
 *   next ask (e.g. an approval prompt), so everything non-idle goes through
 *   the env-details path.
 * - With no task at all, events wait in the buffer for the next task's first
 *   turn.
 */

export interface BackgroundTaskEventText {
	backgroundTaskId: number
	text: string
	at: number
}

/** Minimal surface the dispatcher needs from ClineProvider (kept narrow for tests). */
export interface BackgroundTaskNotificationHost {
	getCurrentTask(): { taskStatus: TaskStatus; submitUserMessage(text: string): Promise<void> } | undefined
	getState(): Promise<{ backgroundTaskWakeEnabled?: boolean } | undefined>
}

/** Tail of recent output included in an event message. */
const EVENT_OUTPUT_TAIL_CHARS = 2_000
/** Idle-wake rate cap: at most this many wakes per rolling minute (globally). */
const MAX_WAKES_PER_MINUTE = 3

let host: BackgroundTaskNotificationHost | undefined
let subscribed = false
let pendingEvents: BackgroundTaskEventText[] = []
let wakeTimestamps: number[] = []

/**
 * Wire the dispatcher to the registry's events. Idempotent; call once with a
 * live provider reference (e.g. from ClineProvider's constructor).
 */
export function initBackgroundTaskNotifications(notificationHost: BackgroundTaskNotificationHost): void {
	host = notificationHost
	if (subscribed) {
		return
	}
	subscribed = true

	BackgroundTaskRegistry.events.on("taskExited", (task) => {
		void enqueueEvent(task, formatExitEvent(task))
	})
	BackgroundTaskRegistry.events.on("patternMatched", (task, matchedLine) => {
		void enqueueEvent(task, formatPatternEvent(task, matchedLine))
	})
}

/**
 * Env-details drain: returns and clears all pending event texts. Called every
 * agent turn, which is what delivers events while the agent is working.
 */
export function drainPendingEvents(): string[] {
	const events = pendingEvents
	pendingEvents = []
	return events.map((e) => e.text)
}

export function hasPendingEvents(): boolean {
	return pendingEvents.length > 0
}

function formatExitEvent(task: BackgroundTask): string {
	const exit = task.exitDetails
	const how = exit?.signalName
		? `was terminated by signal ${exit.signalName}`
		: `exited with code ${exit?.exitCode ?? "<unknown>"}`
	const tail = BackgroundTaskRegistry.peekTail(task.id, EVENT_OUTPUT_TAIL_CHARS)
	// The tail is included in the event, so mark it read — env details and
	// check_task must not re-deliver the same output.
	BackgroundTaskRegistry.markDelivered(task.id)
	return [
		`[Background task #${task.id} ('${task.command}') ${how}.]`,
		tail ? `Recent output:\n${tail}` : "",
		task.artifactId ? `Full output: read_command_output with artifact_id '${task.artifactId}'.` : "",
	]
		.filter(Boolean)
		.join("\n")
}

function formatPatternEvent(task: BackgroundTask, matchedLine: string): string {
	return `[Background task #${task.id} ('${task.command}'): output matched notify_on pattern — "${matchedLine}". Use check_task(id: ${task.id}) for full output.]`
}

async function enqueueEvent(task: BackgroundTask, text: string): Promise<void> {
	// Coalesce: a newer event for the same background task replaces the older
	// one (e.g. pattern match superseded by exit).
	pendingEvents = pendingEvents.filter((e) => e.backgroundTaskId !== task.id)
	pendingEvents.push({ backgroundTaskId: task.id, text, at: Date.now() })

	await maybeWakeIdleTask()
}

async function maybeWakeIdleTask(): Promise<void> {
	if (!host) {
		return
	}

	try {
		const agentTask = host.getCurrentTask()
		if (!agentTask || agentTask.taskStatus !== TaskStatus.Idle) {
			// Working / approval-parked / resumable / no task: env details of
			// the next turn deliver the buffer. Never inject outside Idle.
			return
		}

		const state = await host.getState()
		if (state?.backgroundTaskWakeEnabled === false) {
			return
		}

		// Storm protection: cap wakes per rolling minute; overflow stays
		// buffered for passive delivery.
		const now = Date.now()
		wakeTimestamps = wakeTimestamps.filter((t) => now - t < 60_000)
		if (wakeTimestamps.length >= MAX_WAKES_PER_MINUTE) {
			return
		}

		const events = drainPendingEvents()
		if (events.length === 0) {
			return
		}

		wakeTimestamps.push(now)
		await agentTask.submitUserMessage(events.join("\n\n"))
	} catch (error) {
		console.error(
			"[background-tasks] failed to deliver notification:",
			error instanceof Error ? error.message : error,
		)
	}
}

/**
 * Test-only: reset all module state. Clears the subscribed latch too, because
 * BackgroundTaskRegistry.resetForTests() removes all event listeners — the
 * next init must be able to resubscribe.
 */
export function resetBackgroundTaskNotificationsForTests(): void {
	host = undefined
	subscribed = false
	pendingEvents = []
	wakeTimestamps = []
}
