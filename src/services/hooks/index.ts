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
export { validateHooksText } from "./validation"
export type { HooksFileValidation } from "./validation"
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
import type { LoadedHooksConfig } from "./config"
import type { EventData, ProcessEventResult } from "./types"

/**
 * Singleton engine, lazily initialized per cwd. Tests should construct their
 * own HookEngine directly rather than going through this.
 */
let singleton: { cwd: string; engine: HookEngine } | undefined

export async function getHookEngine(cwd: string): Promise<HookEngine> {
	if (singleton?.cwd === cwd) return singleton.engine

	const loaded = await loadHooksConfig(cwd)
	surfaceHooksConfigProblems(loaded)
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

/**
 * Keys (path + issue text) already shown this session, so the same broken
 * file doesn't re-notify on every engine (re)load — but a *different* error
 * after the user edits the file does.
 */
const notifiedHookConfigIssues = new Set<string>()

/**
 * Surface broken hooks config as a warning notification. The loader treats
 * unparseable/malformed files as "no hooks" so dispatch never crashes, which
 * means a typo silently disables the user's guard hooks — this is the signal
 * that that happened. Never throws.
 */
function surfaceHooksConfigProblems(loaded: LoadedHooksConfig): void {
	try {
		const files = [
			{ path: loaded.globalPath, validation: loaded.globalValidation },
			{ path: loaded.projectPath, validation: loaded.projectValidation },
		]

		for (const { path: filePath, validation } of files) {
			let message: string | undefined
			if (validation.parseError) {
				message = `KitPilot: ${filePath} is invalid (${validation.parseError}) — the hooks in this file are NOT running.`
			} else if (validation.problems.length > 0) {
				message = `KitPilot: ${filePath} has ${validation.problems.length} problem${validation.problems.length === 1 ? "" : "s"} (${validation.problems[0]}${validation.problems.length > 1 ? " …" : ""}) — some hooks may not run.`
			}
			if (!message || notifiedHookConfigIssues.has(message)) continue
			notifiedHookConfigIssues.add(message)

			void vscode.window.showWarningMessage(message, "Open File").then((choice) => {
				if (choice === "Open File") {
					void vscode.window.showTextDocument(vscode.Uri.file(filePath))
				}
			})
		}
	} catch (err) {
		console.warn("[hooks] failed to surface hooks config problems:", err)
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
