import { getVsCodeLmEffortKey, type ExtensionMessage, type ProviderSettings } from "@kit-pilot/types"

import { act, fireEvent, render, screen } from "@/utils/test-utils"
import { vscode } from "@/utils/vscode"
import { ThinkingEffortSelector } from "../ThinkingEffortSelector"

vi.mock("@/utils/vscode", () => ({ vscode: { postMessage: vi.fn() } }))
vi.mock("@/i18n/TranslationContext", async () => {
	const { default: chat } = await import("@/i18n/locales/en/chat.json")
	return {
		useAppTranslation: () => ({
			t: (key: string) => {
				if (key === "chat:thinkingEffort.levels.xhigh") return chat.thinkingEffort.levels.xhigh
				if (key === "chat:thinkingEffort.levels.max") return chat.thinkingEffort.levels.max
				return key
			},
		}),
	}
})

const claude = { vendor: "copilot", family: "claude-opus-5" }
const gpt = { vendor: "copilot", family: "gpt-5.5" }
const configuration: ProviderSettings = {
	apiProvider: "vscode-lm",
	vsCodeLmModelSelector: claude,
	vsCodeLmModelEfforts: {
		[getVsCodeLmEffortKey(claude)!]: "high",
		[getVsCodeLmEffortKey(gpt)!]: "low",
	},
}
const models: ExtensionMessage = {
	type: "vsCodeLmModels",
	vsCodeLmModels: [
		{ ...claude, effortLevels: ["low", "medium", "high", "xhigh", "max"] },
		{ ...gpt, effortLevels: ["none", "low", "medium", "high", "xhigh"] },
		{ vendor: "copilot", family: "gpt-4o", effortLevels: [] },
	],
}
function receive(message: ExtensionMessage) {
	act(() => {
		window.dispatchEvent(new MessageEvent("message", { data: message }))
	})
}
function select(value: string) {
	fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" })
	fireEvent.click(screen.getByRole("option", { name: `chat:thinkingEffort.levels.${value}` }))
}

