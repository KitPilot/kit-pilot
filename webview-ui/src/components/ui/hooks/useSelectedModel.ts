import {
	type ProviderName,
	type ProviderSettings,
	type ModelInfo,
	type ModelRecord,
	type RouterModels,
	anthropicModels,
	bedrockModels,
	deepSeekModels,
	moonshotModels,
	minimaxModels,
	geminiModels,
	mistralModels,
	openAiModelInfoSaneDefaults,
	openAiNativeModels,
	vertexModels,
	xaiModels,
	vscodeLlmModels,
	vscodeLlmDefaultModelId,
	modelSupportsVision,
	openAiCodexModels,
	sambaNovaModels,
	internationalZAiModels,
	mainlandZAiModels,
	fireworksModels,
	basetenModels,
	qwenCodeModels,
	litellmDefaultModelInfo,
	lMStudioDefaultModelInfo,
	BEDROCK_1M_CONTEXT_MODEL_IDS,
	VERTEX_1M_CONTEXT_MODEL_IDS,
	isDynamicProvider,
	isRetiredProvider,
	getProviderDefaultModelId,
} from "@kit-pilot/types"

import { useRouterModels } from "./useRouterModels"
import { useOpenRouterModelProviders } from "./useOpenRouterModelProviders"
import { useLmStudioModels } from "./useLmStudioModels"
import { useOllamaModels } from "./useOllamaModels"

/**
 * Helper to get a validated model ID for dynamic providers.
 * Returns the configured model ID if it exists in the available models, otherwise returns the default.
 */
function getValidatedModelId(
	configuredId: string | undefined,
	availableModels: ModelRecord | undefined,
	defaultModelId: string,
): string {
	return configuredId && availableModels?.[configuredId] ? configuredId : defaultModelId
}

export const useSelectedModel = (apiConfiguration?: ProviderSettings) => {
	// vscode-lm-only build: legacy provider names ("openrouter", "lmstudio",
	// "ollama") no longer exist in the narrowed ProviderName union. Compare
	// against them as strings for the (now-unreachable) legacy branches.
	const provider = apiConfiguration?.apiProvider || "vscode-lm"
	const activeProvider: ProviderName | undefined = isRetiredProvider(provider) ? undefined : provider
	const dynamicProvider = activeProvider && isDynamicProvider(activeProvider) ? activeProvider : undefined
	const openRouterModelId =
		(activeProvider as string) === "openrouter" ? apiConfiguration?.openRouterModelId : undefined
	const lmStudioModelId =
		(activeProvider as string) === "lmstudio" ? apiConfiguration?.lmStudioModelId : undefined
	const ollamaModelId = (activeProvider as string) === "ollama" ? apiConfiguration?.ollamaModelId : undefined

	// Only fetch router models for dynamic providers
	const shouldFetchRouterModels = !!dynamicProvider
	const routerModels = useRouterModels({
		provider: dynamicProvider,
		enabled: shouldFetchRouterModels,
	})

	const openRouterModelProviders = useOpenRouterModelProviders(openRouterModelId)
	const lmStudioModels = useLmStudioModels(lmStudioModelId)
	const ollamaModels = useOllamaModels(ollamaModelId)

	// Compute readiness only for the data actually needed for the selected provider
	const needRouterModels = shouldFetchRouterModels
	const needOpenRouterProviders = (activeProvider as string) === "openrouter"
	const needLmStudio = typeof lmStudioModelId !== "undefined"
	const needOllama = typeof ollamaModelId !== "undefined"

	const hasValidRouterData =
		needRouterModels && dynamicProvider
			? routerModels.data &&
				routerModels.data[dynamicProvider] !== undefined &&
				typeof routerModels.data[dynamicProvider] === "object" &&
				!routerModels.isLoading
			: true

	const isReady =
		(!needLmStudio || typeof lmStudioModels.data !== "undefined") &&
		(!needOllama || typeof ollamaModels.data !== "undefined") &&
		hasValidRouterData &&
		(!needOpenRouterProviders || typeof openRouterModelProviders.data !== "undefined")

	const { id, info } =
		apiConfiguration && isReady && activeProvider
			? getSelectedModel({
					provider: activeProvider,
					apiConfiguration,
					routerModels: (routerModels.data || {}) as RouterModels,
					openRouterModelProviders: (openRouterModelProviders.data || {}) as Record<string, ModelInfo>,
					lmStudioModels: (lmStudioModels.data || undefined) as ModelRecord | undefined,
					ollamaModels: (ollamaModels.data || undefined) as ModelRecord | undefined,
				})
			: { id: getProviderDefaultModelId(activeProvider ?? "vscode-lm"), info: undefined }

	return {
		provider,
		id,
		info,
		isLoading:
			(needRouterModels && routerModels.isLoading) ||
			(needOpenRouterProviders && openRouterModelProviders.isLoading) ||
			(needLmStudio && lmStudioModels!.isLoading) ||
			(needOllama && ollamaModels!.isLoading),
		isError:
			(needRouterModels && routerModels.isError) ||
			(needOpenRouterProviders && openRouterModelProviders.isError) ||
			(needLmStudio && lmStudioModels!.isError) ||
			(needOllama && ollamaModels!.isError),
	}
}

