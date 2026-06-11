/**
 * One-click migration of pre-rename Roo Code configuration to KitPilot paths.
 *
 * The 0.1.18 Roo→KitPilot rename was a hard switch: `.roo`/`.rooignore`/
 * `.roomodes` stopped being read, so pre-release testers upgrading past the
 * rename silently lost their setups. On activation we detect legacy artifacts
 * whose KitPilot equivalent doesn't exist yet and offer to copy them over.
 *
 * Copies (never moves) so the user can roll back to an older build — same
 * precedent as the custom_modes.json → YAML migration. `.roorules` is NOT
 * migrated: rules files still honor the legacy names at read time
 * (see core/prompts/sections/custom-instructions.ts).
 */

import { constants as fsConstants } from "fs"
import * as fs from "fs/promises"
import * as os from "os"
import * as path from "path"

import * as vscode from "vscode"

import { fileExistsAtPath } from "./fs"

export interface LegacyMigrationItem {
	from: string
	to: string
	kind: "dir" | "file"
	/** Short human-readable name shown in notifications/logs, e.g. ".rooignore". */
	label: string
}

const DISMISS_KEY = "legacyRooMigrationDismissed"

/**
 * Find legacy Roo artifacts that have no KitPilot counterpart yet. When both
 * old and new exist we leave them alone — the user already migrated (or
 * started fresh) and merging would be guesswork.
 */
export async function detectLegacyRooArtifacts(
	homeDir: string = os.homedir(),
	workspaceDir?: string,
): Promise<LegacyMigrationItem[]> {
	const candidates: LegacyMigrationItem[] = [
		{
			from: path.join(homeDir, ".roo"),
			to: path.join(homeDir, ".kitpilot"),
			kind: "dir",
			label: "~/.roo",
		},
	]

	if (workspaceDir) {
		candidates.push(
			{
				from: path.join(workspaceDir, ".roo"),
				to: path.join(workspaceDir, ".kitpilot"),
				kind: "dir",
				label: ".roo",
			},
			{
				from: path.join(workspaceDir, ".rooignore"),
				to: path.join(workspaceDir, ".kitpilotignore"),
				kind: "file",
				label: ".rooignore",
			},
			{
				from: path.join(workspaceDir, ".roomodes"),
				to: path.join(workspaceDir, ".kitpilotmodes"),
				kind: "file",
				label: ".roomodes",
			},
		)
	}

	const detected: LegacyMigrationItem[] = []
	for (const item of candidates) {
		if ((await fileExistsAtPath(item.from)) && !(await fileExistsAtPath(item.to))) {
			detected.push(item)
		}
	}
	return detected
}

export interface MigrationOutcome {
	migrated: LegacyMigrationItem[]
	failed: Array<{ item: LegacyMigrationItem; error: string }>
}

/**
 * Copy each detected artifact to its KitPilot path. Originals are preserved.
 */
export async function copyLegacyArtifacts(items: LegacyMigrationItem[]): Promise<MigrationOutcome> {
	const outcome: MigrationOutcome = { migrated: [], failed: [] }

	for (const item of items) {
		try {
			if (item.kind === "dir") {
				await fs.cp(item.from, item.to, { recursive: true, force: false, errorOnExist: true })
			} else {
				await fs.copyFile(item.from, item.to, fsConstants.COPYFILE_EXCL)
			}
			outcome.migrated.push(item)
		} catch (error) {
			outcome.failed.push({ item, error: error instanceof Error ? error.message : String(error) })
		}
	}

	return outcome
}

/**
 * Activation hook: prompt once per detection (suppressed permanently via
 * "Don't Ask Again"). Never throws — migration must not break activation.
 */
export async function maybePromptLegacyRooMigration(
	context: vscode.ExtensionContext,
	outputChannel: vscode.OutputChannel,
): Promise<void> {
	try {
		if (context.globalState.get<boolean>(DISMISS_KEY)) {
			return
		}

		const workspaceDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
		const items = await detectLegacyRooArtifacts(os.homedir(), workspaceDir)
		if (items.length === 0) {
			return
		}

		const labels = items.map((item) => item.label).join(", ")
		const choice = await vscode.window.showInformationMessage(
			`KitPilot found Roo Code configuration that is no longer read (${labels}). Copy it to the new KitPilot locations? Originals are kept.`,
			"Migrate",
			"Don't Ask Again",
		)

		if (choice === "Don't Ask Again") {
			await context.globalState.update(DISMISS_KEY, true)
			outputChannel.appendLine("[Legacy Roo Migration] User dismissed migration permanently")
			return
		}

		if (choice !== "Migrate") {
			// Dismissed without choosing — ask again next activation.
			return
		}

		const outcome = await copyLegacyArtifacts(items)
		for (const item of outcome.migrated) {
			outputChannel.appendLine(`[Legacy Roo Migration] Copied ${item.from} -> ${item.to}`)
		}
		for (const { item, error } of outcome.failed) {
			outputChannel.appendLine(`[Legacy Roo Migration] FAILED ${item.from} -> ${item.to}: ${error}`)
		}

		if (outcome.failed.length > 0) {
			vscode.window.showWarningMessage(
				`KitPilot migrated ${outcome.migrated.length} of ${items.length} item(s); ${outcome.failed.length} failed — see the KitPilot output channel.`,
			)
			return
		}

		const reload = await vscode.window.showInformationMessage(
			`KitPilot migrated ${outcome.migrated.length} item(s) (${labels}). Reload the window so everything picks up the new config.`,
			"Reload Window",
		)
		if (reload === "Reload Window") {
			await vscode.commands.executeCommand("workbench.action.reloadWindow")
		}
	} catch (error) {
		outputChannel.appendLine(`[Legacy Roo Migration] Error: ${error}`)
	}
}
