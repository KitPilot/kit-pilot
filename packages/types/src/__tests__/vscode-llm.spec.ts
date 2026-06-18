import { describe, it, expect } from "vitest"

import { getVsCodeLmModelRates } from "../providers/vscode-llm.js"

describe("getVsCodeLmModelRates", () => {
	it("returns rates for known Anthropic families", () => {
		expect(getVsCodeLmModelRates("claude-opus-4")).toEqual({ inputPrice: 5, outputPrice: 25, cacheReadsPrice: 0.5 })
		expect(getVsCodeLmModelRates("claude-sonnet-4")).toEqual({
			inputPrice: 3,
			outputPrice: 15,
			cacheReadsPrice: 0.3,
		})
		expect(getVsCodeLmModelRates("claude-haiku-4.5")).toEqual({
			inputPrice: 1,
			outputPrice: 5,
			cacheReadsPrice: 0.1,
		})
		expect(getVsCodeLmModelRates("claude-fable-5")).toEqual({
			inputPrice: 10,
			outputPrice: 50,
			cacheReadsPrice: 1.0,
		})
	})

	it("matches the most-specific GPT variant first (ordering matters)", () => {
		// nano/mini/codex must win over the bare gpt-5.4 entry that follows them.
		expect(getVsCodeLmModelRates("gpt-5.4-nano")?.inputPrice).toBe(0.2)
		expect(getVsCodeLmModelRates("gpt-5.4-mini")?.inputPrice).toBe(0.75)
		expect(getVsCodeLmModelRates("gpt-5.4-codex")?.inputPrice).toBe(1.75)
		expect(getVsCodeLmModelRates("gpt-5.4")?.inputPrice).toBe(2.5)
		// gpt-5.5 must not be caught by a gpt-5.4 substring.
		expect(getVsCodeLmModelRates("gpt-5.5")?.outputPrice).toBe(30)
	})

	it("matches on either family or id, case-insensitively", () => {
		expect(getVsCodeLmModelRates(undefined, "Claude-Opus-4")?.inputPrice).toBe(5)
		expect(getVsCodeLmModelRates("GEMINI-3-FLASH")?.outputPrice).toBe(3)
	})

	it("returns undefined for unrecognized models (caller treats as cost-unknown)", () => {
		expect(getVsCodeLmModelRates("some-future-model")).toBeUndefined()
		expect(getVsCodeLmModelRates(undefined, undefined)).toBeUndefined()
		expect(getVsCodeLmModelRates("")).toBeUndefined()
	})

	it("keeps cached-read rates at roughly 10% of input", () => {
		for (const family of ["claude-opus-4", "claude-sonnet-4", "gpt-5.5", "gemini-2.5-pro"]) {
			const rate = getVsCodeLmModelRates(family)!
			expect(rate.cacheReadsPrice).toBeCloseTo(rate.inputPrice * 0.1, 5)
		}
	})
})
