// npx vitest core/task/__tests__/TaskModeResolver.spec.ts

import { defaultModeSlug } from "../../../shared/modes"
import type { ClineProvider } from "../../webview/ClineProvider"
import { TaskModeResolver } from "../TaskModeResolver"

const makeProvider = (
	state: { mode?: string; currentApiConfigName?: string } | (() => Promise<never>),
): ClineProvider =>
	({
		getState: typeof state === "function" ? state : async () => state,
		log: () => {},
	}) as unknown as ClineProvider

describe("TaskModeResolver", () => {
	describe("history item (sync init)", () => {
		it("resolves mode and api config immediately from the history item", async () => {
			const resolver = new TaskModeResolver({
				historyItem: { mode: "architect", apiConfigName: "work" },
				provider: makeProvider({}),
			})

			expect(resolver.mode).toBe("architect")
			expect(resolver.apiConfigName).toBe("work")
			expect(await resolver.getMode()).toBe("architect")
			expect(await resolver.getApiConfigName()).toBe("work")
		})

		it("falls back to defaultModeSlug, and leaves api config undefined, for a legacy history item", () => {
			const resolver = new TaskModeResolver({
				historyItem: {},
				provider: makeProvider({}),
			})

			expect(resolver.mode).toBe(defaultModeSlug)
			// apiConfigName may legitimately be undefined for legacy history items.
			expect(resolver.apiConfigName).toBeUndefined()
		})
	})

	describe("new task (async init from provider state)", () => {
		it("initializes mode and api config from provider state", async () => {
			const resolver = new TaskModeResolver({
				provider: makeProvider({ mode: "debug", currentApiConfigName: "fast" }),
			})

			expect(await resolver.getMode()).toBe("debug")
			expect(await resolver.getApiConfigName()).toBe("fast")
		})

		it("throws on sync mode access before initialization completes", () => {
			const resolver = new TaskModeResolver({
				provider: makeProvider({ mode: "debug" }),
			})

			// modeReady hasn't resolved yet on the same tick.
			expect(() => resolver.mode).toThrow(/before initialization/)
		})

		it("falls back to defaults when provider state is empty", async () => {
			const resolver = new TaskModeResolver({ provider: makeProvider({}) })

			expect(await resolver.getMode()).toBe(defaultModeSlug)
			expect(await resolver.getApiConfigName()).toBe("default")
		})

		it("falls back to defaults (without throwing) when getState rejects", async () => {
			const resolver = new TaskModeResolver({
				provider: makeProvider(async () => {
					throw new Error("provider not ready")
				}),
			})

			expect(await resolver.getMode()).toBe(defaultModeSlug)
			expect(await resolver.getApiConfigName()).toBe("default")
		})
	})

	describe("setMode", () => {
		it("updates the mode for a live (already-initialized) task", async () => {
			const resolver = new TaskModeResolver({
				historyItem: { mode: "code" },
				provider: makeProvider({}),
			})

			resolver.setMode("architect")

			expect(resolver.mode).toBe("architect")
			expect(resolver.modeOrDefault).toBe("architect")
			expect(await resolver.getMode()).toBe("architect")
		})
	})

	describe("set-during-init race", () => {
		it("does not clobber an api config name set before async init resolves", async () => {
			const resolver = new TaskModeResolver({
				provider: makeProvider({ currentApiConfigName: "from-state" }),
			})

			// User switches profile immediately after creation, before getState resolves.
			resolver.setApiConfigName("user-picked")

			await resolver.waitForApiConfig()
			expect(resolver.apiConfigName).toBe("user-picked")
		})

		it("also preserves a set value when getState rejects", async () => {
			const resolver = new TaskModeResolver({
				provider: makeProvider(async () => {
					throw new Error("provider not ready")
				}),
			})

			resolver.setApiConfigName("user-picked")

			await resolver.waitForApiConfig()
			expect(resolver.apiConfigName).toBe("user-picked")
		})
	})
})
