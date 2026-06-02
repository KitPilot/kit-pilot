/**
 * Destructive shell-command detection.
 *
 * Ported from code_puppy's plugins/destructive_command_guard/detector.py.
 * Pure regex, no LLM calls. Cheap substring prefilter → shell-boundary
 * check → first-match-wins pattern scan.
 *
 * Covers:
 *  - Unix/Linux: rm -rf root/home, git push --mirror, git clean -fd,
 *    git reset --hard, git checkout/restore ., DROP via SQL client,
 *    docker prune, accidental package publishes
 *  - Windows PowerShell: Remove-Item/ri, Format-Volume, Clear-Disk,
 *    registry deletion, Clear-RecycleBin, irm|iex remote-execute
 *  - Windows CMD: rd /s /q, del /s on system dirs, format, diskpart,
 *    bcdedit, reg delete
 */

import type { EventData } from "../types"
import type { BuiltinVerdict } from "./index"

export interface DestructiveCommandMatch {
	patternName: string
	description: string
}

// Matches shell operators that precede a new command in a pipeline/chain.
// E.g. "cd foo && rm -rf /" or "true || git reset --hard". The capture
// ensures the destructive keyword follows a real shell boundary.
const SHELL_OPERATOR_RE = /(?:^|&&|\|\||;|\|)\s*\w+/m

function isRealCommand(command: string): boolean {
	return SHELL_OPERATOR_RE.test(command)
}

// Cheap substring pre-filter — if none appear, skip the regex pass.
const PREFILTER_SUBSTRINGS: readonly string[] = [
	// Unix/Linux
	"rm",
	"git",
	"docker",
	"drop",
	"npm",
	"yarn",
	"twine",
	"psql",
	"mysql",
	"sqlite3",
	// Windows PowerShell (cmdlets and common aliases)
	"remove-item",
	" ri ",
	"ri ",
	" rmdir",
	"del ",
	"erase",
	"format-volume",
	"clear-disk",
	"remove-itemproperty",
	"clear-recyclebin",
	"invoke-expression",
	" irm ",
	"iex",
	"get-childitem",
	// Windows CMD
	"rd ",
	"format",
	"diskpart",
	"bcdedit",
	"reg ",
	"netsh",
]

type Pattern = readonly [RegExp, string, string]

const UNIX_PATTERNS: readonly Pattern[] = [
	// rm -rf /  /  rm -rf /*
	[/\brm\b.*\s-rf?\b.*\s\/\s*$/, "rm -rf /", "recursive delete of root filesystem"],
	[/\brm\b.*\s-rf?\b.*\s\/\*\s*$/, "rm -rf /*", "recursive delete of root filesystem (glob)"],
	// rm -rf ~  /  rm -rf ~/*
	[/\brm\b.*\s-rf?\b.*\s~\s*$/, "rm -rf ~", "recursive delete of home directory"],
	[/\brm\b.*\s-rf?\b.*\s~\/\*\s*$/, "rm -rf ~/*", "recursive delete of home directory (glob)"],
	// git push --mirror
	[/\bgit\s+push\b.*--mirror\b/, "git push --mirror", "deletes remote branches not present locally"],
	// git clean -fd / -fx / -fxd
	[/\bgit\s+clean\b.*-f(?:[dxf]|\s+-?[dxf])/, "git clean -fd", "deletes untracked files and directories"],
	// git reset --hard
	[/\bgit\s+reset\b.*--hard\b/, "git reset --hard", "destroys all uncommitted changes"],
	// git checkout/restore .
	[
		/\bgit\s+(?:checkout|restore)\b.*\s--?\s*\.\s*$/,
		"git checkout/restore .",
		"discards all working directory changes",
	],
	// SQL DROP via client
	[
		/(?:psql|mysql|sqlite3)\b.*(?:-c|-e)\b.*DROP\s+(?:TABLE|DATABASE|SCHEMA)\b/i,
		"DROP via SQL client",
		"drops a table/database/schema via SQL client",
	],
	[
		/DROP\s+(?:TABLE|DATABASE|SCHEMA)\b.*\|\s*(?:psql|mysql|sqlite3)\b/i,
		"DROP via SQL pipe",
		"drops a table/database/schema piped to SQL client",
	],
	// docker prune
	[
		/\bdocker\s+(?:system|volume)\s+prune\b.*(?:-[af]|\s-[af]|\s--all)/,
		"docker prune",
		"nukes Docker resources without confirmation",
	],
	// npm/yarn publish
	[/\b(?:npm|yarn)\s+publish\b/, "npm/yarn publish", "accidental package publishing"],
	// twine upload
	[/\btwine\s+upload\b/, "twine upload", "accidental package publishing"],
]

