import { Anthropic } from "@anthropic-ai/sdk"
import * as vscode from "vscode"
import OpenAI from "openai"

import { type ModelInfo, modelSupportsVision, getVsCodeLmModelRates } from "@kit-pilot/types"

// vscode-lm-only build: this fallback ModelInfo used to live in
// @kit-pilot/types as `openAiModelInfoSaneDefaults` (from the OpenAI provider
// model registry, which has been removed). Inlined here as a local default
// because vscode-lm is the only remaining provider and it only needs sensible
// fallback values when the VS Code LM API doesn't report them.
const openAiModelInfoSaneDefaults: ModelInfo = {
	maxTokens: -1,
	contextWindow: 128_000,
	supportsImages: false,
	supportsPromptCache: false,
	inputPrice: 0,
	outputPrice: 0,
}

import type { ApiHandlerOptions } from "../../shared/api"
import { SELECTOR_SEPARATOR, stringifyVsCodeLmModelSelector } from "../../shared/vsCodeSelectorUtils"
import { normalizeToolSchema } from "../../utils/json-schema"

import { ApiStream } from "../transform/stream"
import { convertToVsCodeLmMessages, extractTextCountFromMessage } from "../transform/vscode-lm-format"

import { BaseProvider } from "./base-provider"
import { parseVsCodeLmUsage, type VsCodeLmReportedUsage } from "./vscode-lm-usage"
import type { SingleCompletionHandler, ApiHandlerCreateMessageMetadata } from "../index"

/**
 * Realm-safe duck-typed check for a `vscode.LanguageModelDataPart` (carries
 * `data` bytes + a `mimeType`). Deliberately avoids both `instanceof
 * vscode.LanguageModelDataPart` (the class only exists in @types/vscode >=1.120,
 * but `engines.vscode` floors at ^1.107.0) AND `data instanceof Uint8Array`
 * (the chunk is created in VS Code's realm, so a cross-realm `instanceof`
 * returns false even for a genuine Uint8Array). We key off a string `mimeType`
 * plus a non-string `data` value instead.
 */
function isLanguageModelDataPart(
	chunk: unknown,
): chunk is { data: ArrayBufferLike | ArrayBufferView; mimeType?: string } {
	if (typeof chunk !== "object" || chunk === null) {
		return false
	}
	const c = chunk as { mimeType?: unknown; data?: unknown }
	return typeof c.mimeType === "string" && c.data != null && typeof c.data !== "string"
}

/** Decode a data part's bytes to a string, tolerating Uint8Array / typed array / ArrayBuffer (incl. cross-realm). */
function decodeDataPart(data: ArrayBufferLike | ArrayBufferView): string {
	const bytes = ArrayBuffer.isView(data)
		? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
		: new Uint8Array(data as ArrayBuffer)
	return new TextDecoder().decode(bytes)
}

/** Compact, log-friendly description of an unrecognized stream chunk (for diagnostics). */
function describeChunk(chunk: unknown): Record<string, unknown> {
	if (typeof chunk !== "object" || chunk === null) {
		return { kind: typeof chunk, value: String(chunk) }
	}
	const obj = chunk as Record<string, unknown>
	const types: Record<string, string> = {}
	for (const key of Object.keys(obj)) {
		const v = obj[key]
		types[key] = ArrayBuffer.isView(v)
			? `TypedArray(${(v as ArrayBufferView).byteLength}B)`
			: v instanceof ArrayBuffer
				? `ArrayBuffer(${v.byteLength}B)`
				: Array.isArray(v)
					? `Array(${v.length})`
					: typeof v === "string"
						? `string:${(v as string).slice(0, 60)}`
						: typeof v
	}
	return { ctor: (obj.constructor as { name?: string } | undefined)?.name, keys: Object.keys(obj), types }
}

/**
 * Build the canonical { id, info } pair for a VS Code LM model from the live
 * handle reported by `vscode.lm` (or any selector carrying the same fields).
 *
 * This is the single source of truth for vscode-lm ModelInfo: the provider's
 * `getModel()` uses it for actual requests, and the webview consumes the same
 * values (shipped over the `vsCodeLmModels` message) so the model card never
 * drifts from what the extension enforces. Keeping the static `vscodeLlmModels`
 * registry as the webview's source caused that drift (e.g. the 0.1.7 grey-icon
 * bug) because Copilot's reported `family` strings don't match registry keys.
 */
