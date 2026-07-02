/**
 * VS Code wiring for the "KitPilot: Run Diagnostics" command. The actual
 * checks live in `./index.ts` and are kept free of vscode state so they can
 * be unit-tested.
 */

import * as vscode from "vscode"

import { Package } from "../../shared/package"
import { getWorkspacePath } from "../../utils/path"
import type { ClineProvider } from "../../core/webview/ClineProvider"
import {
	checkHooksConfigs,
	checkLanguageModels,
	checkMemory,
	checkRipgrep,
	checkUsageShare,
	formatDiagnosticsReport,
	type DiagnosticResult,
	type ModelSelectorLike,
	type SelectChatModelsFn,
} from "./index"

/**
 * Built-in guard settings are worth surfacing in the report: "why is my
 * completion blocked" is usually one of these.
 */
function guardSettingsResult(): DiagnosticResult {
	const config = vscode.workspace.getConfiguration("kit-pilot")
	const verifyCommand = config.get<string>("verifyCommand", "").trim()
	const destructiveGuard = config.get<string>("destructiveCommandGuard", "ask")
	const forcePushGuard = config.get<string>("forcePushGuard", "ask")

	return {
		id: "guards",
		label: "Built-in guards",
		status: "info",
		summary: "Settings that can block or gate tool calls:",
		details: [
			`verifyCommand: ${verifyCommand ? `\`${verifyCommand}\` (runs before attempt_completion; non-zero exit blocks completion)` : "(not set)"}`,
			`destructiveCommandGuard: ${destructiveGuard}`,
			`forcePushGuard: ${forcePushGuard}`,
		],
	}
}

export async function runDiagnostics(provider: ClineProvider): Promise<void> {
	// The LM API is missing on VS Code builds older than the extension's
	// floor; access it defensively rather than crashing the command.
	const lm = (vscode as { lm?: { selectChatModels?: SelectChatModelsFn } }).lm
	const selectChatModels = lm?.selectChatModels ? lm.selectChatModels.bind(lm) : undefined

	let configuredSelector: ModelSelectorLike | undefined
	try {
		const state = await provider.getState()
		configuredSelector = state.apiConfiguration?.vsCodeLmModelSelector
	} catch {
		// State unavailable (e.g. mid-activation) — skip the selector check.
	}

	const cwd = getWorkspacePath()

	const results: DiagnosticResult[] = [
		...(await checkLanguageModels(selectChatModels, configuredSelector)),
		await checkRipgrep(vscode.env.appRoot),
		...(await checkHooksConfigs(cwd || undefined)),
		await checkMemory(),
		checkUsageShare(),
		guardSettingsResult(),
	]

	const report = formatDiagnosticsReport(
		{
			KitPilot: `${Package.version}${Package.sha ? ` (${Package.sha.slice(0, 7)})` : ""}`,
			"VS Code": vscode.version,
			Platform: `${process.platform} ${process.arch}`,
			Workspace: cwd || "(no folder open)",
		},
		results,
	)

	const document = await vscode.workspace.openTextDocument({ content: report, language: "markdown" })
	await vscode.window.showTextDocument(document, { preview: false })

	const failed = results.filter((r) => r.status === "fail").length
	const warned = results.filter((r) => r.status === "warn").length
	if (failed > 0) {
		vscode.window.showWarningMessage(
			`KitPilot diagnostics: ${failed} check${failed === 1 ? "" : "s"} failed — see the report for fixes.`,
		)
	} else if (warned > 0) {
		vscode.window.showInformationMessage(
			`KitPilot diagnostics: OK with ${warned} warning${warned === 1 ? "" : "s"}.`,
		)
	} else {
		vscode.window.showInformationMessage("KitPilot diagnostics: all checks passed.")
	}
}
