// npx vitest api/__tests__/usageMetrics.spec.ts

import * as fs from "fs/promises"
import * as os from "os"
import * as path from "path"

import {
	recordUsage,
	getUsageBreakdown,
	resetUsageMetrics,
	initUsageMetricsPersistence,
	flushUsageMetrics,
	getUsageMetricsSince,
	getUsageMetricsFilePath,
} from "../usageMetrics"

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

describe("usageMetrics persistence", () => {
	let dir: string
	let file: string

	beforeEach(async () => {
		resetUsageMetrics()
		dir = await fs.mkdtemp(path.join(os.tmpdir(), "kitpilot-usage-metrics-"))
		file = path.join(dir, "usage-metrics.json")
	})

	afterEach(async () => {
		resetUsageMetrics()
		await fs.rm(dir, { recursive: true, force: true })
	})

	it("defaults to usage-metrics.json in the global .kitpilot directory", () => {
		expect(getUsageMetricsFilePath()).toBe(path.join(os.homedir(), ".kitpilot", "usage-metrics.json"))
	})

	it("flush writes current totals and window start to disk", async () => {
		await initUsageMetricsPersistence(file)
		recordUsage("condense", { inputTokens: 100, outputTokens: 5, cacheReadTokens: 20, totalCost: 0.01 })
		await flushUsageMetrics()

		const persisted = JSON.parse(await fs.readFile(file, "utf8"))
		expect(persisted.version).toBe(1)
		expect(persisted.since).toBe(getUsageMetricsSince())
		expect(persisted.perPurpose.condense).toMatchObject({
			calls: 1,
			inputTokens: 100,
			outputTokens: 5,
			cacheReadTokens: 20,
			cost: 0.01,
		})
	})

	it("restores persisted totals and window start after a reload", async () => {
		await initUsageMetricsPersistence(file)
		recordUsage("main", { inputTokens: 300, outputTokens: 30 })
		recordUsage("condense", { inputTokens: 100, outputTokens: 5 })
		await flushUsageMetrics()
		const originalSince = getUsageMetricsSince()

		// Simulate a window reload: in-memory state gone, file remains.
		resetUsageMetrics()
		expect(getUsageBreakdown()).toEqual({})

		await initUsageMetricsPersistence(file)
		expect(getUsageMetricsSince()).toBe(originalSince)
		expect(getUsageBreakdown().main).toMatchObject({ calls: 1, inputTokens: 300, outputTokens: 30 })
		expect(getUsageBreakdown().condense).toMatchObject({ calls: 1, inputTokens: 100, outputTokens: 5 })
	})

	it("merges persisted totals additively with samples recorded before load", async () => {
		await initUsageMetricsPersistence(file)
		recordUsage("main", { inputTokens: 100, outputTokens: 10 })
		await flushUsageMetrics()
		resetUsageMetrics()

		// A call lands before the (async) load completes.
		recordUsage("main", { inputTokens: 50, outputTokens: 5 })
		await initUsageMetricsPersistence(file)

		expect(getUsageBreakdown().main).toMatchObject({ calls: 2, inputTokens: 150, outputTokens: 15 })
	})

	it("starts a fresh window when the file is missing or corrupt", async () => {
		await fs.writeFile(file, "not json {", "utf8")
		await expect(initUsageMetricsPersistence(file)).resolves.toBeUndefined()
		expect(getUsageBreakdown()).toEqual({})

		// And it can persist over the corrupt file afterwards.
		recordUsage("main", { inputTokens: 1, outputTokens: 1 })
		await flushUsageMetrics()
		expect(JSON.parse(await fs.readFile(file, "utf8")).perPurpose.main.calls).toBe(1)
	})

	it("does not write anything when persistence was never initialized", async () => {
		recordUsage("main", { inputTokens: 1, outputTokens: 1 })
		await flushUsageMetrics()
		await expect(fs.stat(file)).rejects.toThrow()
	})
})
