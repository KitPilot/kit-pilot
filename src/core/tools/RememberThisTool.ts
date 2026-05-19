import { Task } from "../task/Task"
import { formatResponse } from "../prompts/responses"
import { BaseTool, ToolCallbacks } from "./BaseTool"
import { writeMemory, MEMORY_TYPES, type MemoryType } from "./memoryStore"

interface RememberThisParams {
	name: string
	type: string
	description: string
	content: string
}

export class RememberThisTool extends BaseTool<"remember_this"> {
	readonly name = "remember_this" as const

	async execute(params: RememberThisParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { pushToolResult, handleError, askApproval } = callbacks

		try {
			if (!params || typeof params !== "object") {
				task.consecutiveMistakeCount++
				task.recordToolError("remember_this")
				pushToolResult(formatResponse.toolError("remember_this requires a parameters object"))
				return
			}

			const { name, type, description, content } = params
			if (!MEMORY_TYPES.includes(type as MemoryType)) {
				task.consecutiveMistakeCount++
				task.recordToolError("remember_this")
				pushToolResult(
					formatResponse.toolError(
						`type must be one of: ${MEMORY_TYPES.join(", ")}. Got: ${JSON.stringify(type)}`,
					),
				)
				return
			}

			const approvalMsg = JSON.stringify({
				tool: "rememberThis",
				name,
				type,
				description,
				content,
			})
			const didApprove = await askApproval("tool", approvalMsg)
			if (!didApprove) {
				pushToolResult("User declined to save the memory.")
				return
			}

			const result = await writeMemory({ name, type: type as MemoryType, description, content })
			const verb = result.created ? "Saved new" : "Updated existing"
			pushToolResult(
				formatResponse.toolResult(
					`${verb} memory "${name}" (${type}) at ${result.filePath}. It will be auto-loaded in future conversations.`,
				),
			)
		} catch (error) {
			task.consecutiveMistakeCount++
			task.recordToolError("remember_this")
			const msg = error instanceof Error ? error.message : String(error)
			pushToolResult(formatResponse.toolError(`Failed to save memory: ${msg}`))
			await handleError("remember_this", error as Error)
		}
	}
}

export const rememberThisTool = new RememberThisTool()
