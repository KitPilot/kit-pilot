import type OpenAI from "openai"

const EXECUTE_COMMAND_DESCRIPTION = `Request to execute a CLI command on the system. Use this when you need to perform system operations or run specific commands to accomplish any step in the user's task. You must tailor your command to the user's system and provide a clear explanation of what the command does. For command chaining, use the appropriate chaining syntax for the user's shell. Prefer to execute complex CLI commands over creating executable scripts, as they are more flexible and easier to run. Prefer relative commands and paths that avoid location sensitivity for terminal consistency.

Parameters:
- command: (required) The CLI command to execute. This should be valid for the current operating system. Ensure the command is properly formatted and does not contain any harmful instructions.
- cwd: (optional) The working directory to execute the command in
- timeout: (optional) Timeout in seconds. When exceeded, the command keeps running in the background and you receive the output so far. Set this for commands that may run indefinitely, such as dev servers or file watchers, so you can proceed without waiting for them to exit.
- run_in_background: (optional) Start the command as a background task and return immediately with a task id. Use for dev servers, watchers, and long test suites/builds you want to keep working alongside. Check progress with check_task, kill with stop_task. You are notified when the process exits.
- notify_on: (optional, requires run_in_background) A regular expression tested against the command's output; you are notified the first time it matches. Use it for readiness signals, e.g. "ready in \\\\d+ms" or "listening on port".

Example: Executing ls in a specific directory if directed
{ "command": "ls -la", "cwd": "/home/user/projects", "timeout": null, "run_in_background": null, "notify_on": null }

Example: Running a build with a timeout
{ "command": "npm run build", "cwd": null, "timeout": 30, "run_in_background": null, "notify_on": null }

Example: Starting a dev server in the background and getting notified when it's up
{ "command": "npm run dev", "cwd": null, "timeout": null, "run_in_background": true, "notify_on": "ready in \\\\d+ms|listening" }

Example: Running a long test suite in the background while you keep working
{ "command": "pnpm test", "cwd": null, "timeout": null, "run_in_background": true, "notify_on": null }`

const COMMAND_PARAMETER_DESCRIPTION = `Shell command to execute`

const CWD_PARAMETER_DESCRIPTION = `Optional working directory for the command, relative or absolute`

const TIMEOUT_PARAMETER_DESCRIPTION = `Timeout in seconds. When exceeded, the command continues running in the background and output collected so far is returned. Use this for long-running processes like dev servers, file watchers, or any command that may not exit on its own`

const RUN_IN_BACKGROUND_PARAMETER_DESCRIPTION = `Start as a background task: returns immediately with a task id instead of waiting for the command to finish. The process keeps running; read incremental output/status with check_task, kill it with stop_task. You are notified when it exits. Use for dev servers, watchers, and long builds/test suites you want to work alongside`

const NOTIFY_ON_PARAMETER_DESCRIPTION = `Regular expression tested against the background task's output; you are notified on its first match. Only meaningful with run_in_background. Use for readiness signals like "ready in \\d+ms" or "listening on port \\d+"`

export default {
	type: "function",
	function: {
		name: "execute_command",
		description: EXECUTE_COMMAND_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				command: {
					type: "string",
					description: COMMAND_PARAMETER_DESCRIPTION,
				},
				cwd: {
					type: ["string", "null"],
					description: CWD_PARAMETER_DESCRIPTION,
				},
				timeout: {
					type: ["number", "null"],
					description: TIMEOUT_PARAMETER_DESCRIPTION,
				},
				run_in_background: {
					type: ["boolean", "null"],
					description: RUN_IN_BACKGROUND_PARAMETER_DESCRIPTION,
				},
				notify_on: {
					type: ["string", "null"],
					description: NOTIFY_ON_PARAMETER_DESCRIPTION,
				},
			},
			required: ["command", "cwd", "timeout", "run_in_background", "notify_on"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
