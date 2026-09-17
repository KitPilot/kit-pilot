import type { ProviderSettings, WebviewMessage } from "@kit-pilot/types"
import { getVsCodeLmEffortKey } from "@kit-pilot/types"

import type { ClineProvider } from "../ClineProvider"
import { setVsCodeLmEffort } from "../vscodeLmEffortHandler"

vi.mock("vscode", () => ({ version: "1.136.1" }))

describe("setVsCodeLmEffort", () => {
	const selector = { vendor: "copilot", family: "claude-opus-5" }
	const key = getVsCodeLmEffortKey(selector)!
	const otherKey = getVsCodeLmEffortKey({ vendor: "copilot", family: "gpt-5.5" })!
	const configuration: ProviderSettings = {
		apiProvider: "vscode-lm",
		vsCodeLmModelSelector: selector,
		vsCodeLmModelEfforts: { [key]: "low", [otherKey]: "medium" },
		modelTemperature: 0.7,
	}
	const makeProvider = () => ({
		getState: vi.fn().mockResolvedValue({ apiConfiguration: configuration, currentApiConfigName: "Work" }),
		upsertProviderProfile: vi.fn().mockResolvedValue("profile-id"),
		postMessageToWebview: vi.fn(),
		log: vi.fn(),
	})
	const request: WebviewMessage = {
		type: "setVsCodeLmEffort",
		text: "Work",
		requestId: "request-1",
		vsCodeLmEffortSelection: { ...selector, effort: "high" },
	}

	it("merges the change with the latest settings and applies the active profile", async () => {
		const provider = makeProvider()
		await setVsCodeLmEffort(provider as unknown as ClineProvider, request)
		expect(provider.upsertProviderProfile).toHaveBeenCalledWith("Work", {
			...configuration,
			vsCodeLmModelEfforts: { [key]: "high", [otherKey]: "medium" },
		})
		expect(provider.postMessageToWebview).toHaveBeenCalledWith({
			type: "vsCodeLmEffortSaved",
			requestId: "request-1",
			success: true,
		})
	})

	it("Default removes only this model's override", async () => {
		const provider = makeProvider()
		await setVsCodeLmEffort(provider as unknown as ClineProvider, {
			...request,
			vsCodeLmEffortSelection: { ...selector, effort: "default" },
		})
		expect(provider.upsertProviderProfile).toHaveBeenCalledWith("Work", {
			...configuration,
			vsCodeLmModelEfforts: { [otherKey]: "medium" },
		})
	})

	it.each([
		{ ...request, text: "Previous profile" },
		{ ...request, vsCodeLmEffortSelection: { vendor: "copilot", family: "gpt-4o", effort: "high" as const } },
		{ ...request, vsCodeLmEffortSelection: undefined },
		{ ...request, vsCodeLmEffortSelection: { ...selector, effort: "invalid" } as never },
	])("rejects stale or invalid selections", async (message) => {
		const provider = makeProvider()
		await setVsCodeLmEffort(provider as unknown as ClineProvider, message)
		expect(provider.upsertProviderProfile).not.toHaveBeenCalled()
		expect(provider.postMessageToWebview).toHaveBeenCalledWith(expect.objectContaining({ success: false }))
	})

	it.each([undefined, new Error("Cannot save")])("reports a failed save", async (result) => {
		const provider = makeProvider()
		if (result instanceof Error) provider.upsertProviderProfile.mockRejectedValue(result)
		else provider.upsertProviderProfile.mockResolvedValue(result)
		await setVsCodeLmEffort(provider as unknown as ClineProvider, request)
		expect(provider.postMessageToWebview).toHaveBeenCalledWith(expect.objectContaining({ success: false }))
	})
})
