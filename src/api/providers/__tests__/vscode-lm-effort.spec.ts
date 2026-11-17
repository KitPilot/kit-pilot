import { getVsCodeLmEffortKey } from "@kit-pilot/types"
import { getVsCodeLmEffortOptions } from "../vscode-lm-effort"

const host = vi.hoisted(() => ({ version: "1.136.1" }))
vi.mock("vscode", () => host)

describe("getVsCodeLmEffortOptions", () => {
	const claude = { vendor: "copilot", family: "claude-opus-5" }
	const gpt = { vendor: "copilot", family: "gpt-5.5" }
	const settings = { vsCodeLmModelEfforts: { [getVsCodeLmEffortKey(claude)!]: "high" as const } }

	afterEach(() => {
		host.version = "1.136.1"
	})

	it.each(["xhigh", "max"] as const)("sends Claude %s without conversion", (effort) => {
		expect(
			getVsCodeLmEffortOptions(claude, { vsCodeLmModelEfforts: { [getVsCodeLmEffortKey(claude)!]: effort } }),
		).toEqual({
			configuration: { reasoningEffort: effort },
			modelOptions: { _enableThinking: true },
		})
	})

	it("does not send Max to GPT-5.5", () => {
		expect(
			getVsCodeLmEffortOptions(gpt, { vsCodeLmModelEfforts: { [getVsCodeLmEffortKey(gpt)!]: "max" } }),
		).toEqual({})
	})

	it("does not send Extra High to Claude Opus 4.6", () => {
		const model = { vendor: "copilot", family: "claude-opus-4.6" }
		expect(
			getVsCodeLmEffortOptions(model, { vsCodeLmModelEfforts: { [getVsCodeLmEffortKey(model)!]: "xhigh" } }),
		).toEqual({ modelOptions: { _enableThinking: true } })
	})

	it("does not send Claude's effort after a model switch", () => {
		expect(getVsCodeLmEffortOptions(gpt, settings)).toEqual({})
	})

	it("Default enables Claude thinking and inherits the native effort", () => {
		expect(getVsCodeLmEffortOptions(claude, {})).toEqual({ modelOptions: { _enableThinking: true } })
	})

	it("sends GPT effort without a Claude thinking flag", () => {
		expect(
			getVsCodeLmEffortOptions(gpt, {
				vsCodeLmModelEfforts: { [getVsCodeLmEffortKey(gpt)!]: "low" },
			}),
		).toEqual({ configuration: { reasoningEffort: "low" } })
	})

	it("turns on thinking for a Claude model that is not in the effort list", () => {
		// Before, a new Claude model such as Opus 5.5 ran with thinking off.
		for (const family of ["claude-opus-5.5", "claude-haiku-5.5", "claude-haiku-4.5", "claude-new-9"]) {
			expect(getVsCodeLmEffortOptions({ vendor: "copilot", family }, {})).toEqual({
				modelOptions: { _enableThinking: true },
			})
		}
	})

	it("does not send the Claude thinking flag to another vendor", () => {
		expect(getVsCodeLmEffortOptions({ vendor: "anthropic", family: "claude-opus-5.5" }, {})).toEqual({})
	})

	it("sends a fallback effort for a new model that is not in the list", () => {
		const model = { vendor: "copilot", family: "claude-haiku-5.5" }
		expect(
			getVsCodeLmEffortOptions(model, { vsCodeLmModelEfforts: { [getVsCodeLmEffortKey(model)!]: "low" } }),
		).toEqual({ configuration: { reasoningEffort: "low" }, modelOptions: { _enableThinking: true } })
	})

	it("omits all internal fields on older VS Code versions", () => {
		host.version = "1.135.0"
		expect(getVsCodeLmEffortOptions(claude, settings)).toEqual({})
	})

	it("ignores legacy global effort settings", () => {
		expect(getVsCodeLmEffortOptions(gpt, { reasoningEffort: "high", enableReasoningEffort: true })).toEqual({})
	})

	it("does not send saved effort to an unsupported model", () => {
		const model = { vendor: "copilot", family: "gpt-4o" }
		expect(
			getVsCodeLmEffortOptions(model, {
				vsCodeLmModelEfforts: { [getVsCodeLmEffortKey(model)!]: "high" },
			}),
		).toEqual({})
	})
})
