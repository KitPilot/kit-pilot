// npx vitest run core/webview/__tests__/codeIndexSettingsNormalization.spec.ts

vi.mock("vscode", () => ({
	workspace: { getConfiguration: vi.fn(() => ({ get: vi.fn() })), workspaceFolders: [] },
	window: { showErrorMessage: vi.fn(), showInformationMessage: vi.fn() },
	env: { openExternal: vi.fn() },
	Uri: { parse: vi.fn(), file: vi.fn() },
	commands: { executeCommand: vi.fn() },
}))

import { webviewMessageHandler } from "../webviewMessageHandler"
import type { ClineProvider } from "../ClineProvider"

/**
 * Backend contract (reviewer-required): the embedder provider is pinned to
 * "ollama" SERVER-SIDE at save. UI restriction alone is not a boundary —
 * imported settings or hand-crafted messages could carry retired cloud
 * providers; the persisted config must never regress.
 */
describe("saveCodeIndexSettingsAtomic provider normalization", () => {
	const makeProvider = () => {
		const globalState: Record<string, unknown> = {
			codebaseIndexConfig: {
				codebaseIndexEnabled: false,
				codebaseIndexEmbedderProvider: "openai", // legacy persisted value
			},
		}
		const storeSecret = vi.fn().mockResolvedValue(undefined)
		const updateGlobalState = vi.fn(async (key: string, value: unknown) => {
			globalState[key] = value
		})
		return {
			provider: {
				contextProxy: {
					getValue: vi.fn((key: string) => globalState[key]),
					setValue: updateGlobalState,
					storeSecret,
				},
				getCurrentWorkspaceCodeIndexManager: vi.fn().mockReturnValue(undefined),
				postMessageToWebview: vi.fn().mockResolvedValue(undefined),
				postStateToWebview: vi.fn().mockResolvedValue(undefined),
				log: vi.fn(),
			} as unknown as ClineProvider,
			globalState,
			storeSecret,
		}
	}

	it("pins the provider to ollama even when the message carries a cloud provider", async () => {
		const { provider, globalState } = makeProvider()

		await webviewMessageHandler(provider, {
			type: "saveCodeIndexSettingsAtomic",
			codeIndexSettings: {
				codebaseIndexEnabled: true,
				codebaseIndexQdrantUrl: "http://localhost:6333",
				// A hand-crafted/imported message could still say a cloud provider:
				codebaseIndexEmbedderProvider: "openai" as never,
				codebaseIndexEmbedderBaseUrl: "http://localhost:11434",
				codebaseIndexEmbedderModelId: "nomic-embed-text",
			},
		} as never)

		const saved = globalState["codebaseIndexConfig"] as { codebaseIndexEmbedderProvider: string }
		expect(saved.codebaseIndexEmbedderProvider).toBe("ollama")
	})

	it("stores only the Qdrant secret", async () => {
		const { provider, storeSecret } = makeProvider()

		await webviewMessageHandler(provider, {
			type: "saveCodeIndexSettingsAtomic",
			codeIndexSettings: {
				codebaseIndexEnabled: true,
				codebaseIndexQdrantUrl: "http://localhost:6333",
				codebaseIndexEmbedderProvider: "ollama",
				codebaseIndexEmbedderModelId: "nomic-embed-text",
				codeIndexQdrantApiKey: "qdrant-key",
				// Retired cloud secrets in a stale message must be ignored:
				codeIndexOpenAiKey: "sk-should-be-ignored",
			},
		} as never)

		const storedKeys = storeSecret.mock.calls.map((c: unknown[]) => c[0])
		expect(storedKeys).toEqual(["codeIndexQdrantApiKey"])
	})
})
