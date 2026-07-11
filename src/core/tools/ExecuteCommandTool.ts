import fs from "fs/promises"
import * as path from "path"
import * as vscode from "vscode"

import delay from "delay"

import { CommandExecutionStatus, DEFAULT_TERMINAL_OUTPUT_PREVIEW_SIZE, PersistedCommandOutput } from "@kit-pilot/types"

import { Task } from "../task/Task"

import { ToolUse, ToolResponse } from "../../shared/tools"
import { formatResponse } from "../prompts/responses"
import { unescapeHtmlEntities } from "../../utils/text-normalization"
import { ExitCodeDetails, KitPilotTerminalCallbacks, KitPilotTerminalProcess } from "../../integrations/terminal/types"
import { TerminalRegistry } from "../../integrations/terminal/TerminalRegistry"
import { Terminal } from "../../integrations/terminal/Terminal"
import { OutputInterceptor } from "../../integrations/terminal/OutputInterceptor"
import { Package } from "../../shared/package"
import { t } from "../../i18n"
import { getTaskDirectoryPath } from "../../utils/storage"
import { BackgroundTaskRegistry } from "../../services/background-tasks/BackgroundTaskRegistry"
import { BaseTool, ToolCallbacks } from "./BaseTool"

class ShellIntegrationError extends Error {}

/** How long a run_in_background start waits to catch commands that die instantly. */
const BACKGROUND_START_GRACE_MS = 2_000

interface ExecuteCommandParams {
	command: string
	cwd?: string
	timeout?: number | null
	run_in_background?: boolean
	notify_on?: string
}

export function resolveAgentTimeoutMs(timeoutSeconds: number | null | undefined): number {
	const requestedAgentTimeout = typeof timeoutSeconds === "number" && timeoutSeconds > 0 ? timeoutSeconds * 1000 : 0

	// In CLI runtime, stdin harnesses expect command lifetime to be governed
	// solely by commandExecutionTimeout (user setting), not model-provided
	// background timeouts.
	return process.env.KITPILOT_CLI_RUNTIME === "1" ? 0 : requestedAgentTimeout
}

export class ExecuteCommandTool extends BaseTool<"execute_command"> {
	readonly name = "execute_command" as const

