/**
 * Data models for the hook engine.
 *
 * Ported from code_puppy/hook_engine/models.py — declarative shell hooks
 * with Claude-Code-compatible event set + wire format.
 */

import * as crypto from "crypto"

/** Event types the engine can fire on. Slice 1 wires only PreToolUse + PostToolUse. */
export type HookEventType =
	| "PreToolUse"
	| "PostToolUse"
	| "SessionStart"
	| "SessionEnd"
	| "PreCompact"
	| "UserPromptSubmit"
	| "Notification"
	| "Stop"
	| "SubagentStop"

export const SUPPORTED_EVENT_TYPES: readonly HookEventType[] = [
	"PreToolUse",
	"PostToolUse",
	"SessionStart",
	"SessionEnd",
	"PreCompact",
	"UserPromptSubmit",
	"Notification",
	"Stop",
	"SubagentStop",
]

export type HookType = "command" | "prompt"

/** Per-hook configuration. */
export interface HookConfig {
	/** Pattern to match against tool name / file ext / regex (e.g. "execute_command", ".py", "A && B"). */
	matcher: string
	/** "command" = run a shell command; "prompt" = inject prompt text (reserved for slice 2). */
	type: HookType
	/** The shell command or prompt text. */
	command: string
	/** Maximum execution time in milliseconds. */
	timeout: number
	/** If true, execute only once per session (then auto-disable). */
	once: boolean
	/** If false, hook is loaded but skipped. */
	enabled: boolean
	/** Stable id; auto-derived from matcher+type+command if not given. */
	id: string
}

export interface HookConfigInput {
	/** Matcher is optional on the inner hook because nested config inherits from its group. */
	matcher?: string
	type?: HookType
	command?: string
	/** Alias of `command` accepted on input (matches code_puppy schema). */
	prompt?: string
	timeout?: number
	once?: boolean
	enabled?: boolean
	id?: string
}

/** Construct a fully-defaulted HookConfig from loose input. */
export function makeHookConfig(input: HookConfigInput): HookConfig {
	const matcher = input.matcher
	if (!matcher) throw new Error("Hook matcher cannot be empty")

	const type: HookType = input.type ?? "command"
	if (type !== "command" && type !== "prompt") {
		throw new Error(`Hook type must be 'command' or 'prompt', got: ${type}`)
	}

	const command = input.command ?? input.prompt ?? ""
	if (!command) throw new Error("Hook command cannot be empty")

	const timeout = input.timeout ?? 5000
	if (timeout < 100) throw new Error(`Hook timeout must be >= 100ms, got: ${timeout}`)

	const id = input.id ?? deriveHookId(matcher, type, command)

	return {
		matcher,
		type,
		command,
		timeout,
		once: input.once ?? false,
		enabled: input.enabled ?? true,
		id,
	}
}

function deriveHookId(matcher: string, type: HookType, command: string): string {
	return crypto.createHash("sha256").update(`${matcher}:${type}:${command}`).digest("hex").slice(0, 12)
}

/** Input payload for hook processing. */
export interface EventData {
	eventType: HookEventType
	toolName: string
	toolArgs: Record<string, unknown>
	context?: Record<string, unknown>
}

/** Result from executing a single hook. */
export interface ExecutionResult {
	blocked: boolean
	hookCommand: string
	stdout: string
	stderr: string
	exitCode: number
	durationMs: number
	error?: string
	hookId?: string
}

export function isResultSuccess(r: ExecutionResult): boolean {
	return r.exitCode === 0 && !r.error
}

/** Result from processing an event through the engine. */
export interface ProcessEventResult {
	blocked: boolean
	executedHooks: number
	results: ExecutionResult[]
	blockingReason?: string
	totalDurationMs: number
}
