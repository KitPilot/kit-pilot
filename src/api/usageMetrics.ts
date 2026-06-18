/**
 * Lightweight, in-memory instrumentation to measure the **auxiliary-vs-main
 * token share** — the decision gate for TODO #3 (auxiliary-call model routing).
 *
 * Every LLM call tags itself with a `UsagePurpose` (via
 * ApiHandlerCreateMessageMetadata.purpose; defaults to "main"). When a call
 * reports usage we accumulate per-purpose totals and log a running breakdown,
 * so over real usage we can see what fraction of tokens (≈ cost, since today
 * everything runs on one model) goes to condense / enhance / etc. rather than
 * the agent's coding loop.
 *
 * Deliberately minimal: in-memory only (resets on window reload — the per-call
 * log lines persist in the output channel for summing if a longer window is
 * needed), no persistence, no UI. It's a measurement tool, not a feature.
 */

export type UsagePurpose = "main" | "condense" | "enhance" | "error-analysis" | "title" | "other"

export interface UsageSample {
	inputTokens: number
	outputTokens: number
	cacheReadTokens?: number
	/** USD, when the provider reports it; otherwise omitted. */
	totalCost?: number
}

interface PurposeTotals {
	calls: number
	inputTokens: number
	outputTokens: number
	cacheReadTokens: number
	cost: number
}

const totals = new Map<UsagePurpose, PurposeTotals>()

function totalsFor(purpose: UsagePurpose): PurposeTotals {
	let t = totals.get(purpose)
	if (!t) {
		t = { calls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cost: 0 }
		totals.set(purpose, t)
	}
	return t
}

/** Cumulative per-purpose totals plus each purpose's share of total tokens (input+output). */
export function getUsageBreakdown(): Record<string, PurposeTotals & { tokenSharePct: number }> {
	let grandTokens = 0
	for (const t of totals.values()) {
		grandTokens += t.inputTokens + t.outputTokens
	}
	const out: Record<string, PurposeTotals & { tokenSharePct: number }> = {}
	for (const [purpose, t] of totals) {
		const share = grandTokens > 0 ? ((t.inputTokens + t.outputTokens) / grandTokens) * 100 : 0
		out[purpose] = { ...t, tokenSharePct: Math.round(share * 10) / 10 }
	}
	return out
}

/** Reset accumulated totals (tests). */
export function resetUsageMetrics(): void {
	totals.clear()
}

/**
 * Record one call's usage under its purpose and log a one-line sample plus the
 * running cumulative share, e.g.:
 *   KitPilot <usage-metric>: condense +8621/14 tok (cacheRead 7777) | cumulative: main 82.4% condense 17.1% error-analysis 0.5%
 */
export function recordUsage(purpose: UsagePurpose, usage: UsageSample): void {
	const t = totalsFor(purpose)
	t.calls += 1
	t.inputTokens += usage.inputTokens
	t.outputTokens += usage.outputTokens
	t.cacheReadTokens += usage.cacheReadTokens ?? 0
	t.cost += usage.totalCost ?? 0

	const breakdown = getUsageBreakdown()
	const shares = Object.entries(breakdown)
		.sort((a, b) => b[1].tokenSharePct - a[1].tokenSharePct)
		.map(([p, b]) => `${p} ${b.tokenSharePct}%`)
		.join(" ")

	console.debug(
		`KitPilot <usage-metric>: ${purpose} +${usage.inputTokens}/${usage.outputTokens} tok` +
			(usage.cacheReadTokens ? ` (cacheRead ${usage.cacheReadTokens})` : "") +
			` | cumulative token share: ${shares}`,
	)
}
