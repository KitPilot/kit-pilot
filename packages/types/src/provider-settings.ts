import { z } from "zod"

import { modelInfoSchema, reasoningEffortSettingSchema, verbosityLevelsSchema } from "./model.js"
import { codebaseIndexProviderSchema } from "./codebase-index.js"
import { vscodeLlmModels } from "./providers/index.js"

/**
 * vscode-lm-only build of Roo Code: every non-vscode-lm provider has been
 * stripped. The classification lists below are preserved (mostly empty) so
 * existing imports across the codebase keep type-checking.
 */

/**
 * constants
 */

export const DEFAULT_CONSECUTIVE_MISTAKE_LIMIT = 3

/**
 * DynamicProvider — none in this build.
 */
export const dynamicProviders = [] as const
export type DynamicProvider = (typeof dynamicProviders)[number]
export const isDynamicProvider = (_key: string): _key is DynamicProvider => false

/**
 * LocalProvider — none in this build.
 */
export const localProviders = [] as const
export type LocalProvider = (typeof localProviders)[number]
export const isLocalProvider = (_key: string): _key is LocalProvider => false

/**
 * InternalProvider — vscode-lm.
 */
export const internalProviders = ["vscode-lm"] as const
export type InternalProvider = (typeof internalProviders)[number]
export const isInternalProvider = (key: string): key is InternalProvider =>
	internalProviders.includes(key as InternalProvider)

/**
 * CustomProvider — none in this build.
 */
export const customProviders = [] as const
export type CustomProvider = (typeof customProviders)[number]
export const isCustomProvider = (_key: string): _key is CustomProvider => false

/**
 * FauxProvider — none in this build.
 */
export const fauxProviders = [] as const
export type FauxProvider = (typeof fauxProviders)[number]
export const isFauxProvider = (_key: string): _key is FauxProvider => false

/**
 * ProviderName — vscode-lm is the only supported provider.
 */
export const providerNames = ["vscode-lm"] as const
export const providerNamesSchema = z.enum(providerNames)
export type ProviderName = z.infer<typeof providerNamesSchema>
export const isProviderName = (key: unknown): key is ProviderName =>
	typeof key === "string" && providerNames.includes(key as ProviderName)

/**
 * RetiredProviderName
 *
 * Every non-vscode-lm provider is treated as retired so persisted user
 * profiles can be detected as "retired" by the UI and the user can be
 * prompted (or auto-migrated) to vscode-lm.
 */
export const retiredProviderNames = [
	// Original retired providers
	"cerebras",
	"chutes",
	"deepinfra",
	"doubao",
	"featherless",
	"groq",
	"huggingface",
	"io-intelligence",
	"roo",
	// Providers removed in the vscode-lm-only build
	"anthropic",
	"openrouter",
	"bedrock",
	"vertex",
	"openai",
	"ollama",
	"lmstudio",
	"gemini",
	"gemini-cli",
	"openai-codex",
	"openai-native",
	"deepseek",
	"qwen-code",
	"moonshot",
	"mistral",
	"requesty",
	"unbound",
	"fake-ai",
	"xai",
	"litellm",
	"sambanova",
	"zai",
	"fireworks",
	"vercel-ai-gateway",
	"minimax",
	"baseten",
	"poe",
] as const

export const retiredProviderNamesSchema = z.enum(retiredProviderNames)

export type RetiredProviderName = z.infer<typeof retiredProviderNamesSchema>

export const isRetiredProvider = (value: string): value is RetiredProviderName =>
	retiredProviderNames.includes(value as RetiredProviderName)

export const providerNamesWithRetiredSchema = z.union([providerNamesSchema, retiredProviderNamesSchema])

export type ProviderNameWithRetired = z.infer<typeof providerNamesWithRetiredSchema>

/**
 * ProviderSettingsEntry
 */

export const providerSettingsEntrySchema = z.object({
	id: z.string(),
	name: z.string(),
	apiProvider: providerNamesWithRetiredSchema.optional(),
	modelId: z.string().optional(),
})

export type ProviderSettingsEntry = z.infer<typeof providerSettingsEntrySchema>

/**
 * ProviderSettings
 */

