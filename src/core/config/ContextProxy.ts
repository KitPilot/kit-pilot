import * as vscode from "vscode"
import { ZodError } from "zod"

import {
	PROVIDER_SETTINGS_KEYS,
	GLOBAL_SETTINGS_KEYS,
	SECRET_STATE_KEYS,
	RETIRED_SECRET_STATE_KEYS,
	RETIRED_PROVIDER_STATE_KEYS,
	GLOBAL_STATE_KEYS,
	type ProviderSettings,
	type GlobalSettings,
	type SecretState,
	type GlobalState,
	type KitPilotSettings,
	providerSettingsSchema,
	globalSettingsSchema,
	isSecretStateKey,
	isRetiredSecretStateKey,
	isRetiredProviderStateKey,
	isGlobalStateKey,
} from "@kit-pilot/types"

import { logger } from "../../utils/logging"
import { supportPrompt } from "../../shared/support-prompt"

type GlobalStateKey = keyof GlobalState
type SecretStateKey = keyof SecretState
type KitPilotSettingsKey = keyof KitPilotSettings

const PASS_THROUGH_STATE_KEYS = ["taskHistory"]

export const isPassThroughStateKey = (key: string) => PASS_THROUGH_STATE_KEYS.includes(key)

const globalSettingsExportSchema = globalSettingsSchema.omit({
	taskHistory: true,
	listApiConfigMeta: true,
	currentApiConfigName: true,
})

export class ContextProxy {
	private readonly originalContext: vscode.ExtensionContext

	private stateCache: GlobalState
	private secretCache: SecretState
	private _isInitialized = false

	constructor(context: vscode.ExtensionContext) {
		this.originalContext = context
		this.stateCache = {}
		this.secretCache = {}
		this._isInitialized = false
	}

	public get isInitialized() {
		return this._isInitialized
	}

	/**
	 * Secrets from retired integrations, purged on every activation (idempotent
	 * — also cleans up after a downgrade/re-upgrade cycle). Runs BEFORE the
	 * secret cache hydrates so retired values never enter memory:
	 * - the retired cloud embedding providers (Ollama is the only embedder in
	 *   this vscode-lm-only build), and
	 * - the retired OpenAI Codex OAuth integration's stored tokens.
	 */
	private static readonly RETIRED_SECRET_KEYS = [
		...RETIRED_SECRET_STATE_KEYS,
		"codeIndexOpenAiKey",
		"codebaseIndexOpenAiCompatibleApiKey",
		"codebaseIndexGeminiApiKey",
		"codebaseIndexMistralApiKey",
		"codebaseIndexVercelAiGatewayApiKey",
		"codebaseIndexOpenRouterApiKey",
		"openRouterImageApiKey",
		"openai-codex-oauth-credentials",
	] as const

	private async purgeRetiredSecrets() {
		await Promise.all(
			ContextProxy.RETIRED_SECRET_KEYS.map(async (key) => {
				try {
					await this.originalContext.secrets.delete(key)
				} catch (error) {
					logger.error(
						`Error purging retired secret ${key}: ${error instanceof Error ? error.message : String(error)}`,
					)
				}
			}),
		)
	}

	public async initialize() {
		// Purge retired-integration secrets BEFORE hydrating the secret cache,
		// so stale credentials (e.g. a Codex refresh token) never enter memory.
		await this.purgeRetiredSecrets()
		await this.purgeRetiredProviderState()

		for (const key of GLOBAL_STATE_KEYS) {
			try {
				// Revert to original assignment
				this.stateCache[key] = this.originalContext.globalState.get(key)
			} catch (error) {
				logger.error(`Error loading global ${key}: ${error instanceof Error ? error.message : String(error)}`)
			}
		}

		const promises = [
			...SECRET_STATE_KEYS.map(async (key) => {
				try {
					this.secretCache[key] = await this.originalContext.secrets.get(key)
				} catch (error) {
					logger.error(
						`Error loading secret ${key}: ${error instanceof Error ? error.message : String(error)}`,
					)
				}
			}),
		]

		await Promise.all(promises)

		// Migrations for permanently retired integrations. These deliberately run
		// before the provider state is exposed to the rest of the extension.
		await this.purgeLegacyImageGenerationState()
		await this.migrateLegacyCodeIndexConfig()

		// Migration: Normalize invalid/retired API providers to vscode-lm.
		await this.migrateInvalidApiProvider()

		// Migration: Move legacy customCondensingPrompt to customSupportPrompts
		await this.migrateLegacyCondensingPrompt()

		// Migration: Clear old default condensing prompt so users get the improved v2 default
		await this.migrateOldDefaultCondensingPrompt()

		this._isInitialized = true
	}