	async execute(params: ExecuteCommandParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { command, cwd: customCwd, timeout: timeoutSeconds, run_in_background: runInBackgroundParam } = params
		const { handleError, pushToolResult, askApproval } = callbacks

		try {
			if (!command) {
				task.consecutiveMistakeCount++
				task.recordToolError("execute_command")
				pushToolResult(await task.sayAndCreateMissingParamError("execute_command", "command"))
				return
			}

			// Background mode is unavailable in the CLI runtime for the same
			// reason agent timeouts are disabled there: command lifetime must be
			// governed solely by the user-configured timeout.
			const runInBackground = runInBackgroundParam === true && process.env.KITPILOT_CLI_RUNTIME !== "1"

			let notifyOn: RegExp | undefined
			if (runInBackground && params.notify_on) {
				try {
					notifyOn = new RegExp(params.notify_on)
				} catch (error) {
					task.consecutiveMistakeCount++
					task.recordToolError("execute_command")
					pushToolResult(
						`Invalid notify_on pattern: ${error instanceof Error ? error.message : "not a valid regular expression"}`,
					)
					return
				}
			}

			const canonicalCommand = unescapeHtmlEntities(command)

			const ignoredFileAttemptedToAccess = task.kitpilotIgnoreController?.validateCommand(canonicalCommand)

			if (ignoredFileAttemptedToAccess) {
				await task.say("kitpilotignore_error", ignoredFileAttemptedToAccess)
				pushToolResult(formatResponse.kitpilotIgnoreError(ignoredFileAttemptedToAccess))
				return
			}

			task.consecutiveMistakeCount = 0

			const didApprove = await askApproval("command", canonicalCommand)

			if (!didApprove) {
				return
			}

			const executionId = task.lastMessageTs?.toString() ?? Date.now().toString()
			const provider = await task.providerRef.deref()
			const providerState = await provider?.getState()

			const { terminalShellIntegrationDisabled = true } = providerState ?? {}

			// Get command execution timeout from VSCode configuration (in seconds)
			const commandExecutionTimeoutSeconds = vscode.workspace
				.getConfiguration(Package.name)
				.get<number>("commandExecutionTimeout", 0)

			// Get command timeout allowlist from VSCode configuration
			const commandTimeoutAllowlist = vscode.workspace
				.getConfiguration(Package.name)
				.get<string[]>("commandTimeoutAllowlist", [])

			// Check if command matches any prefix in the allowlist
			const isCommandAllowlisted = commandTimeoutAllowlist.some((prefix) =>
				canonicalCommand.startsWith(prefix.trim()),
			)

			// Convert seconds to milliseconds for internal use, but skip timeout if command is allowlisted
			const commandExecutionTimeout = isCommandAllowlisted ? 0 : commandExecutionTimeoutSeconds * 1000

			// Convert agent-specified timeout from seconds to milliseconds
			const agentTimeout = resolveAgentTimeoutMs(timeoutSeconds)

			const options: ExecuteCommandOptions = {
				executionId,
				command: canonicalCommand,
				customCwd,
				terminalShellIntegrationDisabled,
				// Background tasks are meant to be long-lived: neither the user
				// kill-timeout nor the agent detach-timeout applies to them.
				commandExecutionTimeout: runInBackground ? 0 : commandExecutionTimeout,
				agentTimeout: runInBackground ? 0 : agentTimeout,
				background: runInBackground ? { notifyOn } : undefined,
			}

			try {
				const [rejected, result] = await executeCommandInTerminal(task, options)

				if (rejected) {
					task.didRejectTool = true
				}

				pushToolResult(result)
			} catch (error: unknown) {
				const status: CommandExecutionStatus = { executionId, status: "fallback" }
				provider?.postMessageToWebview({ type: "commandExecutionStatus", text: JSON.stringify(status) })
				await task.say("shell_integration_warning")

				// Invalidate pending ask from first execution to prevent race condition
				task.supersedePendingAsk()

				if (error instanceof ShellIntegrationError) {
					const [rejected, result] = await executeCommandInTerminal(task, {
						...options,
						terminalShellIntegrationDisabled: true,
					})

					if (rejected) {
						task.didRejectTool = true
					}

					pushToolResult(result)
				} else {
					pushToolResult(`Command failed to execute in terminal due to a shell integration error.`)
				}
			}

			return
		} catch (error) {
			await handleError("executing command", error as Error)
			return
		}
	}

	override async handlePartial(task: Task, block: ToolUse<"execute_command">): Promise<void> {
		const command = block.params.command
		await task.ask("command", command ?? "", block.partial).catch(() => {})
	}
}

export type ExecuteCommandOptions = {
	executionId: string
	command: string
	customCwd?: string
	terminalShellIntegrationDisabled?: boolean
	commandExecutionTimeout?: number
	agentTimeout?: number
	/** Present = start as a background task (registry handle, fast return). */
	background?: { notifyOn?: RegExp }
}

