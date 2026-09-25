import { z } from "zod"

export const vsCodeLmEffortSchema = z.enum(["none", "minimal", "low", "medium", "high", "xhigh", "max"])
export type VsCodeLmEffort = z.infer<typeof vsCodeLmEffortSchema>

export interface VsCodeLmEffortModel {
	vendor?: string
	family?: string
}

/** Use the same key for profile storage and requests. */
export function getVsCodeLmEffortKey(model?: VsCodeLmEffortModel): string | undefined {
	return model?.vendor && model.family ? JSON.stringify([model.vendor, model.family]) : undefined
}

// VS Code does not expose the Copilot configuration schema to model consumers.
// Keep explicit model entries. Do not infer support from a family prefix.
// These lists describe documented model capabilities, not live Copilot metadata.
// Copilot can restrict the levels that its endpoint accepts.
// Sources (checked 2026-09-18):
// https://platform.claude.com/docs/en/build-with-claude/effort
// https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/reasoning
// https://developers.openai.com/api/docs/models (individual model pages)
// claude-fable-5.1 and claude-opus-4.8-fast: the reasoning_effort list in the
// Copilot model metadata (checked 2026-09-25).
const COMMON = ["low", "medium", "high"] as const
const WITH_MAX = [...COMMON, "max"] as const
const WITH_EXTRA_HIGH = [...COMMON, "xhigh"] as const
const WITH_BOTH = [...COMMON, "xhigh", "max"] as const
const WITH_NONE = ["none", ...COMMON] as const
const WITH_NONE_EXTRA_HIGH = ["none", ...WITH_EXTRA_HIGH] as const

const COPILOT_EFFORT_MODELS: Readonly<Record<string, readonly VsCodeLmEffort[]>> = {
	"claude-opus-4.5": COMMON,
	"claude-opus-4.6": WITH_MAX,
	"claude-opus-4.7": WITH_BOTH,
	"claude-opus-4.8": WITH_BOTH,
	"claude-opus-4.8-fast": WITH_BOTH,
	"claude-opus-5": WITH_BOTH,
	"claude-sonnet-4.6": WITH_MAX,
	"claude-sonnet-5": WITH_BOTH,
	"claude-fable-5": WITH_BOTH,
	"claude-fable-5.1": WITH_BOTH,
	"claude-mythos-5": WITH_BOTH,
	"gpt-5": ["minimal", ...COMMON],
	"gpt-5-mini": ["minimal", ...COMMON],
	"gpt-5-codex": COMMON,
	"gpt-5.1": WITH_NONE,
	"gpt-5.1-codex": COMMON,
	"gpt-5.1-codex-mini": COMMON,
	"gpt-5.1-codex-max": WITH_EXTRA_HIGH,
	"gpt-5.2": WITH_NONE_EXTRA_HIGH,
	"gpt-5.2-codex": WITH_EXTRA_HIGH,
	"gpt-5.3-codex": WITH_EXTRA_HIGH,
	"gpt-5.4": WITH_NONE_EXTRA_HIGH,
	"gpt-5.4-mini": WITH_NONE_EXTRA_HIGH,
	"gpt-5.4-nano": WITH_NONE_EXTRA_HIGH,
	"gpt-5.5": WITH_NONE_EXTRA_HIGH,
	"gpt-5.6-sol": ["none", ...WITH_BOTH],
	"gpt-5.6-terra": ["none", ...WITH_BOTH],
	"gpt-5.6-luna": ["none", ...WITH_BOTH],
}

/** The internal request fields were verified in VS Code 1.136. */
export function supportsVsCodeLmEffort(version: string): boolean {
	const match = /^(\d+)\.(\d+)\./.exec(version)
	return !!match && Number(match[1]) === 1 && Number(match[2]) >= 136
}

export function getVsCodeLmEffortLevels(model: VsCodeLmEffortModel, version: string): readonly VsCodeLmEffort[] {
	if (!supportsVsCodeLmEffort(version) || model.vendor !== "copilot" || !model.family) return []
	const family = model.family.toLowerCase()
	return Object.hasOwn(COPILOT_EFFORT_MODELS, family) ? (COPILOT_EFFORT_MODELS[family] ?? []) : []
}
