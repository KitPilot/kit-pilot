import { defaultModeSlug } from "../../shared/modes"
import type { ClineProvider } from "../webview/ClineProvider"

/**
 * Owns a task's mode and provider-profile (API config name) — both of which can
 * be initialized synchronously (from a resumed history item) or asynchronously
 * (from provider state for a brand-new task).
 *
 * Extracted from `Task` to keep this async-init dance — two readiness promises,
 * the not-yet-initialized guards, and the "don't clobber a newer value" race
 * handling — out of the task's session state. `Task` holds one instance and
 * delegates its public mode/config accessors to it.
 */
export class TaskModeResolver {
	private _mode: string | undefined
	private _apiConfigName: string | undefined

	/** Resolves once the mode has been initialized (immediately for history items). */
	readonly modeReady: Promise<void>
	/** Resolves once the API config name has been initialized (immediately for history items). */
	readonly apiConfigReady: Promise<void>

	constructor(args: { historyItem?: { mode?: string; apiConfigName?: string }; provider: ClineProvider }) {
		const { historyItem, provider } = args

		if (historyItem) {
			this._mode = historyItem.mode || defaultModeSlug
			this._apiConfigName = historyItem.apiConfigName
			this.modeReady = Promise.resolve()
			this.apiConfigReady = Promise.resolve()
		} else {
			this._mode = undefined
			this._apiConfigName = undefined
			this.modeReady = this.initializeMode(provider)
			this.apiConfigReady = this.initializeApiConfigName(provider)
		}
	}

	/**
	 * Initialize the mode from provider state, falling back to `defaultModeSlug`
	 * on any error (network failure, provider not ready, invalid state) so the
	 * task can always proceed.
	 */
	private async initializeMode(provider: ClineProvider): Promise<void> {
		try {
			const state = await provider.getState()
			this._mode = state?.mode || defaultModeSlug
		} catch (error) {
			this._mode = defaultModeSlug
			provider.log(`Failed to initialize task mode: ${error instanceof Error ? error.message : String(error)}`)
		}
	}

	/**
	 * Initialize the API config name from provider state, falling back to
	 * "default" on error. Guards against clobbering a newer value that may have
	 * been set via {@link setApiConfigName} while awaiting provider state (e.g.
	 * the user switches provider profile immediately after task creation).
	 */
	private async initializeApiConfigName(provider: ClineProvider): Promise<void> {
		try {
			const state = await provider.getState()
			if (this._apiConfigName === undefined) {
				this._apiConfigName = state?.currentApiConfigName ?? "default"
			}
		} catch (error) {
			if (this._apiConfigName === undefined) {
				this._apiConfigName = "default"
			}
			provider.log(
				`Failed to initialize task API config name: ${error instanceof Error ? error.message : String(error)}`,
			)
		}
	}

	/** Await mode initialization. */
	async waitForMode(): Promise<void> {
		return this.modeReady
	}

	/** Mode after initialization, falling back to `defaultModeSlug`. Safe to call repeatedly. */
	async getMode(): Promise<string> {
		await this.modeReady
		return this._mode || defaultModeSlug
	}

	/**
	 * Synchronous mode access. Throws if accessed before initialization — callers
	 * must `await waitForMode()`/`getMode()` first.
	 */
	get mode(): string {
		if (this._mode === undefined) {
			throw new Error("Task mode accessed before initialization. Use getMode() or wait for modeReady.")
		}
		return this._mode
	}

	/** Raw mode or `defaultModeSlug`, without awaiting — for internal metadata building. */
	get modeOrDefault(): string {
		return this._mode || defaultModeSlug
	}

	/** Await API config name initialization. */
	async waitForApiConfig(): Promise<void> {
		return this.apiConfigReady
	}

	/** API config name after initialization (may be undefined for legacy tasks). */
	async getApiConfigName(): Promise<string | undefined> {
		await this.apiConfigReady
		return this._apiConfigName
	}

	/**
	 * Synchronous API config name access. Unlike {@link mode} this does not throw
	 * when uninitialized, since the value can legitimately be undefined
	 * (backward compatibility with tasks created before this feature existed).
	 */
	get apiConfigName(): string | undefined {
		return this._apiConfigName
	}

	/**
	 * Update the API config name (user switched provider profiles mid-task).
	 * Setting a value here is what the initialization race guard protects.
	 */
	setApiConfigName(apiConfigName: string | undefined): void {
		this._apiConfigName = apiConfigName
	}
}
