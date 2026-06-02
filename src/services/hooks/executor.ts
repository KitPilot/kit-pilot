/**
 * Command execution for hooks.
 *
 * Spawns a shell command for each hook with:
 *   - stdin: JSON payload in Claude Code hook format
 *   - env vars: CLAUDE_TOOL_INPUT, CLAUDE_TOOL_NAME, CLAUDE_HOOK_EVENT,
 *               CLAUDE_PROJECT_DIR, CLAUDE_FILE_PATH (when applicable), CLAUDE_CODE_HOOK=1
 *   - timeout: from hook.timeout (ms), kills the process on overrun
 *
 * Exit-code semantics (Claude Code compatible):
 *   - 0 → success; stdout displayed in transcript
 *   - 1 → block the operation (stderr becomes the block reason)
 *   - 2 → error feedback to the model (stderr fed back) without blocking
 *   - any other non-zero → treated as error (not blocking)
 */

import { spawn } from "child_process"
import { getBuiltin } from "./builtins"
import { extractFilePath } from "./matcher"
import type { EventData, ExecutionResult, HookConfig } from "./types"

export interface ExecuteOptions {
	envVars?: Record<string, string>
	cwd?: string
}

export async function executeHook(
	hook: HookConfig,
	event: EventData,
	opts: ExecuteOptions = {},
): Promise<ExecutionResult> {
	// "prompt" type is reserved for slice 2 (inject text instead of running). Echo as success.
	if (hook.type === "prompt") {
		return {
			blocked: false,
			hookCommand: hook.command,
			stdout: hook.command,
			stderr: "",
			exitCode: 0,
			durationMs: 0,
			hookId: hook.id,
		}
	}

	// "builtin" type: dispatch to in-process handler by name.
	if (hook.type === "builtin") {
		return executeBuiltin(hook, event)
	}

	const command = substituteVariables(hook.command, event, opts.envVars ?? {}, opts.cwd ?? process.cwd())
	const stdinPayload = buildStdinPayload(event, opts.cwd ?? process.cwd())
	const env = buildEnvironment(event, opts.envVars, opts.cwd ?? process.cwd())

	const start = performance.now()
	return new Promise((resolve) => {
		let stdout = ""
		let stderr = ""
		let settled = false

		const child = spawn(command, {
			shell: true,
			cwd: opts.cwd ?? process.cwd(),
			env,
		})

		const timer = setTimeout(() => {
			if (settled) return
			settled = true
			try {
				child.kill("SIGKILL")
			} catch {
				/* ignore */
			}
			const durationMs = performance.now() - start
			resolve({
				blocked: true,
				hookCommand: command,
				stdout: "",
				stderr: `Command timed out after ${hook.timeout}ms`,
				exitCode: -1,
				durationMs,
				error: `Hook execution timed out after ${hook.timeout}ms`,
				hookId: hook.id,
			})
		}, hook.timeout)

		child.stdout?.on("data", (chunk: Buffer) => {
			stdout += chunk.toString("utf-8")
		})
		child.stderr?.on("data", (chunk: Buffer) => {
			stderr += chunk.toString("utf-8")
		})

		child.on("error", (err) => {
			if (settled) return
			settled = true
			clearTimeout(timer)
			const durationMs = performance.now() - start
			resolve({
				blocked: false,
				hookCommand: command,
				stdout,
				stderr: String(err),
				exitCode: -1,
				durationMs,
				error: `Hook execution error: ${err.message ?? err}`,
				hookId: hook.id,
			})
		})

		child.on("close", (code) => {
			if (settled) return
			settled = true
			clearTimeout(timer)
			const exitCode = code ?? 0
			const durationMs = performance.now() - start
			const blocked = exitCode === 1
			const error = exitCode !== 0 && stderr ? stderr : undefined
			resolve({
				blocked,
				hookCommand: command,
				stdout,
				stderr,
				exitCode,
				durationMs,
				error,
				hookId: hook.id,
			})
		})

		try {
			child.stdin?.write(stdinPayload)
			child.stdin?.end()
		} catch {
			// If stdin write fails (e.g. process died early) the close/error handlers cover it.
		}
	})
}