const POWERSHELL_PATTERNS: readonly Pattern[] = [
	// Remove-Item/ri with -Recurse/-r or -Force/-f flags
	[
		/(?:^|[;|&])\s*(?:Remove-Item|ri)\b.*\s-(?:r|recurse|f|force)\b/i,
		"Remove-Item with recursive/force flags",
		"deletion with recursive or force flag",
	],
	// Remove-Item -Recurse -Force on system locations
	[
		/\b(?:Remove-Item|ri)\b.*\s-(?:r|recurse)\b.*(?:C:|Windows|System32|Users|Program Files|ProgramData)/i,
		"Remove-Item on system location",
		"deletion operation on system directory or drive",
	],
	// Piped to delete (pipeline delete)
	[
		/\|\s*\b(?:Remove-Item|ri|del|erase)\b/i,
		"Piped deletion command",
		"deletion via pipeline (potentially recursive)",
	],
	// Format-Volume / fdisk
	[/\b(?:Format-Volume|fdisk)\b/i, "Format-Volume", "formats a disk volume"],
	// Clear-Disk
	[/\bClear-Disk\b/i, "Clear-Disk", "removes all data and OEM recovery partitions"],
	// Remove-ItemProperty on registry hives
	[
		/\b(?:Remove-ItemProperty|rp)\b.*\sHK(?:LM|CU|CR|U|CC):/i,
		"Remove-ItemProperty registry",
		"removes critical registry values",
	],
	// Clear-RecycleBin -Force
	[
		/\b(?:Clear-RecycleBin|recycle)\b.*\s-(?:f|force)\b/i,
		"Clear-RecycleBin -Force",
		"permanently deletes all recycle bin contents",
	],
	// Download + Execute (irm/iwr/curl/wget | iex)
	[
		/\b(?:irm|Invoke-WebRequest|iwr|Invoke-RestMethod|curl|wget)\b.*\|\s*(?:iex|Invoke-Expression)\b/i,
		"Download + Execute (IWR | IEX)",
		"downloads and executes remote code",
	],
]

const CMD_PATTERNS: readonly Pattern[] = [
	// rd /s /q  (recursive silent delete; both flag orderings)
	[/\b(?:rmdir|rd)\b.*\s\/s\b.*\s\/q\b/i, "rd /s /q", "recursive silent directory delete"],
	[/\b(?:rmdir|rd)\b.*\s\/q\b.*\s\/s\b/i, "rd /s /q", "recursive silent directory delete"],
	// del /s on system dirs (and /f /s variants)
	[
		/\b(?:del|erase)\b.*\s\/s\b.*(?:Windows|System32|Program)/i,
		"del /s system files",
		"recursive delete of system files",
	],
	[
		/\b(?:del|erase)\b.*\s\/f\b.*\s\/s\b.*(?:Windows|System32|Program)/i,
		"del /f /s system files",
		"force recursive delete of system files",
	],
	// format drive (with and without /q)
	[/(?:^|&&|\|\||;|\|)\s*format\b.*\s(?:C:|D:|E:)/i, "format", "formats drive"],
	[/(?:^|&&|\|\||;|\|)\s*format\b.*\s\/q\b.*\s(?:C:|D:|E:)/i, "format /q", "quick formats drive"],
	// diskpart
	[/\bdiskpart\b/i, "diskpart", "diskpart disk management tool"],
	// bcdedit destructive operations
	[
		/\bbcdedit\b.*\s\/(?:delete|set|export|import|bootsequence)\b.*\s(?:\{.*\}|.*bootmgr|.*resume)/i,
		"bcdedit destructive",
		"modifies critical boot configuration",
	],
	// reg delete on hives
	[/\breg\s+delete\b.*\sHK(?:LM|CR|CU)/i, "reg delete", "deletes critical registry keys"],
]

const ALL_PATTERNS: readonly Pattern[] = [...UNIX_PATTERNS, ...POWERSHELL_PATTERNS, ...CMD_PATTERNS]

export function detectDestructiveCommand(command: string): DestructiveCommandMatch | null {
	const lower = command.toLowerCase()
	if (!PREFILTER_SUBSTRINGS.some((s) => lower.includes(s))) return null
	if (!isRealCommand(command)) return null

	for (const [re, name, description] of ALL_PATTERNS) {
		if (re.test(command)) {
			return { patternName: name, description }
		}
	}
	return null
}

/**
 * Pulls the shell command string out of the tool args for `execute_command`.
 * Returns "" if no plausible command is present (which makes detection a no-op).
 */
function extractCommand(args: Record<string, unknown> | undefined): string {
	if (!args) return ""
	const candidate = args.command ?? args.cmd ?? args.shellCommand
	return typeof candidate === "string" ? candidate : ""
}

/**
 * Built-in handler. Only acts on `execute_command`-shaped events. Asks for
 * user approval on a match; returns allow otherwise.
 */
export function destructiveCommandGuardHandler(event: EventData): BuiltinVerdict {
	const command = extractCommand(event.toolArgs as Record<string, unknown> | undefined)
	if (!command) return { kind: "allow" }

	const match = detectDestructiveCommand(command)
	if (!match) return { kind: "allow" }

	const reason =
		`Destructive command detected: ${match.patternName} — ${match.description}. ` +
		`This could cause irreversible data loss.`
	return {
		kind: "ask",
		approval: { reason, patternName: match.patternName, subject: command },
	}
}
