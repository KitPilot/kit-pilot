import type { ClineMessage } from "@kit-pilot/types"

import { getBudgetWindowMetrics } from "../budgetWindow"

const apiReq = (ts: number, cost: number): ClineMessage =>
	({
		type: "say",
		say: "api_req_started",
		ts,
		text: JSON.stringify({ request: "x", tokensIn: 100, tokensOut: 10, cost }),
	}) as ClineMessage

const maxReachedAsk = (ts: number, type: "cost" | "requests"): ClineMessage =>
	({
		type: "ask",
		ask: "auto_approval_max_req_reached",
		ts,
		text: JSON.stringify({ count: "1.00", type }),
	}) as ClineMessage

const say = (ts: number): ClineMessage => ({ type: "say", say: "text", ts, text: "hi" }) as ClineMessage

describe("getBudgetWindowMetrics", () => {
	it("uses whole-task cost when no limit ask exists", () => {
		const { metrics, windowStartTs } = getBudgetWindowMetrics([apiReq(1, 0.5), apiReq(2, 0.25)])
		expect(metrics.totalCost).toBeCloseTo(0.75, 10)
		expect(windowStartTs).toBe(1)
	})

	it("counts only cost after an answered cost-limit ask", () => {
		const messages = [apiReq(1, 0.9), maxReachedAsk(2, "cost"), apiReq(3, 0.1), apiReq(4, 0.2)]
		const { metrics, windowStartTs } = getBudgetWindowMetrics(messages)
		expect(metrics.totalCost).toBeCloseTo(0.3, 10)
		expect(windowStartTs).toBe(3)
	})

	it("also resets on an answered requests-limit ask (shared reset index)", () => {
		const messages = [apiReq(1, 0.9), maxReachedAsk(2, "requests"), apiReq(3, 0.1)]
		expect(getBudgetWindowMetrics(messages).metrics.totalCost).toBeCloseTo(0.1, 10)
	})

	it("does not reset on a still-pending ask (last message)", () => {
		const messages = [apiReq(1, 0.9), apiReq(2, 0.3), maxReachedAsk(3, "cost")]
		const { metrics, windowStartTs } = getBudgetWindowMetrics(messages)
		expect(metrics.totalCost).toBeCloseTo(1.2, 10)
		expect(windowStartTs).toBe(1)
	})

	it("uses the LAST answered ask when several exist", () => {
		const messages = [
			apiReq(1, 0.9),
			maxReachedAsk(2, "cost"),
			apiReq(3, 0.8),
			maxReachedAsk(4, "cost"),
			apiReq(5, 0.05),
		]
		expect(getBudgetWindowMetrics(messages).metrics.totalCost).toBeCloseTo(0.05, 10)
	})

	it("returns zero cost for an empty window", () => {
		const messages = [apiReq(1, 0.9), say(2), maxReachedAsk(3, "cost"), say(4)]
		const { metrics } = getBudgetWindowMetrics(messages)
		expect(metrics.totalCost).toBe(0)
	})

	it("includes condense_context costs in the window", () => {
		const condense = {
			type: "say",
			say: "condense_context",
			ts: 3,
			contextCondense: { cost: 0.07, prevContextTokens: 10, newContextTokens: 5, summary: "s" },
		} as unknown as ClineMessage
		const messages = [maxReachedAsk(1, "cost"), apiReq(2, 0.1), condense]
		expect(getBudgetWindowMetrics(messages).metrics.totalCost).toBeCloseTo(0.17, 10)
	})
})
