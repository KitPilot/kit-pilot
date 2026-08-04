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
	isViewLaunched: boolean
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
		// `rebaselineBudgetWindow` persists through the real `updateTaskHistory`,
		// so the store has to accept writes as well as reads. Mutating the same
		// array keeps reads and writes consistent for the reload assertions.
		upsert: async (updated: HistoryItem) => {
			const index = history.findIndex((existing) => existing.id === updated.id)
			if (index === -1) {
				history.push(updated)
			} else {
				history[index] = updated
			}
			return history
		},
	}
	internals.budgetWindowBaselines = new Map()
	internals.getGlobalState = () => []
	internals.log = () => {}
	internals.isViewLaunched = false

	return provider
}

/** Drop in-memory state the way a Reload Window does, keeping history. */
function simulateReload(provider: ClineProvider) {
	;(provider as unknown as ProviderInternals).budgetWindowBaselines = new Map()
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

	describe("surviving a reload", () => {
		// The baselines map is in-memory. Before it was persisted, a Reload
		// Window silently reset it to zero while the costs it offsets stayed in
		// history — so a resumed tree re-prompted for spend already approved.
		it("keeps the approved window after the in-memory map is lost", async () => {
			const history = [item("root", 4.0, ["child"]), item("child", 2.0)]
			const provider = makeProvider(history)

			await provider.rebaselineBudgetWindow(makeTask("child", 2.0, "root"))
			simulateReload(provider)

			expect(await provider.getBudgetWindowTreeCost(makeTask("child", 2.0, "root"))).toBeCloseTo(0)

			// Spend after the approval still counts against the restored window.
			expect(await provider.getBudgetWindowTreeCost(makeTask("child", 3.5, "root"))).toBeCloseTo(1.5)
		})

		it("records the baseline on the root's history item", async () => {
			const history = [item("root", 4.0, ["child"]), item("child", 2.0)]
			const provider = makeProvider(history)

			await provider.rebaselineBudgetWindow(makeTask("child", 2.0, "root"))

			expect(history.find((entry) => entry.id === "root")?.budgetWindowBaseline).toBeCloseTo(6.0)
			// Only the root carries it — children are not separate windows.
			expect(history.find((entry) => entry.id === "child")?.budgetWindowBaseline).toBeUndefined()
		})

		it("reads a persisted baseline the map never held", async () => {
			// Exactly the rehydrated case: history came off disk, no approval has
			// happened in this session, so the map is empty.
			const root = { ...item("root", 5.0, ["child"]), budgetWindowBaseline: 4.0 } as HistoryItem
			const provider = makeProvider([root, item("child", 1.0)])

			expect(await provider.getBudgetWindowTreeCost(makeTask("child", 1.0, "root"))).toBeCloseTo(2.0)
		})

		it("counts the whole tree when no approval was ever granted", async () => {
			const provider = makeProvider([item("root", 4.0, ["child"]), item("child", 2.0)])
			simulateReload(provider)

			expect(await provider.getBudgetWindowTreeCost(makeTask("child", 2.0, "root"))).toBeCloseTo(6.0)
		})

		it("still rebaselines in memory when the root has no history entry", async () => {
			// A root that hasn't been written to history yet has nothing to attach
			// the baseline to; the session must keep working regardless.
			const provider = makeProvider([item("child", 2.0)])
			const task = makeTask("child", 2.0, "missingRoot")

			await expect(provider.rebaselineBudgetWindow(task)).resolves.toBeUndefined()
			expect(await provider.getBudgetWindowTreeCost(task)).toBeCloseTo(0)
		})
	})

	describe("legacy histories written before lineage was recorded", () => {
		// Those tasks persist parentTaskId but leave rootTaskId undefined. If the
		// root isn't recovered by walking the parent chain, reopening one after
		// upgrading enforces only that child's own spend — the original defect,
		// surviving the upgrade.
		function legacy(id: string, totalCost: number, parentTaskId?: string, childIds?: string[]): HistoryItem {
			return { id, ts: 1, task: id, tokensIn: 0, totalCost, parentTaskId, childIds } as HistoryItem
		}

		function legacyTask(taskId: string, liveCost: number, parentTaskId?: string): Task {
			return {
				taskId,
				rootTaskId: undefined,
				parentTaskId,
				getTokenUsage: () => ({ totalCost: liveCost }),
			} as unknown as Task
		}

		it("recovers the root of a rehydrated child via parentTaskId", async () => {
			const provider = makeProvider([legacy("root", 4.0, undefined, ["child"]), legacy("child", 1.0, "root")])

			const cost = await provider.getBudgetWindowTreeCost(legacyTask("child", 1.0, "root"))

			expect(cost).toBeCloseTo(5.0) // not 1.0
		})

		it("walks more than one level for a rehydrated grandchild", async () => {
			const provider = makeProvider([
				legacy("root", 4.0, undefined, ["child"]),
				legacy("child", 2.0, "root", ["grandchild"]),
				legacy("grandchild", 1.0, "child"),
			])

			const cost = await provider.getBudgetWindowTreeCost(legacyTask("grandchild", 1.0, "child"))

			expect(cost).toBeCloseTo(7.0)
		})

		it("short-circuits on an ancestor that does know its root", async () => {
			const mixed = [
				legacy("root", 4.0, undefined, ["child"]),
				{ ...legacy("child", 2.0, "root", ["grandchild"]), rootTaskId: "root" } as HistoryItem,
				legacy("grandchild", 1.0, "child"),
			]
			const provider = makeProvider(mixed)

			expect(await provider.getBudgetWindowTreeCost(legacyTask("grandchild", 1.0, "child"))).toBeCloseTo(7.0)
		})

		it("stops at a pruned ancestor instead of looping", async () => {
			// Parent no longer in history: fall back to the furthest task reached.
			const provider = makeProvider([legacy("child", 3.0, "deleted-parent")])

			const cost = await provider.getBudgetWindowTreeCost(legacyTask("child", 3.0, "deleted-parent"))

			expect(cost).toBeCloseTo(3.0)
		})

		it("does not loop forever on a cyclic parent chain", async () => {
			const provider = makeProvider([legacy("a", 1.0, "b"), legacy("b", 2.0, "a")])

			const cost = await provider.getBudgetWindowTreeCost(legacyTask("a", 1.0, "b"))

			expect(typeof cost).toBe("number")
		})
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
