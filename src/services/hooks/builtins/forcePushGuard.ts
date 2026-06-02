/**
 * Git force-push detection.
 *
 * Ported from code_puppy's plugins/force_push_guard/detector.py. Pure regex,
 * no LLM calls. Cheap "push" substring prefilter → git-push shell-boundary
 * check → first-match-wins pattern scan ordered by specificity.
 *
 * Catches the various ways git lets you wreck a remote branch:
 *   --force, --force-with-lease, --force-if-includes, -f, -F, +refspec
 */

import type { EventData } from "../types"
import type { BuiltinVerdict } from "./index"

export interface ForcePushMatch {
	patternName: string
	description: string
}

// Matches `git push` only when it appears as an actual command — at the start
// of the input or after a shell operator (&&, ||, ;, |). This avoids matching
// "echo 'git push --force'" while still catching "cd repo && git push -f".
const GIT_PUSH_BOUNDARY_RE = /(?:^|&&|\|\||;|\|)\s*git\s+push\b/m

function isGitPushReal(command: string): boolean {
	return GIT_PUSH_BOUNDARY_RE.test(command)
}

type Pattern = readonly [RegExp, string, string]

// Ordered by specificity — first match wins. The lease/includes variants
// are listed before the bare --force so they get reported with their
// distinct, more-informative name.
const FORCE_PUSH_PATTERNS: readonly Pattern[] = [
	[
		/\bgit\s+push\b.*--force-with-lease/,
		"--force-with-lease",
		"force push with lease (safer, but still rewrites history)",
	],
	[
		/\bgit\s+push\b.*--force-if-includes/,
		"--force-if-includes",
		"force push with includes check (still rewrites history)",
	],
	[/\bgit\s+push\b.*--force/, "--force", "force push (rewrites remote history)"],
	[/\bgit\s+push\b.*\s-f\b/, "-f", "force push shorthand (rewrites remote history)"],
	[/\bgit\s+push\b.*\s-F\b/, "-F", "force push shorthand (rewrites remote history)"],
	// +refspec syntax: `git push origin +main`, `git push origin +HEAD:main`
	[/\bgit\s+push\b.*\s\+/, "+refspec", "force push via +refspec prefix (rewrites remote history)"],
]

export function detectForcePush(command: string): ForcePushMatch | null {
	// Prefilter: if "push" isn't in the command, none of the patterns can hit.
	if (!command.includes("push")) return null
	if (!isGitPushReal(command)) return null

	for (const [re, name, description] of FORCE_PUSH_PATTERNS) {
		if (re.test(command)) {
			return { patternName: name, description }
		}
	}
	return null
}

function extractCommand(args: Record<string, unknown> | undefined): string {
	if (!args) return ""
	const candidate = args.command ?? args.cmd ?? args.shellCommand
	return typeof candidate === "string" ? candidate : ""
}

export function forcePushGuardHandler(event: EventData): BuiltinVerdict {
	const command = extractCommand(event.toolArgs as Record<string, unknown> | undefined)
	if (!command) return { kind: "allow" }

	const match = detectForcePush(command)
	if (!match) return { kind: "allow" }

	const reason =
		`Force push detected: ${match.patternName} — ${match.description}. ` +
		`This rewrites remote history and can destroy others' work.`
	return {
		kind: "ask",
		approval: { reason, patternName: match.patternName, subject: command },
	}
}
