import * as vscode from "vscode"

import {
	getVsCodeLmEffortKey,
	getVsCodeLmEffortLevels,
	supportsVsCodeLmEffort,
	type ProviderSettings,
} from "@kit-pilot/types"

type EffortRequestOptions = vscode.LanguageModelChatRequestOptions & {
	configuration?: { reasoningEffort: string }
}

/** Apply an override only to the selected model on a compatible VS Code version. */
export function getVsCodeLmEffortOptions(
	model: Pick<vscode.LanguageModelChat, "vendor" | "family">,
	settings: ProviderSettings,
): EffortRequestOptions {
	const key = getVsCodeLmEffortKey(model)
	const effort = key ? settings.vsCodeLmModelEfforts?.[key] : undefined
	const levels = getVsCodeLmEffortLevels(model, vscode.version)

	// VS Code forwards configuration as modelConfiguration to Copilot.
	// These internal fields require VS Code 1.136 or later.
	// https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/chat/common/languageModels.ts
	// https://github.com/microsoft/vscode/blob/main/extensions/copilot/src/extension/conversation/vscode-node/languageModelAccess.ts
	//
	// Copilot turns on thinking for a Claude model only when _enableThinking
	// is set. Copilot applies it only if the model supports thinking (adaptive
	// thinking or a thinking budget), so it is safe for every Claude model. It
	// does not depend on the effort list: before, a new Claude model that was
	// not in the list ran with thinking off.
	const enableThinking =
		supportsVsCodeLmEffort(vscode.version) &&
		model.vendor === "copilot" &&
		model.family.toLowerCase().startsWith("claude-")

	return {
		...(effort && levels.includes(effort) ? { configuration: { reasoningEffort: effort } } : {}),
		...(enableThinking ? { modelOptions: { _enableThinking: true } } : {}),
	}
}
