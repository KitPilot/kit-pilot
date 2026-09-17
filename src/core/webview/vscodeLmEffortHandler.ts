import * as vscode from "vscode"
import { getVsCodeLmEffortKey, getVsCodeLmEffortLevels, type WebviewMessage } from "@kit-pilot/types"

import type { ClineProvider } from "./ClineProvider"

/** Save an effort change against the latest profile state. */
export async function setVsCodeLmEffort(provider: ClineProvider, message: WebviewMessage): Promise<void> {
	let success = false
	try {
		const selection = message.vsCodeLmEffortSelection
		const { apiConfiguration, currentApiConfigName } = await provider.getState()
		const key = getVsCodeLmEffortKey(selection)
		if (
			selection &&
			key &&
			currentApiConfigName &&
			currentApiConfigName === message.text &&
			key === getVsCodeLmEffortKey(apiConfiguration?.vsCodeLmModelSelector) &&
			(selection.effort === "default" ||
				getVsCodeLmEffortLevels(selection, vscode.version).includes(selection.effort))
		) {
			const efforts = { ...apiConfiguration.vsCodeLmModelEfforts }
			if (selection.effort === "default") {
				delete efforts[key]
			} else {
				efforts[key] = selection.effort
			}
			success = !!(await provider.upsertProviderProfile(currentApiConfigName, {
				...apiConfiguration,
				vsCodeLmModelEfforts: efforts,
			}))
		}
	} catch (error) {
		provider.log(`Cannot save the model effort: ${error instanceof Error ? error.message : String(error)}`)
	}
	await provider.postMessageToWebview({ type: "vsCodeLmEffortSaved", requestId: message.requestId, success })
}