	/**
	 * Migrates the legacy customCondensingPrompt to the new customSupportPrompts structure
	 * and removes the legacy field.
	 *
	 * Note: Only true customizations are migrated. If the legacy prompt equals the default,
	 * we skip the migration to avoid pinning users to an old default if the default changes.
	 */
	private async migrateLegacyCondensingPrompt() {
		try {
			const legacyPrompt = this.originalContext.globalState.get<string>("customCondensingPrompt")
			if (legacyPrompt) {
				const currentSupportPrompts =
					this.originalContext.globalState.get<Record<string, string>>("customSupportPrompts") || {}

				// Only migrate if:
				// 1. The new location doesn't already have a value
				// 2. The legacy prompt is a true customization (not equal to the default)
				// This prevents pinning users to an old default if the default prompt changes.
				const isCustomized = legacyPrompt.trim() !== supportPrompt.default.CONDENSE.trim()
				if (!currentSupportPrompts.CONDENSE && isCustomized) {
					logger.info("Migrating customized legacy customCondensingPrompt to customSupportPrompts")
					const updatedPrompts = { ...currentSupportPrompts, CONDENSE: legacyPrompt }
					await this.originalContext.globalState.update("customSupportPrompts", updatedPrompts)
					this.stateCache.customSupportPrompts = updatedPrompts
				} else if (!isCustomized) {
					logger.info("Skipping migration: legacy customCondensingPrompt equals the default prompt")
				}

				// Always remove the legacy field
				await this.originalContext.globalState.update("customCondensingPrompt", undefined)
				this.stateCache.customCondensingPrompt = undefined
			}
		} catch (error) {
			logger.error(
				`Error during customCondensingPrompt migration: ${error instanceof Error ? error.message : String(error)}`,
			)
		}
	}

	/**
	 * Clears the old v1 default condensing prompt from customSupportPrompts.CONDENSE if present.
	 *
	 * Before PR #10873 "Intelligent Context Condensation v2", the default condensing prompt was
	 * a simpler 6-section format. Users who had this old default saved in their settings would
	 * be stuck with it instead of getting the improved v2 default (which includes analysis tags,
	 * error tracking, all user messages, and better task continuity).
	 *
	 * This migration uses fingerprinting to detect the old v1 default - checking for key
	 * identifying phrases unique to v1 and absence of v2-specific features. This is more
	 * lenient than exact matching and handles whitespace variations.
	 */
	private async migrateOldDefaultCondensingPrompt() {
		try {
			const currentSupportPrompts =
				this.originalContext.globalState.get<Record<string, string>>("customSupportPrompts") || {}

			const savedCondensePrompt = currentSupportPrompts.CONDENSE

			if (savedCondensePrompt && this.isOldV1DefaultCondensePrompt(savedCondensePrompt)) {
				logger.info(
					"Clearing old v1 default condensing prompt from customSupportPrompts.CONDENSE - user will now get the improved v2 default",
				)

				// Remove the CONDENSE key from customSupportPrompts
				const { CONDENSE: _, ...remainingPrompts } = currentSupportPrompts
				const updatedPrompts = Object.keys(remainingPrompts).length > 0 ? remainingPrompts : undefined

				await this.originalContext.globalState.update("customSupportPrompts", updatedPrompts)
				this.stateCache.customSupportPrompts = updatedPrompts
			}
		} catch (error) {
			logger.error(
				`Error during old default condensing prompt migration: ${error instanceof Error ? error.message : String(error)}`,
			)
		}
	}

	/**
	 * Detects if a prompt is the old v1 default condensing prompt using fingerprinting.
	 * This is more lenient than exact matching - it checks for key identifying phrases
	 * unique to v1 and absence of v2-specific features.
	 *
	 * V1 characteristics:
	 * - Exactly 6 numbered sections (1-6)
	 * - Contains specific section headers like "Previous Conversation", "Current Work", etc.
	 * - Does NOT contain v2-specific features like "<analysis>", "SYSTEM OPERATION", etc.
	 */
	private isOldV1DefaultCondensePrompt(prompt: string): boolean {
		// Key phrases unique to the v1 default (must ALL be present)
		const v1RequiredPhrases = [
			"Your task is to create a detailed summary of the conversation so far",
			"1. Previous Conversation:",
			"2. Current Work:",
			"3. Key Technical Concepts:",
			"4. Relevant Files and Code:",
			"5. Problem Solving:",
			"6. Pending Tasks and Next Steps:",
			"Output only the summary of the conversation so far",
		]

		// V2-specific features (if ANY are present, this is NOT v1 default)
		const v2Features = [
			"<analysis>",
			"SYSTEM OPERATION",
			"Errors and fixes",
			"All user messages",
			"7.", // v2 has more than 6 sections
			"8.",
			"9.",
		]

		// Check that all v1 required phrases are present
		const hasAllV1Phrases = v1RequiredPhrases.every((phrase) => prompt.toLowerCase().includes(phrase.toLowerCase()))

		// Check that no v2 features are present
		const hasNoV2Features = v2Features.every((feature) => !prompt.toLowerCase().includes(feature.toLowerCase()))

		return hasAllV1Phrases && hasNoV2Features
	}

