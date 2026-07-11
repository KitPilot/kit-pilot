import type OpenAI from "openai"

const CHECK_TASK_DESCRIPTION = `Read the status and new output of a background task started with execute_command's run_in_background. Returns whether the task is still running (or its exit code), plus any output produced since your last check. Optionally wait (bounded) for an output pattern — useful for readiness signals like a dev server's "listening" line.

Parameters:
- id: (required) The background task id from execute_command.
- wait_for_pattern: (optional) Regular expression; the call polls until it matches new output, the process exits, or the wait window elapses.
- wait_seconds: (optional) Wait window in seconds for wait_for_pattern (default 30, max 60).

Example: Check for new output
{ "id": 1, "wait_for_pattern": null, "wait_seconds": null }

Example: Wait until a dev server is ready
{ "id": 1, "wait_for_pattern": "ready in \\\\d+ms|listening", "wait_seconds": 20 }`

export default {
	type: "function",
	function: {
		name: "check_task",
		description: CHECK_TASK_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				id: {
					type: "number",
					description: "Background task id returned by execute_command with run_in_background",
				},
				wait_for_pattern: {
					type: ["string", "null"],
					description: "Regular expression to wait for in new output; returns early on match or process exit",
				},
				wait_seconds: {
					type: ["number", "null"],
					description: "How long to wait for wait_for_pattern in seconds (default 30, max 60)",
				},
			},
			required: ["id", "wait_for_pattern", "wait_seconds"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