describe("ThinkingEffortSelector", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("waits for capabilities and hides unsupported models", () => {
		const { rerender } = render(<ThinkingEffortSelector apiConfiguration={configuration} profileName="Work" />)
		expect(screen.queryByRole("combobox")).not.toBeInTheDocument()
		receive(models)
		expect(screen.getByRole("combobox")).toHaveTextContent("chat:thinkingEffort.levels.high")
		rerender(
			<ThinkingEffortSelector
				apiConfiguration={{ ...configuration, vsCodeLmModelSelector: { vendor: "copilot", family: "gpt-4o" } }}
				profileName="Work"
			/>,
		)
		expect(screen.queryByRole("combobox")).not.toBeInTheDocument()
	})

	it("restores each model's saved effort after a model switch", () => {
		const { rerender } = render(<ThinkingEffortSelector apiConfiguration={configuration} profileName="Work" />)
		receive(models)
		rerender(
			<ThinkingEffortSelector
				apiConfiguration={{ ...configuration, vsCodeLmModelSelector: gpt }}
				profileName="Work"
			/>,
		)
		expect(screen.getByRole("combobox")).toHaveTextContent("chat:thinkingEffort.levels.low")
		rerender(<ThinkingEffortSelector apiConfiguration={configuration} profileName="Work" />)
		expect(screen.getByRole("combobox")).toHaveTextContent("chat:thinkingEffort.levels.high")
	})

	it("sends a narrow update and waits for the saved state", () => {
		const { rerender } = render(<ThinkingEffortSelector apiConfiguration={configuration} profileName="Work" />)
		receive(models)
		select("low")
		const request = vi.mocked(vscode.postMessage).mock.calls.at(-1)![0]
		expect(request).toEqual({
			type: "setVsCodeLmEffort",
			text: "Work",
			requestId: expect.any(String),
			vsCodeLmEffortSelection: { ...claude, effort: "low" },
		})
		expect(screen.getByRole("combobox")).toBeDisabled()
		expect(screen.getByRole("combobox")).toHaveTextContent("chat:thinkingEffort.levels.high")
		receive({ type: "vsCodeLmEffortSaved", requestId: "unrelated", success: true })
		expect(screen.getByRole("combobox")).toBeDisabled()
		rerender(
			<ThinkingEffortSelector
				apiConfiguration={{
					...configuration,
					vsCodeLmModelEfforts: { [getVsCodeLmEffortKey(claude)!]: "low" },
				}}
				profileName="Work"
			/>,
		)
		receive({ type: "vsCodeLmEffortSaved", requestId: request.requestId, success: true })
		expect(screen.getByRole("combobox")).toBeEnabled()
		expect(screen.getByRole("combobox")).toHaveTextContent("chat:thinkingEffort.levels.low")
	})

	it("sends Default to clear the current model override", () => {
		render(<ThinkingEffortSelector apiConfiguration={configuration} profileName="Work" />)
		receive(models)
		select("default")
		expect(vscode.postMessage).toHaveBeenLastCalledWith(
			expect.objectContaining({
				vsCodeLmEffortSelection: { ...claude, effort: "default" },
			}),
		)
	})

	it("keeps the saved value and reports a failed save", () => {
		render(<ThinkingEffortSelector apiConfiguration={configuration} profileName="Work" />)
		receive(models)
		select("low")
		const request = vi.mocked(vscode.postMessage).mock.calls.at(-1)![0]
		receive({ type: "vsCodeLmEffortSaved", requestId: request.requestId, success: false })
		expect(screen.getByRole("combobox")).toHaveTextContent("chat:thinkingEffort.levels.high")
		expect(screen.getByRole("combobox")).toBeEnabled()
		expect(screen.getByRole("alert")).toHaveAttribute("aria-label", "chat:thinkingEffort.saveFailed")
	})

	it("ignores a save response for a previous model", () => {
		const { rerender } = render(<ThinkingEffortSelector apiConfiguration={configuration} profileName="Work" />)
		receive(models)
		select("low")
		const request = vi.mocked(vscode.postMessage).mock.calls.at(-1)![0]
		rerender(
			<ThinkingEffortSelector
				apiConfiguration={{ ...configuration, vsCodeLmModelSelector: gpt }}
				profileName="Work"
			/>,
		)
		receive({ type: "vsCodeLmEffortSaved", requestId: request.requestId, success: false })
		expect(screen.queryByRole("alert")).not.toBeInTheDocument()
		expect(screen.getByRole("combobox")).toHaveTextContent("chat:thinkingEffort.levels.low")
	})

	it.each([
		["Extra High", "xhigh"],
		["Max", "max"],
	] as const)("sends the exact value for %s", (label, effort) => {
		render(<ThinkingEffortSelector apiConfiguration={configuration} profileName="Work" />)
		receive(models)
		fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" })
		expect(screen.getByRole("option", { name: "Extra High" })).toBeInTheDocument()
		expect(screen.getByRole("option", { name: "Max" })).toBeInTheDocument()
		fireEvent.click(screen.getByRole("option", { name: label }))
		expect(vscode.postMessage).toHaveBeenLastCalledWith(
			expect.objectContaining({
				vsCodeLmEffortSelection: { ...claude, effort },
			}),
		)
	})

	it("shows GPT's options without Claude's Max level", () => {
		render(
			<ThinkingEffortSelector
				apiConfiguration={{ ...configuration, vsCodeLmModelSelector: gpt }}
				profileName="Work"
			/>,
		)
		receive(models)
		fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" })
		expect(screen.getByRole("option", { name: "Extra High" })).toBeInTheDocument()
		expect(screen.queryByRole("option", { name: "Max" })).not.toBeInTheDocument()
	})

	it("respects the disabled state", () => {
		render(<ThinkingEffortSelector apiConfiguration={configuration} profileName="Work" disabled />)
		receive(models)
		expect(screen.getByRole("combobox")).toBeDisabled()
	})
})
