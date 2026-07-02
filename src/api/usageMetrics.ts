/**
 * Lightweight instrumentation to measure the **auxiliary-vs-main token
 * share** — the decision gate for TODO #3 (auxiliary-call model routing).
 *
 * Every LLM call tags itself with a `UsagePurpose` (via
 * ApiHandlerCreateMessageMetadata.purpose; defaults to "main"). When a call
 * reports usage we accumulate per-purpose totals and log a running breakdown,
 * so over real usage we can see what fraction of tokens (≈ cost, since today
 * everything runs on one model) goes to condense / enhance / etc. rather than
 * the agent's coding loop.
 *
 * Totals persist to `~/.kitpilot/usage-metrics.json` (debounced after each
 * sample, additively merged back on activation) so the measurement window
 * spans reloads and sessions. The file plus the diagnostics report section
 * are the intended way to read the result — no UI. It's a measurement tool,
 * not a feature.
 */

import * as fs from "fs/promises"
import * as path from "path"

import { getGlobalKitPilotDirectory } from "../services/kitpilot-config"

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

/** Start of the measurement window (ISO); loaded from disk when persisted. */
let since = new Date().toISOString()

/** Undefined until initUsageMetricsPersistence runs — recordUsage stays in-memory-only. */
let persistPath: string | undefined
let persistTimer: ReturnType<typeof setTimeout> | undefined
let pendingWrite: Promise<void> = Promise.resolve()

const PERSIST_DEBOUNCE_MS = 5_000

interface PersistedUsageMetrics {
	version: 1
	since: string
	perPurpose: Partial<Record<UsagePurpose, PurposeTotals>>
}

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

/** ISO timestamp of the start of the current measurement window. */
export function getUsageMetricsSince(): string {
	return since
}

/** Canonical on-disk location of the persisted totals. */
export function getUsageMetricsFilePath(): string {
	return path.join(getGlobalKitPilotDirectory(), "usage-metrics.json")
}

/**
 * Load persisted totals and enable debounced persistence. Persisted values
 * are merged additively into whatever is already in memory, so samples
 * recorded before this async load completes are not lost.
 */
export async function initUsageMetricsPersistence(filePath: string = getUsageMetricsFilePath()): Promise<void> {
	let loaded: PersistedUsageMetrics | undefined
	try {
		loaded = JSON.parse(await fs.readFile(filePath, "utf8"))
	} catch {
		// Missing or corrupt file — start a fresh window.
	}

	if (loaded?.version === 1 && typeof loaded.since === "string" && loaded.perPurpose) {
		since = loaded.since
		for (const [purpose, persisted] of Object.entries(loaded.perPurpose)) {
			if (!persisted) continue
			const t = totalsFor(purpose as UsagePurpose)
			t.calls += persisted.calls ?? 0
			t.inputTokens += persisted.inputTokens ?? 0
			t.outputTokens += persisted.outputTokens ?? 0
			t.cacheReadTokens += persisted.cacheReadTokens ?? 0
			t.cost += persisted.cost ?? 0
		}
	}

	persistPath = filePath
}

function schedulePersist(): void {
	if (!persistPath || persistTimer) return
	persistTimer = setTimeout(() => {
		persistTimer = undefined
		void writeTotals()
	}, PERSIST_DEBOUNCE_MS)
}

function writeTotals(): Promise<void> {
	const filePath = persistPath
	if (!filePath) return Promise.resolve()
	const snapshot: PersistedUsageMetrics = {
		version: 1,
		since,
		perPurpose: Object.fromEntries([...totals].map(([purpose, t]) => [purpose, { ...t }])),
	}
	// Serialize writes so a slow disk can't interleave two JSON bodies.
	pendingWrite = pendingWrite
		.then(async () => {
			await fs.mkdir(path.dirname(filePath), { recursive: true })
			await fs.writeFile(filePath, JSON.stringify(snapshot, null, "\t"), "utf8")
		})
		.catch((error) => {
			console.debug(`KitPilot <usage-metric>: failed to persist totals: ${error}`)
		})
	return pendingWrite
}

/** Cancel any pending debounce and write the current totals now (deactivate, tests). */
export async function flushUsageMetrics(): Promise<void> {
	if (persistTimer) {
		clearTimeout(persistTimer)
		persistTimer = undefined
	}
	await writeTotals()
}

/** Reset accumulated totals and start a new measurement window (tests). */
export function resetUsageMetrics(): void {
	totals.clear()
	since = new Date().toISOString()
	if (persistTimer) {
		clearTimeout(persistTimer)
		persistTimer = undefined
	}
	persistPath = undefined
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

	schedulePersist()
}