	/**
	 * Normalizes unknown and retired providers to the only runtime provider.
	 */
	private async migrateInvalidApiProvider() {
		try {
			const apiProvider = this.stateCache.apiProvider

			if (apiProvider !== undefined && apiProvider !== "vscode-lm") {
				logger.info(`[ContextProxy] Replacing retired provider "${String(apiProvider)}" with vscode-lm`)
				this.stateCache.apiProvider = "vscode-lm"
				await this.originalContext.globalState.update("apiProvider", "vscode-lm")
			}
		} catch (error) {
			logger.error(
				`Error during invalid API provider migration: ${error instanceof Error ? error.message : String(error)}`,
			)
		}
	}

	/**
	 * Removes all persisted state from the retired OpenRouter image experiment.
	 */
	private async purgeLegacyImageGenerationState() {
		try {
			await Promise.all(
				[
					"imageGenerationProvider",
					"openRouterImageGenerationSelectedModel",
					"openRouterImageGenerationSettings",
				].map(async (key) => {
					if (this.originalContext.globalState.get(key) !== undefined) {
						await this.originalContext.globalState.update(key, undefined)
					}
				}),
			)

			const storedExperiments = this.originalContext.globalState.get<Record<string, boolean>>("experiments")
			if (storedExperiments && "imageGeneration" in storedExperiments) {
				const { imageGeneration: _, ...activeExperiments } = storedExperiments
				await this.originalContext.globalState.update("experiments", activeExperiments)
				this.stateCache.experiments = activeExperiments
			}
		} catch (error) {
			logger.error(
				`Error purging legacy image generation state: ${error instanceof Error ? error.message : String(error)}`,
			)
		}
	}

	private async purgeRetiredProviderState() {
		await Promise.all(
			RETIRED_PROVIDER_STATE_KEYS.map(async (key) => {
				try {
					if (this.originalContext.globalState.get(key) !== undefined) {
						await this.originalContext.globalState.update(key, undefined)
					}
				} catch (error) {
					logger.error(
						`Error purging retired provider state ${String(key)}: ${error instanceof Error ? error.message : String(error)}`,
					)
				}
			}),
		)
	}

	/**
	 * A legacy cloud embedder's URL/model must never be reinterpreted as an
	 * Ollama configuration. Preserve only Qdrant/search preferences, disable
	 * indexing, and reset the embedder to a known-local default.
	 */
	private async migrateLegacyCodeIndexConfig() {
		try {
			const config = this.stateCache.codebaseIndexConfig
			if (!config?.codebaseIndexEmbedderProvider || config.codebaseIndexEmbedderProvider === "ollama") {
				return
			}

			const normalized = {
				codebaseIndexEnabled: false,
				codebaseIndexQdrantUrl: config.codebaseIndexQdrantUrl,
				codebaseIndexEmbedderProvider: "ollama" as const,
				codebaseIndexEmbedderBaseUrl: "http://localhost:11434",
				codebaseIndexSearchMinScore: config.codebaseIndexSearchMinScore,
				codebaseIndexSearchMaxResults: config.codebaseIndexSearchMaxResults,
			}

			this.stateCache.codebaseIndexConfig = normalized
			await this.originalContext.globalState.update("codebaseIndexConfig", normalized)
			logger.info("Reset retired cloud code-index settings to a disabled Ollama configuration")
		} catch (error) {
			logger.error(
				`Error normalizing legacy code-index settings: ${error instanceof Error ? error.message : String(error)}`,
			)
		}
	}

	public get extensionUri() {
		return this.originalContext.extensionUri
	}

	public get extensionPath() {
		return this.originalContext.extensionPath
	}

