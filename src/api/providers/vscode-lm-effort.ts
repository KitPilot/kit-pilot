import * as vscode from "vscode"

import { getVsCodeLmEffortKey, getVsCodeLmEffortLevels, type ProviderSettings } from "@kit-pilot/types"

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
	if (levels.length === 0) return {}

	// VS Code forwards configuration as modelConfiguration to Copilot.
	// Copilot also needs _enableThinking to apply effort to Claude requests.
	// These internal fields require the VS Code version check above.
	// https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/chat/common/languageModels.ts
	// https://github.com/microsoft/vscode/blob/main/extensions/copilot/src/extension/conversation/vscode-node/languageModelAccess.ts
	return {
		...(effort && levels.includes(effort) ? { configuration: { reasoningEffort: effort } } : {}),
		...(model.family.toLowerCase().startsWith("claude-") ? { modelOptions: { _enableThinking: true } } : {}),
	}
}
