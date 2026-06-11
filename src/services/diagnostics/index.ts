/**
 * KitPilot diagnostics.
 *
 * Health checks for the failure modes that all present to the user as the
 * same symptom — chat silently stuck on "API request…":
 *
 *   - Copilot / VS Code LM models unavailable (dead handle, not signed in,
 *     Copilot extension broken)
 *   - ripgrep binary not found in the VS Code installation
 *   - hooks.json present but unparseable (the loader silently ignores it)
 *   - memory directory unwritable
 *
 * Check functions are dependency-injected / path-parameterized so they can be
 * unit-tested without a live VS Code. The vscode wiring lives in `command.ts`.
 */

import { constants as fsConstants } from "fs"
import * as fs from "fs/promises"
import * as path from "path"

import { getBinPath } from "../ripgrep"
import { getGlobalKitPilotDirectory, getProjectKitPilotDirectoryForCwd, readFileIfExists } from "../kitpilot-config"
import { validateHooksText } from "../hooks/validation"
import { getMemoryDir } from "../../core/tools/memoryStore"

export type DiagnosticStatus = "pass" | "warn" | "fail" | "info"

export interface DiagnosticResult {
	id: string
	label: string
	status: DiagnosticStatus
	summary: string
	details?: string[]
}

/**
 * Minimal shape of `vscode.LanguageModelChat` that the model check needs.
 */
export interface LanguageModelLike {
	id: string
	vendor: string
	family: string
	version?: string
	name?: string
}

export type SelectChatModelsFn = (selector: Record<string, unknown>) => Thenable<LanguageModelLike[] | undefined>

/**
 * Subset of `vscode.LanguageModelChatSelector` — every field is an exact-match
 * filter against the corresponding model property.
 */
export interface ModelSelectorLike {
	vendor?: string
	family?: string
	id?: string
	version?: string
}

/**
 * Check that the VS Code Language Model API is present and that at least one
 * chat model is registered. Zero models is the classic "Copilot is broken /
 * not signed in" state — KitPilot cannot do anything until this passes.
 */
export async function checkLanguageModels(
	selectChatModels: SelectChatModelsFn | undefined,
	configuredSelector?: ModelSelectorLike,
): Promise<DiagnosticResult[]> {
	const label = "Language models (GitHub Copilot)"

	if (typeof selectChatModels !== "function") {
		return [
			{
				id: "lm-api",
				label,
				status: "fail",
				summary: "The VS Code Language Model API is not available in this VS Code build.",
				details: ["KitPilot requires VS Code 1.107+ with the Language Model API enabled."],
			},
		]
	}

	let models: LanguageModelLike[]
	try {
		models = (await selectChatModels({})) ?? []
	} catch (error) {
		return [
			{
				id: "lm-models",
				label,
				status: "fail",
				summary: `Querying language models failed: ${error instanceof Error ? error.message : String(error)}`,
				details: [
					"This usually means the GitHub Copilot extension is broken or mid-restart.",
					"Try: reload the window, then check the Copilot status icon in the status bar.",
				],
			},
		]
	}

	if (models.length === 0) {
		return [
			{
				id: "lm-models",
				label,
				status: "fail",
				summary: "No language models are available — KitPilot cannot send any requests.",
				details: [
					"This is a Copilot-side problem, not a KitPilot bug. In order of likelihood:",
					"1. The GitHub Copilot extension is not installed or is disabled.",
					"2. You are not signed in to GitHub (check Accounts in the Activity Bar).",
					"3. Copilot is still starting up — wait a few seconds and re-run diagnostics.",
					"4. Your organization blocks Copilot on this machine.",
				],
			},
		]
	}

	const results: DiagnosticResult[] = []
	const modelList = models.map((m) => `${m.vendor} / ${m.family}${m.version ? ` (${m.version})` : ""}`)
	results.push({
		id: "lm-models",
		label,
		status: "pass",
		summary: `${models.length} model${models.length === 1 ? "" : "s"} available.`,
		details: modelList.slice(0, 20),
	})

	const selectorEntries = Object.entries(configuredSelector ?? {}).filter(
		([, value]) => typeof value === "string" && value.length > 0,
	) as Array<[keyof ModelSelectorLike & string, string]>

	if (selectorEntries.length > 0) {
		const matches = models.filter((model) => selectorEntries.every(([key, value]) => model[key] === value))
		const selectorText = selectorEntries.map(([key, value]) => `${key}=${value}`).join(", ")
		if (matches.length === 0) {
			results.push({
				id: "lm-selector",
				label: "Configured model",
				status: "warn",
				summary: `The configured model selector (${selectorText}) matches none of the available models.`,
				details: [
					"KitPilot will fall back to the first model Copilot offers, which may not be the one you expect.",
					"Re-pick the model in KitPilot settings.",
				],
			})
		} else {
			results.push({
				id: "lm-selector",
				label: "Configured model",
				status: "pass",
				summary: `Configured selector (${selectorText}) resolves to ${matches[0].vendor} / ${matches[0].family}.`,
			})
		}
	}

	return results
}

