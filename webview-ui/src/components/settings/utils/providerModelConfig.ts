import type { ProviderName, ModelInfo, ProviderSettings } from "@kit-pilot/types"
import {
	anthropicDefaultModelId,
	bedrockDefaultModelId,
	deepSeekDefaultModelId,
	moonshotDefaultModelId,
	geminiDefaultModelId,
	mistralDefaultModelId,
	openAiNativeDefaultModelId,
	qwenCodeDefaultModelId,
	vertexDefaultModelId,
	xaiDefaultModelId,
	sambaNovaDefaultModelId,
	internationalZAiDefaultModelId,
	mainlandZAiDefaultModelId,
	fireworksDefaultModelId,
	minimaxDefaultModelId,
	basetenDefaultModelId,
} from "@kit-pilot/types"

import { MODELS_BY_PROVIDER } from "../constants"

export interface ProviderServiceConfig {
	serviceName: string
	serviceUrl: string
}

// vscode-lm-only build: legacy provider entries below are unreachable but
// kept as a Record<string, ...> so the literal keys still compile.
export const PROVIDER_SERVICE_CONFIG: Partial<Record<string, ProviderServiceConfig>> = {
	anthropic: { serviceName: "Anthropic", serviceUrl: "https://console.anthropic.com" },
	bedrock: { serviceName: "Amazon Bedrock", serviceUrl: "https://aws.amazon.com/bedrock" },
	deepseek: { serviceName: "DeepSeek", serviceUrl: "https://platform.deepseek.com" },
	moonshot: { serviceName: "Moonshot", serviceUrl: "https://platform.moonshot.cn" },
	gemini: { serviceName: "Google Gemini", serviceUrl: "https://ai.google.dev" },
	mistral: { serviceName: "Mistral", serviceUrl: "https://console.mistral.ai" },
	"openai-native": { serviceName: "OpenAI", serviceUrl: "https://platform.openai.com" },
	"qwen-code": { serviceName: "Qwen Code", serviceUrl: "https://dashscope.console.aliyun.com" },
	vertex: { serviceName: "GCP Vertex AI", serviceUrl: "https://console.cloud.google.com/vertex-ai" },
	xai: { serviceName: "xAI", serviceUrl: "https://x.ai" },
	sambanova: { serviceName: "SambaNova", serviceUrl: "https://sambanova.ai" },
	zai: { serviceName: "Z.ai", serviceUrl: "https://z.ai" },
	fireworks: { serviceName: "Fireworks AI", serviceUrl: "https://fireworks.ai" },
	minimax: { serviceName: "MiniMax", serviceUrl: "https://minimax.chat" },
	baseten: { serviceName: "Baseten", serviceUrl: "https://baseten.co" },
	ollama: { serviceName: "Ollama", serviceUrl: "https://ollama.ai" },
	lmstudio: { serviceName: "LM Studio", serviceUrl: "https://lmstudio.ai/docs" },
	"vscode-lm": {
		serviceName: "VS Code LM",
		serviceUrl: "https://code.visualstudio.com/api/extension-guides/language-model",
	},
}

export const PROVIDER_DEFAULT_MODEL_IDS: Partial<Record<string, string>> = {
	anthropic: anthropicDefaultModelId,
	bedrock: bedrockDefaultModelId,
	deepseek: deepSeekDefaultModelId,
	moonshot: moonshotDefaultModelId,
	gemini: geminiDefaultModelId,
	mistral: mistralDefaultModelId,
	"openai-native": openAiNativeDefaultModelId,
	"qwen-code": qwenCodeDefaultModelId,
	vertex: vertexDefaultModelId,
	xai: xaiDefaultModelId,
	sambanova: sambaNovaDefaultModelId,
	zai: internationalZAiDefaultModelId,
	fireworks: fireworksDefaultModelId,
	minimax: minimaxDefaultModelId,
	baseten: basetenDefaultModelId,
}

export const getProviderServiceConfig = (provider: ProviderName): ProviderServiceConfig => {
	return PROVIDER_SERVICE_CONFIG[provider] ?? { serviceName: provider, serviceUrl: "" }
}

export const getDefaultModelIdForProvider = (provider: ProviderName, apiConfiguration?: ProviderSettings): string => {
	// vscode-lm-only build: legacy zai handling kept as a string compare since
	// the provider name is no longer in the narrowed ProviderName union.
	if ((provider as string) === "zai" && apiConfiguration) {
		return (apiConfiguration as { zaiApiLine?: string }).zaiApiLine === "china_coding"
			? mainlandZAiDefaultModelId
			: internationalZAiDefaultModelId
	}

	return PROVIDER_DEFAULT_MODEL_IDS[provider] ?? ""
}

export const getStaticModelsForProvider = (
	provider: ProviderName,
	customArnLabel?: string,
): Record<string, ModelInfo> => {
	const models = MODELS_BY_PROVIDER[provider] ?? {}

	// vscode-lm-only build: legacy Bedrock branch kept as a string compare.
	if ((provider as string) === "bedrock") {
		return {
			...models,
			"custom-arn": {
				maxTokens: 0,
				contextWindow: 0,
				supportsPromptCache: false,
				description: customArnLabel ?? "Use Custom ARN",
			},
		}
	}

	return models
}

/**
 * Checks if a provider uses static models from MODELS_BY_PROVIDER
 */
export const isStaticModelProvider = (provider: ProviderName): boolean => {
	return provider in MODELS_BY_PROVIDER
}

/**
 * List of providers that have their own custom model selection UI
 * and should not use the generic ModelPicker in ApiOptions
 */
// vscode-lm-only build: vscode-lm is the only remaining provider; it has its
// own custom model UI (VSCodeLM.tsx).
export const PROVIDERS_WITH_CUSTOM_MODEL_UI: ProviderName[] = ["vscode-lm"]

/**
 * Checks if a provider should use the generic ModelPicker
 */
export const shouldUseGenericModelPicker = (provider: ProviderName): boolean => {
	return isStaticModelProvider(provider) && !PROVIDERS_WITH_CUSTOM_MODEL_UI.includes(provider)
}

/**
 * Handles provider-specific side effects when a model is changed.
 * Centralizes provider-specific logic to keep it out of the ApiOptions template.
 */
export const handleModelChangeSideEffects = <K extends keyof ProviderSettings>(
	provider: ProviderName,
	modelId: string,
	setApiConfigurationField: (field: K, value: ProviderSettings[K]) => void,
): void => {
	// vscode-lm-only build: legacy Bedrock side-effect removed (provider gone).
	void provider
	void modelId
	void setApiConfigurationField

	// All providers: Clear reasoning settings when switching models to allow
	// the new model's defaults to take effect. Different models within the
	// same provider can have different reasoning defaults/options.
	setApiConfigurationField("reasoningEffort" as K, undefined as ProviderSettings[K])
	setApiConfigurationField("modelMaxTokens" as K, undefined as ProviderSettings[K])
	setApiConfigurationField("modelMaxThinkingTokens" as K, undefined as ProviderSettings[K])
}
