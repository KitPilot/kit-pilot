// npx vitest run core/config/__tests__/ContextProxy.retiredSecrets.spec.ts

import type * as vscode from "vscode"

vi.mock("vscode", () => ({
	Uri: { file: (p: string) => ({ fsPath: p }) },
	ExtensionMode: { Production: 1, Development: 2, Test: 3 },
}))

import { ContextProxy } from "../ContextProxy"
import { RETIRED_SECRET_STATE_KEYS } from "@kit-pilot/types"

const RETIRED = [
	...RETIRED_SECRET_STATE_KEYS,
	"codeIndexOpenAiKey",
	"codebaseIndexOpenAiCompatibleApiKey",
	"codebaseIndexGeminiApiKey",
	"codebaseIndexMistralApiKey",
	"codebaseIndexVercelAiGatewayApiKey",
	"codebaseIndexOpenRouterApiKey",
	"openRouterImageApiKey",
	"openai-codex-oauth-credentials",
]

const makeContext = (stored: Record<string, string> = {}, storedGlobal: Record<string, unknown> = {}) => {
	const store = new Map(Object.entries(stored))
	const globalStore = new Map(Object.entries(storedGlobal))
	const secrets = {
		get: vi.fn(async (key: string) => store.get(key)),
		store: vi.fn(async (key: string, value: string) => void store.set(key, value)),
		delete: vi.fn(async (key: string) => void store.delete(key)),
	}
	return {
		context: {
			globalState: {
				get: vi.fn((key: string) => globalStore.get(key)),
				update: vi.fn(async (key: string, value: unknown) =>
					value === undefined ? void globalStore.delete(key) : void globalStore.set(key, value),
				),
			},
			secrets,
			extensionUri: { fsPath: "/ext" },
			extensionMode: 3,
			globalStorageUri: { fsPath: "/storage" },
		} as unknown as vscode.ExtensionContext,
		secrets,
		store,
		globalStore,
	}
}

describe("ContextProxy retired-secret purge", () => {
	it("deletes every retired secret before hydrating the cache", async () => {
		const { context, secrets, store } = makeContext({
			"openai-codex-oauth-credentials": JSON.stringify({ refresh_token: "stale" }),
			codeIndexOpenAiKey: "sk-old-cloud-key",
		})

		const proxy = new ContextProxy(context)
		await proxy.initialize()

		for (const key of RETIRED) {
			expect(secrets.delete).toHaveBeenCalledWith(key)
		}
		// The stored values are actually gone.
		expect(store.has("openai-codex-oauth-credentials")).toBe(false)
		expect(store.has("codeIndexOpenAiKey")).toBe(false)
		// And never entered the cache (retired keys are no longer read at all).
		const requestedByGet = secrets.get.mock.calls.map((c) => c[0])
		for (const key of RETIRED) {
			expect(requestedByGet).not.toContain(key)
		}
	})

	it("is idempotent across activations", async () => {
		const { context, secrets } = makeContext()

		const first = new ContextProxy(context)
		await first.initialize()
		const second = new ContextProxy(context)
		await second.initialize()

		// Two activations, two full purges, no errors on already-absent keys.
		const codexDeletes = secrets.delete.mock.calls.filter((c) => c[0] === "openai-codex-oauth-credentials")
		expect(codexDeletes).toHaveLength(2)
	})

	it("keeps the live Qdrant secret intact", async () => {
		const { context, store } = makeContext({ codeIndexQdrantApiKey: "still-needed" })

		const proxy = new ContextProxy(context)
		await proxy.initialize()

		expect(store.get("codeIndexQdrantApiKey")).toBe("still-needed")
	})

	it("rejects attempts to write a retired provider secret", async () => {
		const { context, secrets, store, globalStore } = makeContext()
		const proxy = new ContextProxy(context)
		await proxy.initialize()
		vi.clearAllMocks()

		await proxy.setValue("openRouterApiKey", "must-not-persist")

		expect(secrets.store).not.toHaveBeenCalled()
		expect(secrets.delete).toHaveBeenCalledWith("openRouterApiKey")
		expect(store.has("openRouterApiKey")).toBe(false)

		await proxy.setValue("apiProvider", "openrouter")
		expect(globalStore.get("apiProvider")).toBe("vscode-lm")
	})

	it("purges plaintext retired provider state and normalizes the provider", async () => {
		const { context, globalStore } = makeContext(
			{},
			{
				apiProvider: "openrouter",
				openAiBaseUrl: "https://legacy.example/v1",
				openAiHeaders: { Authorization: "Bearer stale" },
			},
		)

		const proxy = new ContextProxy(context)
		await proxy.initialize()

		expect(globalStore.get("apiProvider")).toBe("vscode-lm")
		expect(globalStore.has("openAiBaseUrl")).toBe(false)
		expect(globalStore.has("openAiHeaders")).toBe(false)
		expect(proxy.getProviderSettings()).toMatchObject({ apiProvider: "vscode-lm" })
		expect(proxy.getProviderSettings().openAiBaseUrl).toBeUndefined()
	})

	it("disables and resets a legacy cloud code-index configuration", async () => {
		const { context, globalStore } = makeContext(
			{},
			{
				codebaseIndexConfig: {
					codebaseIndexEnabled: true,
					codebaseIndexQdrantUrl: "http://localhost:6333",
					codebaseIndexEmbedderProvider: "openai",
					codebaseIndexEmbedderBaseUrl: "https://api.openai.com/v1",
					codebaseIndexEmbedderModelId: "text-embedding-3-small",
					codebaseIndexEmbedderModelDimension: 1536,
					codebaseIndexSearchMaxResults: 75,
				},
			},
		)

		const proxy = new ContextProxy(context)
		await proxy.initialize()

		expect(globalStore.get("codebaseIndexConfig")).toEqual({
			codebaseIndexEnabled: false,
			codebaseIndexQdrantUrl: "http://localhost:6333",
			codebaseIndexEmbedderProvider: "ollama",
			codebaseIndexEmbedderBaseUrl: "http://localhost:11434",
			codebaseIndexSearchMinScore: undefined,
			codebaseIndexSearchMaxResults: 75,
		})
	})

	it("removes the retired image experiment and its legacy state", async () => {
		const { context, globalStore } = makeContext(
			{ openRouterImageApiKey: "stale-image-key" },
			{
				imageGenerationProvider: "openrouter",
				openRouterImageGenerationSelectedModel: "legacy-model",
				openRouterImageGenerationSettings: { openRouterApiKey: "nested-key" },
				experiments: { imageGeneration: true, customTools: true },
			},
		)

		const proxy = new ContextProxy(context)
		await proxy.initialize()

		expect(globalStore.has("imageGenerationProvider")).toBe(false)
		expect(globalStore.has("openRouterImageGenerationSelectedModel")).toBe(false)
		expect(globalStore.has("openRouterImageGenerationSettings")).toBe(false)
		expect(globalStore.get("experiments")).toEqual({ customTools: true })
	})
})
