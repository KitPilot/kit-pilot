/**
 * Main HookEngine orchestration.
 *
 * Coordinates: load config → match event against registered hooks → execute
 * (sequential, stop-on-block) → aggregate into ProcessEventResult.
 *
 * Ported from code_puppy/hook_engine/engine.py.
 */

import { executeHooksSequential, getBlockingResult } from "./executor"
import { matches } from "./matcher"
import { buildRegistryFromConfig, type HookRegistry, type HooksConfigDict } from "./registry"
import type { EventData, HookConfig, HookEventType, ProcessEventResult } from "./types"

export interface HookEngineOptions {
	envVars?: Record<string, string>
	cwd?: string
}

export interface ProcessEventOptions {
	stopOnBlock?: boolean
}

export class HookEngine {
	private registry: HookRegistry
	private envVars: Record<string, string>
	private cwd: string | undefined

	constructor(config: HooksConfigDict = {}, opts: HookEngineOptions = {}) {
		this.registry = buildRegistryFromConfig(config)
		this.envVars = opts.envVars ?? {}
		this.cwd = opts.cwd
	}

	loadConfig(config: HooksConfigDict): void {
		this.registry = buildRegistryFromConfig(config)
	}

	async processEvent(event: EventData, opts: ProcessEventOptions = {}): Promise<ProcessEventResult> {
		const start = performance.now()
		const all = this.registry.getHooksForEvent(event.eventType)
		if (all.length === 0) {
			return { blocked: false, executedHooks: 0, results: [], totalDurationMs: 0 }
		}

		const matching = all.filter((h) => {
			try {
				return matches(h.matcher, event.toolName, event.toolArgs)
			} catch {
				return false
			}
		})

		if (matching.length === 0) {
			return { blocked: false, executedHooks: 0, results: [], totalDurationMs: performance.now() - start }
		}

		const results = await executeHooksSequential(matching, event, {
			envVars: this.envVars,
			cwd: this.cwd,
			stopOnBlock: opts.stopOnBlock ?? true,
		})

		// Mark once-hooks as fired (only on success — matches code_puppy semantics).
		for (let i = 0; i < results.length; i++) {
			const hook = matching[i]
			const result = results[i]
			if (hook.once && result.exitCode === 0 && !result.error) {
				this.registry.markHookExecuted(hook.id)
			}
		}

		const blocking = getBlockingResult(results)
		const blocked = blocking !== undefined
		const blockingReason = blocked
			? `Hook '${blocking!.hookCommand}' failed: ${blocking!.error ?? blocking!.stderr ?? "blocked (no details provided)"}`
			: undefined

		return {
			blocked,
			executedHooks: results.length,
			results,
			blockingReason,
			totalDurationMs: performance.now() - start,
		}
	}

	addHook(eventType: HookEventType, hook: HookConfig): void {
		this.registry.addHook(eventType, hook)
	}

	removeHook(eventType: HookEventType, hookId: string): boolean {
		return this.registry.removeHook(eventType, hookId)
	}

	countHooks(eventType?: HookEventType): number {
		return this.registry.countHooks(eventType)
	}

	resetOnceHooks(): void {
		this.registry.resetOnceHooks()
	}

	setEnvVars(envVars: Record<string, string>): void {
		this.envVars = envVars
	}
}
