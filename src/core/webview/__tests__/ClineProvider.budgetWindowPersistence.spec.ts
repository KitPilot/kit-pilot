// pnpm --filter kit-pilot test core/webview/__tests__/ClineProvider.budgetWindowPersistence.spec.ts

import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"

import type { HistoryItem } from "@kit-pilot/types"

import { ClineProvider } from "../ClineProvider"
import type { Task } from "../../task/Task"
import { TaskHistoryStore } from "../../task-persistence/TaskHistoryStore"

vi.mock("../../../utils/storage", () => ({
	getStorageBasePath: vi.fn().mockImplementation((defaultPath: string) => defaultPath),
}))

// Plain fs writes in tests, matching TaskHistoryStore's own specs (avoids
// proper-lockfile in a temp dir).
vi.mock("../../../utils/safeWriteJson", () => ({
	safeWriteJson: vi.fn().mockImplementation(async (filePath: string, data: unknown) => {
		await fs.mkdir(path.dirname(filePath), { recursive: true })
		await fs.writeFile(filePath, JSON.stringify(data, null, "\t"), "utf8")
	}),
}))

interface ProviderInternals {
	taskHistoryStore: TaskHistoryStore
	budgetWindowBaselines: Map<string, number>
	getGlobalState: (key: string) => unknown
	log: (message: string) => void
	isViewLaunched: boolean
}

/**
 * A real `ClineProvider` method body over a real `TaskHistoryStore`. The point
 * of this file is durability on disk, which a stubbed store cannot demonstrate:
 * `upsert` writes the per-task file immediately but only *schedules* the index
 * write, and a fresh store reads that index.
 */
function makeProvider(store: TaskHistoryStore) {
	const provider = Object.create(ClineProvider.prototype) as ClineProvider
	const internals = provider as unknown as ProviderInternals

	internals.taskHistoryStore = store
	internals.budgetWindowBaselines = new Map()
	internals.getGlobalState = () => []
	internals.log = () => {}
	internals.isViewLaunched = false

	return provider
}

function item(id: string, totalCost: number, childIds?: string[]): HistoryItem {
	return { id, number: 1, ts: 1, task: id, tokensIn: 0, tokensOut: 0, totalCost, childIds } as HistoryItem
}

function makeTask(taskId: string, liveCost: number, rootTaskId?: string): Task {
	return {
		taskId,
		rootTaskId,
		parentTaskId: rootTaskId ? "parent" : undefined,
		getTokenUsage: () => ({ totalCost: liveCost }),
	} as unknown as Task
}

describe("budget baseline durability across a real TaskHistoryStore", () => {
	let tmpDir: string
	let store: TaskHistoryStore

	beforeEach(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "budget-baseline-"))
		store = new TaskHistoryStore(tmpDir)
		await store.initialize()
	})

	afterEach(async () => {
		store.dispose()
		await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
	})

	it("survives a reload that happens before the index debounce fires", async () => {
		// Start from a root already on disk *and* already in the index, with no
		// baseline — the state a long-running task is in before its first
		// approval. Flushing here is what makes the index entry stale later.
		await store.upsert(item("root", 6.0, ["child"]))
		await store.upsert(item("child", 4.0))
		await store.flushIndex()

		const provider = makeProvider(store)

		// User approves past the cap. No manual flush after this point: the
		// production path is what has to make the write durable.
		await provider.rebaselineBudgetWindow(makeTask("child", 4.0, "root"))

		// Reload Window inside the store's two-second index debounce: a brand new
		// store reads the index, and initialization does not re-read per-task
		// files for ids the index already covers.
		const reopened = new TaskHistoryStore(tmpDir)

		try {
			await reopened.initialize()

			expect(reopened.get("root")?.budgetWindowBaseline).toBeCloseTo(10.0)

			// And the restored baseline is actually enforced: the resumed tree
			// must not re-prompt for the spend already approved.
			const resumed = makeProvider(reopened)
			expect(await resumed.getBudgetWindowTreeCost(makeTask("child", 4.0, "root"))).toBeCloseTo(0)
		} finally {
			reopened.dispose()
		}
	})

	it("keeps a lowered baseline durable after a rewind", async () => {
		await store.upsert(item("root", 6.0, ["child"]))
		await store.upsert(item("child", 4.0))
		await store.flushIndex()

		const provider = makeProvider(store)
		await provider.rebaselineBudgetWindow(makeTask("child", 4.0, "root"))

		// Rewind drops the child's later turns.
		await store.upsert(item("child", 0.5))
		await provider.getBudgetWindowTreeCost(makeTask("child", 0.5, "root"))

		const reopened = new TaskHistoryStore(tmpDir)

		try {
			await reopened.initialize()

			// Re-anchored to the shrunken tree, not the pre-rewind total.
			expect(reopened.get("root")?.budgetWindowBaseline).toBeCloseTo(6.5)

			// So new spend is metered again rather than being absorbed by the
			// removed spend's allowance.
			const resumed = makeProvider(reopened)
			expect(await resumed.getBudgetWindowTreeCost(makeTask("child", 1.5, "root"))).toBeCloseTo(1.0)
		} finally {
			reopened.dispose()
		}
	})
})
