/**
 * Hook config loader.
 *
 * Reads (in order, later overriding):
 *   1. ~/.kitpilot/hooks.json        (global)
 *   2. <cwd>/.kitpilot/hooks.json    (project)
 *
 * For each event type, project-level groups are APPENDED to global groups
 * (so both fire, with project hooks running after global ones). To suppress
 * a global hook from a project, give it `enabled: false` in the project file
 * with the same `id`.
 */

import * as path from "path"
import { getGlobalKitPilotDirectory, getProjectKitPilotDirectoryForCwd, readFileIfExists } from "../kitpilot-config"
import type { HookGroup, HooksConfigDict } from "./registry"
import { SUPPORTED_EVENT_TYPES, type HookEventType } from "./types"
import { validateHooksText, type HooksFileValidation } from "./validation"

const HOOKS_FILE = "hooks.json"

export interface LoadedHooksConfig {
	merged: HooksConfigDict
	globalPath: string
	projectPath: string
	globalExists: boolean
	projectExists: boolean
	globalValidation: HooksFileValidation
	projectValidation: HooksFileValidation
}

export async function loadHooksConfig(cwd: string): Promise<LoadedHooksConfig> {
	const globalPath = path.join(getGlobalKitPilotDirectory(), HOOKS_FILE)
	const projectPath = path.join(getProjectKitPilotDirectoryForCwd(cwd), HOOKS_FILE)

	const [globalText, projectText] = await Promise.all([readFileIfExists(globalPath), readFileIfExists(projectPath)])

	const global = parseHooksJson(globalText)
	const project = parseHooksJson(projectText)
	const merged = mergeConfigs(global, project)

	return {
		merged,
		globalPath,
		projectPath,
		globalExists: globalText !== null,
		projectExists: projectText !== null,
		globalValidation: validateHooksText(globalText),
		projectValidation: validateHooksText(projectText),
	}
}

export function parseHooksJson(text: string | null): HooksConfigDict {
	if (!text) return {}
	try {
		const parsed = JSON.parse(text)
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			return parsed as HooksConfigDict
		}
	} catch {
		// Silently fall back so a typo can never crash tool dispatch;
		// `validateHooksText` surfaces the error to the user on load.
	}
	return {}
}

export function mergeConfigs(a: HooksConfigDict, b: HooksConfigDict): HooksConfigDict {
	const out: HooksConfigDict = {}
	for (const eventType of SUPPORTED_EVENT_TYPES) {
		const aGroups = (a[eventType] as HookGroup[] | undefined) ?? []
		const bGroups = (b[eventType] as HookGroup[] | undefined) ?? []
		const combined = [...aGroups, ...bGroups]
		if (combined.length > 0) {
			out[eventType] = combined
		}
	}
	return out
}

/**
 * Injects a synthetic PreToolUse hook on `attempt_completion` from the user's
 * `kit-pilot.verifyCommand` setting. This makes verifyCommand actually-enforced
 * (block on non-zero exit) instead of just prompt text.
 *
 * Mutates `config` in place. Idempotent (uses a stable id).
 */
export function injectVerifyCommandHook(config: HooksConfigDict, verifyCommand: string | undefined): void {
	const cmd = verifyCommand?.trim()
	if (!cmd) return

	const eventType: HookEventType = "PreToolUse"
	const groups = (config[eventType] as HookGroup[] | undefined) ?? []
	const synthetic: HookGroup = {
		matcher: "attempt_completion",
		hooks: [
			{
				id: "kitpilot-verify-command",
				type: "command",
				command: cmd,
				timeout: 120_000,
			},
		],
	}
	config[eventType] = [...groups, synthetic]
}

/**
 * Injects the built-in destructive-command guard as a PreToolUse hook on
 * `execute_command`. The guard runs in-process (no subprocess) and asks the
 * user to approve commands matching dangerous patterns (rm -rf /, git reset
 * --hard, etc.). Disabled when `mode === "off"`.
 *
 * Mutates `config` in place. Idempotent (stable id).
 */
export function injectDestructiveCommandGuard(config: HooksConfigDict, mode: "ask" | "off"): void {
	if (mode === "off") return

	const eventType: HookEventType = "PreToolUse"
	const groups = (config[eventType] as HookGroup[] | undefined) ?? []
	const synthetic: HookGroup = {
		matcher: "execute_command",
		hooks: [
			{
				id: "kitpilot-destructive-command-guard",
				type: "builtin",
				command: "destructive_command_guard",
				timeout: 5_000,
			},
		],
	}
	config[eventType] = [...groups, synthetic]
}

/**
 * Injects the built-in git force-push guard as a PreToolUse hook on
 * `execute_command`. Asks the user to approve `git push --force`,
 * `--force-with-lease`, `-f`, `+refspec`, etc. Disabled when `mode === "off"`.
 */
export function injectForcePushGuard(config: HooksConfigDict, mode: "ask" | "off"): void {
	if (mode === "off") return

	const eventType: HookEventType = "PreToolUse"
	const groups = (config[eventType] as HookGroup[] | undefined) ?? []
	const synthetic: HookGroup = {
		matcher: "execute_command",
		hooks: [
			{
				id: "kitpilot-force-push-guard",
				type: "builtin",
				command: "force_push_guard",
				timeout: 5_000,
			},
		],
	}
	config[eventType] = [...groups, synthetic]
}