	public get globalStorageUri() {
		return this.originalContext.globalStorageUri
	}

	public get logUri() {
		return this.originalContext.logUri
	}

	public get extension() {
		return this.originalContext.extension
	}

	public get extensionMode() {
		return this.originalContext.extensionMode
	}

	/**
	 * ExtensionContext.globalState
	 * https://code.visualstudio.com/api/references/vscode-api#ExtensionContext.globalState
	 */

	getGlobalState<K extends GlobalStateKey>(key: K): GlobalState[K]
	getGlobalState<K extends GlobalStateKey>(key: K, defaultValue: GlobalState[K]): GlobalState[K]
	getGlobalState<K extends GlobalStateKey>(key: K, defaultValue?: GlobalState[K]): GlobalState[K] {
		if (isPassThroughStateKey(key)) {
			const value = this.originalContext.globalState.get<GlobalState[K]>(key)
			return value === undefined || value === null ? defaultValue : value
		}

		const value = this.stateCache[key]
		return value !== undefined ? value : defaultValue
	}

	updateGlobalState<K extends GlobalStateKey>(key: K, value: GlobalState[K]) {
		if (isPassThroughStateKey(key)) {
			return this.originalContext.globalState.update(key, value)
		}

		this.stateCache[key] = value
		return this.originalContext.globalState.update(key, value)
	}

	private getAllGlobalState(): GlobalState {
		return Object.fromEntries(GLOBAL_STATE_KEYS.map((key) => [key, this.getGlobalState(key)]))
	}

	/**
	 * ExtensionContext.secrets
	 * https://code.visualstudio.com/api/references/vscode-api#ExtensionContext.secrets
	 */

	getSecret(key: SecretStateKey) {
		return this.secretCache[key]
	}

	storeSecret(key: SecretStateKey, value?: string) {
		if (isRetiredSecretStateKey(key)) {
			this.secretCache[key] = undefined
			return this.originalContext.secrets.delete(key)
		}

		// Update cache.
		this.secretCache[key] = value

		// Write directly to context.
		return value === undefined
			? this.originalContext.secrets.delete(key)
			: this.originalContext.secrets.store(key, value)
	}

	/**
	 * Refresh secrets from storage and update cache
	 * This is useful when you need to ensure the cache has the latest values
	 */
	async refreshSecrets(): Promise<void> {
		const promises = [
			...SECRET_STATE_KEYS.map(async (key) => {
				try {
					this.secretCache[key] = await this.originalContext.secrets.get(key)
				} catch (error) {
					logger.error(
						`Error refreshing secret ${key}: ${error instanceof Error ? error.message : String(error)}`,
					)
				}
			}),
		]
		await Promise.all(promises)
	}

	private getAllSecretState(): SecretState {
		return Object.fromEntries(SECRET_STATE_KEYS.map((key) => [key, this.getSecret(key as SecretStateKey)]))
	}

	/**
	 * GlobalSettings
	 */

	public getGlobalSettings(): GlobalSettings {
		const values = this.getValues()

		try {
			return globalSettingsSchema.parse(values)
		} catch (error) {
			return GLOBAL_SETTINGS_KEYS.reduce((acc, key) => ({ ...acc, [key]: values[key] }), {} as GlobalSettings)
		}
	}

	/**
	 * ProviderSettings
	 */

	public getProviderSettings(): ProviderSettings {
		const values = this.getValues()

		// Sanitize invalid/removed apiProvider values before parsing
		// This handles cases where a user had a provider selected that was later removed
		// from the extension (e.g., "glama"). We sanitize here to avoid repeated
		// schema validation errors that can cause infinite update loops.
		const sanitizedValues = this.sanitizeProviderValues(values)

		try {
			return providerSettingsSchema.parse(sanitizedValues)
		} catch (error) {
			return PROVIDER_SETTINGS_KEYS.reduce(
				(acc, key) => ({ ...acc, [key]: sanitizedValues[key] }),
				{} as ProviderSettings,
			)
		}
	}

	/**
	 * Sanitizes provider values by resetting unknown apiProvider values.
	 * Unknown or retired providers are removed before values reach runtime.
	 */
	private sanitizeProviderValues(values: KitPilotSettings): KitPilotSettings {
		// Remove legacy Claude Code CLI wrapper keys that may still exist in global state.
		// These keys were used by a removed local CLI runner and are no longer part of ProviderSettings.
		const legacyKeys = ["claudeCodePath", "claudeCodeMaxOutputTokens"] as const

		let sanitizedValues = values
		for (const key of legacyKeys) {
			if (key in sanitizedValues) {
				const copy = { ...sanitizedValues } as Record<string, unknown>
				delete copy[key as string]
				sanitizedValues = copy as KitPilotSettings
			}
		}

		if (values.apiProvider !== undefined && values.apiProvider !== "vscode-lm") {
			logger.info(`[ContextProxy] Replacing runtime provider "${String(values.apiProvider)}" with vscode-lm`)
			return { ...sanitizedValues, apiProvider: "vscode-lm" }
		}
		return sanitizedValues
	}

