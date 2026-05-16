import { ProviderSettings } from "@kit-pilot/types"

export function checkExistKey(config: ProviderSettings | undefined) {
	if (!config) {
		return false
	}

	// vscode-lm-only build: configuration is just the model selector.
	// VS Code LM API requires no user-provided API key.
	return config.vsCodeLmModelSelector !== undefined || config.apiProvider === "vscode-lm"
}
