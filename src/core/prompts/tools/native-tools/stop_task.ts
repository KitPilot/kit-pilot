import type OpenAI from "openai"

const STOP_TASK_DESCRIPTION = `Kill a background task started with execute_command's run_in_background (SIGKILL to its whole process tree). Returns the final status and any output you hadn't read yet. Use when a dev server / watcher is no longer needed or a runaway task must be stopped.

Parameters:
- id: (required) The background task id from execute_command.

Example:
{ "id": 1 }`

export default {
	type: "function",
	function: {
		name: "stop_task",
		description: STOP_TASK_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				id: {
					type: "number",
					description: "Background task id returned by execute_command with run_in_background",
				},
			},
			required: ["id"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
