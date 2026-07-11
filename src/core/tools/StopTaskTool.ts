import { Task } from "../task/Task"
import { Terminal } from "../../integrations/terminal/Terminal"
import { BackgroundTaskRegistry } from "../../services/background-tasks/BackgroundTaskRegistry"
import { BaseTool, ToolCallbacks } from "./BaseTool"
import { formatStatusLine } from "./CheckTaskTool"

interface StopTaskParams {
	id: number
}

/**
 * Kill a background task (SIGKILL to its process tree). No approval prompt:
 * it only affects processes the agent itself started (each of which WAS
 * approved), and stopping is the safe direction.
 */
export class StopTaskTool extends BaseTool<"stop_task"> {
	readonly name = "stop_task" as const

	async execute(params: StopTaskParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { handleError, pushToolResult } = callbacks

		try {
			const id = Number(params.id)
			const bgTask = Number.isInteger(id) ? BackgroundTaskRegistry.get(id) : undefined

			if (!bgTask) {
				task.consecutiveMistakeCount++
				task.recordToolError("stop_task")
				pushToolResult(`No background task with id ${params.id}.`)
				return
			}

			task.consecutiveMistakeCount = 0

			const wasRunning = bgTask.status === "running"
			const stopped = BackgroundTaskRegistry.stop(id)!

			// Drain whatever output the model hadn't read yet so nothing is lost.
			const remaining = BackgroundTaskRegistry.readNewOutput(id)?.text ?? ""

			await task.say(
				"tool",
				JSON.stringify({
					tool: "stopTask",
					id,
					command: stopped.command,
					wasRunning,
				}),
			)

			pushToolResult(
				[
					wasRunning
						? `Killed background task #${id} ('${stopped.command}') and its process tree.`
						: `${formatStatusLine(stopped)} Nothing to kill.`,
					remaining ? `Final unread output:\n${Terminal.compressTerminalOutput(remaining)}` : "",
					stopped.artifactId
						? `Full output artifact: read_command_output with artifact_id '${stopped.artifactId}'.`
						: "",
				]
					.filter(Boolean)
					.join("\n"),
			)
		} catch (error) {
			await handleError("stopping background task", error as Error)
		}
	}
}

export const stopTaskTool = new StopTaskTool()