/**
 * Check that the ripgrep binary ships with this VS Code installation, using
 * the same lookup KitPilot's search tools use (`getBinPath`). A miss here is
 * exactly the 0.1.19 "stuck on API request" bug.
 */
export async function checkRipgrep(appRoot: string | undefined): Promise<DiagnosticResult> {
	const label = "ripgrep binary"

	if (!appRoot) {
		return {
			id: "ripgrep",
			label,
			status: "warn",
			summary: "Could not determine the VS Code installation root, so the ripgrep lookup was skipped.",
		}
	}

	const binPath = await getBinPath(appRoot)
	if (!binPath) {
		return {
			id: "ripgrep",
			label,
			status: "fail",
			summary:
				"ripgrep was not found in this VS Code installation — file search and codebase search will hang or fail.",
			details: [
				`Searched under: ${appRoot}/node_modules[.asar.unpacked]/@vscode/ripgrep-universal, @vscode/ripgrep, vscode-ripgrep`,
				"This can happen when VS Code changes where it ships ripgrep. Please report it with your VS Code version.",
			],
		}
	}

	return {
		id: "ripgrep",
		label,
		status: "pass",
		summary: `Found at ${binPath}`,
	}
}

/**
 * Validate a single hooks.json file via the shared hooks validator. The
 * runtime loader (`parseHooksJson`) silently treats an unparseable file as
 * "no hooks" — this check is where that failure becomes visible on demand.
 */
export async function checkHooksFile(filePath: string, label: string): Promise<DiagnosticResult> {
	const id = `hooks:${filePath}`
	const validation = validateHooksText(await readFileIfExists(filePath))

	if (!validation.exists) {
		return {
			id,
			label,
			status: "info",
			summary: `Not present (${filePath}) — no hooks configured here.`,
		}
	}

	if (validation.parseError) {
		return {
			id,
			label,
			status: "fail",
			summary: `${filePath} is invalid: ${validation.parseError}`,
			details: ["KitPilot silently ignores unparseable hooks files — the hooks in this file are NOT running."],
		}
	}

	if (validation.problems.length > 0) {
		return {
			id,
			label,
			status: "warn",
			summary: `${filePath} parsed, but has ${validation.problems.length} problem${validation.problems.length === 1 ? "" : "s"}.`,
			details: validation.problems,
		}
	}

	return {
		id,
		label,
		status: "pass",
		summary:
			validation.groupCounts.length > 0
				? `${filePath}: ${validation.groupCounts.join(", ")}.`
				: `${filePath}: parsed, but defines no hooks.`,
	}
}

/**
 * Check the global and (when a workspace is open) project hooks files.
 */
