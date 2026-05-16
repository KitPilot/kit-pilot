// vscode-lm-only build: LM Studio is not supported. This stub preserves the
// two public functions (`hasLoadedFullDetails`, `forceFullModelDetailsLoad`)
// referenced by ClineProvider; both are no-ops.

export const hasLoadedFullDetails = (_modelId: string): boolean => false

export const forceFullModelDetailsLoad = async (_baseUrl: string, _modelId: string): Promise<void> => {
	// no-op
}
