// npx vitest run src/shared/__tests__/experiments.spec.ts

import type { ExperimentId } from "@kit-pilot/types"

import { EXPERIMENT_IDS, experimentConfigsMap, experiments as Experiments } from "../experiments"

describe("experiments", () => {
	describe("CUSTOM_TOOLS", () => {
		it("is configured correctly", () => {
			expect(EXPERIMENT_IDS.CUSTOM_TOOLS).toBe("customTools")
			expect(experimentConfigsMap.CUSTOM_TOOLS).toMatchObject({
				enabled: false,
			})
		})
	})

	describe("isEnabled", () => {
		it("returns false when experiment is not enabled", () => {
			const experiments: Record<ExperimentId, boolean> = {
				customTools: false,
			}
			expect(Experiments.isEnabled(experiments, EXPERIMENT_IDS.CUSTOM_TOOLS)).toBe(false)
		})

		it("returns true when experiment is enabled", () => {
			const experiments: Record<ExperimentId, boolean> = {
				customTools: true,
			}
			expect(Experiments.isEnabled(experiments, EXPERIMENT_IDS.CUSTOM_TOOLS)).toBe(true)
		})

		it("returns the default when the experiment is not present", () => {
			expect(Experiments.isEnabled({}, EXPERIMENT_IDS.CUSTOM_TOOLS)).toBe(false)
		})
	})
})