const baseProviderSettingsSchema = z.object({
	includeMaxTokens: z.boolean().optional(),
	todoListEnabled: z.boolean().optional(),
	modelTemperature: z.number().nullish(),
	rateLimitSeconds: z.number().optional(),
	consecutiveMistakeLimit: z.number().min(0).optional(),

	// Model reasoning.
	enableReasoningEffort: z.boolean().optional(),
	reasoningEffort: reasoningEffortSettingSchema.optional(),
	modelMaxTokens: z.number().optional(),
	modelMaxThinkingTokens: z.number().optional(),

	// Model verbosity.
	verbosity: verbosityLevelsSchema.optional(),

	// vscode-lm-only build: Ollama embedding configuration lives on the
	// flat ProviderSettings shape because the codebase-index embedder reads
	// these fields via ApiHandlerOptions. Ollama is the only supported
	// embedder in this build.
	ollamaModelId: z.string().optional(),
	ollamaBaseUrl: z.string().optional(),
	ollamaApiKey: z.string().optional(),
	ollamaNumCtx: z.number().int().min(128).optional(),
})

/**
 * Stub constants kept for backwards compatibility with persisted state and
 * external imports. The Anthropic / OpenRouter providers no longer exist in
 * this build, but a handful of call sites still import these names.
 */
export const ANTHROPIC_DEFAULT_MAX_TOKENS = 8192
export const openRouterDefaultModelId = ""
export const requestyDefaultModelId = ""
export const BEDROCK_1M_CONTEXT_MODEL_IDS: readonly string[] = []
export const VERTEX_1M_CONTEXT_MODEL_IDS: readonly string[] = []

/**
 * Stub for OpenAI Codex rate limit info. The Codex provider was removed but a
 * handful of integration files still parse this shape. Kept as a permissive
 * record so existing handlers compile even though nothing consumes the result
 * at runtime in this build.
 */
export type OpenAiCodexRateLimitInfo = {
	primary?: { usedPercent: number; windowMinutes?: number; resetsAt?: number }
	secondary?: { usedPercent: number; windowMinutes?: number; resetsAt?: number }
	planType?: string
	fetchedAt?: number
}

const vsCodeLmSchema = baseProviderSettingsSchema.extend({
	vsCodeLmModelSelector: z
		.object({
			vendor: z.string().optional(),
			family: z.string().optional(),
			version: z.string().optional(),
			id: z.string().optional(),
		})
		.optional(),
})

const defaultSchema = z.object({
	apiProvider: z.undefined(),
})

export const providerSettingsSchemaDiscriminated = z.discriminatedUnion("apiProvider", [
	vsCodeLmSchema.merge(z.object({ apiProvider: z.literal("vscode-lm") })),
	defaultSchema,
])

/**
 * Compatibility fields: legacy code paths (history loading, settings UI,
 * tests) read fields like `apiModelId` and `openAiHeaders` directly off
 * ProviderSettings. We keep these as optional fields on the flat schema so
 * those paths still type-check. None of them flow into runtime behavior —
 * the buildApiHandler gate routes everything through vscode-lm.
 */