export async function executeCommandInTerminal(
	task: Task,
	{
		executionId,
		command,
		customCwd,
		terminalShellIntegrationDisabled = true,
		commandExecutionTimeout = 0,
		agentTimeout = 0,
		background,
	}: ExecuteCommandOptions,
): Promise<[boolean, ToolResponse]> {
	// Convert milliseconds back to seconds for display purposes.
	const commandExecutionTimeoutSeconds = commandExecutionTimeout / 1000
	let workingDir: string

	if (!customCwd) {
		workingDir = task.cwd
	} else if (path.isAbsolute(customCwd)) {
		workingDir = customCwd
	} else {
		workingDir = path.resolve(task.cwd, customCwd)
	}

	try {
		await fs.access(workingDir)
	} catch (error) {
		return [false, `Working directory '${workingDir}' does not exist.`]
	}

	let message: { text?: string; images?: string[] } | undefined
	// Background-from-start commands never enter the "Proceed While Running"
	// ask loop; setting this up front makes onLine skip it.
	let runInBackground = !!background
	// Registry handle once the command is registered as a background task.
	// Output before registration (the start grace window) buffers in prelude.
	let backgroundTaskId: number | undefined
	let preludeOutput = ""
	let completed = false
	let result: string = ""
	let persistedResult: PersistedCommandOutput | undefined
	let exitDetails: ExitCodeDetails | undefined
	let shellIntegrationError: string | undefined
	let hasAskedForCommandOutput = false

	const terminalProvider = terminalShellIntegrationDisabled ? "execa" : "vscode"
	const provider = await task.providerRef.deref()

	// Get global storage path for persisted output artifacts
	const globalStoragePath = provider?.context?.globalStorageUri?.fsPath
	let interceptor: OutputInterceptor | undefined

	// Create OutputInterceptor if we have storage available
	if (globalStoragePath) {
		const taskDir = await getTaskDirectoryPath(globalStoragePath, task.taskId)
		const storageDir = path.join(taskDir, "command-output")
		const providerState = await provider?.getState()
		const terminalOutputPreviewSize =
			providerState?.terminalOutputPreviewSize ?? DEFAULT_TERMINAL_OUTPUT_PREVIEW_SIZE

		interceptor = new OutputInterceptor({
			executionId,
			taskId: task.taskId,
			command,
			storageDir,
			previewSize: terminalOutputPreviewSize,
		})
	}

	let accumulatedOutput = ""
	// Bound accumulated output buffer size to prevent unbounded memory growth for long-running commands.
	// The interceptor preserves full output; this buffer is only for UI display (100KB limit).
	const maxAccumulatedOutputSize = 100_000
	const commandOutputStreamThrottleMs = 150
	let latestCompressedOutput = ""
	let lastQueuedCommandOutput = ""
	let lastCommandOutputEmitAt = 0
	let pendingCommandOutputEmitTimer: NodeJS.Timeout | undefined
	let commandOutputSayChain: Promise<void> = Promise.resolve()

	const queueCommandOutputMessage = (text: string, partial: boolean, force = false): Promise<void> => {
		if (!force && text === lastQueuedCommandOutput) {
			return commandOutputSayChain
		}

		lastQueuedCommandOutput = text
		commandOutputSayChain = commandOutputSayChain
			.then(async () => {
				await task.say("command_output", text, undefined, partial, undefined, undefined, {
					isNonInteractive: true,
				})
			})
			.catch((error) => {
				console.error("[ExecuteCommandTool] Failed to publish command output:", error)
			})

		return commandOutputSayChain
	}

	const schedulePartialCommandOutputUpdate = () => {
		if (!latestCompressedOutput || completed) {
			return
		}

		const emitUpdate = () => {
			pendingCommandOutputEmitTimer = undefined
			lastCommandOutputEmitAt = Date.now()
			void queueCommandOutputMessage(latestCompressedOutput, true)
		}

		const elapsed = Date.now() - lastCommandOutputEmitAt
		if (elapsed >= commandOutputStreamThrottleMs) {
			emitUpdate()
			return
		}

		if (!pendingCommandOutputEmitTimer) {
			pendingCommandOutputEmitTimer = setTimeout(emitUpdate, commandOutputStreamThrottleMs - elapsed)
		}
	}

	// Track when onCompleted callback finishes to avoid race condition.
	// The callback is async but Terminal/ExecaTerminal don't await it, so we track completion
	// explicitly to ensure persistedResult is set before we use it.
	let onCompletedPromise: Promise<void> | undefined
	let resolveOnCompleted: (() => void) | undefined
	onCompletedPromise = new Promise((resolve) => {
		resolveOnCompleted = resolve
	})

	const callbacks: KitPilotTerminalCallbacks = {
		onLine: async (lines: string, process: KitPilotTerminalProcess) => {
			accumulatedOutput += lines

			// Trim accumulated output to prevent unbounded memory growth
			if (accumulatedOutput.length > maxAccumulatedOutputSize) {
				accumulatedOutput = accumulatedOutput.slice(-maxAccumulatedOutputSize)
			}

			// Write to interceptor for persisted output
			interceptor?.write(lines)

			// Background tasks stream into the registry (live pattern matching +
			// check_task reads). Before registration (start grace window) the
			// output buffers in prelude, bounded like accumulatedOutput.
			if (background) {
				if (backgroundTaskId !== undefined) {
					BackgroundTaskRegistry.appendOutput(backgroundTaskId, lines)
				} else {
					preludeOutput = (preludeOutput + lines).slice(-maxAccumulatedOutputSize)
				}
			}

			// Continue sending compressed output to webview for UI display (unchanged behavior)
			const compressedOutput = Terminal.compressTerminalOutput(accumulatedOutput)
			latestCompressedOutput = compressedOutput
			const status: CommandExecutionStatus = { executionId, status: "output", output: compressedOutput }
			provider?.postMessageToWebview({ type: "commandExecutionStatus", text: JSON.stringify(status) })
			schedulePartialCommandOutputUpdate()

			if (runInBackground || hasAskedForCommandOutput) {
				return
			}

			// Mark that we've asked to prevent multiple concurrent asks
			hasAskedForCommandOutput = true

			try {
				const { response, text, images } = await task.ask("command_output", "")
				runInBackground = true

				if (response === "messageResponse") {
					message = { text, images }
					process.continue()
				}
			} catch (_error) {
				// Silently handle ask errors (e.g., "Current ask promise was ignored")
			}
		},
		onCompleted: async (output: string | undefined) => {
			try {
				clearTimeout(pendingCommandOutputEmitTimer)
				pendingCommandOutputEmitTimer = undefined

				// Finalize interceptor and get persisted result.
				// We await finalize() to ensure the artifact file is fully flushed
				// before we advertise the artifact_id to the LLM.
				if (interceptor) {
					persistedResult = await interceptor.finalize()
					if (backgroundTaskId !== undefined && persistedResult?.artifactPath) {
						// read_command_output addresses artifacts by basename (cmd-*.txt).
						BackgroundTaskRegistry.setArtifactId(
							backgroundTaskId,
							path.basename(persistedResult.artifactPath),
						)
					}
				}

				// Continue using compressed output for UI display
				result = Terminal.compressTerminalOutput(output ?? "")
				latestCompressedOutput = result

				// Preserve order: wait for queued partial updates, then emit the final
				// non-partial command_output update.
				await commandOutputSayChain
				await queueCommandOutputMessage(result, false, true)
				completed = true
			} finally {
				// Signal that onCompleted has finished, so the main code can safely use persistedResult
				resolveOnCompleted?.()
			}
		},
		onShellExecutionStarted: (pid: number | undefined) => {
			const status: CommandExecutionStatus = { executionId, status: "started", pid, command }
			provider?.postMessageToWebview({ type: "commandExecutionStatus", text: JSON.stringify(status) })
		},
		onShellExecutionComplete: (details: ExitCodeDetails) => {
			const status: CommandExecutionStatus = { executionId, status: "exited", exitCode: details.exitCode }
			provider?.postMessageToWebview({ type: "commandExecutionStatus", text: JSON.stringify(status) })
			exitDetails = details
			if (backgroundTaskId !== undefined) {
				BackgroundTaskRegistry.notifyExit(backgroundTaskId, details)
			}
		},
	}

	const terminal = await TerminalRegistry.getOrCreateTerminal(workingDir, task.taskId, terminalProvider)

	if (terminal instanceof Terminal) {
		terminal.terminal.show(true)

		// Update the working directory in case the terminal we asked for has
		// a different working directory so that the model will know where the
		// command actually executed.
		workingDir = terminal.getCurrentWorkingDirectory()
	}

	const process = terminal.runCommand(command, callbacks)

	if (background) {
		// Background-from-start: no ask loop, no timeouts, no task.terminalProcess
		// (the user's terminal continue/abort buttons target foreground commands
		// only — background tasks are addressed via check_task/stop_task).
		// Wait a short grace window so commands that die instantly (typo, missing
		// binary) report their failure inline instead of returning a dead handle.
		let processSettled = false
		try {
			await Promise.race([
				(async () => {
					await process
					processSettled = true
				})(),
				delay(BACKGROUND_START_GRACE_MS),
			])
		} catch (error) {
			// Spawn/stream failure inside the grace window. If the callbacks
			// recorded an exit, the shared tail below formats it; otherwise
			// propagate so the caller's fallback handling applies.
			processSettled = true
			if (!exitDetails && !completed) {
				throw error
			}
		} finally {
			clearTimeout(pendingCommandOutputEmitTimer)
		}

		if (shellIntegrationError) {
			throw new ShellIntegrationError(shellIntegrationError)
		}

		// processSettled without exit callbacks means the process is dead even
		// though no exit details arrived — never hand out a handle to it; the
		// shared tail reports it inline instead.
		if (!exitDetails && !completed && !processSettled) {
			// Still running after the grace window — hand the model a handle.
			// No awaits between capturing the prelude and assigning the id, so
			// no onLine callback can slip output into the gap.
			const bgTask = BackgroundTaskRegistry.register({
				agentTaskId: task.taskId,
				command,
				cwd: workingDir,
				terminal,
				process,
				executionId,
				notifyOn: background.notifyOn,
				seedOutput: preludeOutput,
			})
			backgroundTaskId = bgTask.id

			const initialOutput = preludeOutput ? Terminal.compressTerminalOutput(preludeOutput) : ""
			const patternNote = background.notifyOn
				? bgTask.notifyOnMatched
					? `Note: the notify_on pattern already matched in the output below.`
					: `You will be notified when output matches ${background.notifyOn} or the process exits.`
				: `You will be notified when the process exits.`

			return [
				false,
				[
					`Started background task #${bgTask.id} ('${command}') in '${workingDir.toPosix()}'.`,
					initialOutput ? `Initial output:\n${initialOutput}` : `No output yet.`,
					`Use check_task with id ${bgTask.id} to read status/new output, stop_task to kill it. ${patternNote}`,
				].join("\n"),
			]
		}
		// Exited within the grace window: fall through to the shared tail so the
		// model gets the normal inline result (exit code + output), no handle.
	} else {
		task.terminalProcess = process

		// Dual-timeout logic:
		// - Agent timeout: transitions the command to background (continues running)
		// - User timeout: aborts the command (kills it)
		// Both timers run independently — the user timeout remains active as a safety net
		// even after the agent timeout moves the command to the background.
		let agentTimeoutId: NodeJS.Timeout | undefined
		let userTimeoutId: NodeJS.Timeout | undefined
		let isUserTimedOut = false

		try {
			const racers: Promise<void>[] = [process]

			// Agent timeout: transition to background (command keeps running)
			if (agentTimeout > 0) {
				racers.push(
					new Promise<void>((resolve) => {
						agentTimeoutId = setTimeout(() => {
							runInBackground = true
							process.continue()
							task.supersedePendingAsk()
							resolve()
						}, agentTimeout)
					}),
				)
			}

			// User timeout: abort the command (existing behavior)
			if (commandExecutionTimeout > 0) {
				racers.push(
					new Promise<void>((_, reject) => {
						userTimeoutId = setTimeout(() => {
							isUserTimedOut = true
							task.terminalProcess?.abort()
							reject(new Error(`Command execution timed out after ${commandExecutionTimeout}ms`))
						}, commandExecutionTimeout)
					}),
				)
			}

			await Promise.race(racers)
		} catch (error) {
			if (isUserTimedOut) {
				const status: CommandExecutionStatus = { executionId, status: "timeout" }
				provider?.postMessageToWebview({ type: "commandExecutionStatus", text: JSON.stringify(status) })
				await task.say("error", t("common:errors:command_timeout", { seconds: commandExecutionTimeoutSeconds }))
				task.didToolFailInCurrentTurn = true
				task.terminalProcess = undefined

				return [
					false,
					`The command was terminated after exceeding a user-configured ${commandExecutionTimeoutSeconds}s timeout. Do not try to re-run the command.`,
				]
			}
			throw error
		} finally {
			clearTimeout(agentTimeoutId)
			clearTimeout(userTimeoutId)
			clearTimeout(pendingCommandOutputEmitTimer)
			task.terminalProcess = undefined
		}

		if (shellIntegrationError) {
			throw new ShellIntegrationError(shellIntegrationError)
		}
	}

	// Wait for a short delay to ensure all messages are sent to the webview.
	// This delay allows time for non-awaited promises to be created and
	// for their associated messages to be sent to the webview, maintaining
	// the correct order of messages (although the webview is smart about
	// grouping command_output messages despite any gaps anyways).
	await delay(50)

	// Wait for onCompleted callback to finish if shell execution completed.
	// This ensures persistedResult is set before we try to use it, fixing the race
	// condition where exitDetails is set (sync) before the async onCompleted finishes.
	if (exitDetails && onCompletedPromise) {
		await onCompletedPromise
	}

	// Foreground command left running (agent timeout or user's "Proceed While
	// Running"): register a detached handle so check_task/stop_task can address
	// it. Detached = process.continue() already stopped line events, so output
	// is read via the process's own unretrieved-output tracking; notify_on is
	// unavailable, but exit notification still fires via onShellExecutionComplete.
	const registerDetachedHandle = (): number | undefined => {
		if (background || exitDetails || completed || backgroundTaskId !== undefined) {
			return undefined
		}
		const bgTask = BackgroundTaskRegistry.register({
			agentTaskId: task.taskId,
			command,
			cwd: workingDir,
			terminal,
			process,
			executionId,
			detached: true,
		})
		backgroundTaskId = bgTask.id
		return bgTask.id
	}

	if (message) {
		const { text, images } = message
		await task.say("user_feedback", text, images)

		const detachedId = registerDetachedHandle()

		return [
			true,
			formatResponse.toolResult(
				[
					`Command is still running in terminal from '${terminal.getCurrentWorkingDirectory().toPosix()}'.`,
					result.length > 0 ? `Here's the output so far:\n${result}\n` : "\n",
					...(detachedId !== undefined
						? [`It is registered as background task #${detachedId} (check_task / stop_task).`]
						: []),
					`<user_message>\n${text}\n</user_message>`,
				].join("\n"),
				images,
			),
		]
	} else if (completed || exitDetails) {
		const currentWorkingDir = terminal.getCurrentWorkingDirectory().toPosix()

		// Use persisted output format when output was truncated and spilled to disk
		if (persistedResult?.truncated) {
			return [false, formatPersistedOutput(persistedResult, exitDetails, currentWorkingDir)]
		}

		// Use inline format for small outputs (original behavior with exit status)
		let exitStatus: string = ""

		if (exitDetails !== undefined) {
			if (exitDetails.signalName) {
				exitStatus = `Process terminated by signal ${exitDetails.signalName}`

				if (exitDetails.coreDumpPossible) {
					exitStatus += " - core dump possible"
				}
			} else if (exitDetails.exitCode === undefined) {
				result += "<VSCE exit code is undefined: terminal output and command execution status is unknown.>"
				exitStatus = `Exit code: <undefined, notify user>`
			} else {
				if (exitDetails.exitCode !== 0) {
					exitStatus += "Command execution was not successful, inspect the cause and adjust as needed.\n"
				}

				exitStatus += `Exit code: ${exitDetails.exitCode}`
			}
		} else {
			result += "<VSCE exitDetails == undefined: terminal output and command execution status is unknown.>"
			exitStatus = `Exit code: <undefined, notify user>`
		}

		return [
			false,
			`Command executed in terminal within working directory '${currentWorkingDir}'. ${exitStatus}\nOutput:\n${result}`,
		]
	} else {
		const detachedId = registerDetachedHandle()

		return [
			false,
			[
				`Command is still running in terminal ${workingDir ? ` from '${workingDir.toPosix()}'` : ""}.`,
				result.length > 0 ? `Here's the output so far:\n${result}\n` : "\n",
				...(detachedId !== undefined
					? [
							`It is registered as background task #${detachedId} — use check_task(id: ${detachedId}) for status/new output, stop_task to kill it.`,
						]
					: []),
				"You will be updated on the terminal status and new output in the future.",
			].join("\n"),
		]
	}
}

