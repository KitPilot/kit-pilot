// npx vitest api/__tests__/usageMetrics.spec.ts

import { recordUsage, getUsageBreakdown, resetUsageMetrics } from "../usageMetrics"

describe("usageMetrics", () => {
	beforeEach(() => resetUsageMetrics())

	it("accumulates per-purpose totals across calls", () => {
		recordUsage("main", { inputTokens: 100, outputTokens: 10 })
		recordUsage("main", { inputTokens: 200, outputTokens: 20, cacheReadTokens: 50 })
		recordUsage("condense", { inputTokens: 300, outputTokens: 5 })

		const b = getUsageBreakdown()
		expect(b.main).toMatchObject({ calls: 2, inputTokens: 300, outputTokens: 30, cacheReadTokens: 50 })
		expect(b.condense).toMatchObject({ calls: 1, inputTokens: 300, outputTokens: 5 })
	})

	it("computes each purpose's share of total tokens (input+output)", () => {
		// main: 330 tok, condense: 305 tok, total 635
		recordUsage("main", { inputTokens: 300, outputTokens: 30 })
		recordUsage("condense", { inputTokens: 300, outputTokens: 5 })

		const b = getUsageBreakdown()
		expect(b.main.tokenSharePct).toBeCloseTo(52.0, 0)
		expect(b.condense.tokenSharePct).toBeCloseTo(48.0, 0)
		expect(b.main.tokenSharePct + b.condense.tokenSharePct).toBeCloseTo(100, 0)
	})

	it("accumulates reported cost when present", () => {
		recordUsage("main", { inputTokens: 10, outputTokens: 1, totalCost: 0.5 })
		recordUsage("main", { inputTokens: 10, outputTokens: 1, totalCost: 0.25 })
		expect(getUsageBreakdown().main.cost).toBeCloseTo(0.75, 10)
	})

	it("reset clears all totals", () => {
		recordUsage("main", { inputTokens: 10, outputTokens: 1 })
		resetUsageMetrics()
		expect(getUsageBreakdown()).toEqual({})
	})
})