export function buildVsCodeLmModelInfo(model: {
	id?: string
	vendor?: string
	family?: string
	version?: string
	maxInputTokens?: number
}): { id: string; info: ModelInfo } {
	const modelParts = [model.vendor, model.family, model.version].filter(Boolean)
	const modelId = model.id || modelParts.join(SELECTOR_SEPARATOR)

	// Real USD-per-1M-token rates under Copilot's usage/credit billing (post
	// 2026-06-01) so cost tracking + the `allowedMaxCost` budget cap work.
	// Unknown models fall back to 0 (cost unknown) — same as the old behavior.
	const rates = getVsCodeLmModelRates(model.family, model.id)

	const info: ModelInfo = {
		maxTokens: -1, // Unlimited tokens by default
		contextWindow:
			typeof model.maxInputTokens === "number"
				? Math.max(0, model.maxInputTokens)
				: openAiModelInfoSaneDefaults.contextWindow,
		supportsImages: modelSupportsVision(model.family, model.id),
		supportsPromptCache: true,
		inputPrice: rates?.inputPrice ?? 0,
		outputPrice: rates?.outputPrice ?? 0,
		cacheReadsPrice: rates?.cacheReadsPrice,
		description: `VSCode Language Model: ${modelId}`,
	}

	return { id: modelId, info }
}

/**
 * Rough per-image token estimate, tiered by decoded byte size. The VS Code LM
 * API's `countTokens` only handles strings, so we bypass it for images and add
 * a flat estimate. Real per-image cost varies by model (OpenAI ~85 low / 1100
 * high-detail; Claude ~1500 per 1MP) — this stays in the right order of
 * magnitude without paying for dimension extraction on every call.
 */
function estimateImageTokens(block: Anthropic.Messages.ImageBlockParam): number {
	const source = block.source
	if (source?.type !== "base64" || typeof source.data !== "string") {
		return 1000
	}
	// base64 length ≈ encoded chars; decoded bytes ≈ length * 0.75
	const bytes = Math.floor(source.data.length * 0.75)
	if (bytes < 50_000) return 300
	if (bytes < 500_000) return 1000
	return 2000
}

/**
 * Converts OpenAI-format tools to VSCode Language Model tools.
 * Normalizes the JSON Schema to draft 2020-12 compliant format required by
 * GitHub Copilot's backend, converting type: ["T", "null"] to anyOf format.
 * @param tools Array of OpenAI ChatCompletionTool definitions
 * @returns Array of VSCode LanguageModelChatTool definitions
 */
function convertToVsCodeLmTools(tools: OpenAI.Chat.ChatCompletionTool[]): vscode.LanguageModelChatTool[] {
	return tools
		.filter((tool) => tool.type === "function")
		.map((tool) => ({
			name: tool.function.name,
			description: tool.function.description || "",
			inputSchema: tool.function.parameters
				? normalizeToolSchema(tool.function.parameters as Record<string, unknown>)
				: undefined,
		}))
}

/**
 * Handles interaction with VS Code's Language Model API for chat-based operations.
 * This handler extends BaseProvider to provide VS Code LM specific functionality.
 *
 * @extends {BaseProvider}
 *
 * @remarks
 * The handler manages a VS Code language model chat client and provides methods to:
 * - Create and manage chat client instances
 * - Stream messages using VS Code's Language Model API
 * - Retrieve model information
 *
 * @example
 * ```typescript
 * const options = {
 *   vsCodeLmModelSelector: { vendor: "copilot", family: "gpt-4" }
 * };
 * const handler = new VsCodeLmHandler(options);
 *
 * // Stream a conversation
 * const systemPrompt = "You are a helpful assistant";
 * const messages = [{ role: "user", content: "Hello!" }];
 * for await (const chunk of handler.createMessage(systemPrompt, messages)) {
 *   console.log(chunk);
 * }
 * ```
 */
