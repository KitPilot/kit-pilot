import React, { memo, useCallback, useEffect, useMemo, useState } from "react"
import { convertHeadersToObject } from "./utils/headers"
import { useDebounce } from "react-use"
import { VSCodeLink, VSCodeTextField } from "@vscode/webview-ui-toolkit/react"
import { ExternalLinkIcon } from "@radix-ui/react-icons"

import {
	type ProviderName,
	type ProviderSettings,
	isRetiredProvider,
	DEFAULT_CONSECUTIVE_MISTAKE_LIMIT,
	openRouterDefaultModelId,
	poeDefaultModelId,
	requestyDefaultModelId,
	litellmDefaultModelId,
	openAiNativeDefaultModelId,
	openAiCodexDefaultModelId,
	anthropicDefaultModelId,
	qwenCodeDefaultModelId,
	geminiDefaultModelId,
	deepSeekDefaultModelId,
	moonshotDefaultModelId,
	mistralDefaultModelId,
	xaiDefaultModelId,
	basetenDefaultModelId,
	bedrockDefaultModelId,
	vertexDefaultModelId,
	sambaNovaDefaultModelId,
	internationalZAiDefaultModelId,
	mainlandZAiDefaultModelId,
	fireworksDefaultModelId,
	vercelAiGatewayDefaultModelId,
	minimaxDefaultModelId,
	unboundDefaultModelId,
} from "@kit-pilot/types"

import {
	getProviderServiceConfig,
	getDefaultModelIdForProvider,
	getStaticModelsForProvider,
	shouldUseGenericModelPicker,
	handleModelChangeSideEffects,
} from "./utils/providerModelConfig"

import { vscode } from "@src/utils/vscode"
import { validateApiConfigurationExcludingModelErrors, getModelValidationError } from "@src/utils/validate"
import { useAppTranslation } from "@src/i18n/TranslationContext"
import { useRouterModels } from "@src/components/ui/hooks/useRouterModels"
import { useSelectedModel } from "@src/components/ui/hooks/useSelectedModel"
import { useExtensionState } from "@src/context/ExtensionStateContext"
import {
	useOpenRouterModelProviders,
	OPENROUTER_DEFAULT_PROVIDER_NAME,
} from "@src/components/ui/hooks/useOpenRouterModelProviders"
import { filterProviders, filterModels } from "./utils/organizationFilters"
import {
	Select,
	SelectTrigger,
	SelectValue,
	SelectContent,
	SelectItem,
	SearchableSelect,
	Collapsible,
	CollapsibleTrigger,
	CollapsibleContent,
} from "@src/components/ui"

import { VSCodeLM } from "./providers"

import { MODELS_BY_PROVIDER, PROVIDERS } from "./constants"
import { inputEventTransform, noTransform } from "./transforms"
import { ModelPicker } from "./ModelPicker"
import { ApiErrorMessage } from "./ApiErrorMessage"
import { ThinkingBudget } from "./ThinkingBudget"
import { Verbosity } from "./Verbosity"
import { TodoListSettingsControl } from "./TodoListSettingsControl"
import { TemperatureControl } from "./TemperatureControl"
import { RateLimitSecondsControl } from "./RateLimitSecondsControl"
import { ConsecutiveMistakeLimitControl } from "./ConsecutiveMistakeLimitControl"
// vscode-lm-only build: BedrockCustomArn UI removed.
import { buildDocLink } from "@src/utils/docLinks"
import { BookOpenText } from "lucide-react"

export interface ApiOptionsProps {
	uriScheme: string | undefined
	apiConfiguration: ProviderSettings
	setApiConfigurationField: <K extends keyof ProviderSettings>(
		field: K,
		value: ProviderSettings[K],
		isUserAction?: boolean,
	) => void
	fromWelcomeView?: boolean
	errorMessage: string | undefined
	setErrorMessage: React.Dispatch<React.SetStateAction<string | undefined>>
}

