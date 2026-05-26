// npx vitest src/components/ui/hooks/__tests__/useSelectedModel.spec.ts

import React from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook } from "@testing-library/react"
import type { Mock } from "vitest"

import { ProviderSettings, vscodeLlmDefaultModelId, vscodeLlmModels } from "@kit-pilot/types"

import { useSelectedModel } from "../useSelectedModel"
import { useRouterModels } from "../useRouterModels"
import { useOpenRouterModelProviders } from "../useOpenRouterModelProviders"

vi.mock("../useRouterModels")
vi.mock("../useOpenRouterModelProviders")

const mockUseRouterModels = useRouterModels as Mock<typeof useRouterModels>
const mockUseOpenRouterModelProviders = useOpenRouterModelProviders as Mock<typeof useOpenRouterModelProviders>

const createWrapper = () => {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				retry: false,
			},
		},
	})
	return ({ children }: { children: React.ReactNode }) =>
		React.createElement(QueryClientProvider, { client: queryClient }, children)
}

// This is a vscode-lm-only build: vscode-lm is the only active provider and
// every other provider name is "retired". The hook resolves retired providers
// to the vscode-lm default with no model info.
describe("useSelectedModel", () => {
	beforeEach(() => {
		// The hook always instantiates these query hooks even though vscode-lm
		// doesn't depend on them; return inert data so nothing tries to fetch.
		mockUseRouterModels.mockReturnValue({
			data: undefined,
			isLoading: false,
			isError: false,
		} as any)

		mockUseOpenRouterModelProviders.mockReturnValue({
			data: undefined,
			isLoading: false,
			isError: false,
		} as any)
	})

	describe("default behavior", () => {
		it("should return the vscode-lm default when no configuration is provided", () => {
			const wrapper = createWrapper()
			const { result } = renderHook(() => useSelectedModel(), { wrapper })

			expect(result.current.provider).toBe("vscode-lm")
			expect(result.current.id).toBe(vscodeLlmDefaultModelId)
			// Model info is only resolved once apiConfiguration arrives.
			expect(result.current.info).toBeUndefined()
			expect(result.current.isLoading).toBe(false)
			expect(result.current.isError).toBe(false)
		})

		it("should use the default model family when vscode-lm has no selector", () => {
			const apiConfiguration: ProviderSettings = {
				apiProvider: "vscode-lm",
			}

			const wrapper = createWrapper()
			const { result } = renderHook(() => useSelectedModel(apiConfiguration), { wrapper })

			expect(result.current.provider).toBe("vscode-lm")
			expect(result.current.id).toBe(vscodeLlmDefaultModelId)
			// claude-3.5-sonnet is a vision model.
			expect(result.current.info?.supportsImages).toBe(true)
		})
	})

	describe("vscode-lm provider", () => {
		it("should build the model id from the vendor/family selector", () => {
			const apiConfiguration: ProviderSettings = {
				apiProvider: "vscode-lm",
				vsCodeLmModelSelector: { vendor: "copilot", family: "gpt-4o" },
			}

			const wrapper = createWrapper()
			const { result } = renderHook(() => useSelectedModel(apiConfiguration), { wrapper })

			expect(result.current.id).toBe("copilot/gpt-4o")
		})

		it("should let registry model info flow through for a matching family", () => {
			const apiConfiguration: ProviderSettings = {
				apiProvider: "vscode-lm",
				vsCodeLmModelSelector: { vendor: "copilot", family: "gpt-4o" },
			}

			const wrapper = createWrapper()
			const { result } = renderHook(() => useSelectedModel(apiConfiguration), { wrapper })

			expect(result.current.info?.contextWindow).toBe(vscodeLlmModels["gpt-4o"].contextWindow)
			expect(result.current.info?.supportsImages).toBe(true)
		})

		// Regression test: Copilot reports vision-capable families (e.g.
		// "claude-sonnet-4") whose names don't match the static registry keys
		// (e.g. "claude-4-sonnet"). A registry miss used to fall back to defaults
		// with supportsImages: false, which wrongly disabled the chat image
		// button (shown as a red "not-allowed" cursor on hover).
		it("should report supportsImages for a vision family that is not a registry key", () => {
			const apiConfiguration: ProviderSettings = {
				apiProvider: "vscode-lm",
				vsCodeLmModelSelector: { vendor: "copilot", family: "claude-sonnet-4" },
			}

			const wrapper = createWrapper()
			const { result } = renderHook(() => useSelectedModel(apiConfiguration), { wrapper })

			expect(result.current.id).toBe("copilot/claude-sonnet-4")
			expect(result.current.info?.supportsImages).toBe(true)
		})

		it("should report supportsImages for other vision families missing from the registry", () => {
			const visionFamilies = ["claude-3.7-sonnet", "claude-opus-4", "gemini-2.0-flash"]

			for (const family of visionFamilies) {
				const apiConfiguration: ProviderSettings = {
					apiProvider: "vscode-lm",
					vsCodeLmModelSelector: { vendor: "copilot", family },
				}

				const wrapper = createWrapper()
				const { result } = renderHook(() => useSelectedModel(apiConfiguration), { wrapper })

				expect(result.current.info?.supportsImages).toBe(true)
			}
		})

		it("should not report supportsImages for text-only families", () => {
			const textOnlyFamilies = ["gpt-3.5-turbo", "o3-mini", "o1-mini"]

			for (const family of textOnlyFamilies) {
				const apiConfiguration: ProviderSettings = {
					apiProvider: "vscode-lm",
					vsCodeLmModelSelector: { vendor: "copilot", family },
				}

				const wrapper = createWrapper()
				const { result } = renderHook(() => useSelectedModel(apiConfiguration), { wrapper })

				expect(result.current.info?.supportsImages).toBe(false)
			}
		})
	})

	describe("retired providers", () => {
		it.each(["anthropic", "openrouter", "bedrock", "litellm", "openai", "minimax"] as const)(
			"should fall back to the vscode-lm default for retired provider %s",
			(apiProvider) => {
				const apiConfiguration = { apiProvider } as unknown as ProviderSettings

				const wrapper = createWrapper()
				const { result } = renderHook(() => useSelectedModel(apiConfiguration), { wrapper })

				expect(result.current.id).toBe(vscodeLlmDefaultModelId)
				expect(result.current.info).toBeUndefined()
			},
		)
	})
})
