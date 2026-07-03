// npx vitest run src/shared/__tests__/experiments.spec.ts

import type { ExperimentId } from "@kit-pilot/types"

import { EXPERIMENT_IDS, experimentConfigsMap, experiments as Experiments } from "../experiments"

describe("experiments", () => {
	describe("IMAGE_GENERATION", () => {
		it("is configured correctly", () => {
			expect(EXPERIMENT_IDS.IMAGE_GENERATION).toBe("imageGeneration")
			expect(experimentConfigsMap.IMAGE_GENERATION).toMatchObject({
				enabled: false,
			})
		})
	})

	describe("isEnabled", () => {
		it("returns false when experiment is not enabled", () => {
			const experiments: Record<ExperimentId, boolean> = {
				imageGeneration: false,
				customTools: false,
			}
			expect(Experiments.isEnabled(experiments, EXPERIMENT_IDS.IMAGE_GENERATION)).toBe(false)
		})

		it("returns true when experiment is enabled", () => {
			const experiments: Record<ExperimentId, boolean> = {
				imageGeneration: true,
				customTools: false,
			}
			expect(Experiments.isEnabled(experiments, EXPERIMENT_IDS.IMAGE_GENERATION)).toBe(true)
		})

		it("returns the default when the experiment is not present", () => {
			expect(Experiments.isEnabled({}, EXPERIMENT_IDS.IMAGE_GENERATION)).toBe(false)
		})
	})
})
