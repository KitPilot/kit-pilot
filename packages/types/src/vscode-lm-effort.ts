import { z } from "zod"

export const vsCodeLmEffortSchema = z.enum(["low", "medium", "high"])
export type VsCodeLmEffort = z.infer<typeof vsCodeLmEffortSchema>

export interface VsCodeLmEffortModel {
	vendor?: string
	family?: string
}

/** Use the same key for profile storage and requests. */
export function getVsCodeLmEffortKey(model?: VsCodeLmEffortModel): string | undefined {
	return model?.vendor && model.family ? JSON.stringify([model.vendor, model.family]) : undefined
}

// These models accept the common Low, Medium, and High levels. Other levels
// require Copilot metadata that the public VS Code API does not expose.
// Use exact names so future models do not inherit unverified capabilities.
// Sources: https://platform.claude.com/docs/en/build-with-claude/effort
// https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/reasoning
const COPILOT_EFFORT_MODELS = new Set([
	"claude-opus-4.5",
	"claude-opus-4.6",
	"claude-opus-4.7",
	"claude-opus-4.8",
	"claude-opus-5",
	"claude-sonnet-4.6",
	"claude-sonnet-5",
	"claude-fable-5",
	"claude-mythos-5",
	"gpt-5",
	"gpt-5-mini",
	"gpt-5-codex",
	"gpt-5.1",
	"gpt-5.1-codex",
	"gpt-5.1-codex-mini",
	"gpt-5.1-codex-max",
	"gpt-5.2",
	"gpt-5.2-codex",
	"gpt-5.3-codex",
	"gpt-5.4",
	"gpt-5.4-mini",
	"gpt-5.4-nano",
	"gpt-5.5",
	"gpt-5.6-sol",
	"gpt-5.6-terra",
	"gpt-5.6-luna",
])

/** The internal request fields were verified in VS Code 1.136. */
export function supportsVsCodeLmEffort(version: string): boolean {
	const match = /^(\d+)\.(\d+)\./.exec(version)
	return !!match && Number(match[1]) === 1 && Number(match[2]) >= 136
}

export function getVsCodeLmEffortLevels(model: VsCodeLmEffortModel, version: string): readonly VsCodeLmEffort[] {
	if (!supportsVsCodeLmEffort(version) || model.vendor !== "copilot" || !model.family) return []
	return COPILOT_EFFORT_MODELS.has(model.family.toLowerCase()) ? vsCodeLmEffortSchema.options : []
}
