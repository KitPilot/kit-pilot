import type { Mock } from "vitest"

// Mocks must come first, before imports
vi.mock("vscode", () => {
	class MockLanguageModelTextPart {
		type = "text"
		constructor(public value: string) {}
	}

	class MockLanguageModelDataPart {
		type = "data"
		constructor(
			public data: Uint8Array,
			public mimeType: string,
		) {}
		static image(data: Uint8Array, mime: string) {
			return new MockLanguageModelDataPart(data, mime)
		}
	}

	class MockLanguageModelToolCallPart {
		type = "tool_call"
		constructor(
			public callId: string,
			public name: string,
			public input: any,
		) {}
	}

	class MockLanguageModelToolResultPart {
		type = "tool_result"
		constructor(
			public callId: string,
			public content: any[],
		) {}
	}

	return {
		workspace: {
			onDidChangeConfiguration: vi.fn((_callback) => ({
				dispose: vi.fn(),
			})),
		},
		window: {
			showWarningMessage: vi.fn(),
		},
		CancellationTokenSource: vi.fn(() => ({
			token: {
				isCancellationRequested: false,
				onCancellationRequested: vi.fn(),
			},
			cancel: vi.fn(),
			dispose: vi.fn(),
		})),
		CancellationError: class CancellationError extends Error {
			constructor() {
				super("Operation cancelled")
				this.name = "CancellationError"
			}
		},
		LanguageModelChatMessage: {
			Assistant: vi.fn((content) => ({
				role: "assistant",
				content: Array.isArray(content) ? content : [new MockLanguageModelTextPart(content)],
			})),
			User: vi.fn((content) => ({
				role: "user",
				content: Array.isArray(content) ? content : [new MockLanguageModelTextPart(content)],
			})),
		},
		LanguageModelTextPart: MockLanguageModelTextPart,
		LanguageModelDataPart: MockLanguageModelDataPart,
		LanguageModelToolCallPart: MockLanguageModelToolCallPart,
		LanguageModelToolResultPart: MockLanguageModelToolResultPart,
		lm: {
			selectChatModels: vi.fn(),
			onDidChangeChatModels: vi.fn((_callback) => ({
				dispose: vi.fn(),
			})),
		},
	}
})

import * as vscode from "vscode"
import { VsCodeLmHandler } from "../vscode-lm"
import type { ApiHandlerOptions } from "../../../shared/api"
import type { Anthropic } from "@anthropic-ai/sdk"

const mockLanguageModelChat = {
	id: "test-model",
	name: "Test Model",
	vendor: "test-vendor",
	family: "test-family",
	version: "1.0",
	maxInputTokens: 4096,
	sendRequest: vi.fn(),
	countTokens: vi.fn(),
}