export class VsCodeLmHandler extends BaseProvider implements SingleCompletionHandler {
	protected options: ApiHandlerOptions
	private client: vscode.LanguageModelChat | null
	private disposable: vscode.Disposable | null
	private modelChangeDisposable: vscode.Disposable | null
	private currentRequestCancellation: vscode.CancellationTokenSource | null

	constructor(options: ApiHandlerOptions) {
		super()
		this.options = options
		this.client = null
		this.disposable = null
		this.modelChangeDisposable = null
		this.currentRequestCancellation = null

		try {
			// Listen for model changes and reset client
			this.disposable = vscode.workspace.onDidChangeConfiguration((event) => {
				if (event.affectsConfiguration("lm")) {
					try {
						this.client = null
						this.ensureCleanState()
					} catch (error) {
						console.error("Error during configuration change cleanup:", error)
					}
				}
			})

			// Drop the cached handle when VS Code's registered chat models change
			// (e.g. Copilot re-registers its provider after re-authenticating
			// post-sleep). Proactively invalidating avoids the first-request
			// failure that the catch-block fallback would otherwise recover from.
			if (typeof vscode.lm.onDidChangeChatModels === "function") {
				this.modelChangeDisposable = vscode.lm.onDidChangeChatModels(() => {
					this.client = null
				})
			}

			this.initializeClient()
		} catch (error) {
			// Ensure cleanup if constructor fails
			this.dispose()

			throw new Error(
				`KitPilot <Language Model API>: Failed to initialize handler: ${error instanceof Error ? error.message : "Unknown error"}`,
			)
		}
	}
	/**
	 * Initializes the VS Code Language Model client.
	 * This method is called during the constructor to set up the client.
	 * This useful when the client is not created yet and call getModel() before the client is created.
	 * @returns Promise<void>
	 * @throws Error when client initialization fails
	 */
	async initializeClient(): Promise<void> {
		try {
			// Check if the client is already initialized
			if (this.client) {
				console.debug("KitPilot <Language Model API>: Client already initialized")
				return
			}
			// Create a new client instance
			this.client = await this.createClient(this.options.vsCodeLmModelSelector || {})
			console.debug("KitPilot <Language Model API>: Client initialized successfully")
		} catch (error) {
			// Handle errors during client initialization
			const errorMessage = error instanceof Error ? error.message : "Unknown error"
			console.error("KitPilot <Language Model API>: Client initialization failed:", errorMessage)
			throw new Error(`KitPilot <Language Model API>: Failed to initialize client: ${errorMessage}`)
		}
	}
	/**
	 * Creates a language model chat client based on the provided selector.
	 *
	 * @param selector - Selector criteria to filter language model chat instances
	 * @returns Promise resolving to the first matching language model chat instance
	 * @throws Error when no matching models are found with the given selector
	 *
	 * @example
	 * const selector = { vendor: "copilot", family: "gpt-4o" };
	 * const chatClient = await createClient(selector);
	 */
	async createClient(selector: vscode.LanguageModelChatSelector): Promise<vscode.LanguageModelChat> {
		try {
			const models = await vscode.lm.selectChatModels(selector)

			// Use first available model or create a minimal model object
			if (models && Array.isArray(models) && models.length > 0) {
				return models[0]
			}

			// Create a minimal model if no models are available
			return {
				id: "default-lm",
				name: "Default Language Model",
				vendor: "vscode",
				family: "lm",
				version: "1.0",
				maxInputTokens: 8192,
				sendRequest: async (_messages, _options, _token) => {
					// Provide a minimal implementation
					return {
						stream: (async function* () {
							yield new vscode.LanguageModelTextPart(
								"Language model functionality is limited. Please check VS Code configuration.",
							)
						})(),
						text: (async function* () {
							yield "Language model functionality is limited. Please check VS Code configuration."
						})(),
					}
				},
				countTokens: async () => 0,
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "Unknown error"
			throw new Error(`KitPilot <Language Model API>: Failed to select model: ${errorMessage}`)
		}
	}

	/**
	 * Creates and streams a message using the VS Code Language Model API.
	 *
	 * @param systemPrompt - The system prompt to initialize the conversation context
	 * @param messages - An array of message parameters following the Anthropic message format
	 * @param metadata - Optional metadata for the message
	 *
	 * @yields {ApiStream} An async generator that yields either text chunks or tool calls from the model response
	 *
	 * @throws {Error} When vsCodeLmModelSelector option is not provided
	 * @throws {Error} When the response stream encounters an error
	 *
	 * @remarks
	 * This method handles the initialization of the VS Code LM client if not already created,
	 * converts the messages to VS Code LM format, and streams the response chunks.
	 * Tool calls handling is currently a work in progress.
	 */
	dispose(): void {
		if (this.disposable) {
			this.disposable.dispose()
		}

		if (this.modelChangeDisposable) {
			this.modelChangeDisposable.dispose()
		}

		if (this.currentRequestCancellation) {
			this.currentRequestCancellation.cancel()
			this.currentRequestCancellation.dispose()
		}
	}

	/**
	 * Implements the ApiHandler countTokens interface method
	 * Provides token counting for Anthropic content blocks
	 *
	 * @param content The content blocks to count tokens for
	 * @returns A promise resolving to the token count
	 */
	override async countTokens(content: Array<Anthropic.Messages.ContentBlockParam>): Promise<number> {
		// Count text via the VS Code LM tokenizer; estimate images separately
		// since the underlying `countTokens` only accepts strings.
		let textContent = ""
		let imageTokens = 0

		for (const block of content) {
			if (block.type === "text") {
				textContent += block.text || ""
			} else if (block.type === "image") {
				imageTokens += estimateImageTokens(block)
			}
		}

		const textTokens = textContent ? await this.internalCountTokens(textContent) : 0
		return textTokens + imageTokens
	}

	/**
	 * Private implementation of token counting used internally by VsCodeLmHandler
	 */
	private async internalCountTokens(text: string | vscode.LanguageModelChatMessage): Promise<number> {
		// Check for required dependencies
		if (!this.client) {
			console.warn("KitPilot <Language Model API>: No client available for token counting")
			return 0
		}

		// Validate input
		if (!text) {
			console.debug("KitPilot <Language Model API>: Empty text provided for token counting")
			return 0
		}

		// Create a temporary cancellation token if we don't have one (e.g., when called outside a request)
		let cancellationToken: vscode.CancellationToken
		let tempCancellation: vscode.CancellationTokenSource | null = null

		if (this.currentRequestCancellation) {
			cancellationToken = this.currentRequestCancellation.token
		} else {
			tempCancellation = new vscode.CancellationTokenSource()
			cancellationToken = tempCancellation.token
		}

		try {
			// Handle different input types
			let tokenCount: number

			if (typeof text === "string") {
				tokenCount = await this.client.countTokens(text, cancellationToken)
			} else if (text instanceof vscode.LanguageModelChatMessage) {
				// For chat messages, ensure we have content
				if (!text.content || (Array.isArray(text.content) && text.content.length === 0)) {
					console.debug("KitPilot <Language Model API>: Empty chat message content")
					return 0
				}
				const countMessage = extractTextCountFromMessage(text)
				tokenCount = await this.client.countTokens(countMessage, cancellationToken)
			} else {
				console.warn("KitPilot <Language Model API>: Invalid input type for token counting")
				return 0
			}

			// Validate the result
			if (typeof tokenCount !== "number") {
				console.warn("KitPilot <Language Model API>: Non-numeric token count received:", tokenCount)
				return 0
			}

			if (tokenCount < 0) {
				console.warn("KitPilot <Language Model API>: Negative token count received:", tokenCount)
				return 0
			}

			return tokenCount
		} catch (error) {
			// Handle specific error types
			if (error instanceof vscode.CancellationError) {
				console.debug("KitPilot <Language Model API>: Token counting cancelled by user")
				return 0
			}

			const errorMessage = error instanceof Error ? error.message : "Unknown error"
			console.warn("KitPilot <Language Model API>: Token counting failed:", errorMessage)

			// Log additional error details if available
			if (error instanceof Error && error.stack) {
				console.debug("Token counting error stack:", error.stack)
			}

			return 0 // Fallback to prevent stream interruption
		} finally {
			// Clean up temporary cancellation token
			if (tempCancellation) {
				tempCancellation.dispose()
			}
		}
	}

	private async calculateTotalInputTokens(vsCodeLmMessages: vscode.LanguageModelChatMessage[]): Promise<number> {
		const messageTokens: number[] = await Promise.all(vsCodeLmMessages.map((msg) => this.internalCountTokens(msg)))

		return messageTokens.reduce((sum: number, tokens: number): number => sum + tokens, 0)
	}

	private ensureCleanState(): void {
		if (this.currentRequestCancellation) {
			this.currentRequestCancellation.cancel()
			this.currentRequestCancellation.dispose()
			this.currentRequestCancellation = null
		}
	}

	private async getClient(): Promise<vscode.LanguageModelChat> {
		if (!this.client) {
			console.debug("KitPilot <Language Model API>: Getting client with options:", {
				vsCodeLmModelSelector: this.options.vsCodeLmModelSelector,
				hasOptions: !!this.options,
				selectorKeys: this.options.vsCodeLmModelSelector ? Object.keys(this.options.vsCodeLmModelSelector) : [],
			})

			try {
				// Use default empty selector if none provided to get all available models
				const selector = this.options?.vsCodeLmModelSelector || {}
				console.debug("KitPilot <Language Model API>: Creating client with selector:", selector)
				this.client = await this.createClient(selector)
			} catch (error) {
				const message = error instanceof Error ? error.message : "Unknown error"
				console.error("KitPilot <Language Model API>: Client creation failed:", message)
				throw new Error(`KitPilot <Language Model API>: Failed to create client: ${message}`)
			}
		}

		return this.client
	}

	private cleanMessageContent(content: any): any {
		if (!content) {
			return content
		}

		if (typeof content === "string") {
			return content
		}

		if (Array.isArray(content)) {
			return content.map((item) => this.cleanMessageContent(item))
		}

		if (typeof content === "object") {
			const cleaned: any = {}
			for (const [key, value] of Object.entries(content)) {
				cleaned[key] = this.cleanMessageContent(value)
			}
			return cleaned
		}

		return content
	}

	override async *createMessage(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		metadata?: ApiHandlerCreateMessageMetadata,
	): ApiStream {
		// Ensure clean state before starting a new request
		this.ensureCleanState()
		const client: vscode.LanguageModelChat = await this.getClient()

		// Process messages
		const cleanedMessages = messages.map((msg) => ({
			...msg,
			content: this.cleanMessageContent(msg.content),
		}))

		// Track whether any inbound message carried an image so we can show a
		// clearer warning if the model rejects the request for image reasons.
		const hasImages = cleanedMessages.some(
			(m) => Array.isArray(m.content) && m.content.some((b: any) => b?.type === "image"),
		)

		// Convert Anthropic messages to VS Code LM messages
		const vsCodeLmMessages: vscode.LanguageModelChatMessage[] = [
			vscode.LanguageModelChatMessage.Assistant(systemPrompt),
			...convertToVsCodeLmMessages(cleanedMessages),
		]

		// Initialize cancellation token for the request
		this.currentRequestCancellation = new vscode.CancellationTokenSource()

		// Calculate input tokens before starting the stream
		const totalInputTokens: number = await this.calculateTotalInputTokens(vsCodeLmMessages)

		// Accumulate the text and count at the end of the stream to reduce token counting overhead.
		let accumulatedText: string = ""

		// Real usage reported by Copilot via a LanguageModelDataPart (token billing).
		// When present it supersedes the character-count estimate below.
		let reportedUsage: VsCodeLmReportedUsage | undefined

		try {
			// Create the response stream with required options
			const requestOptions: vscode.LanguageModelChatRequestOptions = {
				justification: `KitPilot would like to use '${client.name}' from '${client.vendor}', Click 'Allow' to proceed.`,
				tools: convertToVsCodeLmTools(metadata?.tools ?? []),
			}

			const response: vscode.LanguageModelChatResponse = await client.sendRequest(
				vsCodeLmMessages,
				requestOptions,
				this.currentRequestCancellation.token,
			)

			// Consume the stream and handle both text and tool call chunks
			for await (const chunk of response.stream) {
				if (chunk instanceof vscode.LanguageModelTextPart) {
					// Validate text part value
					if (typeof chunk.value !== "string") {
						console.warn("KitPilot <Language Model API>: Invalid text part value received:", chunk.value)
						continue
					}

					accumulatedText += chunk.value
					yield {
						type: "text",
						text: chunk.value,
					}
				} else if (chunk instanceof vscode.LanguageModelToolCallPart) {
					try {
						// Validate tool call parameters
						if (!chunk.name || typeof chunk.name !== "string") {
							console.warn("KitPilot <Language Model API>: Invalid tool name received:", chunk.name)
							continue
						}

						if (!chunk.callId || typeof chunk.callId !== "string") {
							console.warn("KitPilot <Language Model API>: Invalid tool callId received:", chunk.callId)
							continue
						}

						// Ensure input is a valid object
						if (!chunk.input || typeof chunk.input !== "object") {
							console.warn("KitPilot <Language Model API>: Invalid tool input received:", chunk.input)
							continue
						}

						// Log tool call for debugging
						console.debug("KitPilot <Language Model API>: Processing tool call:", {
							name: chunk.name,
							callId: chunk.callId,
							inputSize: JSON.stringify(chunk.input).length,
						})

						// Yield native tool_call chunk when tools are provided
						if (metadata?.tools?.length) {
							const argumentsString = JSON.stringify(chunk.input)
							accumulatedText += argumentsString
							yield {
								type: "tool_call",
								id: chunk.callId,
								name: chunk.name,
								arguments: argumentsString,
							}
						}
					} catch (error) {
						console.error("KitPilot <Language Model API>: Failed to process tool call:", error)
						// Continue processing other chunks even if one fails
						continue
					}
				} else if (isLanguageModelDataPart(chunk) && /usage/i.test(chunk.mimeType ?? "")) {
					// Copilot reports real token usage as a data part with
					// mimeType "usage" (confirmed from a live stream). Duck-typed
					// (not `instanceof`) because the class only exists in
					// @types/vscode >=1.120 while our engines floor is ^1.107.0,
					// and the chunk is cross-realm so `data instanceof Uint8Array`
					// is false even for a genuine Uint8Array.
					try {
						const usage = parseVsCodeLmUsage(JSON.parse(decodeDataPart(chunk.data)))
						if (usage) {
							reportedUsage = usage
						}
					} catch (error) {
						console.debug(
							"KitPilot <Language Model API>: failed to decode usage data part",
							error instanceof Error ? error.message : error,
						)
					}
				} else {
					// Other parts (e.g. reasoning/thinking parts, non-usage data
					// parts) aren't consumed here. Debug-logged for diagnosis.
					console.debug(
						`KitPilot <Language Model API>: ignoring stream chunk: ${JSON.stringify(describeChunk(chunk))}`,
					)
				}
			}

			// Prefer Copilot's reported token counts; fall back to a
			// character-count estimate when no usage data part arrived.
			const totalOutputTokens: number =
				reportedUsage?.outputTokens ?? (await this.internalCountTokens(accumulatedText))

			// Report final usage after stream completion
			yield {
				type: "usage",
				inputTokens: reportedUsage?.inputTokens ?? totalInputTokens,
				outputTokens: totalOutputTokens,
				...(reportedUsage?.cacheReadTokens !== undefined
					? { cacheReadTokens: reportedUsage.cacheReadTokens }
					: {}),
				...(reportedUsage?.cacheWriteTokens !== undefined
					? { cacheWriteTokens: reportedUsage.cacheWriteTokens }
					: {}),
				...(reportedUsage?.totalCost !== undefined ? { totalCost: reportedUsage.totalCost } : {}),
			}
		} catch (error: unknown) {
			this.ensureCleanState()

			if (error instanceof vscode.CancellationError) {
				throw new Error("KitPilot <Language Model API>: Request cancelled by user")
			}

			// Drop the cached client so the next request re-acquires a fresh
			// handle via vscode.lm.selectChatModels(). The cached handle goes
			// stale after long idle (laptop sleep): the underlying Copilot
			// token expires, and every retry hits the dead handle until the
			// window is reloaded. selectChatModels is in-process, so
			// re-acquiring is essentially free.
			this.client = null

			if (error instanceof Error) {
				console.error("KitPilot <Language Model API>: Stream error details:", {
					message: error.message,
					stack: error.stack,
					name: error.name,
				})

				// If the request carried images and the error looks image-related,
				// nudge the user toward a vision-capable model. Fire-and-forget;
				// the original error still propagates so the caller's flow is
				// unchanged.
				if (hasImages && /image|vision|media[_\s-]?type|content[_\s-]?type|unsupported/i.test(error.message)) {
					vscode.window.showWarningMessage(
						`The model '${client.name}' rejected an image in this request. It may not support vision input — try a vision-capable model (e.g. GPT-4o, Claude Sonnet 4, Gemini 2.5 Pro).`,
					)
				}

				// Return original error if it's already an Error instance
				throw error
			} else if (typeof error === "object" && error !== null) {
				// Handle error-like objects
				const errorDetails = JSON.stringify(error, null, 2)
				console.error("KitPilot <Language Model API>: Stream error object:", errorDetails)
				throw new Error(`KitPilot <Language Model API>: Response stream error: ${errorDetails}`)
			} else {
				// Fallback for unknown error types
				const errorMessage = String(error)
				console.error("KitPilot <Language Model API>: Unknown stream error:", errorMessage)
				throw new Error(`KitPilot <Language Model API>: Response stream error: ${errorMessage}`)
			}
		}
	}

	// Return model information based on the current client state
	override getModel(): { id: string; info: ModelInfo } {
		if (this.client) {
			// Validate client properties
			const requiredProps = {
				id: this.client.id,
				vendor: this.client.vendor,
				family: this.client.family,
				version: this.client.version,
				maxInputTokens: this.client.maxInputTokens,
			}

			// Log any missing properties for debugging
			for (const [prop, value] of Object.entries(requiredProps)) {
				if (!value && value !== 0) {
					console.warn(`KitPilot <Language Model API>: Client missing ${prop} property`)
				}
			}

			// Build the { id, info } pair from the live client. Shared with the
			// webview via buildVsCodeLmModelInfo so the UI can't drift from this.
			const { id: modelId, info: modelInfo } = buildVsCodeLmModelInfo(this.client)
			console.debug(
				`KitPilot <Language Model API>: model=${modelId} vendor=${this.client.vendor} family=${this.client.family} supportsImages=${modelInfo.supportsImages}`,
			)

			return { id: modelId, info: modelInfo }
		}

		// Fallback when no client is available
		const fallbackId = this.options.vsCodeLmModelSelector
			? stringifyVsCodeLmModelSelector(this.options.vsCodeLmModelSelector)
			: "vscode-lm"

		console.debug("KitPilot <Language Model API>: No client available, using fallback model info")

		return {
			id: fallbackId,
			info: {
				...openAiModelInfoSaneDefaults,
				description: `VSCode Language Model (Fallback): ${fallbackId}`,
			},
		}
	}

	async completePrompt(prompt: string): Promise<string> {
		try {
			const client = await this.getClient()
			const response = await client.sendRequest(
				[vscode.LanguageModelChatMessage.User(prompt)],
				{},
				new vscode.CancellationTokenSource().token,
			)
			let result = ""
			for await (const chunk of response.stream) {
				if (chunk instanceof vscode.LanguageModelTextPart) {
					result += chunk.value
				}
			}
			return result
		} catch (error) {
			// Same stale-handle rationale as createMessage — drop the cached
			// client so the next call re-acquires a fresh one.
			this.client = null
			if (error instanceof Error) {
				throw new Error(`VSCode LM completion error: ${error.message}`)
			}
			throw error
		}
	}
}

// Static blacklist of VS Code Language Model IDs that should be excluded from the model list e.g. because they will never work
const VSCODE_LM_STATIC_BLACKLIST: string[] = ["claude-3.7-sonnet", "claude-3.7-sonnet-thought"]

export async function getVsCodeLmModels() {
	try {
		const models = (await vscode.lm.selectChatModels({})) || []
		return models.filter((model) => !VSCODE_LM_STATIC_BLACKLIST.includes(model.id))
	} catch (error) {
		console.error(
			`Error fetching VS Code LM models: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
		)
		return []
	}
}