	public async setProviderSettings(values: ProviderSettings) {
		// Explicitly clear out any old API configuration values before that
		// might not be present in the new configuration.
		// If a value is not present in the new configuration, then it is assumed
		// that the setting's value should be `undefined` and therefore we
		// need to remove it from the state cache if it exists.

		await this.setValues({
			...PROVIDER_SETTINGS_KEYS.filter((key) => isGlobalStateKey(key))
				.filter((key) => !!(this.stateCache as Record<string, unknown>)[key])
				.reduce((acc, key) => ({ ...acc, [key]: undefined }), {} as ProviderSettings),
			...values,
		})
	}

	/**
	 * KitPilotSettings
	 */

	public async setValue<K extends KitPilotSettingsKey>(key: K, value: KitPilotSettings[K]) {
		if (key === "apiProvider" && value !== undefined && value !== "vscode-lm") {
			return this.updateGlobalState("apiProvider", "vscode-lm")
		}

		if (isSecretStateKey(key)) {
			return this.storeSecret(key as SecretStateKey, value as string)
		}

		if (isRetiredProviderStateKey(key)) {
			delete (this.stateCache as Record<string, unknown>)[key]
			return this.originalContext.globalState.update(key, undefined)
		}

		return this.updateGlobalState(key as GlobalStateKey, value as GlobalState[GlobalStateKey])
	}

	public getValue<K extends KitPilotSettingsKey>(key: K): KitPilotSettings[K] {
		if (isSecretStateKey(key)) {
			return this.getSecret(key as SecretStateKey) as KitPilotSettings[K]
		}
		if (isRetiredProviderStateKey(key)) {
			return undefined as KitPilotSettings[K]
		}
		return this.getGlobalState(key as GlobalStateKey) as KitPilotSettings[K]
	}

	public getValues(): KitPilotSettings {
		const globalState = this.getAllGlobalState()
		const secretState = this.getAllSecretState()

		// Simply merge all states - no nested secrets to handle
		return { ...globalState, ...secretState }
	}

	public async setValues(values: KitPilotSettings) {
		const entries = Object.entries(values) as [KitPilotSettingsKey, unknown][]
		await Promise.all(entries.map(([key, value]) => this.setValue(key, value)))
	}

	/**
	 * Import / Export
	 */

	public async export(): Promise<GlobalSettings | undefined> {
		try {
			const globalSettings = globalSettingsExportSchema.parse(this.getValues())

			// Exports should only contain global settings, so this skips project custom modes (those exist in the .kitpilotmodes folder)
			globalSettings.customModes = globalSettings.customModes?.filter((mode) => mode.source === "global")

			return Object.fromEntries(Object.entries(globalSettings).filter(([_, value]) => value !== undefined))
		} catch (error) {
			return undefined
		}
	}

	/**
	 * Resets all global state, secrets, and in-memory caches.
	 * This clears all data from both the in-memory caches and the VSCode storage.
	 * @returns A promise that resolves when all reset operations are complete
	 */
	public async resetAllState() {
		// Clear in-memory caches
		this.stateCache = {}
		this.secretCache = {}

		await Promise.all([
			...GLOBAL_STATE_KEYS.map((key) => this.originalContext.globalState.update(key, undefined)),
			...RETIRED_PROVIDER_STATE_KEYS.map((key) => this.originalContext.globalState.update(key, undefined)),
			...SECRET_STATE_KEYS.map((key) => this.originalContext.secrets.delete(key)),
			...RETIRED_SECRET_STATE_KEYS.map((key) => this.originalContext.secrets.delete(key)),
		])

		await this.initialize()
	}

	private static _instance: ContextProxy | null = null

	static get instance() {
		if (!this._instance) {
			throw new Error("ContextProxy not initialized")
		}

		return this._instance
	}

	static async getInstance(context: vscode.ExtensionContext) {
		if (this._instance) {
			return this._instance
		}

		this._instance = new ContextProxy(context)
		await this._instance.initialize()

		return this._instance
	}
}
