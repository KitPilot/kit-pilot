/**
 * Hook registry — per-event-type storage with once-tracking.
 *
 * Ported from code_puppy/hook_engine/registry.py + the HookRegistry portion of models.py.
 */

import { type HookConfig, type HookConfigInput, type HookEventType, makeHookConfig, SUPPORTED_EVENT_TYPES } from "./types"

export class HookRegistry {
	private hooks: Map<HookEventType, HookConfig[]> = new Map()
	private executedOnce: Set<string> = new Set()

	constructor() {
		for (const t of SUPPORTED_EVENT_TYPES) this.hooks.set(t, [])
	}

	addHook(eventType: HookEventType, hook: HookConfig): void {
		if (!this.hooks.has(eventType)) throw new Error(`Unknown event type: ${eventType}`)
		this.hooks.get(eventType)!.push(hook)
	}

	removeHook(eventType: HookEventType, hookId: string): boolean {
		const list = this.hooks.get(eventType)
		if (!list) return false
		const idx = list.findIndex((h) => h.id === hookId)
		if (idx === -1) return false
		list.splice(idx, 1)
		return true
	}

	/** Returns enabled hooks for an event, filtering out already-executed once-hooks. */
	getHooksForEvent(eventType: HookEventType): HookConfig[] {
		const list = this.hooks.get(eventType) ?? []
		return list.filter((h) => h.enabled && !(h.once && this.executedOnce.has(h.id)))
	}

	markHookExecuted(hookId: string): void {
		this.executedOnce.add(hookId)
	}

	resetOnceHooks(): void {
		this.executedOnce.clear()
	}

	countHooks(eventType?: HookEventType): number {
		if (eventType) return (this.hooks.get(eventType) ?? []).length
		let total = 0
		for (const list of this.hooks.values()) total += list.length
		return total
	}
}

/**
 * Configuration dictionary shape (matches code_puppy's hooks.json):
 *
 *   {
 *     "PreToolUse": [
 *       { "matcher": "execute_command", "hooks": [
 *           { "type": "command", "command": "...", "timeout": 5000 }
 *       ]}
 *     ],
 *     "PostToolUse": [ ... ]
 *   }
 *
 * Keys starting with "_" are skipped (used for comments in JSON).
 */
export type HooksConfigDict = {
	[K in HookEventType]?: HookGroup[]
} & {
	// Comment keys (any string starting with "_") are tolerated at runtime
	// (skipped by build_registry_from_config) but kept loose in the type.
	[comment: string]: HookGroup[] | undefined
}

export interface HookGroup {
	matcher?: string
	hooks?: HookConfigInput[]
}

export function buildRegistryFromConfig(config: HooksConfigDict): HookRegistry {
	const registry = new HookRegistry()

	for (const [eventTypeRaw, groups] of Object.entries(config)) {
		if (eventTypeRaw.startsWith("_")) continue
		if (!SUPPORTED_EVENT_TYPES.includes(eventTypeRaw as HookEventType)) continue
		if (!Array.isArray(groups)) continue

		const eventType = eventTypeRaw as HookEventType
		for (const group of groups) {
			if (!group || typeof group !== "object") continue
			const groupMatcher = group.matcher ?? "*"
			const hooksData = Array.isArray(group.hooks) ? group.hooks : []
			for (const hookData of hooksData) {
				if (!hookData || typeof hookData !== "object") continue
				if (hookData.type === "command" && !hookData.command) continue
				try {
					const hook = makeHookConfig({
						...hookData,
						matcher: hookData.matcher ?? groupMatcher,
					})
					registry.addHook(eventType, hook)
				} catch {
					// Skip invalid hook silently; the validator (slice 2) will surface these.
				}
			}
		}
	}

	return registry
}