function getSelectedModel({
	provider,
	apiConfiguration,
	routerModels,
	openRouterModelProviders,
	lmStudioModels,
	ollamaModels,
}: {
	provider: ProviderName
	apiConfiguration: ProviderSettings
	routerModels: RouterModels
	openRouterModelProviders: Record<string, ModelInfo>
	lmStudioModels: ModelRecord | undefined
	ollamaModels: ModelRecord | undefined
}): { id: string; info: ModelInfo | undefined } {
	// the `undefined` case are used to show the invalid selection to prevent
	// users from seeing the default model if their selection is invalid
	// this gives a better UX than showing the default model
	const defaultModelId = getProviderDefaultModelId(provider)
	// vscode-lm-only build: only "vscode-lm" is a valid ProviderName, but legacy
	// case branches below are kept for older persisted profiles. Cast to string
	// so TypeScript doesn't narrow unreachable cases to never.
	switch (provider as string) {
		case "openrouter": {
			const id = getValidatedModelId(apiConfiguration.openRouterModelId, routerModels.openrouter, defaultModelId)
			let info = routerModels.openrouter?.[id]
			const specificProvider = apiConfiguration.openRouterSpecificProvider

			if (specificProvider && openRouterModelProviders[specificProvider]) {
				// Overwrite the info with the specific provider info. Some
				// fields are missing the model info for `openRouterModelProviders`
				// so we need to merge the two.
				info = info
					? { ...info, ...openRouterModelProviders[specificProvider] }
					: openRouterModelProviders[specificProvider]
			}

			return { id, info }
		}
		case "requesty": {
			const id = getValidatedModelId(apiConfiguration.requestyModelId, routerModels.requesty, defaultModelId)
			const routerInfo = routerModels.requesty?.[id]
			return { id, info: routerInfo }
		}
		case "unbound": {
			const id = getValidatedModelId(apiConfiguration.unboundModelId, routerModels.unbound, defaultModelId)
			const routerInfo = routerModels.unbound?.[id]
			return { id, info: routerInfo }
		}
		case "litellm": {
			const id = getValidatedModelId(apiConfiguration.litellmModelId, routerModels.litellm, defaultModelId)
			const routerInfo = routerModels.litellm?.[id]
			return { id, info: routerInfo ?? litellmDefaultModelInfo }
		}
		case "xai": {
			const id = apiConfiguration.apiModelId ?? defaultModelId
			const info = xaiModels[id as keyof typeof xaiModels]
			return info ? { id, info } : { id, info: undefined }
		}
		case "baseten": {
			const id = apiConfiguration.apiModelId ?? defaultModelId
			const info = basetenModels[id as keyof typeof basetenModels]
			return { id, info }
		}
		case "bedrock": {
			const id = apiConfiguration.apiModelId ?? defaultModelId
			const baseInfo = bedrockModels[id as keyof typeof bedrockModels]

			// Special case for custom ARN.
			if (id === "custom-arn") {
				return {
					id,
					info: { maxTokens: 5000, contextWindow: 128_000, supportsPromptCache: true, supportsImages: true },
				}
			}

			// Apply 1M context for supported Claude 4 models when enabled
			if (BEDROCK_1M_CONTEXT_MODEL_IDS.includes(id as any) && apiConfiguration.awsBedrock1MContext && baseInfo) {
				// Create a new ModelInfo object with updated context window
				const info: ModelInfo = {
					...baseInfo,
					contextWindow: 1_000_000,
				}
				return { id, info }
			}

			return { id, info: baseInfo }
		}
		case "vertex": {
			const id = apiConfiguration.apiModelId ?? defaultModelId
			const baseInfo = vertexModels[id as keyof typeof vertexModels]

			// Apply 1M context for supported Claude 4 models when enabled
			if (VERTEX_1M_CONTEXT_MODEL_IDS.includes(id as any) && apiConfiguration.vertex1MContext && baseInfo) {
				const modelInfo: ModelInfo = baseInfo
				const tier = modelInfo.tiers?.[0]
				if (tier) {
					const info: ModelInfo = {
						...modelInfo,
						contextWindow: tier.contextWindow,
						inputPrice: tier.inputPrice,
						outputPrice: tier.outputPrice,
						cacheWritesPrice: tier.cacheWritesPrice,
						cacheReadsPrice: tier.cacheReadsPrice,
					}
					return { id, info }
				}
			}

			return { id, info: baseInfo }
		}
		case "gemini": {
			const id = apiConfiguration.apiModelId ?? defaultModelId
			const info = geminiModels[id as keyof typeof geminiModels]
			return { id, info }
		}
		case "deepseek": {
			const id = apiConfiguration.apiModelId ?? defaultModelId
			const info = deepSeekModels[id as keyof typeof deepSeekModels]
			return { id, info }
		}
		case "moonshot": {
			const id = apiConfiguration.apiModelId ?? defaultModelId
			const info = moonshotModels[id as keyof typeof moonshotModels]
			return { id, info }
		}
		case "minimax": {
			const id = apiConfiguration.apiModelId ?? defaultModelId
			const info = minimaxModels[id as keyof typeof minimaxModels]
			return { id, info }
		}
		case "zai": {
			const isChina = apiConfiguration.zaiApiLine === "china_coding"
			const models = isChina ? mainlandZAiModels : internationalZAiModels
			const defaultModelId = getProviderDefaultModelId(provider, { isChina })
			const id = apiConfiguration.apiModelId ?? defaultModelId
			const info = models[id as keyof typeof models]
			return { id, info }
		}
		case "openai-native": {
			const id = apiConfiguration.apiModelId ?? defaultModelId
			const info = openAiNativeModels[id as keyof typeof openAiNativeModels]
			return { id, info }
		}
		case "mistral": {
			const id = apiConfiguration.apiModelId ?? defaultModelId
			const info = mistralModels[id as keyof typeof mistralModels]
			return { id, info }
		}
		case "openai": {
			const id = apiConfiguration.openAiModelId ?? ""
			const customInfo = apiConfiguration?.openAiCustomModelInfo
			const info = customInfo ?? openAiModelInfoSaneDefaults
			return { id, info }
		}
		case "ollama": {
			const id = apiConfiguration.ollamaModelId ?? ""
			const info = ollamaModels && ollamaModels[apiConfiguration.ollamaModelId!]

			const adjustedInfo =
				info?.contextWindow &&
				apiConfiguration?.ollamaNumCtx &&
				apiConfiguration.ollamaNumCtx < info.contextWindow
					? { ...info, contextWindow: apiConfiguration.ollamaNumCtx }
					: info

			return {
				id,
				info: adjustedInfo || undefined,
			}
		}
		case "lmstudio": {
			const id = apiConfiguration.lmStudioModelId ?? ""
			const modelInfo = lmStudioModels && lmStudioModels[apiConfiguration.lmStudioModelId!]
			return {
				id,
				info: modelInfo ? { ...lMStudioDefaultModelInfo, ...modelInfo } : undefined,
			}
		}
		case "vscode-lm": {
			const id = apiConfiguration?.vsCodeLmModelSelector
				? `${apiConfiguration.vsCodeLmModelSelector.vendor}/${apiConfiguration.vsCodeLmModelSelector.family}`
				: vscodeLlmDefaultModelId
			const modelFamily = apiConfiguration?.vsCodeLmModelSelector?.family ?? vscodeLlmDefaultModelId
			const info = vscodeLlmModels[modelFamily as keyof typeof vscodeLlmModels]
			// Derive `supportsImages` from the same substring rules the backend
			// vscode-lm provider uses, not the static registry. Copilot reports
			// family strings (e.g. "claude-sonnet-4") that don't match the registry
			// keys (e.g. "claude-4-sonnet"); a registry miss fell back to defaults
			// with supportsImages: false, wrongly disabling the chat image button.
			return {
				id,
				info: {
					...openAiModelInfoSaneDefaults,
					...info,
					supportsImages: modelSupportsVision(modelFamily, id),
				},
			}
		}
		case "sambanova": {
			const id = apiConfiguration.apiModelId ?? defaultModelId
			const info = sambaNovaModels[id as keyof typeof sambaNovaModels]
			return { id, info }
		}
		case "fireworks": {
			const id = apiConfiguration.apiModelId ?? defaultModelId
			const info = fireworksModels[id as keyof typeof fireworksModels]
			return { id, info }
		}
		case "poe": {
			const id = apiConfiguration.apiModelId ?? defaultModelId
			const info = routerModels.poe?.[id]
			return { id, info }
		}
		case "qwen-code": {
			const id = apiConfiguration.apiModelId ?? defaultModelId
			const info = qwenCodeModels[id as keyof typeof qwenCodeModels]
			return { id, info }
		}
		case "openai-codex": {
			const id = apiConfiguration.apiModelId ?? defaultModelId
			const info = openAiCodexModels[id as keyof typeof openAiCodexModels]
			return { id, info }
		}
		case "vercel-ai-gateway": {
			const id = getValidatedModelId(
				apiConfiguration.vercelAiGatewayModelId,
				routerModels["vercel-ai-gateway"],
				defaultModelId,
			)
			const info = routerModels["vercel-ai-gateway"]?.[id]
			return { id, info }
		}
		// case "anthropic":
		// case "fake-ai":
		default: {
			// vscode-lm-only build: the satisfies narrowing is dropped because
			// the switch above casts provider to string and other cases are
			// unreachable in practice.
			const id = apiConfiguration.apiModelId ?? defaultModelId
			const baseInfo = anthropicModels[id as keyof typeof anthropicModels]

			// Apply 1M context beta tier pricing for supported Claude 4 models
			if (
				(provider as string) === "anthropic" &&
				(id === "claude-sonnet-4-20250514" ||
					id === "claude-sonnet-4-5" ||
					id === "claude-sonnet-4-6" ||
					id === "claude-opus-4-6") &&
				apiConfiguration.anthropicBeta1MContext &&
				baseInfo
			) {
				// Type assertion since supported Claude 4 models include 1M context pricing tiers.
				const modelWithTiers = baseInfo as typeof baseInfo & {
					tiers?: Array<{
						contextWindow: number
						inputPrice?: number
						outputPrice?: number
						cacheWritesPrice?: number
						cacheReadsPrice?: number
					}>
				}
				const tier = modelWithTiers.tiers?.[0]
				if (tier) {
					// Create a new ModelInfo object with updated values
					const info: ModelInfo = {
						...baseInfo,
						contextWindow: tier.contextWindow,
						inputPrice: tier.inputPrice ?? baseInfo.inputPrice,
						outputPrice: tier.outputPrice ?? baseInfo.outputPrice,
						cacheWritesPrice: tier.cacheWritesPrice ?? baseInfo.cacheWritesPrice,
						cacheReadsPrice: tier.cacheReadsPrice ?? baseInfo.cacheReadsPrice,
					}
					return { id, info }
				}
			}

			return { id, info: baseInfo }
		}
	}
}
