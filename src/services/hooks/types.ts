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

/**
 * Every event type a hooks.json file may legally declare.
 *
 * This is the *accepted config* list, not the list of events that fire — the
 * registry seeds its map from it and drops anything outside it, so narrowing it
 * to the dispatched set would silently discard hooks rather than report them.
 * Use `DISPATCHED_EVENT_TYPES` to ask what actually runs.
 */
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

/**
 * The event types that currently have a fire site in the extension.
 *
 * Everything else in `SUPPORTED_EVENT_TYPES` parses and loads but is never
 * dispatched, so validation reports it — otherwise a user's `Stop` hook
 * validates clean and then does nothing, with nothing to explain the silence.
 * Extend this list when a new fire site lands.
 */
export const DISPATCHED_EVENT_TYPES: readonly HookEventType[] = ["PreToolUse", "PostToolUse", "UserPromptSubmit"]

export type HookType = "command" | "prompt" | "builtin"

/**
 * How to read a command hook's exit code and output.
 *
 * "hook" is the Claude Code contract and the default: exit 1 blocks the tool
 * call, and stderr gives the reason. A hook script is written for that
 * contract.
 *
 * "plain-command" is for an ordinary project command, for example the command
 * in `kit-pilot.verifyCommand`. Such a command does not know the contract. It
 * can fail with any non-zero code, and a build tool or a test runner usually
 * writes its errors to stdout. Thus any non-zero exit blocks, and the reason
 * contains the command's output.
 */
export type HookContract = "hook" | "plain-command"

export const HOOK_CONTRACTS: readonly HookContract[] = ["hook", "plain-command"]

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
	/** How to read the exit code and the output. See HookContract. */
	contract: HookContract
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
	contract?: HookContract
}

/** Construct a fully-defaulted HookConfig from loose input. */
export function makeHookConfig(input: HookConfigInput): HookConfig {
	const matcher = input.matcher
	if (!matcher) throw new Error("Hook matcher cannot be empty")

	const type: HookType = input.type ?? "command"
	if (type !== "command" && type !== "prompt" && type !== "builtin") {
		throw new Error(`Hook type must be 'command', 'prompt', or 'builtin', got: ${type}`)
	}

	const command = input.command ?? input.prompt ?? ""
	if (!command) throw new Error("Hook command cannot be empty")

	const timeout = input.timeout ?? 5000
	if (timeout < 100) throw new Error(`Hook timeout must be >= 100ms, got: ${timeout}`)

	const contract: HookContract = input.contract ?? "hook"
	if (!HOOK_CONTRACTS.includes(contract)) {
		throw new Error(`Hook contract must be one of ${HOOK_CONTRACTS.join(", ")}, got: ${contract}`)
	}

	const id = input.id ?? deriveHookId(matcher, type, command)

	return {
		matcher,
		type,
		command,
		timeout,
		once: input.once ?? false,
		enabled: input.enabled ?? true,
		id,
		contract,
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

/**
 * Approval request raised by a builtin hook. The dispatcher must prompt the
 * user; on deny the tool call is blocked, on approve it proceeds.
 */
export interface HookApprovalRequest {
	/** Human-readable reason shown in the prompt. */
	reason: string
	/** Short identifier of the matched pattern (e.g. "rm -rf /"). */
	patternName: string
	/** The shell command (or other input) the user is approving. */
	subject: string
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
	/** Set by builtin hooks that need user approval before allowing the tool through. */
	needsApproval?: HookApprovalRequest
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
	/** First builtin hook in the results that requested user approval, if any. */
	needsApproval?: HookApprovalRequest
}
