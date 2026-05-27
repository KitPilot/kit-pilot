import * as assert from "assert"

import { KitPilotEventName, type ClineMessage } from "@kit-pilot/types"

import { waitUntilCompleted } from "./utils"
import { setDefaultSuiteTimeout } from "./test-utils"

suite("KitPilot Task", function () {
	setDefaultSuiteTimeout(this)

	test("Should handle prompt and response correctly", async () => {
		const api = globalThis.api

		const messages: ClineMessage[] = []

		api.on(KitPilotEventName.Message, ({ message }) => {
			if (message.type === "say" && message.partial === false) {
				messages.push(message)
			}
		})

		const taskId = await api.startNewTask({
			configuration: { mode: "ask", alwaysAllowModeSwitch: true, autoApprovalEnabled: true },
			text: "Hello world, what is your name? Respond with 'My name is ...'",
		})

		await waitUntilCompleted({ api, taskId })

		assert.ok(
			!!messages.find(
				({ say, text }) => (say === "completion_result" || say === "text") && text?.includes("My name is KitPilot"),
			),
			`Completion should include "My name is KitPilot"`,
		)
	})
})
