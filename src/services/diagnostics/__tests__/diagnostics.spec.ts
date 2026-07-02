import * as fs from "fs/promises"
import * as os from "os"
import * as path from "path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
	checkHooksFile,
	checkLanguageModels,
	checkMemory,
	checkUsageShare,
	formatDiagnosticsReport,
	type DiagnosticResult,
	type LanguageModelLike,
} from "../index"

const model = (vendor: string, family: string, extra: Partial<LanguageModelLike> = {}): LanguageModelLike => ({
	id: `${vendor}-${family}`,
	vendor,
	family,
	...extra,
})

describe("diagnostics/checkLanguageModels", () => {
	it("fails when the LM API is unavailable", async () => {
		const results = await checkLanguageModels(undefined)
		expect(results).toHaveLength(1)
		expect(results[0].status).toBe("fail")
		expect(results[0].summary).toContain("Language Model API")
	})

	it("fails when selectChatModels throws", async () => {
		const results = await checkLanguageModels(async () => {
			throw new Error("token expired")
		})
		expect(results).toHaveLength(1)
		expect(results[0].status).toBe("fail")
		expect(results[0].summary).toContain("token expired")
	})

	it("fails with Copilot guidance when zero models are available", async () => {
		const results = await checkLanguageModels(async () => [])
		expect(results).toHaveLength(1)
		expect(results[0].status).toBe("fail")
		expect(results[0].details?.join("\n")).toContain("Copilot")
	})

	it("passes and lists models when available", async () => {
		const results = await checkLanguageModels(async () => [
			model("copilot", "claude-sonnet-4"),
			model("copilot", "gpt-4o-mini"),
		])
		expect(results).toHaveLength(1)
		expect(results[0].status).toBe("pass")
		expect(results[0].summary).toContain("2 models")
		expect(results[0].details).toContain("copilot / claude-sonnet-4")
	})

	it("warns when the configured selector matches no model", async () => {
		const results = await checkLanguageModels(async () => [model("copilot", "gpt-4o-mini")], {
			vendor: "copilot",
			family: "claude-sonnet-4",
		})
		const selectorResult = results.find((r) => r.id === "lm-selector")
		expect(selectorResult?.status).toBe("warn")
		expect(selectorResult?.summary).toContain("family=claude-sonnet-4")
	})

	it("passes the selector check when a model matches", async () => {
		const results = await checkLanguageModels(async () => [model("copilot", "claude-sonnet-4")], {
			vendor: "copilot",
			family: "claude-sonnet-4",
		})
		const selectorResult = results.find((r) => r.id === "lm-selector")
		expect(selectorResult?.status).toBe("pass")
	})

	it("skips the selector check when the selector is empty", async () => {
		const results = await checkLanguageModels(async () => [model("copilot", "gpt-4o-mini")], {})
		expect(results.find((r) => r.id === "lm-selector")).toBeUndefined()
	})
})

describe("diagnostics/checkHooksFile", () => {
	let dir: string

	beforeEach(async () => {
		dir = await fs.mkdtemp(path.join(os.tmpdir(), "kitpilot-diag-hooks-"))
	})

	afterEach(async () => {
		await fs.rm(dir, { recursive: true, force: true })
	})

	const hooksPath = () => path.join(dir, "hooks.json")

	it("reports info when the file is absent", async () => {
		const result = await checkHooksFile(hooksPath(), "Hooks (global)")
		expect(result.status).toBe("info")
	})

	it("fails loudly on a JSON parse error", async () => {
		await fs.writeFile(hooksPath(), '{ "PreToolUse": [ trailing')
		const result = await checkHooksFile(hooksPath(), "Hooks (global)")
		expect(result.status).toBe("fail")
		expect(result.details?.join("\n")).toContain("NOT running")
	})

	it("fails when the root is not an object", async () => {
		await fs.writeFile(hooksPath(), "[1, 2, 3]")
		const result = await checkHooksFile(hooksPath(), "Hooks (global)")
		expect(result.status).toBe("fail")
	})

	it("warns on unknown event types", async () => {
		await fs.writeFile(hooksPath(), JSON.stringify({ "post-edit": [] }))
		const result = await checkHooksFile(hooksPath(), "Hooks (global)")
		expect(result.status).toBe("warn")
		expect(result.details?.join("\n")).toContain('"post-edit"')
	})

	it("warns on groups with no hooks array and hooks missing a command", async () => {
		await fs.writeFile(
			hooksPath(),
			JSON.stringify({
				PreToolUse: [{ matcher: "*" }, { matcher: "execute_command", hooks: [{ type: "command" }] }],
			}),
		)
		const result = await checkHooksFile(hooksPath(), "Hooks (global)")
		expect(result.status).toBe("warn")
		const text = result.details?.join("\n") ?? ""
		expect(text).toContain('no "hooks" array')
		expect(text).toContain('missing a "command"')
	})

	it("passes a valid config and reports group counts", async () => {
		await fs.writeFile(
			hooksPath(),
			JSON.stringify({
				PreToolUse: [{ matcher: "*", hooks: [{ type: "command", command: "exit 0" }] }],
				PostToolUse: [{ matcher: ".ts", hooks: [{ command: "pnpm tsc" }] }],
			}),
		)
		const result = await checkHooksFile(hooksPath(), "Hooks (global)")
		expect(result.status).toBe("pass")
		expect(result.summary).toContain("PreToolUse×1")
		expect(result.summary).toContain("PostToolUse×1")
	})
})

