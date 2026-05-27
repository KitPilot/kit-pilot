// npx vitest run __tests__/delegation-events.spec.ts

import { KitPilotEventName, kitpilotCodeEventsSchema, taskEventSchema } from "@kit-pilot/types"

describe("delegation event schemas", () => {
	test("kitpilotCodeEventsSchema validates tuples", () => {
		expect(() => (kitpilotCodeEventsSchema.shape as any)[KitPilotEventName.TaskDelegated].parse(["p", "c"])).not.toThrow()
		expect(() =>
			(kitpilotCodeEventsSchema.shape as any)[KitPilotEventName.TaskDelegationCompleted].parse(["p", "c", "s"]),
		).not.toThrow()
		expect(() =>
			(kitpilotCodeEventsSchema.shape as any)[KitPilotEventName.TaskDelegationResumed].parse(["p", "c"]),
		).not.toThrow()

		// invalid shapes
		expect(() => (kitpilotCodeEventsSchema.shape as any)[KitPilotEventName.TaskDelegated].parse(["p"])).toThrow()
		expect(() =>
			(kitpilotCodeEventsSchema.shape as any)[KitPilotEventName.TaskDelegationCompleted].parse(["p", "c"]),
		).toThrow()
		expect(() => (kitpilotCodeEventsSchema.shape as any)[KitPilotEventName.TaskDelegationResumed].parse(["p"])).toThrow()
	})

	test("taskEventSchema discriminated union includes delegation events", () => {
		expect(() =>
			taskEventSchema.parse({
				eventName: KitPilotEventName.TaskDelegated,
				payload: ["p", "c"],
				taskId: 1,
			}),
		).not.toThrow()

		expect(() =>
			taskEventSchema.parse({
				eventName: KitPilotEventName.TaskDelegationCompleted,
				payload: ["p", "c", "s"],
				taskId: 1,
			}),
		).not.toThrow()

		expect(() =>
			taskEventSchema.parse({
				eventName: KitPilotEventName.TaskDelegationResumed,
				payload: ["p", "c"],
				taskId: 1,
			}),
		).not.toThrow()
	})
})
