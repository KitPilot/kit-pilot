import { describe, expect, it } from "vitest"

import { providerSettingsSchema } from "../provider-settings.js"
import { ACTIVE_PROVIDER_STATE_KEYS } from "../global-settings.js"
import { getVsCodeLmEffortKey, getVsCodeLmEffortLevels } from "../vscode-lm-effort.js"

describe("VS Code model effort", () => {
	it("preserves separate model choices through profile validation", () => {
		const claude = getVsCodeLmEffortKey({ vendor: "copilot", family: "claude-opus-5" })!
		const gpt = getVsCodeLmEffortKey({ vendor: "copilot", family: "gpt-5.5" })!
		const settings = providerSettingsSchema.parse({
			apiProvider: "vscode-lm",
			vsCodeLmModelEfforts: { [claude]: "high", [gpt]: "low" },
		})
		expect(settings.vsCodeLmModelEfforts).toEqual({ [claude]: "high", [gpt]: "low" })
		expect(ACTIVE_PROVIDER_STATE_KEYS).toContain("vsCodeLmModelEfforts")
	})

	it("does not give incomplete selectors a shared storage key", () => {
		expect(getVsCodeLmEffortKey()).toBeUndefined()
		expect(getVsCodeLmEffortKey({ vendor: "copilot" })).toBeUndefined()
	})

	it("rejects invalid effort values in imported profiles", () => {
		expect(providerSettingsSchema.safeParse({ vsCodeLmModelEfforts: { model: "invalid" } }).success).toBe(false)
	})

	it.each([
		["claude-opus-4.5", ["low", "medium", "high"]],
		["claude-opus-4.6", ["low", "medium", "high", "max"]],
		["claude-sonnet-4.6", ["low", "medium", "high", "max"]],
		["claude-opus-5", ["low", "medium", "high", "xhigh", "max"]],
		["claude-sonnet-5", ["low", "medium", "high", "xhigh", "max"]],
		["gpt-5", ["minimal", "low", "medium", "high"]],
		["gpt-5-codex", ["low", "medium", "high"]],
		["gpt-5.1", ["none", "low", "medium", "high"]],
		["gpt-5.1-codex-max", ["low", "medium", "high", "xhigh"]],
		["gpt-5.5", ["none", "low", "medium", "high", "xhigh"]],
		["gpt-5.6-sol", ["none", "low", "medium", "high", "xhigh", "max"]],
	])("returns the documented levels for %s", (family, levels) => {
		expect(getVsCodeLmEffortLevels({ vendor: "copilot", family: family as string }, "1.136.1")).toEqual(levels)
	})

	it("preserves Extra High and Max as distinct profile values", () => {
		const settings = providerSettingsSchema.parse({ vsCodeLmModelEfforts: { opus: "max", gpt: "xhigh" } })
		expect(settings.vsCodeLmModelEfforts).toEqual({ opus: "max", gpt: "xhigh" })
	})

	it.each([
		"gpt-4o",
		"claude-sonnet-4",
		"gemini-2.5-pro",
		"gpt-5.5-pro",
		"gpt-99",
		"auto",
		"constructor",
		"__proto__",
	])("does not invent support for %s", (family) => {
		expect(getVsCodeLmEffortLevels({ vendor: "copilot", family }, "1.136.1")).toEqual([])
	})

	it("does not apply Copilot capabilities to another vendor", () => {
		expect(getVsCodeLmEffortLevels({ vendor: "custom", family: "claude-opus-5" }, "1.136.1")).toEqual([])
	})

	it.each(["1.107.0", "1.135.0", "unknown", "2.0.0"])("disables internal fields on VS Code %s", (version) => {
		expect(getVsCodeLmEffortLevels({ vendor: "copilot", family: "claude-opus-5" }, version)).toEqual([])
	})
})
