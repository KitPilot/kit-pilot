import type { ModelInfo } from "../model.js"

export type VscodeLlmModelId = keyof typeof vscodeLlmModels

export const vscodeLlmDefaultModelId: VscodeLlmModelId = "claude-3.5-sonnet"

// Substrings of model `family` / `id` strings known to accept image input via
// the VS Code Language Model API (Copilot-backed). Conservative on purpose:
// flipping `supportsImages: true` for a text-only model breaks requests instead
// of falling back to the upstream `[IMAGE]` placeholder.
//
// This is the single source of truth for vision detection: the backend
// (vscode-lm provider) uses it to build ModelInfo, and the webview uses it to
// decide whether the chat image button is enabled. Keying off the static
// `vscodeLlmModels` registry is unreliable because the `family` strings Copilot
// reports (e.g. "claude-sonnet-4") don't match the registry keys (e.g.
// "claude-4-sonnet"), so registry misses wrongly disabled the image button.
export const VISION_MODEL_ALLOWLIST = [
	"gpt-4o",
	"gpt-4.1",
	"gpt-4-turbo",
	"gpt-5",
	"claude-3.5-sonnet",
	"claude-3-5-sonnet",
	"claude-3.7-sonnet",
	"claude-3-7-sonnet",
	"claude-sonnet-4",
	"claude-opus-4",
	"claude-haiku-4-5",
	"gemini-1.5",
	"gemini-2",
	"o1",
	"o3",
	"o4",
] as const

// Explicit deny list for text-only variants that would otherwise be caught by
// the allowlist substrings above (e.g. "o3-mini" matches "o3").
export const VISION_MODEL_DENYLIST = ["o1-mini", "o3-mini", "gpt-3.5"] as const

export function modelSupportsVision(family?: string, id?: string): boolean {
	const haystack = `${family ?? ""} ${id ?? ""}`.toLowerCase()
	if (VISION_MODEL_DENYLIST.some((p) => haystack.includes(p))) {
		return false
	}
	return VISION_MODEL_ALLOWLIST.some((p) => haystack.includes(p))
}

export interface VsCodeLmModelRate {
	/** USD per 1M input tokens. */
	inputPrice: number
	/** USD per 1M output tokens. */
	outputPrice: number
	/** USD per 1M cached input tokens (~10% of input under Copilot's rates). */
	cacheReadsPrice: number
}

// Per-model token rates for GitHub Copilot's usage/credit billing, which replaced
// per-request billing on 2026-06-01 (1 AI credit = $0.01). Values are USD per 1M
// tokens, matching ModelInfo's inputPrice/outputPrice convention. Before this,
// vscode-lm reported $0 prices (correct under per-request billing), which left the
// cost display and the `allowedMaxCost` budget cap dead. These give a real cost
// ESTIMATE so both work again.
//
// Matched by substring against Copilot's reported `family`/`id` (the same robust
// approach as VISION_MODEL_ALLOWLIST, since reported family strings don't match
// the static registry keys). Ordered MOST-SPECIFIC FIRST — first match wins.
// Unknown models return undefined → no cost shown (same as before), never a wrong
// non-zero number. Rates drift; re-verify at
// https://docs.github.com/en/copilot/reference/copilot-billing/models-and-pricing
// (last checked 2026-06-18).
const VSCODE_LM_MODEL_RATES: ReadonlyArray<readonly [pattern: string, rate: VsCodeLmModelRate]> = [
	["claude-fable-5", { inputPrice: 10, outputPrice: 50, cacheReadsPrice: 1.0 }],
	["claude-opus", { inputPrice: 5, outputPrice: 25, cacheReadsPrice: 0.5 }],
	["claude-sonnet", { inputPrice: 3, outputPrice: 15, cacheReadsPrice: 0.3 }],
	["claude-haiku", { inputPrice: 1, outputPrice: 5, cacheReadsPrice: 0.1 }],
	["gpt-5.5", { inputPrice: 5, outputPrice: 30, cacheReadsPrice: 0.5 }],
	["gpt-5.4-codex", { inputPrice: 1.75, outputPrice: 14, cacheReadsPrice: 0.175 }],
	["gpt-5.4-nano", { inputPrice: 0.2, outputPrice: 1.25, cacheReadsPrice: 0.02 }],
	["gpt-5.4-mini", { inputPrice: 0.75, outputPrice: 4.5, cacheReadsPrice: 0.075 }],
	["gpt-5.4", { inputPrice: 2.5, outputPrice: 15, cacheReadsPrice: 0.25 }],
	["gpt-5-mini", { inputPrice: 0.25, outputPrice: 2, cacheReadsPrice: 0.025 }],
	["gemini-3.5-flash", { inputPrice: 1.5, outputPrice: 9, cacheReadsPrice: 0.15 }],
	["gemini-3.1-pro", { inputPrice: 2, outputPrice: 12, cacheReadsPrice: 0.2 }],
	["gemini-3-flash", { inputPrice: 0.5, outputPrice: 3, cacheReadsPrice: 0.05 }],
	["gemini-2.5-pro", { inputPrice: 1.25, outputPrice: 10, cacheReadsPrice: 0.125 }],
	["raptor", { inputPrice: 0.25, outputPrice: 2, cacheReadsPrice: 0.025 }],
	["mai-code", { inputPrice: 0.75, outputPrice: 4.5, cacheReadsPrice: 0.075 }],
] as const

