// npx vitest run services/code-index/__tests__/config-manager.spec.ts

import { CodeIndexConfigManager } from "../config-manager"
import type { ContextProxy } from "../../../core/config/ContextProxy"
import type { PreviousConfigSnapshot } from "../interfaces/config"

/**
 * vscode-lm-only build: Ollama is the only supported embedder. These tests
 * cover the Ollama+Qdrant surface plus the legacy-coercion contract (persisted
 * cloud-provider state from older builds must load and coerce to Ollama, and
 * retired cloud secrets must never be read).
 */

const makeContextProxy = (
	globalState: Record<string, unknown> = {},
	secrets: Record<string, string> = {},
): ContextProxy => {
	const getSecret = vi.fn((key: string) => secrets[key])
	return {
		getGlobalState: vi.fn((key: string) => globalState[key]),
		getSecret,
		refreshSecrets: vi.fn().mockResolvedValue(undefined),
	} as unknown as ContextProxy
}

describe("CodeIndexConfigManager (Ollama-only)", () => {
	it("initializes with safe defaults when no state exists", () => {
		const manager = new CodeIndexConfigManager(makeContextProxy())

		expect(manager.currentEmbedderProvider).toBe("ollama")
		expect(manager.isFeatureEnabled).toBe(false)
		expect(manager.isFeatureConfigured).toBe(false)
	})

	it("loads an Ollama configuration from global state + qdrant secret", async () => {
		const proxy = makeContextProxy(
			{
				codebaseIndexConfig: {
					codebaseIndexEnabled: true,
					codebaseIndexQdrantUrl: "http://localhost:6333",
					codebaseIndexEmbedderProvider: "ollama",
					codebaseIndexEmbedderBaseUrl: "http://localhost:11434",
					codebaseIndexEmbedderModelId: "nomic-embed-text",
				},
			},
			{ codeIndexQdrantApiKey: "qdrant-secret" },
		)
		const manager = new CodeIndexConfigManager(proxy)
		const { currentConfig } = await manager.loadConfiguration()

		expect(currentConfig.embedderProvider).toBe("ollama")
		expect(currentConfig.ollamaOptions?.ollamaBaseUrl).toBe("http://localhost:11434")
		expect(currentConfig.qdrantApiKey).toBe("qdrant-secret")
		expect(currentConfig.isConfigured).toBe(true)
		expect(manager.currentModelId).toBe("nomic-embed-text")
	})

	describe("legacy cloud-provider coercion", () => {
		it.each(["openai", "gemini", "mistral", "bedrock", "openrouter", "vercel-ai-gateway", "openai-compatible"])(
			"coerces persisted %s provider to ollama",
			(legacyProvider) => {
				const proxy = makeContextProxy({
					codebaseIndexConfig: {
						codebaseIndexEnabled: true,
						codebaseIndexQdrantUrl: "http://localhost:6333",
						codebaseIndexEmbedderProvider: legacyProvider,
						codebaseIndexEmbedderModelId: "text-embedding-3-small",
					},
				})
				const manager = new CodeIndexConfigManager(proxy)
				expect(manager.currentEmbedderProvider).toBe("ollama")
			},
		)

		it("never reads retired cloud embedder secrets", () => {
			const proxy = makeContextProxy({
				codebaseIndexConfig: {
					codebaseIndexEnabled: true,
					codebaseIndexEmbedderProvider: "openai",
				},
			})
			new CodeIndexConfigManager(proxy)

			const requestedKeys = (proxy.getSecret as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])
			expect(requestedKeys).toEqual(["codeIndexQdrantApiKey"])
		})

		it("a legacy cloud snapshot triggers a restart (provider changed to ollama)", () => {
			const proxy = makeContextProxy({
				codebaseIndexConfig: {
					codebaseIndexEnabled: true,
					codebaseIndexQdrantUrl: "http://localhost:6333",
					codebaseIndexEmbedderBaseUrl: "http://localhost:11434",
				},
			})
			const manager = new CodeIndexConfigManager(proxy)
			const legacySnapshot: PreviousConfigSnapshot = {
				enabled: true,
				configured: true,
				embedderProvider: "openai",
				modelId: "text-embedding-3-small",
				qdrantUrl: "http://localhost:6333",
				ollamaBaseUrl: "",
			}
			expect(manager.doesConfigChangeRequireRestart(legacySnapshot)).toBe(true)
		})
	})

	describe("isConfigured", () => {
		it("requires an Ollama base URL", () => {
			const proxy = makeContextProxy({
				codebaseIndexConfig: {
					codebaseIndexEnabled: true,
					codebaseIndexQdrantUrl: "http://localhost:6333",
					codebaseIndexEmbedderBaseUrl: "",
				},
			})
			expect(new CodeIndexConfigManager(proxy).isConfigured()).toBe(false)
		})

		it("requires a Qdrant URL", () => {
			const proxy = makeContextProxy({
				codebaseIndexConfig: {
					codebaseIndexEnabled: true,
					codebaseIndexQdrantUrl: "",
					codebaseIndexEmbedderBaseUrl: "http://localhost:11434",
				},
			})
			expect(new CodeIndexConfigManager(proxy).isConfigured()).toBe(false)
		})

		it("is satisfied by Ollama base URL + Qdrant URL", () => {
			const proxy = makeContextProxy({
				codebaseIndexConfig: {
					codebaseIndexEnabled: true,
					codebaseIndexQdrantUrl: "http://localhost:6333",
					codebaseIndexEmbedderBaseUrl: "http://localhost:11434",
				},
			})
			expect(new CodeIndexConfigManager(proxy).isConfigured()).toBe(true)
		})
	})

	describe("doesConfigChangeRequireRestart", () => {
		const configuredState = {
			codebaseIndexConfig: {
				codebaseIndexEnabled: true,
				codebaseIndexQdrantUrl: "http://localhost:6333",
				codebaseIndexEmbedderProvider: "ollama",
				codebaseIndexEmbedderBaseUrl: "http://localhost:11434",
				codebaseIndexEmbedderModelId: "nomic-embed-text",
			},
		}

		const snapshotOf = (over: Partial<PreviousConfigSnapshot> = {}): PreviousConfigSnapshot => ({
			enabled: true,
			configured: true,
			embedderProvider: "ollama",
			modelId: "nomic-embed-text",
			ollamaBaseUrl: "http://localhost:11434",
			qdrantUrl: "http://localhost:6333",
			qdrantApiKey: "",
			...over,
		})

		it("restarts when transitioning from disabled to enabled+configured", () => {
			const manager = new CodeIndexConfigManager(makeContextProxy(configuredState))
			expect(manager.doesConfigChangeRequireRestart(snapshotOf({ enabled: false, configured: false }))).toBe(true)
		})

		it("restarts when the feature is disabled", () => {
			const disabled = structuredClone(configuredState)
			disabled.codebaseIndexConfig.codebaseIndexEnabled = false
			const manager = new CodeIndexConfigManager(makeContextProxy(disabled))
			expect(manager.doesConfigChangeRequireRestart(snapshotOf())).toBe(true)
		})

		it("restarts when the Ollama base URL changes", () => {
			const manager = new CodeIndexConfigManager(makeContextProxy(configuredState))
			expect(
				manager.doesConfigChangeRequireRestart(snapshotOf({ ollamaBaseUrl: "http://other-host:11434" })),
			).toBe(true)
		})

		it("restarts when Qdrant connection details change", () => {
			const manager = new CodeIndexConfigManager(makeContextProxy(configuredState))
			expect(manager.doesConfigChangeRequireRestart(snapshotOf({ qdrantUrl: "http://other:6333" }))).toBe(true)
			expect(manager.doesConfigChangeRequireRestart(snapshotOf({ qdrantApiKey: "changed" }))).toBe(true)
		})

		it("does not restart for unrelated changes", () => {
			const manager = new CodeIndexConfigManager(makeContextProxy(configuredState))
			expect(manager.doesConfigChangeRequireRestart(snapshotOf())).toBe(false)
		})

		it("does not restart when it wasn't ready and still isn't", () => {
			const manager = new CodeIndexConfigManager(makeContextProxy())
			expect(manager.doesConfigChangeRequireRestart(snapshotOf({ enabled: false, configured: false }))).toBe(
				false,
			)
		})
	})

	describe("model dimension", () => {
		it("uses a valid custom dimension when the model has no built-in one", () => {
			const proxy = makeContextProxy({
				codebaseIndexConfig: {
					codebaseIndexEnabled: true,
					codebaseIndexQdrantUrl: "http://localhost:6333",
					codebaseIndexEmbedderBaseUrl: "http://localhost:11434",
					codebaseIndexEmbedderModelId: "my-custom-model",
					codebaseIndexEmbedderModelDimension: 1024,
				},
			})
			expect(new CodeIndexConfigManager(proxy).currentModelDimension).toBe(1024)
		})

		it("ignores an invalid dimension value", () => {
			const proxy = makeContextProxy({
				codebaseIndexConfig: {
					codebaseIndexEnabled: true,
					codebaseIndexEmbedderModelDimension: -5,
				},
			})
			const manager = new CodeIndexConfigManager(proxy)
			expect(manager.getConfig().modelDimension).toBeUndefined()
		})
	})

	describe("search tuning", () => {
		it("prefers the user-configured min score", () => {
			const proxy = makeContextProxy({
				codebaseIndexConfig: {
					codebaseIndexEnabled: true,
					codebaseIndexSearchMinScore: 0.77,
				},
			})
			expect(new CodeIndexConfigManager(proxy).currentSearchMinScore).toBe(0.77)
		})

		it("falls back to defaults for max results", () => {
			const manager = new CodeIndexConfigManager(makeContextProxy())
			expect(manager.currentSearchMaxResults).toBeGreaterThan(0)
		})
	})
})
