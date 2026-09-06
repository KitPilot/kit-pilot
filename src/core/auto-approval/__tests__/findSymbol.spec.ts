import { describe, expect, it } from "vitest"

import type { ClineSayTool } from "@kit-pilot/types"

import { isReadOnlyToolAction, isWriteToolAction } from "../tools"
import { getCommandDecision } from "../commands"

describe("find_symbol auto-approval", () => {
	// The tool reads and never writes. Without this, `alwaysAllowReadOnly` does
	// not cover it, so every lookup waits for a person. An unattended run then
	// stalls until it times out.
	it("counts findSymbol as a read-only action", () => {
		expect(isReadOnlyToolAction({ tool: "findSymbol" } as ClineSayTool)).toBe(true)
	})

	it("does not count findSymbol as a write action", () => {
		expect(isWriteToolAction({ tool: "findSymbol" } as ClineSayTool)).toBe(false)
	})
})

describe("command approval the evaluation harness depends on", () => {
	// `alwaysAllowExecute` alone approves nothing: an empty allowlist denies
	// every command. The evaluation harness sets a wildcard allowlist for its
	// throwaway workspace, and these pin the behavior it relies on.
	it("approves nothing when the allowlist is empty", () => {
		expect(getCommandDecision("node test/run.js", [], [])).not.toBe("auto_approve")
	})

	it("approves a fixture command under a wildcard allowlist", () => {
		expect(getCommandDecision("node test/run.js", ["*"], [])).toBe("auto_approve")
	})

	it("approves the other fixture command under a wildcard allowlist", () => {
		expect(getCommandDecision("node src/index.js", ["*"], [])).toBe("auto_approve")
	})
})
