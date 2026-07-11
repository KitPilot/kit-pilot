import delay from "delay"

import { Task } from "../task/Task"
import { Terminal } from "../../integrations/terminal/Terminal"
import { BackgroundTaskRegistry, type BackgroundTask } from "../../services/background-tasks/BackgroundTaskRegistry"
import { BaseTool, ToolCallbacks } from "./BaseTool"

interface CheckTaskParams {
	id: number
	wait_for_pattern?: string | null
	wait_seconds?: number | null
}

/** Poll interval while waiting for a pattern/exit. */
const WAIT_POLL_MS = 250
/** Default and maximum bounded wait. */
const DEFAULT_WAIT_SECONDS = 30
const MAX_WAIT_SECONDS = 60

/**
 * Read status + new output of a background task started via execute_command's
 * run_in_background (or a legacy timeout-backgrounded command). Read-only —
 * requires no approval, mirroring read_command_output.
 */
export class CheckTaskTool extends BaseTool<"check_task"> {
	readonly name = "check_task" as const

	async execute(params: CheckTaskParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { handleError, pushToolResult } = callbacks

		try {
			const id = Number(params.id)
			const bgTask = Number.isInteger(id) ? BackgroundTaskRegistry.get(id) : undefined

			if (!bgTask) {
				task.consecutiveMistakeCount++
				task.recordToolError("check_task")
				pushToolResult(
					`No background task with id ${params.id}. ${describeKnownTasks()} Task ids come from execute_command with run_in_background.`,
				)
				return
			}

			let waitPattern: RegExp | undefined
			if (params.wait_for_pattern) {
				try {
					waitPattern = new RegExp(params.wait_for_pattern)
				} catch (error) {
					task.consecutiveMistakeCount++
					task.recordToolError("check_task")
					pushToolResult(
						`Invalid wait_for_pattern: ${error instanceof Error ? error.message : "not a valid regular expression"}`,
					)
					return
				}
			}

			task.consecutiveMistakeCount = 0

			// Collect new output; when waiting, keep polling until the pattern
			// appears in what we've collected, the process leaves "running", or
			// the bounded wait elapses. Everything consumed is returned, so the
			// cursor semantics hold (the model sees all output we advanced past).
			let collected = ""
			let skippedBytes = 0
			let patternOutcome: "matched" | "timeout" | undefined

			const readOnce = () => {
				const read = BackgroundTaskRegistry.readNewOutput(id)
				if (read) {
					collected += read.text
					skippedBytes += read.skippedBytes
				}
			}

			readOnce()

			if (waitPattern && bgTask.status === "running" && !waitPattern.test(collected)) {
				const waitSeconds = Math.min(
					params.wait_seconds && params.wait_seconds > 0 ? params.wait_seconds : DEFAULT_WAIT_SECONDS,
					MAX_WAIT_SECONDS,
				)
				const deadline = Date.now() + waitSeconds * 1000

				while (Date.now() < deadline) {
					await delay(WAIT_POLL_MS)
					readOnce()
					if (waitPattern.test(collected)) {
						patternOutcome = "matched"
						break
					}
					if (BackgroundTaskRegistry.get(id)?.status !== "running") {
						break
					}
				}
				if (waitPattern && patternOutcome === undefined && waitPattern.test(collected)) {
					patternOutcome = "matched"
				}
				if (
					waitPattern &&
					patternOutcome === undefined &&
					BackgroundTaskRegistry.get(id)?.status === "running"
				) {
					patternOutcome = "timeout"
				}
			} else if (waitPattern && waitPattern.test(collected)) {
				patternOutcome = "matched"
			}

			// The entry may have been pruned by the final read; use the last snapshot.
			const finalTask = BackgroundTaskRegistry.get(id) ?? bgTask

			await task.say(
				"tool",
				JSON.stringify({
					tool: "checkTask",
					id,
					command: finalTask.command,
					status: finalTask.status,
					exitCode: finalTask.exitDetails?.exitCode,
				}),
			)

			pushToolResult(formatCheckResult(finalTask, collected, skippedBytes, patternOutcome))
		} catch (error) {
			await handleError("checking background task", error as Error)
		}
	}
}

function describeKnownTasks(): string {
	const tasks = BackgroundTaskRegistry.list()
	if (tasks.length === 0) {
		return "There are no background tasks."
	}
	const summary = tasks.map((t) => `#${t.id} ('${t.command}', ${t.status})`).join(", ")
	return `Known background tasks: ${summary}.`
}

export function formatStatusLine(bgTask: BackgroundTask): string {
	switch (bgTask.status) {
		case "running":
			return `Background task #${bgTask.id} ('${bgTask.command}') is running (started ${Math.round((Date.now() - bgTask.startedAt) / 1000)}s ago).`
		case "killed":
			return `Background task #${bgTask.id} ('${bgTask.command}') was killed.`
		case "exited": {
			const exit = bgTask.exitDetails
			const how = exit?.signalName
				? `terminated by signal ${exit.signalName}`
				: `exited with code ${exit?.exitCode ?? "<unknown>"}`
			return `Background task #${bgTask.id} ('${bgTask.command}') ${how}.`
		}
	}
}

function formatCheckResult(
	bgTask: BackgroundTask,
	collected: string,
	skippedBytes: number,
	patternOutcome: "matched" | "timeout" | undefined,
): string {
	const parts: string[] = [formatStatusLine(bgTask)]

	if (patternOutcome === "matched") {
		parts.push(`The wait_for_pattern matched in the output below.`)
	} else if (patternOutcome === "timeout") {
		parts.push(`The wait_for_pattern did NOT match within the wait window; the task is still running.`)
	}

	if (skippedBytes > 0) {
		parts.push(
			`Note: ${skippedBytes} bytes of older output were evicted from the buffer between checks${bgTask.artifactId ? ` (full log: read_command_output with artifact_id '${bgTask.artifactId}')` : ""}.`,
		)
	}

	parts.push(collected ? `New output:\n${Terminal.compressTerminalOutput(collected)}` : `No new output.`)

	if (bgTask.status !== "running" && bgTask.artifactId) {
		parts.push(`Full output artifact: read_command_output with artifact_id '${bgTask.artifactId}'.`)
	}

	return parts.join("\n")
}

export const checkTaskTool = new CheckTaskTool()
