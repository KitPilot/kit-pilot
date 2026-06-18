// npx vitest api/providers/__tests__/vscode-lm-usage.spec.ts

import { parseVsCodeLmUsage } from "../vscode-lm-usage"

describe("parseVsCodeLmUsage", () => {
	it("extracts token counts from the OpenAI-shaped Copilot payload", () => {
		const decoded = {
			prompt_tokens: 1234,
			completion_tokens: 567,
			total_tokens: 1801,
			prompt_tokens_details: {
				cached_tokens: 1000,
				cache_creation_input_tokens: 200,
			},
		}

		expect(parseVsCodeLmUsage(decoded)).toEqual({
			inputTokens: 1234,
			outputTokens: 567,
			cacheReadTokens: 1000,
			cacheWriteTokens: 200,
		})
	})

	it("parses the real payload captured from a live Copilot stream (no total_nano_aiu)", () => {
		// Verbatim from a live `mimeType: "usage"` data part (2026-06-18).
		const decoded = {
			completion_tokens: 14,
			prompt_tokens: 8621,
			total_tokens: 8635,
			prompt_tokens_details: { cached_tokens: 7777 },
		}

		expect(parseVsCodeLmUsage(decoded)).toEqual({
			inputTokens: 8621,
			outputTokens: 14,
			cacheReadTokens: 7777,
			// no cacheWriteTokens (cache_creation_input_tokens absent), no totalCost
			// (total_nano_aiu absent) — cost falls back to tokens × rate table.
		})
	})

	it("derives exact cost from total_nano_aiu (1 AIU = $0.01)", () => {
		// 4.5e11 nano-AIU → 450 AIU → $4.50
		const usage = parseVsCodeLmUsage({ prompt_tokens: 10, completion_tokens: 5, total_nano_aiu: 450_000_000_000 })
		expect(usage?.totalCost).toBeCloseTo(4.5, 10)
	})

	it("matches the documented per-1M-input rate for Sonnet ($3)", () => {
		// 1M input tokens at $3/M = 300 credits = 3e11 nano-AIU.
		const usage = parseVsCodeLmUsage({
			prompt_tokens: 1_000_000,
			completion_tokens: 0,
			total_nano_aiu: 300_000_000_000,
		})
		expect(usage?.totalCost).toBeCloseTo(3.0, 10)
	})

	it("tolerates counts nested under a `usage` key and alternate field names", () => {
		expect(parseVsCodeLmUsage({ usage: { input_tokens: 42, output_tokens: 7 } })).toMatchObject({
			inputTokens: 42,
			outputTokens: 7,
		})
	})

	it("omits cost and cache fields when absent", () => {
		expect(parseVsCodeLmUsage({ prompt_tokens: 100, completion_tokens: 20 })).toEqual({
			inputTokens: 100,
			outputTokens: 20,
		})
	})

	it("returns undefined when no token counts are present (so caller falls back to estimate)", () => {
		expect(parseVsCodeLmUsage({ some_other_field: 1 })).toBeUndefined()
		expect(parseVsCodeLmUsage({})).toBeUndefined()
		expect(parseVsCodeLmUsage(null)).toBeUndefined()
		expect(parseVsCodeLmUsage("not an object")).toBeUndefined()
	})

	it("ignores non-finite numbers", () => {
		expect(parseVsCodeLmUsage({ prompt_tokens: NaN, completion_tokens: 5 })).toEqual({
			inputTokens: 0,
			outputTokens: 5,
		})
	})
})
