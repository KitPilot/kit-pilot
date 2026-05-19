import { Task } from "../task/Task"
import { formatResponse } from "../prompts/responses"
import { BaseTool, ToolCallbacks } from "./BaseTool"
import { deleteMemory } from "./memoryStore"

interface ForgetThisParams {
	name: string
}

export class ForgetThisTool extends BaseTool<"forget_this"> {
	readonly name = "forget_this" as const

	async execute(params: ForgetThisParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { pushToolResult, handleError } = callbacks

		try {
			if (!params || typeof params !== "object" || typeof params.name !== "string") {
				task.consecutiveMistakeCount++
				task.recordToolError("forget_this")
				pushToolResult(formatResponse.toolError("forget_this requires a 'name' string parameter"))
				return
			}

			const result = await deleteMemory(params.name)

			if (!result.fileDeleted && !result.indexUpdated) {
				pushToolResult(
					formatResponse.toolResult(
						`Memory "${params.name}" did not exist — nothing to delete.`,
					),
				)
				return
			}

			const parts: string[] = []
			if (result.fileDeleted) parts.push(`deleted ${result.filePath}`)
			if (result.indexUpdated) parts.push("removed from MEMORY.md index")
			pushToolResult(formatResponse.toolResult(`Forgot memory "${params.name}": ${parts.join(", ")}.`))
		} catch (error) {
			task.consecutiveMistakeCount++
			task.recordToolError("forget_this")
			const msg = error instanceof Error ? error.message : String(error)
			pushToolResult(formatResponse.toolError(`Failed to delete memory: ${msg}`))
			await handleError("forget_this", error as Error)
		}
	}
}

export const forgetThisTool = new ForgetThisTool()
