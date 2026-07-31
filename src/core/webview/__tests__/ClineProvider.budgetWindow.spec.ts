// pnpm --filter kit-pilot test core/webview/__tests__/ClineProvider.budgetWindow.spec.ts

import type { HistoryItem } from "@kit-pilot/types"

import { ClineProvider } from "../ClineProvider"
import type { Task } from "../../task/Task"

/**
 * These exercise the real method bodies against a hand-built history graph.
 * Standing up a full ClineProvider needs ~200 lines of unrelated mocks, and
 * none of it is what's under test: tree cost resolution reads the task history
 * store, the live task's own metrics, and the per-tree reset baseline.
 */
interface ProviderInternals {
	taskHistoryStore: unknown
	budgetWindowBaselines: Map<string, number>
	getGlobalState: (key: string) => unknown
	log: (message: string) => void
}

function makeProvider(history: HistoryItem[]) {
	const provider = Object.create(ClineProvider.prototype) as ClineProvider

	// Assign through a separate view rather than an intersection type:
	// intersecting ClineProvider with a type that redeclares its private
	// members collapses to `never`.
	const internals = provider as unknown as ProviderInternals
	internals.taskHistoryStore = {
		initialized: Promise.resolve(),
		get: (id: string) => history.find((item) => item.id === id),
	}
	internals.budgetWindowBaselines = new Map()
	internals.getGlobalState = () => []
	internals.log = () => {}

	return provider
}

function item(id: string, totalCost: number, childIds?: string[]): HistoryItem {
	return { id, ts: 1, task: id, tokensIn: 0, totalCost, childIds } as HistoryItem
}

function makeTask(taskId: string, liveCost: number, rootTaskId?: string): Task {
	return {
		taskId,
		rootTaskId,
		parentTaskId: rootTaskId ? "parent" : undefined,
		getTokenUsage: () => ({ totalCost: liveCost }),
	} as unknown as Task
}

describe("ClineProvider budget window (delegation tree)", () => {
	it("sums a parent and two sequential children", async () => {
		// The case the earlier carried-baseline design lost: after child A
		// returned, starting child B recomputed from the parent alone.
		const provider = makeProvider([
			item("root", 2.0, ["childA", "childB"]),
			item("childA", 1.5),
			item("childB", 0.25),
		])

		// Running task is childB, live spend 1.0 (its history says 0.25).
		const cost = await provider.getBudgetWindowTreeCost(makeTask("childB", 1.0, "root"))

		expect(cost).toBeCloseTo(4.5) // 2.0 root + 1.5 childA + 1.0 live childB
	})

	it("includes grandchildren", async () => {
		const provider = makeProvider([
			item("root", 1.0, ["child"]),
			item("child", 2.0, ["grandchild"]),
			item("grandchild", 3.0),
		])

		const cost = await provider.getBudgetWindowTreeCost(makeTask("grandchild", 3.0, "root"))

		expect(cost).toBeCloseTo(6.0)
	})

	it("prefers the running task's live cost over its stale persisted total", async () => {
		const provider = makeProvider([item("root", 0.0, ["child"]), item("child", 0.0)])

		// Mid-turn: neither HistoryItem has been saved with the new spend yet.
		const cost = await provider.getBudgetWindowTreeCost(makeTask("child", 7.25, "root"))

		expect(cost).toBeCloseTo(7.25)
	})

	it("is idempotent — repeated resolution does not accumulate", async () => {
		const provider = makeProvider([item("root", 2.0, ["child"]), item("child", 1.0)])
		const task = makeTask("child", 1.0, "root")

		const first = await provider.getBudgetWindowTreeCost(task)
		const second = await provider.getBudgetWindowTreeCost(task)
		const third = await provider.getBudgetWindowTreeCost(task)

		expect(first).toBeCloseTo(3.0)
		expect(second).toBe(first)
		expect(third).toBe(first)
	})

	it("starts a new window after the user approves, without losing later spend", async () => {
		const provider = makeProvider([item("root", 4.0, ["child"]), item("child", 2.0)])
		const task = makeTask("child", 2.0, "root")

		expect(await provider.getBudgetWindowTreeCost(task)).toBeCloseTo(6.0)

		// User approves past the cap inside the child.
		await provider.rebaselineBudgetWindow(task)
		expect(await provider.getBudgetWindowTreeCost(task)).toBeCloseTo(0)

		// Further spend counts against the fresh window only.
		const spentMore = makeTask("child", 3.5, "root")
		expect(await provider.getBudgetWindowTreeCost(spentMore)).toBeCloseTo(1.5)
	})

	it("keeps the baseline per tree", async () => {
		const provider = makeProvider([item("rootA", 5.0), item("rootB", 5.0)])

		await provider.rebaselineBudgetWindow(makeTask("rootA", 5.0))

		expect(await provider.getBudgetWindowTreeCost(makeTask("rootA", 5.0))).toBeCloseTo(0)
		expect(await provider.getBudgetWindowTreeCost(makeTask("rootB", 5.0))).toBeCloseTo(5.0)
	})

	it("treats a task missing from history as zero rather than throwing", async () => {
		const provider = makeProvider([item("root", 1.0, ["child", "vanished"]), item("child", 2.0)])

		const cost = await provider.getBudgetWindowTreeCost(makeTask("child", 2.0, "root"))

		expect(cost).toBeCloseTo(3.0)
	})

	it("never reports a negative window cost", async () => {
		const provider = makeProvider([item("root", 10.0)])
		const task = makeTask("root", 10.0)

		await provider.rebaselineBudgetWindow(task)

		// A later turn reporting less than the baseline (e.g. history pruned)
		// must not hand enforcement a negative figure.
		expect(await provider.getBudgetWindowTreeCost(makeTask("root", 1.0))).toBe(0)
	})

	it("rebaselines on a request-limit approval too, not just a cost one", async () => {
		// The handler keeps ONE reset point shared by both checks, so approving
		// a request prompt already restarts its cost window. If the tree
		// baseline didn't move with it, the next request would still see the
		// full pre-approval tree total and trip the cost cap immediately.
		const provider = makeProvider([item("root", 6.0, ["child"]), item("child", 3.0)])
		const task = makeTask("child", 3.0, "root")

		expect(await provider.getBudgetWindowTreeCost(task)).toBeCloseTo(9.0)

		// Task.attemptApiRequest rebaselines on any approved limit.
		await provider.rebaselineBudgetWindow(task)

		expect(await provider.getBudgetWindowTreeCost(task)).toBeCloseTo(0)
	})

	it("returns undefined when resolution fails, so enforcement falls back", async () => {
		const provider = makeProvider([item("root", 1.0)])
		;(provider as any).taskHistoryStore = {
			get initialized(): Promise<void> {
				throw new Error("store unavailable")
			},
		}

		expect(await provider.getBudgetWindowTreeCost(makeTask("root", 1.0))).toBeUndefined()
	})
})
