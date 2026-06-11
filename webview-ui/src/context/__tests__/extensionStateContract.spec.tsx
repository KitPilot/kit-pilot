// Webview half of the webview <-> extension state contract.
//
// Hydrates the REAL ExtensionStateContext from the fixture committed by the
// extension-side spec (src/core/webview/__tests__/extensionStateContract.spec.ts,
// which serializes actual `getStateToPostToWebview()` output) and asserts the
// decisions the webview derives from it. Each assertion maps to a shipped bug
// that unit tests on either side missed:
//
//   - profile allowed        -> 0.1.20 ChatView "sending stuck disabled"
//   - image support derived  -> 0.1.15/0.1.16 image-button regressions
//   - model id resolution    -> 0.1.7 grey-icon registry drift
//   - welcome-screen gate    -> would lock users out of chat entirely
//
// If this fails after an extension-side state change, the wire format moved:
// regenerate the fixture (UPDATE_STATE_CONTRACT=1 on the src spec) and fix
// whichever side broke the contract.

import { render, act, renderHook } from "@/utils/test-utils"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import type { ExtensionState } from "@kit-pilot/types"
import { ProfileValidator } from "@kitpilot/ProfileValidator"
import { checkExistKey } from "@kitpilot/checkExistApiConfig"

import {
	ExtensionStateContextProvider,
	useExtensionState,
	type ExtensionStateContextType,
} from "../ExtensionStateContext"
import { useSelectedModel } from "@src/components/ui/hooks/useSelectedModel"

import fixtureJson from "../../../../src/core/webview/__tests__/__fixtures__/extension-state.contract.json"

const fixture = fixtureJson as unknown as ExtensionState

vi.mock("@src/utils/vscode", () => ({
	vscode: {
		postMessage: vi.fn(),
	},
}))

let captured: ExtensionStateContextType

const Probe = () => {
	captured = useExtensionState()
	return null
}

const hydrateFromFixture = () => {
	render(
		<ExtensionStateContextProvider>
			<Probe />
		</ExtensionStateContextProvider>,
	)

	act(() => {
		window.dispatchEvent(new MessageEvent("message", { data: { type: "state", state: fixture } }))
	})
}

describe("webview <- extension state contract", () => {
	it("hydrates and leaves the welcome screen", () => {
		hydrateFromFixture()

		expect(captured.didHydrateState).toBe(true)
		// checkExistKey must recognize the vscode-lm profile, or every user
		// gets stuck on the welcome screen.
		expect(checkExistKey(fixture.apiConfiguration)).toBe(true)
		expect(captured.showWelcome).toBe(false)
	})

	it("accepts the profile so sending is not disabled", () => {
		hydrateFromFixture()

		// ChatView computes isProfileDisabled from exactly this call; if it
		// returns false the input is permanently disabled (0.1.20 bug class).
		expect(ProfileValidator.isProfileAllowed(captured.apiConfiguration!, captured.organizationAllowList!)).toBe(
			true,
		)
	})

	it("derives a usable model with image support from the hydrated config", () => {
		hydrateFromFixture()

		const queryClient = new QueryClient()
		const { result } = renderHook(() => useSelectedModel(captured.apiConfiguration), {
			wrapper: ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
		})

		// vscode-lm needs no router fetches: the model must resolve immediately.
		expect(result.current.isLoading).toBe(false)
		expect(result.current.provider).toBe("vscode-lm")
		expect(result.current.id).toBe("copilot/claude-sonnet-4")
		// Derived via the shared substring rules, NOT the static registry —
		// "claude-sonnet-4" is intentionally absent from vscodeLlmModels keys,
		// which is exactly the lookup that broke the image button in 0.1.16.
		expect(result.current.info?.supportsImages).toBe(true)
	})

	it("preserves every field of the state message (no silent drops in merge)", () => {
		hydrateFromFixture()

		const state = captured as unknown as Record<string, unknown>
		const expected = fixture as unknown as Record<string, unknown>

		// mergeExtensionState intentionally MERGES these over webview defaults
		// instead of replacing them wholesale; assert that semantic instead.
		const mergedNotReplaced = new Set(["customModePrompts", "experiments"])
		for (const key of mergedNotReplaced) {
			expect({ key, value: state[key] }).toEqual({
				key,
				value: expect.objectContaining(expected[key] as Record<string, unknown>),
			})
		}

		// Everything else must round-trip through mergeExtensionState unchanged.
		// The key is included in the comparison so a failure names the field.
		for (const key of Object.keys(expected)) {
			if (mergedNotReplaced.has(key)) continue
			expect({ key, value: state[key] }).toEqual({ key, value: expected[key] })
		}
	})
})
