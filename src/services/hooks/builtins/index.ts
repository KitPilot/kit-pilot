/**
 * Built-in hook handlers.
 *
 * In-process safety/policy checks that share the hook engine's lifecycle
 * (PreToolUse / PostToolUse / etc.) without spawning a subprocess. Each
 * handler returns a Verdict the executor maps to an ExecutionResult.
 *
 * Built-ins are referenced from config by name in the `command` field:
 *   { "type": "builtin", "command": "destructive_command_guard" }
 */

import type { EventData, HookApprovalRequest } from "../types"

export type BuiltinVerdict =
	| { kind: "allow" }
	| { kind: "block"; reason: string }
	| { kind: "ask"; approval: HookApprovalRequest }

export type BuiltinHandler = (event: EventData) => BuiltinVerdict | Promise<BuiltinVerdict>

const REGISTRY: Map<string, BuiltinHandler> = new Map()

export function registerBuiltin(name: string, handler: BuiltinHandler): void {
	REGISTRY.set(name, handler)
}

export function getBuiltin(name: string): BuiltinHandler | undefined {
	return REGISTRY.get(name)
}

export function hasBuiltin(name: string): boolean {
	return REGISTRY.has(name)
}

export function listBuiltins(): string[] {
	return Array.from(REGISTRY.keys())
}

// Self-register built-ins on module load. Importing this module is the
// single source of truth for what's available.
import { destructiveCommandGuardHandler } from "./destructiveCommandGuard"
import { forcePushGuardHandler } from "./forcePushGuard"
registerBuiltin("destructive_command_guard", destructiveCommandGuardHandler)
registerBuiltin("force_push_guard", forcePushGuardHandler)