const legacyCompatFieldsSchema = z.object({
	// Common model id fields
	apiModelId: z.string().optional(),
	apiKey: z.string().optional(),

	// OpenAI-compatible legacy fields (read by ContextProxy, settings UI)
	openAiBaseUrl: z.string().optional(),
	openAiApiKey: z.string().optional(),
	openAiModelId: z.string().optional(),
	openAiHeaders: z.record(z.string(), z.string()).optional(),
	openAiCustomModelInfo: modelInfoSchema.nullish(),
	openAiUseAzure: z.boolean().optional(),
	azureApiVersion: z.string().optional(),
	openAiStreamingEnabled: z.boolean().optional(),
	openAiHostHeader: z.string().optional(),
	openAiR1FormatEnabled: z.boolean().optional(),
	openAiNativeApiKey: z.string().optional(),
	openAiNativeBaseUrl: z.string().optional(),
	openAiNativeServiceTier: z.string().optional(),

	// OpenRouter legacy fields
	openRouterApiKey: z.string().optional(),
	openRouterModelId: z.string().optional(),
	openRouterBaseUrl: z.string().optional(),
	openRouterSpecificProvider: z.string().optional(),

	// Bedrock / AWS
	awsAccessKey: z.string().optional(),
	awsSecretKey: z.string().optional(),
	awsSessionToken: z.string().optional(),
	awsRegion: z.string().optional(),
	awsProfile: z.string().optional(),
	awsUseProfile: z.boolean().optional(),
	awsApiKey: z.string().optional(),
	awsUseApiKey: z.boolean().optional(),
	awsCustomArn: z.string().optional(),
	awsModelContextWindow: z.number().optional(),
	awsBedrockEndpointEnabled: z.boolean().optional(),
	awsBedrockEndpoint: z.string().optional(),

	// Vertex / Google
	vertexKeyFile: z.string().optional(),
	vertexJsonCredentials: z.string().optional(),
	vertexProjectId: z.string().optional(),
	vertexRegion: z.string().optional(),

	// LM Studio
	lmStudioModelId: z.string().optional(),
	lmStudioBaseUrl: z.string().optional(),
	lmStudioDraftModelId: z.string().optional(),
	lmStudioSpeculativeDecodingEnabled: z.boolean().optional(),

	// Misc provider fields
	anthropicApiKey: z.string().optional(),
	anthropicBaseUrl: z.string().optional(),
	geminiApiKey: z.string().optional(),
	googleGeminiBaseUrl: z.string().optional(),
	mistralApiKey: z.string().optional(),
	mistralCodestralUrl: z.string().optional(),
	deepSeekBaseUrl: z.string().optional(),
	deepSeekApiKey: z.string().optional(),
	xaiApiKey: z.string().optional(),
	sambaNovaApiKey: z.string().optional(),
	moonshotApiKey: z.string().optional(),
	moonshotBaseUrl: z.string().optional(),
	requestyApiKey: z.string().optional(),
	requestyBaseUrl: z.string().optional(),
	requestyModelId: z.string().optional(),
	unboundApiKey: z.string().optional(),
	unboundModelId: z.string().optional(),
	litellmApiKey: z.string().optional(),
	litellmBaseUrl: z.string().optional(),
	litellmModelId: z.string().optional(),
	poeApiKey: z.string().optional(),
	poeBaseUrl: z.string().optional(),
	fakeAi: z.unknown().optional(),

	// Misc secrets referenced by SECRET_STATE_KEYS
	minimaxApiKey: z.string().optional(),
	zaiApiKey: z.string().optional(),
	fireworksApiKey: z.string().optional(),
	vercelAiGatewayApiKey: z.string().optional(),
	basetenApiKey: z.string().optional(),

	// Misc fields referenced by webview hooks
	vercelAiGatewayModelId: z.string().optional(),
	anthropicBeta1MContext: z.boolean().optional(),
	awsBedrock1MContext: z.boolean().optional(),
	vertex1MContext: z.boolean().optional(),
	zaiApiLine: z.string().optional(),
	qwenCodeOauthPath: z.string().optional(),
})

export const providerSettingsSchema = z.object({
	apiProvider: providerNamesWithRetiredSchema.optional(),
	...vsCodeLmSchema.shape,
	...legacyCompatFieldsSchema.shape,
	...codebaseIndexProviderSchema.shape,
})

export type ProviderSettings = z.infer<typeof providerSettingsSchema>

export const providerSettingsWithIdSchema = providerSettingsSchema.extend({ id: z.string().optional() })

export const discriminatedProviderSettingsWithIdSchema = providerSettingsSchemaDiscriminated.and(
	z.object({ id: z.string().optional() }),
)

export type ProviderSettingsWithId = z.infer<typeof providerSettingsWithIdSchema>

export const PROVIDER_SETTINGS_KEYS = providerSettingsSchema.keyof().options

/**
 * ModelIdKey — vscode-lm has no flat modelId field; the selector carries it.
 */

export const modelIdKeys = [] as const satisfies readonly (keyof ProviderSettings)[]

export type ModelIdKey = (typeof modelIdKeys)[number]

export const getModelId = (settings: ProviderSettings): string | undefined => {
	// vscode-lm-only build: model id lives inside the vsCodeLmModelSelector.
	return settings.vsCodeLmModelSelector?.id
}

/**
 * TypicalProvider — empty in this build (vscode-lm is internal, not typical).
 */

export type TypicalProvider = Exclude<ProviderName, InternalProvider | CustomProvider | FauxProvider>

export const isTypicalProvider = (key: unknown): key is TypicalProvider =>
	isProviderName(key) && !isInternalProvider(key) && !isCustomProvider(key) && !isFauxProvider(key)

export const modelIdKeysByProvider: Record<TypicalProvider, ModelIdKey> = {} as Record<TypicalProvider, ModelIdKey>

/**
 * ANTHROPIC_STYLE_PROVIDERS — none in this build.
 */

export const ANTHROPIC_STYLE_PROVIDERS: ProviderName[] = []

export const getApiProtocol = (_provider: ProviderName | undefined, _modelId?: string): "anthropic" | "openai" => {
	// vscode-lm uses OpenAI-style tool calling.
	return "openai"
}

/**
 * MODELS_BY_PROVIDER — vscode-lm only.
 */

export const MODELS_BY_PROVIDER: Record<ProviderName, { id: ProviderName; label: string; models: string[] }> = {
	"vscode-lm": {
		id: "vscode-lm",
		label: "VS Code LM API",
		models: Object.keys(vscodeLlmModels),
	},
}
