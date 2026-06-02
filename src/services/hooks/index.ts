/**
 * Hook service — declarative shell hooks fired around tool execution.
 *
 * Slice 1 wires only PreToolUse + PostToolUse into the dispatcher; the other 7
 * event types are accepted in config but never fire yet.
 *
 * See README.md in this directory for config schema and porting notes.
 */

export { HookEngine } from "./HookEngine"
export type { HookEngineOptions, ProcessEventOptions } from "./HookEngine"
export {
	injectDestructiveCommandGuard,
	injectForcePushGuard,
	injectVerifyCommandHook,
	loadHooksConfig,
	parseHooksJson,
} from "./config"
export type { LoadedHooksConfig } from "./config"
export type {
	HookApprovalRequest,
	HookConfig,
	HookEventType,
	EventData,
	ExecutionResult,
	ProcessEventResult,
} from "./types"
export { SUPPORTED_EVENT_TYPES, makeHookConfig } from "./types"
export type { HookGroup, HooksConfigDict } from "./registry"
// Side-effect: registers all built-in hook handlers.
import "./builtins"

import * as vscode from "vscode"
import { HookEngine } from "./HookEngine"
import { injectDestructiveCommandGuard, injectForcePushGuard, injectVerifyCommandHook, loadHooksConfig } from "./config"
import type { EventData, ProcessEventResult } from "./types"

/**
 * Singleton engine, lazily initialized per cwd. Tests should construct their
 * own HookEngine directly rather than going through this.
 */
let singleton: { cwd: string; engine: HookEngine } | undefined

export async function getHookEngine(cwd: string): Promise<HookEngine> {
	if (singleton?.cwd === cwd) return singleton.engine

	const loaded = await loadHooksConfig(cwd)
	const verifyCommand = readVerifyCommand()
	injectVerifyCommandHook(loaded.merged, verifyCommand)
	injectDestructiveCommandGuard(loaded.merged, readDestructiveCommandGuardMode())
	injectForcePushGuard(loaded.merged, readForcePushGuardMode())

	const engine = new HookEngine(loaded.merged, { cwd })
	singleton = { cwd, engine }
	return engine
}

/** Force a reload of the engine from disk (e.g. after the user edits hooks.json). */
export async function reloadHookEngine(cwd: string): Promise<HookEngine> {
	singleton = undefined
	return getHookEngine(cwd)
}

/** Convenience wrapper for dispatch sites. Returns a no-op result on any error. */
export async function processHookEvent(cwd: string, event: EventData): Promise<ProcessEventResult> {
	try {
		const engine = await getHookEngine(cwd)
		return await engine.processEvent(event)
	} catch (err) {
		// Never let hook machinery crash tool dispatch.
		console.warn(`[hooks] processHookEvent failed for ${event.eventType}/${event.toolName}:`, err)
		return { blocked: false, executedHooks: 0, results: [], totalDurationMs: 0 }
	}
}

function readVerifyCommand(): string | undefined {
	try {
		return vscode.workspace.getConfiguration("kit-pilot").get<string>("verifyCommand", "")
	} catch {
		return undefined
	}
}

function readDestructiveCommandGuardMode(): "ask" | "off" {
	try {
		const v = vscode.workspace.getConfiguration("kit-pilot").get<string>("destructiveCommandGuard", "ask")
		return v === "off" ? "off" : "ask"
	} catch {
		return "ask"
	}
}

function readForcePushGuardMode(): "ask" | "off" {
	try {
		const v = vscode.workspace.getConfiguration("kit-pilot").get<string>("forcePushGuard", "ask")
		return v === "off" ? "off" : "ask"
	} catch {
		return "ask"
	}
}
