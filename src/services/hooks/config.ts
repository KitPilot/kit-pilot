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

const HOOKS_FILE = "hooks.json"

export interface LoadedHooksConfig {
	merged: HooksConfigDict
	globalPath: string
	projectPath: string
	globalExists: boolean
	projectExists: boolean
}

export async function loadHooksConfig(cwd: string): Promise<LoadedHooksConfig> {
	const globalPath = path.join(getGlobalKitPilotDirectory(), HOOKS_FILE)
	const projectPath = path.join(getProjectKitPilotDirectoryForCwd(cwd), HOOKS_FILE)

	const [globalText, projectText] = await Promise.all([
		readFileIfExists(globalPath),
		readFileIfExists(projectPath),
	])

	const global = parseHooksJson(globalText)
	const project = parseHooksJson(projectText)
	const merged = mergeConfigs(global, project)

	return {
		merged,
		globalPath,
		projectPath,
		globalExists: globalText !== null,
		projectExists: projectText !== null,
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
		// Silently fall back; the validator (slice 2) will surface parse errors.
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