async function executeBuiltin(hook: HookConfig, event: EventData): Promise<ExecutionResult> {
	const start = performance.now()
	const handler = getBuiltin(hook.command)
	if (!handler) {
		const durationMs = performance.now() - start
		return {
			blocked: false,
			hookCommand: hook.command,
			stdout: "",
			stderr: `Unknown builtin hook: ${hook.command}`,
			exitCode: -1,
			durationMs,
			error: `Unknown builtin hook: ${hook.command}`,
			hookId: hook.id,
		}
	}

	try {
		const verdict = await handler(event)
		const durationMs = performance.now() - start

		if (verdict.kind === "allow") {
			return {
				blocked: false,
				hookCommand: hook.command,
				stdout: "",
				stderr: "",
				exitCode: 0,
				durationMs,
				hookId: hook.id,
			}
		}
		if (verdict.kind === "block") {
			return {
				blocked: true,
				hookCommand: hook.command,
				stdout: "",
				stderr: verdict.reason,
				exitCode: 1,
				durationMs,
				error: verdict.reason,
				hookId: hook.id,
			}
		}
		// "ask" — do not block here; the dispatcher will prompt the user.
		return {
			blocked: false,
			hookCommand: hook.command,
			stdout: "",
			stderr: "",
			exitCode: 0,
			durationMs,
			hookId: hook.id,
			needsApproval: verdict.approval,
		}
	} catch (err) {
		const durationMs = performance.now() - start
		const message = err instanceof Error ? err.message : String(err)
		return {
			blocked: false,
			hookCommand: hook.command,
			stdout: "",
			stderr: message,
			exitCode: -1,
			durationMs,
			error: `Builtin hook '${hook.command}' threw: ${message}`,
			hookId: hook.id,
		}
	}
}

function buildStdinPayload(event: EventData, cwd: string): string {
	const payload: Record<string, unknown> = {
		session_id: (event.context?.session_id as string) ?? "kitpilot-session",
		hook_event_name: event.eventType,
		tool_name: event.toolName,
		tool_input: makeSerializable(event.toolArgs),
		cwd,
		permission_mode: "default",
	}
	if (event.context?.result !== undefined) {
		payload.tool_result = makeSerializable(event.context.result)
	}
	if (event.context?.duration_ms !== undefined) {
		payload.tool_duration_ms = event.context.duration_ms
	}
	return JSON.stringify(payload)
}

function buildEnvironment(
	event: EventData,
	envVars: Record<string, string> | undefined,
	cwd: string,
): NodeJS.ProcessEnv {
	const env: NodeJS.ProcessEnv = { ...process.env }
	env.CLAUDE_PROJECT_DIR = cwd
	env.CLAUDE_TOOL_INPUT = JSON.stringify(event.toolArgs)
	env.CLAUDE_TOOL_NAME = event.toolName
	env.CLAUDE_HOOK_EVENT = event.eventType
	env.CLAUDE_CODE_HOOK = "1"

	const filePath = extractFilePath(event.toolArgs)
	if (filePath) env.CLAUDE_FILE_PATH = filePath

	if (envVars) Object.assign(env, envVars)
	return env
}

function substituteVariables(command: string, event: EventData, envVars: Record<string, string>, cwd: string): string {
	const subs: Record<string, string> = {
		CLAUDE_PROJECT_DIR: cwd,
		tool_name: event.toolName,
		event_type: event.eventType,
		file: extractFilePath(event.toolArgs) ?? "",
		CLAUDE_TOOL_INPUT: JSON.stringify(event.toolArgs),
	}
	if (event.context?.result !== undefined) subs.result = String(event.context.result)
	if (event.context?.duration_ms !== undefined) subs.duration_ms = String(event.context.duration_ms)
	Object.assign(subs, envVars)

	let result = command
	for (const [name, value] of Object.entries(subs)) {
		// ${VAR} form
		result = result.split(`\${${name}}`).join(value)
		// $VAR form (followed by non-word or end)
		const re = new RegExp(`\\$${escapeRegexLiteral(name)}(?=\\W|$)`, "g")
		result = result.replace(re, value)
	}
	return result
}

function escapeRegexLiteral(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function makeSerializable(value: unknown): unknown {
	if (value === null || value === undefined) return value
	const t = typeof value
	if (t === "string" || t === "number" || t === "boolean") return value
	if (Array.isArray(value)) return value.map(makeSerializable)
	if (t === "object") {
		const out: Record<string, unknown> = {}
		for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
			out[k] = makeSerializable(v)
		}
		return out
	}
	try {
		return String(value)
	} catch {
		return "<unserializable>"
	}
}

export async function executeHooksSequential(
	hooks: HookConfig[],
	event: EventData,
	opts: ExecuteOptions & { stopOnBlock?: boolean } = {},
): Promise<ExecutionResult[]> {
	const stopOnBlock = opts.stopOnBlock ?? true
	const results: ExecutionResult[] = []
	for (const hook of hooks) {
		const result = await executeHook(hook, event, opts)
		results.push(result)
		if (stopOnBlock && result.blocked) break
	}
	return results
}

export function getBlockingResult(results: ExecutionResult[]): ExecutionResult | undefined {
	return results.find((r) => r.blocked)
}
