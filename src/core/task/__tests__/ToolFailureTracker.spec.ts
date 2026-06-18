// npx vitest core/task/__tests__/ToolFailureTracker.spec.ts

import type { ApiHandler } from "../../../api"
import { ToolFailureTracker } from "../ToolFailureTracker"

const makeApi = (chunks: Array<{ type: string; text?: string }>): ApiHandler =>
	({
		createMessage: () =>
			(async function* () {
				for (const chunk of chunks) {
					yield chunk as any
				}
			})(),
	}) as unknown as ApiHandler

describe("ToolFailureTracker", () => {
	describe("toolNeedingDeepAnalysis", () => {
		it("returns null until a tool fails exactly twice", () => {
			const tracker = new ToolFailureTracker()

			tracker.record("read_file", true, "boom")
			expect(tracker.toolNeedingDeepAnalysis()).toBeNull()

			tracker.record("read_file", true, "boom again")
			expect(tracker.toolNeedingDeepAnalysis()).toBe("read_file")
		})

		it("only fires once per stuck episode (exactly 2, not >2)", () => {
			const tracker = new ToolFailureTracker()

			tracker.record("apply_diff", true, "e1")
			tracker.record("apply_diff", true, "e2")
			expect(tracker.toolNeedingDeepAnalysis()).toBe("apply_diff")

			// Third failure pushes the count past the threshold, so it no longer
			// signals — preventing the analysis call from firing every turn.
			tracker.record("apply_diff", true, "e3")
			expect(tracker.toolNeedingDeepAnalysis()).toBeNull()
		})

		it("resets a tool's counter on success", () => {
			const tracker = new ToolFailureTracker()

			tracker.record("write_file", true, "e1")
			tracker.record("write_file", true, "e2")
			expect(tracker.toolNeedingDeepAnalysis()).toBe("write_file")

			tracker.record("write_file", false)
			expect(tracker.toolNeedingDeepAnalysis()).toBeNull()
		})
	})

	describe("analyzeToolFailure", () => {
		it("returns null when there is no cached error for the tool", async () => {
			const tracker = new ToolFailureTracker()
			const result = await tracker.analyzeToolFailure("read_file", makeApi([]), "task-1")
			expect(result).toBeNull()
		})

		it("streams the analysis text back, trimmed", async () => {
			const tracker = new ToolFailureTracker()
			tracker.record("read_file", true, "ENOENT")

			const api = makeApi([
				{ type: "text", text: "  The path " },
				{ type: "usage" },
				{ type: "text", text: "is wrong.  " },
			])
			const result = await tracker.analyzeToolFailure("read_file", api, "task-1")
			expect(result).toBe("The path is wrong.")
		})

		it("returns null (does not throw) when the secondary call fails", async () => {
			const tracker = new ToolFailureTracker()
			tracker.record("read_file", true, "ENOENT")

			const api = {
				createMessage: () => {
					throw new Error("network down")
				},
			} as unknown as ApiHandler

			await expect(tracker.analyzeToolFailure("read_file", api, "task-1")).resolves.toBeNull()
		})

		it("returns null when the model produces only whitespace", async () => {
			const tracker = new ToolFailureTracker()
			tracker.record("read_file", true, "ENOENT")

			const result = await tracker.analyzeToolFailure("read_file", makeApi([{ type: "text", text: "   " }]), "t")
			expect(result).toBeNull()
		})
	})
})