describe("VsCodeLmHandler", () => {
	let handler: VsCodeLmHandler
	const defaultOptions: ApiHandlerOptions = {
		vsCodeLmModelSelector: {
			vendor: "test-vendor",
			family: "test-family",
		},
	}

	beforeEach(() => {
		vi.clearAllMocks()
		handler = new VsCodeLmHandler(defaultOptions)
	})

	afterEach(() => {
		handler.dispose()
	})

	describe("constructor", () => {
		it("should initialize with provided options", () => {
			expect(handler).toBeDefined()
			expect(vscode.workspace.onDidChangeConfiguration).toHaveBeenCalled()
		})

		it("should handle configuration changes", () => {
			const callback = (vscode.workspace.onDidChangeConfiguration as Mock).mock.calls[0][0]
			callback({ affectsConfiguration: () => true })
			// Should reset client when config changes
			expect(handler["client"]).toBeNull()
		})
	})

	describe("createClient", () => {
		it("should create client with selector", async () => {
			const mockModel = { ...mockLanguageModelChat }
			;(vscode.lm.selectChatModels as Mock).mockResolvedValueOnce([mockModel])

			const client = await handler["createClient"]({
				vendor: "test-vendor",
				family: "test-family",
			})

			expect(client).toBeDefined()
			expect(client.id).toBe("test-model")
			expect(vscode.lm.selectChatModels).toHaveBeenCalledWith({
				vendor: "test-vendor",
				family: "test-family",
			})
		})

		it("should return default client when no models available", async () => {
			;(vscode.lm.selectChatModels as Mock).mockResolvedValueOnce([])

			const client = await handler["createClient"]({})

			expect(client).toBeDefined()
			expect(client.id).toBe("default-lm")
			expect(client.vendor).toBe("vscode")
		})
	})

	describe("createMessage", () => {
		beforeEach(() => {
			const mockModel = { ...mockLanguageModelChat }
			;(vscode.lm.selectChatModels as Mock).mockResolvedValueOnce([mockModel])
			mockLanguageModelChat.countTokens.mockResolvedValue(10)

			// Override the default client with our test client
			handler["client"] = mockLanguageModelChat
		})

		it("should stream text responses", async () => {
			const systemPrompt = "You are a helpful assistant"
			const messages: Anthropic.Messages.MessageParam[] = [
				{
					role: "user" as const,
					content: "Hello",
				},
			]

			const responseText = "Hello! How can I help you?"
			mockLanguageModelChat.sendRequest.mockResolvedValueOnce({
				stream: (async function* () {
					yield new vscode.LanguageModelTextPart(responseText)
					return
				})(),
				text: (async function* () {
					yield responseText
					return
				})(),
			})

			const stream = handler.createMessage(systemPrompt, messages)
			const chunks = []
			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			expect(chunks).toHaveLength(2) // Text chunk + usage chunk
			expect(chunks[0]).toEqual({
				type: "text",
				text: responseText,
			})
			expect(chunks[1]).toMatchObject({
				type: "usage",
				inputTokens: expect.any(Number),
				outputTokens: expect.any(Number),
			})
		})

		it("should emit tool_call chunks when tools are provided", async () => {
			const systemPrompt = "You are a helpful assistant"
			const messages: Anthropic.Messages.MessageParam[] = [
				{
					role: "user" as const,
					content: "Calculate 2+2",
				},
			]

			const toolCallData = {
				name: "calculator",
				arguments: { operation: "add", numbers: [2, 2] },
				callId: "call-1",
			}

			mockLanguageModelChat.sendRequest.mockResolvedValueOnce({
				stream: (async function* () {
					yield new vscode.LanguageModelToolCallPart(
						toolCallData.callId,
						toolCallData.name,
						toolCallData.arguments,
					)
					return
				})(),
				text: (async function* () {
					yield JSON.stringify({ type: "tool_call", ...toolCallData })
					return
				})(),
			})

			const tools = [
				{
					type: "function" as const,
					function: {
						name: "calculator",
						description: "A simple calculator",
						parameters: {
							type: "object",
							properties: {
								operation: { type: "string" },
								numbers: { type: "array", items: { type: "number" } },
							},
						},
					},
				},
			]

			const stream = handler.createMessage(systemPrompt, messages, {
				taskId: "test-task",
				tools,
			})
			const chunks = []
			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			expect(chunks).toHaveLength(2) // Tool call chunk + usage chunk
			expect(chunks[0]).toEqual({
				type: "tool_call",
				id: toolCallData.callId,
				name: toolCallData.name,
				arguments: JSON.stringify(toolCallData.arguments),
			})
		})

		it("should handle native tool calls when tools are provided", async () => {
			const systemPrompt = "You are a helpful assistant"
			const messages: Anthropic.Messages.MessageParam[] = [
				{
					role: "user" as const,
					content: "Calculate 2+2",
				},
			]

			const toolCallData = {
				name: "calculator",
				arguments: { operation: "add", numbers: [2, 2] },
				callId: "call-1",
			}

			const tools = [
				{
					type: "function" as const,
					function: {
						name: "calculator",
						description: "A simple calculator",
						parameters: {
							type: "object",
							properties: {
								operation: { type: "string" },
								numbers: { type: "array", items: { type: "number" } },
							},
						},
					},
				},
			]

			mockLanguageModelChat.sendRequest.mockResolvedValueOnce({
				stream: (async function* () {
					yield new vscode.LanguageModelToolCallPart(
						toolCallData.callId,
						toolCallData.name,
						toolCallData.arguments,
					)
					return
				})(),
				text: (async function* () {
					yield JSON.stringify({ type: "tool_call", ...toolCallData })
					return
				})(),
			})

			const stream = handler.createMessage(systemPrompt, messages, {
				taskId: "test-task",
				tools,
			})
			const chunks = []
			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			expect(chunks).toHaveLength(2) // Tool call chunk + usage chunk
			expect(chunks[0]).toEqual({
				type: "tool_call",
				id: toolCallData.callId,
				name: toolCallData.name,
				arguments: JSON.stringify(toolCallData.arguments),
			})
		})

		it("should pass tools to request options when tools are provided", async () => {
			const systemPrompt = "You are a helpful assistant"
			const messages: Anthropic.Messages.MessageParam[] = [
				{
					role: "user" as const,
					content: "Calculate 2+2",
				},
			]

			const tools = [
				{
					type: "function" as const,
					function: {
						name: "calculator",
						description: "A simple calculator",
						parameters: {
							type: "object",
							properties: {
								operation: { type: "string" },
							},
						},
					},
				},
			]

			mockLanguageModelChat.sendRequest.mockResolvedValueOnce({
				stream: (async function* () {
					yield new vscode.LanguageModelTextPart("Result: 4")
					return
				})(),
				text: (async function* () {
					yield "Result: 4"
					return
				})(),
			})

			const stream = handler.createMessage(systemPrompt, messages, {
				taskId: "test-task",
				tools,
			})
			const chunks = []
			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			// Verify sendRequest was called with tools in options
			// Note: normalizeToolSchema adds additionalProperties: false for JSON Schema 2020-12 compliance
			expect(mockLanguageModelChat.sendRequest).toHaveBeenCalledWith(
				expect.any(Array),
				expect.objectContaining({
					tools: [
						{
							name: "calculator",
							description: "A simple calculator",
							inputSchema: {
								type: "object",
								properties: {
									operation: { type: "string" },
								},
								additionalProperties: false,
							},
						},
					],
				}),
				expect.anything(),
			)
		})

		it("should handle errors", async () => {
			const systemPrompt = "You are a helpful assistant"
			const messages: Anthropic.Messages.MessageParam[] = [
				{
					role: "user" as const,
					content: "Hello",
				},
			]

			mockLanguageModelChat.sendRequest.mockRejectedValueOnce(new Error("API Error"))

			await expect(handler.createMessage(systemPrompt, messages).next()).rejects.toThrow("API Error")
		})

		it("should warn the user when an image-bearing request is rejected by the model", async () => {
			const showWarning = vscode.window.showWarningMessage as Mock
			showWarning.mockClear()

			const messages: Anthropic.Messages.MessageParam[] = [
				{
					role: "user",
					content: [
						{ type: "text", text: "What is this?" },
						{
							type: "image",
							source: { type: "base64", media_type: "image/png", data: "abc" },
						},
					],
				},
			]
			mockLanguageModelChat.sendRequest.mockRejectedValueOnce(
				new Error("Unsupported content type: image/png"),
			)

			await expect(handler.createMessage("system", messages).next()).rejects.toThrow(
				"Unsupported content type",
			)
			expect(showWarning).toHaveBeenCalledTimes(1)
			expect(showWarning.mock.calls[0][0]).toMatch(/rejected an image/i)
		})

		it("should NOT warn for non-image errors even when images are present", async () => {
			const showWarning = vscode.window.showWarningMessage as Mock
			showWarning.mockClear()

			const messages: Anthropic.Messages.MessageParam[] = [
				{
					role: "user",
					content: [
						{
							type: "image",
							source: { type: "base64", media_type: "image/png", data: "abc" },
						},
					],
				},
			]
			mockLanguageModelChat.sendRequest.mockRejectedValueOnce(new Error("Network timeout"))

			await expect(handler.createMessage("system", messages).next()).rejects.toThrow("Network timeout")
			expect(showWarning).not.toHaveBeenCalled()
		})

		it("drops the cached client when sendRequest throws so the next call re-acquires a fresh handle", async () => {
			const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: "Hello" }]
			mockLanguageModelChat.sendRequest.mockRejectedValueOnce(new Error("auth token expired"))

			await expect(handler.createMessage("system", messages).next()).rejects.toThrow("auth token expired")

			// Cached handle must be cleared so getClient() re-runs selectChatModels()
			// on the next request instead of reusing the stale one.
			expect(handler["client"]).toBeNull()
		})

		it("does NOT drop the cached client on user cancellation (the client is fine)", async () => {
			const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: "Hello" }]
			mockLanguageModelChat.sendRequest.mockRejectedValueOnce(new vscode.CancellationError())

			await expect(handler.createMessage("system", messages).next()).rejects.toThrow(/cancelled/i)

			// CancellationError means the user cancelled — the handle itself
			// is still valid, so we should not force a re-acquire.
			expect(handler["client"]).toBe(mockLanguageModelChat)
		})
	})

	describe("getModel", () => {
		it("should return model info when client exists", async () => {
			const mockModel = { ...mockLanguageModelChat }
			// The handler starts async initialization in the constructor.
			// Make the test deterministic by explicitly (re)initializing here.
			;(vscode.lm.selectChatModels as Mock).mockResolvedValue([mockModel])
			handler["client"] = null
			await handler.initializeClient()

			const model = handler.getModel()
			expect(model.id).toBe("test-model")
			expect(model.info).toBeDefined()
			expect(model.info.contextWindow).toBe(4096)
		})

		it("should return fallback model info when no client exists", () => {
			// Clear the client first
			handler["client"] = null
			const model = handler.getModel()
			expect(model.id).toBe("test-vendor/test-family")
			expect(model.info).toBeDefined()
		})

		it("should return basic model info when client exists", async () => {
			const mockModel = { ...mockLanguageModelChat }
			// The handler starts async initialization in the constructor.
			// Make the test deterministic by explicitly (re)initializing here.
			;(vscode.lm.selectChatModels as Mock).mockResolvedValue([mockModel])
			handler["client"] = null
			await handler.initializeClient()

			const model = handler.getModel()
			expect(model.info).toBeDefined()
			expect(model.info.contextWindow).toBe(4096)
		})

		it("should return fallback model info when no client exists", () => {
			// Clear the client first
			handler["client"] = null
			const model = handler.getModel()
			expect(model.info).toBeDefined()
		})

		it("should report supportsImages=false for non-vision models", async () => {
			;(vscode.lm.selectChatModels as Mock).mockResolvedValue([{ ...mockLanguageModelChat }])
			handler["client"] = null
			await handler.initializeClient()

			const model = handler.getModel()
			expect(model.info.supportsImages).toBe(false)
		})

		it("should report supportsImages=true for vision-capable model families", async () => {
			;(vscode.lm.selectChatModels as Mock).mockResolvedValue([
				{ ...mockLanguageModelChat, id: "gpt-4o", family: "gpt-4o" },
			])
			handler["client"] = null
			await handler.initializeClient()

			const model = handler.getModel()
			expect(model.info.supportsImages).toBe(true)
		})

		it("should keep supportsImages=false for denylisted text-only variants like o3-mini", async () => {
			;(vscode.lm.selectChatModels as Mock).mockResolvedValue([
				{ ...mockLanguageModelChat, id: "o3-mini", family: "o3-mini" },
			])
			handler["client"] = null
			await handler.initializeClient()

			const model = handler.getModel()
			expect(model.info.supportsImages).toBe(false)
		})
	})

	describe("countTokens", () => {
		beforeEach(() => {
			handler["client"] = mockLanguageModelChat
		})

		it("should count tokens when called outside of an active request", async () => {
			// Ensure no active request cancellation token exists
			handler["currentRequestCancellation"] = null

			mockLanguageModelChat.countTokens.mockResolvedValueOnce(42)

			const content: Anthropic.Messages.ContentBlockParam[] = [{ type: "text", text: "Hello world" }]
			const result = await handler.countTokens(content)

			expect(result).toBe(42)
			expect(mockLanguageModelChat.countTokens).toHaveBeenCalledWith("Hello world", expect.any(Object))
		})

		it("should count tokens when called during an active request", async () => {
			// Simulate an active request with a cancellation token
			const mockCancellation = {
				token: { isCancellationRequested: false, onCancellationRequested: vi.fn() },
				cancel: vi.fn(),
				dispose: vi.fn(),
			}
			handler["currentRequestCancellation"] = mockCancellation as any

			mockLanguageModelChat.countTokens.mockResolvedValueOnce(50)

			const content: Anthropic.Messages.ContentBlockParam[] = [{ type: "text", text: "Test content" }]
			const result = await handler.countTokens(content)

			expect(result).toBe(50)
			expect(mockLanguageModelChat.countTokens).toHaveBeenCalledWith("Test content", mockCancellation.token)
		})

		it("should return 0 when no client is available", async () => {
			handler["client"] = null
			handler["currentRequestCancellation"] = null

			const content: Anthropic.Messages.ContentBlockParam[] = [{ type: "text", text: "Hello" }]
			const result = await handler.countTokens(content)

			expect(result).toBe(0)
		})

		it("should estimate image tokens without calling the text counter", async () => {
			handler["currentRequestCancellation"] = null

			// Small image (decoded ~2 bytes) → 300-token tier
			const content: Anthropic.Messages.ContentBlockParam[] = [
				{ type: "image", source: { type: "base64", media_type: "image/png", data: "abc" } },
			]
			const result = await handler.countTokens(content)

			expect(result).toBe(300)
			// No text content was present, so the underlying tokenizer must not be called.
			expect(mockLanguageModelChat.countTokens).not.toHaveBeenCalled()
		})

		it("should add image token estimate on top of text tokens", async () => {
			handler["currentRequestCancellation"] = null
			mockLanguageModelChat.countTokens.mockResolvedValueOnce(7)

			// ~80KB decoded → 1000-token tier
			const base64 = "a".repeat(110_000)
			const content: Anthropic.Messages.ContentBlockParam[] = [
				{ type: "text", text: "describe this" },
				{ type: "image", source: { type: "base64", media_type: "image/png", data: base64 } },
			]
			const result = await handler.countTokens(content)

			expect(result).toBe(7 + 1000)
			expect(mockLanguageModelChat.countTokens).toHaveBeenCalledWith("describe this", expect.any(Object))
		})
	})

	describe("completePrompt", () => {
		it("should complete single prompt", async () => {
			const mockModel = { ...mockLanguageModelChat }
			;(vscode.lm.selectChatModels as Mock).mockResolvedValueOnce([mockModel])

			const responseText = "Completed text"
			mockLanguageModelChat.sendRequest.mockResolvedValueOnce({
				stream: (async function* () {
					yield new vscode.LanguageModelTextPart(responseText)
					return
				})(),
				text: (async function* () {
					yield responseText
					return
				})(),
			})

			// Override the default client with our test client to ensure it uses
			// the mock implementation rather than the default fallback
			handler["client"] = mockLanguageModelChat

			const result = await handler.completePrompt("Test prompt")
			expect(result).toBe(responseText)
			expect(mockLanguageModelChat.sendRequest).toHaveBeenCalled()
		})

		it("should handle errors during completion", async () => {
			const mockModel = { ...mockLanguageModelChat }
			;(vscode.lm.selectChatModels as Mock).mockResolvedValueOnce([mockModel])

			mockLanguageModelChat.sendRequest.mockRejectedValueOnce(new Error("Completion failed"))

			// Make sure we're using the mock client
			handler["client"] = mockLanguageModelChat

			const promise = handler.completePrompt("Test prompt")
			await expect(promise).rejects.toThrow("VSCode LM completion error: Completion failed")
		})

		it("drops the cached client on completion error so the next call re-acquires a fresh handle", async () => {
			;(vscode.lm.selectChatModels as Mock).mockResolvedValueOnce([{ ...mockLanguageModelChat }])
			mockLanguageModelChat.sendRequest.mockRejectedValueOnce(new Error("Completion failed"))
			handler["client"] = mockLanguageModelChat

			await expect(handler.completePrompt("Test prompt")).rejects.toThrow()
			expect(handler["client"]).toBeNull()
		})
	})

	describe("stale-handle recovery", () => {
		it("nulls the cached client when onDidChangeChatModels fires", () => {
			// The constructor registers a listener with vscode.lm.onDidChangeChatModels.
			// Simulate VS Code firing it (e.g. Copilot re-registering after re-auth post-sleep).
			handler["client"] = mockLanguageModelChat

			const onDidChange = vscode.lm.onDidChangeChatModels as Mock
			expect(onDidChange).toHaveBeenCalled()
			const callback = onDidChange.mock.calls[0][0]
			callback()

			expect(handler["client"]).toBeNull()
		})

		it("disposes the model-change listener on dispose()", () => {
			const onDidChange = vscode.lm.onDidChangeChatModels as Mock
			// Most recent registration belongs to the handler under test.
			const registration = onDidChange.mock.results[onDidChange.mock.results.length - 1].value as {
				dispose: Mock
			}
			handler.dispose()
			expect(registration.dispose).toHaveBeenCalled()
		})
	})
})