const ApiOptions = ({
	uriScheme: _uriScheme,
	apiConfiguration,
	setApiConfigurationField,
	fromWelcomeView,
	errorMessage,
	setErrorMessage,
}: ApiOptionsProps) => {
	const { t } = useAppTranslation()
	const { organizationAllowList, openAiCodexIsAuthenticated: _openAiCodexIsAuthenticated } = useExtensionState()

	const [customHeaders, setCustomHeaders] = useState<[string, string][]>(() => {
		const headers = apiConfiguration?.openAiHeaders || {}
		return Object.entries(headers)
	})

	useEffect(() => {
		const propHeaders = apiConfiguration?.openAiHeaders || {}

		if (JSON.stringify(customHeaders) !== JSON.stringify(Object.entries(propHeaders))) {
			setCustomHeaders(Object.entries(propHeaders))
		}
	}, [apiConfiguration?.openAiHeaders, customHeaders])

	// Helper to convert array of tuples to object (filtering out empty keys).

	// Debounced effect to update the main configuration when local
	// customHeaders state stabilizes.
	useDebounce(
		() => {
			const currentConfigHeaders = apiConfiguration?.openAiHeaders || {}
			const newHeadersObject = convertHeadersToObject(customHeaders)

			// Only update if the processed object is different from the current config.
			if (JSON.stringify(currentConfigHeaders) !== JSON.stringify(newHeadersObject)) {
				setApiConfigurationField("openAiHeaders", newHeadersObject, false)
			}
		},
		300,
		[customHeaders, apiConfiguration?.openAiHeaders, setApiConfigurationField],
	)

	const [isAdvancedSettingsOpen, setIsAdvancedSettingsOpen] = useState(false)

	const handleInputChange = useCallback(
		<K extends keyof ProviderSettings, E>(
			field: K,
			transform: (event: E) => ProviderSettings[K] = inputEventTransform,
		) =>
			(event: E | Event) => {
				setApiConfigurationField(field, transform(event as E))
			},
		[setApiConfigurationField],
	)

	const {
		provider: selectedProvider,
		id: selectedModelId,
		info: selectedModelInfo,
	} = useSelectedModel(apiConfiguration)
	const activeSelectedProvider: ProviderName | undefined = isRetiredProvider(selectedProvider)
		? undefined
		: selectedProvider
	const isRetiredSelectedProvider =
		typeof apiConfiguration.apiProvider === "string" && isRetiredProvider(apiConfiguration.apiProvider)

	// vscode-lm-only build: auto-migrate any saved non-vscode-lm profile to
	// vscode-lm so the dropdown displays a valid value and the runtime gate
	// in buildApiHandler doesn't fire.
	useEffect(() => {
		if (apiConfiguration.apiProvider && apiConfiguration.apiProvider !== "vscode-lm") {
			setApiConfigurationField("apiProvider", "vscode-lm")
		}
	}, [apiConfiguration.apiProvider, setApiConfigurationField])

	const { data: routerModels, refetch: _refetchRouterModels } = useRouterModels()

	const { data: openRouterModelProviders } = useOpenRouterModelProviders(
		apiConfiguration?.openRouterModelId,
		apiConfiguration?.openRouterBaseUrl,
		{
			enabled:
				!!apiConfiguration?.openRouterModelId &&
				routerModels?.openrouter &&
				Object.keys(routerModels.openrouter).length > 1 &&
				apiConfiguration.openRouterModelId in routerModels.openrouter,
		},
	)

	// Update `apiModelId` whenever `selectedModelId` changes.
	useEffect(() => {
		if (isRetiredSelectedProvider) {
			return
		}

		if (selectedModelId && apiConfiguration.apiModelId !== selectedModelId) {
			// Pass false as third parameter to indicate this is not a user action
			// This is an internal sync, not a user-initiated change
			setApiConfigurationField("apiModelId", selectedModelId, false)
		}
	}, [selectedModelId, setApiConfigurationField, apiConfiguration.apiModelId, isRetiredSelectedProvider])

	// Debounced refresh model updates, only executed 250ms after the user
	// stops typing.
	useDebounce(
		() => {
			if (selectedProvider === "openai") {
				// Use our custom headers state to build the headers object.
				const headerObject = convertHeadersToObject(customHeaders)

				vscode.postMessage({
					type: "requestOpenAiModels",
					values: {
						baseUrl: apiConfiguration?.openAiBaseUrl,
						apiKey: apiConfiguration?.openAiApiKey,
						customHeaders: {}, // Reserved for any additional headers.
						openAiHeaders: headerObject,
					},
				})
			} else if (selectedProvider === "ollama") {
				vscode.postMessage({ type: "requestOllamaModels" })
			} else if (selectedProvider === "lmstudio") {
				vscode.postMessage({ type: "requestLmStudioModels" })
			} else if (selectedProvider === "vscode-lm") {
				vscode.postMessage({ type: "requestVsCodeLmModels" })
			} else if (selectedProvider === "litellm" || selectedProvider === "poe") {
				vscode.postMessage({ type: "requestRouterModels" })
			}
		},
		250,
		[
			selectedProvider,
			apiConfiguration?.requestyApiKey,
			apiConfiguration?.openAiBaseUrl,
			apiConfiguration?.openAiApiKey,
			apiConfiguration?.ollamaBaseUrl,
			apiConfiguration?.lmStudioBaseUrl,
			apiConfiguration?.litellmBaseUrl,
			apiConfiguration?.litellmApiKey,
			apiConfiguration?.poeApiKey,
			apiConfiguration?.poeBaseUrl,
			customHeaders,
		],
	)

	useEffect(() => {
		if (isRetiredSelectedProvider) {
			setErrorMessage(undefined)
			return
		}

		const apiValidationResult = validateApiConfigurationExcludingModelErrors(
			apiConfiguration,
			routerModels,
			organizationAllowList,
		)
		setErrorMessage(apiValidationResult)
	}, [apiConfiguration, routerModels, organizationAllowList, setErrorMessage, isRetiredSelectedProvider])

	const onProviderChange = useCallback(
		(value: ProviderName) => {
			setApiConfigurationField("apiProvider", value)

			// It would be much easier to have a single attribute that stores
			// the modelId, but we have a separate attribute for each of
			// OpenRouter and Requesty.
			// If you switch to one of these providers and the corresponding
			// modelId is not set then you immediately end up in an error state.
			// To address that we set the modelId to the default value for th
			// provider if it's not already set.
			const validateAndResetModel = (
				provider: ProviderName,
				modelId: string | undefined,
				field: keyof ProviderSettings,
				defaultValue?: string,
			) => {
				// in case we haven't set a default value for a provider
				if (!defaultValue) return

				// 1) If nothing is set, initialize to the provider default.
				if (!modelId) {
					setApiConfigurationField(field, defaultValue, false)
					return
				}

				// 2) If something *is* set, ensure it's valid for the newly selected provider.
				//
				// Without this, switching providers can leave the UI showing a model from the
				// previously selected provider (including model IDs that don't exist for the
				// newly selected provider).
				//
				// Note: We only validate providers with static model lists.
				const staticModels = MODELS_BY_PROVIDER[provider]
				if (!staticModels) {
					return
				}

				// vscode-lm-only build: Bedrock custom-arn branch retained as a
				// string compare for legacy code paths.
				if ((provider as string) === "bedrock" && modelId === "custom-arn") {
					return
				}

				const filteredModels = filterModels(staticModels, provider, organizationAllowList)
				const isValidModel = !!filteredModels && Object.prototype.hasOwnProperty.call(filteredModels, modelId)
				if (!isValidModel) {
					setApiConfigurationField(field, defaultValue, false)
				}
			}

			// Define a mapping object that associates each provider with its model configuration.
			// vscode-lm-only build: keyed as Record<string, ...> to keep the
			// legacy entries below valid even though only vscode-lm is reachable.
			const PROVIDER_MODEL_CONFIG: Partial<
				Record<
					string,
					{
						field: keyof ProviderSettings
						default?: string
					}
				>
			> = {
				openrouter: { field: "openRouterModelId", default: openRouterDefaultModelId },
				requesty: { field: "requestyModelId", default: requestyDefaultModelId },
				unbound: { field: "unboundModelId", default: unboundDefaultModelId },
				litellm: { field: "litellmModelId", default: litellmDefaultModelId },
				anthropic: { field: "apiModelId", default: anthropicDefaultModelId },
				"openai-codex": { field: "apiModelId", default: openAiCodexDefaultModelId },
				"qwen-code": { field: "apiModelId", default: qwenCodeDefaultModelId },
				"openai-native": { field: "apiModelId", default: openAiNativeDefaultModelId },
				gemini: { field: "apiModelId", default: geminiDefaultModelId },
				deepseek: { field: "apiModelId", default: deepSeekDefaultModelId },
				moonshot: { field: "apiModelId", default: moonshotDefaultModelId },
				minimax: { field: "apiModelId", default: minimaxDefaultModelId },
				mistral: { field: "apiModelId", default: mistralDefaultModelId },
				xai: { field: "apiModelId", default: xaiDefaultModelId },
				baseten: { field: "apiModelId", default: basetenDefaultModelId },
				bedrock: { field: "apiModelId", default: bedrockDefaultModelId },
				vertex: { field: "apiModelId", default: vertexDefaultModelId },
				sambanova: { field: "apiModelId", default: sambaNovaDefaultModelId },
				zai: {
					field: "apiModelId",
					default:
						apiConfiguration.zaiApiLine === "china_coding"
							? mainlandZAiDefaultModelId
							: internationalZAiDefaultModelId,
				},
				fireworks: { field: "apiModelId", default: fireworksDefaultModelId },
				poe: { field: "apiModelId", default: poeDefaultModelId },
				"vercel-ai-gateway": { field: "vercelAiGatewayModelId", default: vercelAiGatewayDefaultModelId },
				openai: { field: "openAiModelId" },
				ollama: { field: "ollamaModelId" },
				lmstudio: { field: "lmStudioModelId" },
			}

			const config = PROVIDER_MODEL_CONFIG[value]
			if (config) {
				validateAndResetModel(
					value,
					apiConfiguration[config.field] as string | undefined,
					config.field,
					config.default,
				)
			}
		},
		[setApiConfigurationField, apiConfiguration, organizationAllowList],
	)

	const modelValidationError = useMemo(() => {
		return getModelValidationError(apiConfiguration, routerModels, organizationAllowList)
	}, [apiConfiguration, routerModels, organizationAllowList])

	const docs = useMemo(() => {
		const provider = PROVIDERS.find(({ value }) => value === selectedProvider)
		const name = provider?.label

		if (!name) {
			return undefined
		}

		// Get the URL slug - use custom mapping if available, otherwise use the provider key.
		const slugs: Record<string, string> = {
			"openai-native": "openai",
			openai: "openai-compatible",
		}

		const slug = slugs[selectedProvider] || selectedProvider
		return {
			url: buildDocLink(`providers/${slug}`, "provider_docs"),
			name,
		}
	}, [selectedProvider])

	// Convert providers to SearchableSelect options
	const providerOptions = useMemo(() => {
		// First filter by organization allow list
		const allowedProviders = filterProviders(PROVIDERS, organizationAllowList)

		// Then filter out static providers that have no models (unless currently selected)
		const providersWithModels = allowedProviders.filter(({ value }) => {
			// Always show the currently selected provider to avoid breaking existing configurations
			// Use apiConfiguration.apiProvider directly since that's what's actually selected
			if (value === apiConfiguration.apiProvider) {
				return true
			}

			// Check if this is a static provider (has models in MODELS_BY_PROVIDER)
			const staticModels = MODELS_BY_PROVIDER[value as ProviderName]

			// If it's a static provider, check if it has any models after filtering
			if (staticModels) {
				const filteredModels = filterModels(staticModels, value as ProviderName, organizationAllowList)
				// Hide the provider if it has no models after filtering
				return filteredModels && Object.keys(filteredModels).length > 0
			}

			// If it's a dynamic provider (not in MODELS_BY_PROVIDER), always show it
			// to avoid race conditions with async model fetching
			return true
		})

		const options = providersWithModels.map(({ value, label }) => ({
			value,
			label,
		}))

		if (fromWelcomeView) {
			const openRouterIndex = options.findIndex((opt) => opt.value === "openrouter")
			if (openRouterIndex > 0) {
				const [openRouterOption] = options.splice(openRouterIndex, 1)
				options.unshift(openRouterOption)
			}
		}

		return options
	}, [organizationAllowList, apiConfiguration.apiProvider, fromWelcomeView])

	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-col gap-1 relative">
				<div className="flex justify-between items-center">
					<label className="block font-medium">{t("settings:providers.apiProvider")}</label>
					{docs && (
						<VSCodeLink href={docs.url} target="_blank" className="flex gap-2">
							{t("settings:providers.apiProviderDocs")}
							<BookOpenText className="size-4 inline ml-2" />
						</VSCodeLink>
					)}
				</div>
				<SearchableSelect
					value={selectedProvider}
					onValueChange={(value) => onProviderChange(value as ProviderName)}
					options={providerOptions}
					placeholder={t("settings:common.select")}
					searchPlaceholder={t("settings:providers.searchProviderPlaceholder")}
					emptyMessage={t("settings:providers.noProviderMatchFound")}
					className="w-full"
					data-testid="provider-select"
				/>
			</div>

			{errorMessage && <ApiErrorMessage errorMessage={errorMessage} />}

			{isRetiredSelectedProvider ? (
				<div
					className="rounded-md border border-vscode-panel-border px-3 py-2 text-sm text-vscode-descriptionForeground"
					data-testid="retired-provider-message">
					{t(
						apiConfiguration.apiProvider === "kitpilot"
							? "settings:providers.retiredKitPilotProviderMessage"
							: "settings:providers.retiredProviderMessage",
					)}
				</div>
			) : (
				<>
					{/* vscode-lm-only build: only the VSCodeLM provider UI is rendered. */}
					{selectedProvider === "vscode-lm" && (
						<VSCodeLM
							apiConfiguration={apiConfiguration}
							setApiConfigurationField={setApiConfigurationField}
						/>
					)}

					{/* Generic model picker for providers with static models */}
					{activeSelectedProvider && shouldUseGenericModelPicker(activeSelectedProvider) && (
						<>
							<ModelPicker
								apiConfiguration={apiConfiguration}
								setApiConfigurationField={setApiConfigurationField}
								defaultModelId={getDefaultModelIdForProvider(activeSelectedProvider, apiConfiguration)}
								models={getStaticModelsForProvider(
									activeSelectedProvider,
									t("settings:labels.useCustomArn"),
								)}
								modelIdKey="apiModelId"
								serviceName={getProviderServiceConfig(activeSelectedProvider).serviceName}
								serviceUrl={getProviderServiceConfig(activeSelectedProvider).serviceUrl}
								organizationAllowList={organizationAllowList}
								errorMessage={modelValidationError}
								simplifySettings={fromWelcomeView}
								onModelChange={(modelId) =>
									handleModelChangeSideEffects(
										activeSelectedProvider,
										modelId,
										setApiConfigurationField,
									)
								}
							/>

							{/* vscode-lm-only build: BedrockCustomArn removed. */}
						</>
					)}

					{!fromWelcomeView && (
						<ThinkingBudget
							key={`${selectedProvider}-${selectedModelId}`}
							apiConfiguration={apiConfiguration}
							setApiConfigurationField={setApiConfigurationField}
							modelInfo={selectedModelInfo}
						/>
					)}

					{/* Gate Verbosity UI by capability flag */}
					{!fromWelcomeView && selectedModelInfo?.supportsVerbosity && (
						<Verbosity
							apiConfiguration={apiConfiguration}
							setApiConfigurationField={setApiConfigurationField}
							modelInfo={selectedModelInfo}
						/>
					)}

					{!fromWelcomeView && (
						<Collapsible open={isAdvancedSettingsOpen} onOpenChange={setIsAdvancedSettingsOpen}>
							<CollapsibleTrigger className="flex items-center gap-1 w-full cursor-pointer hover:opacity-80 mb-2">
								<span
									className={`codicon codicon-chevron-${isAdvancedSettingsOpen ? "down" : "right"}`}></span>
								<span className="font-medium">{t("settings:advancedSettings.title")}</span>
							</CollapsibleTrigger>
							<CollapsibleContent className="space-y-3">
								<TodoListSettingsControl
									todoListEnabled={apiConfiguration.todoListEnabled}
									onChange={(field, value) => setApiConfigurationField(field, value)}
								/>
								{selectedModelInfo?.supportsTemperature !== false && (
									<TemperatureControl
										value={apiConfiguration.modelTemperature}
										onChange={handleInputChange("modelTemperature", noTransform)}
										maxValue={2}
										defaultValue={selectedModelInfo?.defaultTemperature}
									/>
								)}
								<RateLimitSecondsControl
									value={apiConfiguration.rateLimitSeconds || 0}
									onChange={(value) => setApiConfigurationField("rateLimitSeconds", value)}
								/>
								<ConsecutiveMistakeLimitControl
									value={
										apiConfiguration.consecutiveMistakeLimit !== undefined
											? apiConfiguration.consecutiveMistakeLimit
											: DEFAULT_CONSECUTIVE_MISTAKE_LIMIT
									}
									onChange={(value) => setApiConfigurationField("consecutiveMistakeLimit", value)}
								/>
								{selectedProvider === "poe" && (
									<VSCodeTextField
										value={apiConfiguration?.poeBaseUrl || ""}
										onInput={handleInputChange("poeBaseUrl")}
										placeholder="https://api.poe.com/v1"
										className="w-full">
										<label className="block font-medium mb-1">
											{t("settings:providers.poeBaseUrl")}
										</label>
									</VSCodeTextField>
								)}
								{selectedProvider === "openrouter" &&
									openRouterModelProviders &&
									Object.keys(openRouterModelProviders).length > 0 && (
										<div>
											<div className="flex items-center gap-1">
												<label className="block font-medium mb-1">
													{t("settings:providers.openRouter.providerRouting.title")}
												</label>
												<a href={`https://openrouter.ai/${selectedModelId}/providers`}>
													<ExternalLinkIcon className="w-4 h-4" />
												</a>
											</div>
											<Select
												value={
													apiConfiguration?.openRouterSpecificProvider ||
													OPENROUTER_DEFAULT_PROVIDER_NAME
												}
												onValueChange={(value) =>
													setApiConfigurationField("openRouterSpecificProvider", value)
												}>
												<SelectTrigger className="w-full">
													<SelectValue placeholder={t("settings:common.select")} />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value={OPENROUTER_DEFAULT_PROVIDER_NAME}>
														{OPENROUTER_DEFAULT_PROVIDER_NAME}
													</SelectItem>
													{Object.entries(openRouterModelProviders).map(
														([value, { label }]) => (
															<SelectItem key={value} value={value}>
																{label}
															</SelectItem>
														),
													)}
												</SelectContent>
											</Select>
											<div className="text-sm text-vscode-descriptionForeground mt-1">
												{t("settings:providers.openRouter.providerRouting.description")}{" "}
												<a href="https://openrouter.ai/docs/features/provider-routing">
													{t("settings:providers.openRouter.providerRouting.learnMore")}.
												</a>
											</div>
										</div>
									)}
							</CollapsibleContent>
						</Collapsible>
					)}
				</>
			)}
		</div>
	)
}

export default memo(ApiOptions)
