// vscode-lm-only build: dynamic provider model fetching is unused (vscode-lm
// discovers models via vscode.lm.selectChatModels). The public surface of
// this module is preserved as no-ops so widely-referenced imports across the
// codebase keep type-checking.
import type { ModelRecord } from "@kit-pilot/types"
import type { GetModelsOptions } from "../../../shared/api"

const emptyModels: ModelRecord = {}

export const getModels = async (_options: GetModelsOptions): Promise<ModelRecord> => emptyModels

export const refreshModels = async (_options: GetModelsOptions): Promise<ModelRecord> => emptyModels

export async function initializeModelCacheRefresh(): Promise<void> {
	// no-op
}

export const flushModels = async (_options: GetModelsOptions, _refresh: boolean = false): Promise<void> => {
	// no-op
}

export function getModelsFromCache(_provider: string): ModelRecord | undefined {
	return undefined
}
