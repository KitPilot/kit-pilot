// vscode-lm-only build: provider model registries for non-vscode-lm providers
// were removed. The files themselves remain on disk (some are imported by
// historical tests or constants) but are not re-exported. Add a re-export
// here only if a vscode-lm-only consumer needs it.
export * from "./vscode-llm.js"

import type { ModelInfo } from "../model.js"
import { vscodeLlmDefaultModelId } from "./vscode-llm.js"

// Import the ProviderName type from provider-settings to avoid duplication
import type { ProviderName } from "../provider-settings.js"

/**
 * Stub exports for legacy provider model registries. The webview-ui still
 * references these names in case branches that are unreachable in this
 * build. Each is an empty record so `models[id]` returns undefined and
 * downstream code falls through to defaults.
 */
const emptyModels: Record<string, ModelInfo> = {}
export const anthropicModels = emptyModels
export const bedrockModels = emptyModels
export const deepSeekModels = emptyModels
export const moonshotModels = emptyModels
export const geminiModels = emptyModels
export const mistralModels = emptyModels
export const openAiNativeModels = emptyModels
export const openAiCodexModels = emptyModels
export const qwenCodeModels = emptyModels
export const vertexModels = emptyModels
export const xaiModels = emptyModels
export const sambaNovaModels = emptyModels
export const internationalZAiModels = emptyModels
export const mainlandZAiModels = emptyModels
export const fireworksModels = emptyModels
export const minimaxModels = emptyModels
export const basetenModels = emptyModels

const defaultModelInfo: ModelInfo = {
	maxTokens: -1,
	contextWindow: 128_000,
	supportsImages: false,
	supportsPromptCache: false,
	inputPrice: 0,
	outputPrice: 0,
}
export const litellmDefaultModelInfo = defaultModelInfo
export const lMStudioDefaultModelInfo = defaultModelInfo
export const openAiModelInfoSaneDefaults = defaultModelInfo
export const minimaxDefaultModelId = ""
export const vertexDefaultModelId = ""
export const xaiDefaultModelId = ""
export const sambaNovaDefaultModelId = ""
export const internationalZAiDefaultModelId = ""
export const mainlandZAiDefaultModelId = ""
export const fireworksDefaultModelId = ""
export const basetenDefaultModelId = ""
export const anthropicDefaultModelId = ""
export const bedrockDefaultModelId = ""
export const deepSeekDefaultModelId = ""
export const moonshotDefaultModelId = ""
export const geminiDefaultModelId = ""
export const mistralDefaultModelId = ""
export const openAiNativeDefaultModelId = ""
export const qwenCodeDefaultModelId = ""
export const openAiCodexDefaultModelId = ""
export const poeDefaultModelId = ""
export const litellmDefaultModelId = ""
export const vercelAiGatewayDefaultModelId = ""
export const unboundDefaultModelId = ""

/**
 * Get the default model ID for a given provider.
 * vscode-lm-only build: only vscode-lm is a valid ProviderName, so this
 * always returns the vscode-lm default.
 */
export function getProviderDefaultModelId(
	_provider: ProviderName,
	_options: { isChina?: boolean } = { isChina: false },
): string {
	return vscodeLlmDefaultModelId
}