describe("diagnostics/checkMemory", () => {
	let dir: string

	beforeEach(async () => {
		dir = await fs.mkdtemp(path.join(os.tmpdir(), "kitpilot-diag-memory-"))
	})

	afterEach(async () => {
		await fs.rm(dir, { recursive: true, force: true })
	})

	it("reports info when the directory does not exist", async () => {
		const result = await checkMemory(path.join(dir, "does-not-exist"))
		expect(result.status).toBe("info")
	})

	it("warns when memories exist but the index is missing", async () => {
		await fs.writeFile(path.join(dir, "some-fact.md"), "body")
		const result = await checkMemory(dir)
		expect(result.status).toBe("warn")
		expect(result.summary).toContain("MEMORY.md")
	})

	it("passes when memories and index are present", async () => {
		await fs.writeFile(path.join(dir, "some-fact.md"), "body")
		await fs.writeFile(path.join(dir, "MEMORY.md"), "# index")
		const result = await checkMemory(dir)
		expect(result.status).toBe("pass")
		expect(result.summary).toContain("1 memory")
	})

	it("passes on an empty existing directory", async () => {
		const result = await checkMemory(dir)
		expect(result.status).toBe("pass")
		expect(result.summary).toContain("0 memories")
	})
})

describe("diagnostics/checkUsageShare", () => {
	it("reports info with a pointer to the file when nothing is recorded", () => {
		const result = checkUsageShare({}, "2026-07-02T00:00:00.000Z", "/home/u/.kitpilot/usage-metrics.json")
		expect(result.status).toBe("info")
		expect(result.summary).toContain("No token usage recorded yet")
		expect(result.details?.join("\n")).toContain("/home/u/.kitpilot/usage-metrics.json")
	})

	it("lists purposes sorted by share with token, call, and window details", () => {
		const breakdown = {
			condense: {
				calls: 3,
				inputTokens: 30000,
				outputTokens: 500,
				cacheReadTokens: 12000,
				cost: 0.42,
				tokenSharePct: 60.4,
			},
			main: {
				calls: 10,
				inputTokens: 19000,
				outputTokens: 1000,
				cacheReadTokens: 0,
				cost: 0,
				tokenSharePct: 39.6,
			},
		}
		const result = checkUsageShare(breakdown, "2026-07-01T09:00:00.000Z", "/home/u/.kitpilot/usage-metrics.json")
		expect(result.status).toBe("info")
		const details = result.details ?? []
		// Sorted by share: condense first.
		expect(details[0]).toContain("condense")
		expect(details[0]).toContain("60.4%")
		expect(details[0]).toContain("30,000 in / 500 out")
		expect(details[0]).toContain("3 calls")
		expect(details[0]).toContain("12,000 cache-read")
		expect(details[0]).toContain("$0.42")
		expect(details[1]).toContain("main")
		expect(details.join("\n")).toContain("2026-07-01T09:00:00.000Z")
		expect(details.join("\n")).toContain("/home/u/.kitpilot/usage-metrics.json")
	})
})

describe("diagnostics/formatDiagnosticsReport", () => {
	const results: DiagnosticResult[] = [
		{ id: "a", label: "Check A", status: "pass", summary: "fine" },
		{ id: "b", label: "Check B", status: "fail", summary: "broken", details: ["fix it"] },
		{ id: "c", label: "Check C", status: "warn", summary: "meh" },
	]

	it("includes environment, summary counts, and every check", () => {
		const report = formatDiagnosticsReport({ KitPilot: "0.1.19", "VS Code": "1.101.0" }, results)
		expect(report).toContain("# KitPilot Diagnostics")
		expect(report).toContain("**KitPilot:** 0.1.19")
		expect(report).toContain("1 passed, 1 warning, 1 failed")
		expect(report).toContain("## ✅ Check A")
		expect(report).toContain("## ❌ Check B")
		expect(report).toContain("- fix it")
		expect(report).toContain("## ⚠️ Check C")
	})

	it("reports all-clear when nothing failed or warned", () => {
		const report = formatDiagnosticsReport({}, [{ id: "a", label: "A", status: "pass", summary: "ok" }])
		expect(report).toContain("All checks passed")
	})
})
