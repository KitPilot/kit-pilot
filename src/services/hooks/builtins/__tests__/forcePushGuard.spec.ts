import { describe, expect, it } from "vitest"
import { HookEngine } from "../../HookEngine"
import { injectForcePushGuard } from "../../config"
import type { HooksConfigDict } from "../../registry"
import { detectForcePush, forcePushGuardHandler } from "../forcePushGuard"

describe("forcePushGuard / detector", () => {
	describe("positive matches", () => {
		it.each([
			["git push --force", "--force"],
			["git push origin main --force", "--force"],
			["git push --force-with-lease", "--force-with-lease"],
			["git push origin main --force-with-lease=origin/main", "--force-with-lease"],
			["git push --force-if-includes", "--force-if-includes"],
			["git push origin main -f", "-f"],
			["git push origin -F main", "-F"],
			["git push origin +main", "+refspec"],
			["git push origin +HEAD:refs/heads/main", "+refspec"],
		])("matches %s as %s", (command, expected) => {
			const result = detectForcePush(command)
			expect(result).not.toBeNull()
			expect(result?.patternName).toBe(expected)
		})

		it("reports the most-specific variant first (lease before --force)", () => {
			// --force-with-lease appears in the string, but `--force` would also
			// substring-match. Pattern order should pick the lease variant.
			const result = detectForcePush("git push --force-with-lease origin main")
			expect(result?.patternName).toBe("--force-with-lease")
		})
	})

	describe("false-positive guards", () => {
		it("returns null when 'push' is absent (prefilter)", () => {
			expect(detectForcePush("git status")).toBeNull()
			expect(detectForcePush("ls -la")).toBeNull()
		})

		it("ignores force-push string inside an echo argument", () => {
			expect(detectForcePush("echo 'git push --force'")).toBeNull()
		})

		it("returns null on a normal push", () => {
			expect(detectForcePush("git push origin main")).toBeNull()
			expect(detectForcePush("git push")).toBeNull()
			expect(detectForcePush("git push --set-upstream origin main")).toBeNull()
		})

		it("returns null on git commands that aren't push", () => {
			expect(detectForcePush("git push-mirror")).toBeNull() // not a real command, but no shell-boundary 'git push'
			expect(detectForcePush("git commit -m 'add push button'")).toBeNull()
		})
	})

	describe("compound commands", () => {
		it("matches git push -f after &&", () => {
			const result = detectForcePush("cd repo && git push -f origin main")
			expect(result?.patternName).toBe("-f")
		})

		it("matches git push --force after ;", () => {
			const result = detectForcePush("git status ; git push --force")
			expect(result?.patternName).toBe("--force")
		})
	})
})

describe("forcePushGuard / handler verdicts", () => {
	const baseEvent = {
		eventType: "PreToolUse" as const,
		toolName: "execute_command",
	}

	it("allows when no command arg is present", async () => {
		const verdict = await forcePushGuardHandler({ ...baseEvent, toolArgs: {} })
		expect(verdict).toEqual({ kind: "allow" })
	})

	it("allows benign commands", async () => {
		const verdict = await forcePushGuardHandler({
			...baseEvent,
			toolArgs: { command: "git status" },
		})
		expect(verdict).toEqual({ kind: "allow" })
	})

	it("asks with pattern details on a force push", async () => {
		const verdict = await forcePushGuardHandler({
			...baseEvent,
			toolArgs: { command: "git push --force" },
		})
		if (verdict.kind !== "ask") throw new Error(`expected ask, got ${verdict.kind}`)
		expect(verdict.approval.patternName).toBe("--force")
		expect(verdict.approval.subject).toBe("git push --force")
		expect(verdict.approval.reason).toContain("force push")
	})
})

describe("forcePushGuard / HookEngine integration", () => {
	function buildConfig(mode: "ask" | "off" = "ask"): HooksConfigDict {
		const config: HooksConfigDict = {}
		injectForcePushGuard(config, mode)
		return config
	}

	it("does not inject when mode=off", () => {
		expect(buildConfig("off").PreToolUse).toBeUndefined()
	})

	it("surfaces needsApproval on force-push commands", async () => {
		const engine = new HookEngine(buildConfig("ask"))
		const result = await engine.processEvent({
			eventType: "PreToolUse",
			toolName: "execute_command",
			toolArgs: { command: "git push -f origin main" },
		})
		expect(result.blocked).toBe(false)
		expect(result.needsApproval?.patternName).toBe("-f")
	})

	it("does not surface needsApproval on a normal push", async () => {
		const engine = new HookEngine(buildConfig("ask"))
		const result = await engine.processEvent({
			eventType: "PreToolUse",
			toolName: "execute_command",
			toolArgs: { command: "git push origin main" },
		})
		expect(result.needsApproval).toBeUndefined()
	})

	it("does not fire on non-execute_command tools", async () => {
		const engine = new HookEngine(buildConfig("ask"))
		const result = await engine.processEvent({
			eventType: "PreToolUse",
			toolName: "read_file",
			toolArgs: { command: "git push --force" },
		})
		expect(result.executedHooks).toBe(0)
	})
})