/**
 * Format exit status from ExitCodeDetails
 */
function formatExitStatus(exitDetails: ExitCodeDetails | undefined): string {
	if (exitDetails === undefined) {
		return "Exit code: <undefined, notify user>"
	}

	if (exitDetails.signalName) {
		let status = `Process terminated by signal ${exitDetails.signalName}`
		if (exitDetails.coreDumpPossible) {
			status += " - core dump possible"
		}
		return status
	}

	if (exitDetails.exitCode === undefined) {
		return "Exit code: <undefined, notify user>"
	}

	let status = ""
	if (exitDetails.exitCode !== 0) {
		status += "Command execution was not successful, inspect the cause and adjust as needed.\n"
	}
	status += `Exit code: ${exitDetails.exitCode}`
	return status
}

/**
 * Format persisted output result for tool response when output was truncated
 */
function formatPersistedOutput(
	result: PersistedCommandOutput,
	exitDetails: ExitCodeDetails | undefined,
	workingDir: string,
): string {
	const exitStatus = formatExitStatus(exitDetails)
	const sizeStr = formatBytes(result.totalBytes)
	const artifactId = result.artifactPath ? path.basename(result.artifactPath) : ""

	return [
		`Command executed in '${workingDir}'. ${exitStatus}`,
		"",
		`Output (${sizeStr}) persisted. Artifact ID: ${artifactId}`,
		"",
		"Preview:",
		result.preview,
		"",
		"Use read_command_output tool to view full output if needed.",
	].join("\n")
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
	if (bytes < 1024) {
		return `${bytes}B`
	}
	if (bytes < 1024 * 1024) {
		return `${(bytes / 1024).toFixed(1)}KB`
	}
	return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

export const executeCommandTool = new ExecuteCommandTool()