/**
 * Best-effort USD-per-1M-token rates for a Copilot model, matched by substring
 * against its reported `family`/`id`. Returns undefined for unrecognized models
 * (caller should treat that as "cost unknown", i.e. 0, not an error).
 */
export function getVsCodeLmModelRates(family?: string, id?: string): VsCodeLmModelRate | undefined {
	const haystack = `${family ?? ""} ${id ?? ""}`.toLowerCase()
	for (const [pattern, rate] of VSCODE_LM_MODEL_RATES) {
		if (haystack.includes(pattern)) {
			return rate
		}
	}
	return undefined
}

// https://docs.cline.bot/provider-config/vscode-language-model-api
export const vscodeLlmModels = {
	"gpt-3.5-turbo": {
		contextWindow: 12114,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0,
		outputPrice: 0,
		family: "gpt-3.5-turbo",
		version: "gpt-3.5-turbo-0613",
		name: "GPT 3.5 Turbo",
		supportsToolCalling: true,
		maxInputTokens: 12114,
	},
	"gpt-4o-mini": {
		contextWindow: 12115,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 0,
		outputPrice: 0,
		family: "gpt-4o-mini",
		version: "gpt-4o-mini-2024-07-18",
		name: "GPT-4o mini",
		supportsToolCalling: true,
		maxInputTokens: 12115,
	},
	"gpt-4": {
		contextWindow: 28501,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0,
		outputPrice: 0,
		family: "gpt-4",
		version: "gpt-4-0613",
		name: "GPT 4",
		supportsToolCalling: true,
		maxInputTokens: 28501,
	},
	"gpt-4-0125-preview": {
		contextWindow: 63826,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0,
		outputPrice: 0,
		family: "gpt-4-turbo",
		version: "gpt-4-0125-preview",
		name: "GPT 4 Turbo",
		supportsToolCalling: true,
		maxInputTokens: 63826,
	},
	"gpt-4o": {
		contextWindow: 63827,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 0,
		outputPrice: 0,
		family: "gpt-4o",
		version: "gpt-4o-2024-11-20",
		name: "GPT-4o",
		supportsToolCalling: true,
		maxInputTokens: 63827,
	},
	o1: {
		contextWindow: 19827,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 0,
		outputPrice: 0,
		family: "o1-ga",
		version: "o1-2024-12-17",
		name: "o1 (Preview)",
		supportsToolCalling: true,
		maxInputTokens: 19827,
	},
	"o3-mini": {
		contextWindow: 63827,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0,
		outputPrice: 0,
		family: "o3-mini",
		version: "o3-mini-2025-01-31",
		name: "o3-mini",
		supportsToolCalling: true,
		maxInputTokens: 63827,
	},
	"claude-3.5-sonnet": {
		contextWindow: 81638,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 0,
		outputPrice: 0,
		family: "claude-3.5-sonnet",
		version: "claude-3.5-sonnet",
		name: "Claude 3.5 Sonnet",
		supportsToolCalling: true,
		maxInputTokens: 81638,
	},
	"claude-4-sonnet": {
		contextWindow: 128000,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 0,
		outputPrice: 0,
		family: "claude-sonnet-4",
		version: "claude-sonnet-4",
		name: "Claude Sonnet 4",
		supportsToolCalling: true,
		maxInputTokens: 111836,
	},
	"gemini-2.0-flash-001": {
		contextWindow: 127827,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 0,
		outputPrice: 0,
		family: "gemini-2.0-flash",
		version: "gemini-2.0-flash-001",
		name: "Gemini 2.0 Flash",
		supportsToolCalling: false,
		maxInputTokens: 127827,
	},
	"gemini-2.5-pro": {
		contextWindow: 128000,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 0,
		outputPrice: 0,
		family: "gemini-2.5-pro",
		version: "gemini-2.5-pro-preview-03-25",
		name: "Gemini 2.5 Pro (Preview)",
		supportsToolCalling: true,
		maxInputTokens: 108637,
	},
	"o4-mini": {
		contextWindow: 128000,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 0,
		outputPrice: 0,
		family: "o4-mini",
		version: "o4-mini-2025-04-16",
		name: "o4-mini (Preview)",
		supportsToolCalling: true,
		maxInputTokens: 111452,
	},
	"gpt-4.1": {
		contextWindow: 128000,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 0,
		outputPrice: 0,
		family: "gpt-4.1",
		version: "gpt-4.1-2025-04-14",
		name: "GPT-4.1 (Preview)",
		supportsToolCalling: true,
		maxInputTokens: 111452,
	},
	"gpt-5-mini": {
		contextWindow: 128000,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 0,
		outputPrice: 0,
		family: "gpt-5-mini",
		version: "gpt-5-mini",
		name: "GPT-5 mini (Preview)",
		supportsToolCalling: true,
		maxInputTokens: 108637,
	},
	"gpt-5": {
		contextWindow: 128000,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 0,
		outputPrice: 0,
		family: "gpt-5",
		version: "gpt-5",
		name: "GPT-5 (Preview)",
		supportsToolCalling: true,
		maxInputTokens: 108637,
	},
} as const satisfies Record<
	string,
	ModelInfo & {
		family: string
		version: string
		name: string
		supportsToolCalling: boolean
		maxInputTokens: number
	}
>