export async function checkHooksConfigs(cwd: string | undefined): Promise<DiagnosticResult[]> {
	const checks = [checkHooksFile(path.join(getGlobalKitPilotDirectory(), "hooks.json"), "Hooks (global)")]
	if (cwd) {
		checks.push(checkHooksFile(path.join(getProjectKitPilotDirectoryForCwd(cwd), "hooks.json"), "Hooks (project)"))
	}
	return Promise.all(checks)
}

/**
 * Check the persistent-memory directory: present, writable, indexed.
 */
export async function checkMemory(memoryDir: string = getMemoryDir()): Promise<DiagnosticResult> {
	const label = "Persistent memory"

	try {
		await fs.stat(memoryDir)
	} catch {
		return {
			id: "memory",
			label,
			status: "info",
			summary: `Memory directory does not exist yet (${memoryDir}) — it is created the first time the agent saves a memory.`,
		}
	}

	try {
		await fs.access(memoryDir, fsConstants.W_OK)
	} catch {
		return {
			id: "memory",
			label,
			status: "fail",
			summary: `Memory directory exists but is not writable (${memoryDir}) — remember_this will fail.`,
			details: ["Check the directory's permissions and ownership."],
		}
	}

	const entries = await fs.readdir(memoryDir)
	const memoryFiles = entries.filter((name) => name.endsWith(".md") && name !== "MEMORY.md")
	const hasIndex = entries.includes("MEMORY.md")

	if (memoryFiles.length > 0 && !hasIndex) {
		return {
			id: "memory",
			label,
			status: "warn",
			summary: `${memoryFiles.length} memory file${memoryFiles.length === 1 ? "" : "s"} found, but the MEMORY.md index is missing — saved memories are not being loaded into prompts.`,
			details: [`Directory: ${memoryDir}`],
		}
	}

	return {
		id: "memory",
		label,
		status: "pass",
		summary: `${memoryFiles.length} memor${memoryFiles.length === 1 ? "y" : "ies"} stored${hasIndex ? ", index present" : ""} (${memoryDir}).`,
	}
}

const STATUS_ICON: Record<DiagnosticStatus, string> = {
	pass: "✅",
	warn: "⚠️",
	fail: "❌",
	info: "ℹ️",
}

/**
 * Render the report opened in the editor after running diagnostics.
 */
export function formatDiagnosticsReport(environment: Record<string, string>, results: DiagnosticResult[]): string {
	const counts = { pass: 0, warn: 0, fail: 0, info: 0 }
	for (const result of results) counts[result.status]++

	const lines: string[] = []
	lines.push("# KitPilot Diagnostics")
	lines.push("")
	lines.push(`Generated: ${new Date().toISOString()}`)
	lines.push("")

	for (const [key, value] of Object.entries(environment)) {
		lines.push(`- **${key}:** ${value}`)
	}
	lines.push("")

	const summaryParts = [`${counts.pass} passed`]
	if (counts.warn > 0) summaryParts.push(`${counts.warn} warning${counts.warn === 1 ? "" : "s"}`)
	if (counts.fail > 0) summaryParts.push(`${counts.fail} failed`)
	lines.push(
		counts.fail > 0
			? `**${STATUS_ICON.fail} ${summaryParts.join(", ")}.** See the failed checks below for what to fix.`
			: counts.warn > 0
				? `**${STATUS_ICON.warn} ${summaryParts.join(", ")}.**`
				: `**${STATUS_ICON.pass} All checks passed** (${summaryParts.join(", ")}).`,
	)
	lines.push("")

	for (const result of results) {
		lines.push(`## ${STATUS_ICON[result.status]} ${result.label}`)
		lines.push("")
		lines.push(result.summary)
		if (result.details && result.details.length > 0) {
			lines.push("")
			for (const detail of result.details) {
				lines.push(`- ${detail}`)
			}
		}
		lines.push("")
	}

	return lines.join("\n")
}
