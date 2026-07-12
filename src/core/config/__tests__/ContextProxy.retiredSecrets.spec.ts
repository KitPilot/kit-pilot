// npx vitest run core/config/__tests__/ContextProxy.retiredSecrets.spec.ts

import type * as vscode from "vscode"

vi.mock("vscode", () => ({
	Uri: { file: (p: string) => ({ fsPath: p }) },
	ExtensionMode: { Production: 1, Development: 2, Test: 3 },
}))

import { ContextProxy } from "../ContextProxy"

const RETIRED = [
	"codeIndexOpenAiKey",
	"codebaseIndexOpenAiCompatibleApiKey",
	"codebaseIndexGeminiApiKey",
	"codebaseIndexMistralApiKey",
	"codebaseIndexVercelAiGatewayApiKey",
	"codebaseIndexOpenRouterApiKey",
	"openai-codex-oauth-credentials",
]

const makeContext = (stored: Record<string, string> = {}) => {
	const store = new Map(Object.entries(stored))
	const secrets = {
		get: vi.fn(async (key: string) => store.get(key)),
		store: vi.fn(async (key: string, value: string) => void store.set(key, value)),
		delete: vi.fn(async (key: string) => void store.delete(key)),
	}
	return {
		context: {
			globalState: { get: vi.fn(), update: vi.fn() },
			secrets,
			extensionUri: { fsPath: "/ext" },
			extensionMode: 3,
			globalStorageUri: { fsPath: "/storage" },
		} as unknown as vscode.ExtensionContext,
		secrets,
		store,
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
})
