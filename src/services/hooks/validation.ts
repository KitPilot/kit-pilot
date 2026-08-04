/**
 * Pure validation for hooks.json content. Shared by:
 *
 *   - the diagnostics command (on-demand report)
 *   - the hook engine load path (warning notification on first load)
 *
 * The runtime loader (`parseHooksJson`) deliberately treats broken config as
 * "no hooks" so a typo can never crash tool dispatch — this module is what
 * makes that silent fallback visible to the user.
 */

import { DISPATCHED_EVENT_TYPES, SUPPORTED_EVENT_TYPES } from "./types"

export interface HooksFileValidation {
	/** False when the file does not exist (text was null). */
	exists: boolean
	/** Set when the file exists but is not parseable as a JSON object. */
	parseError?: string
	/** Structural problems in a parseable file (hooks affected may not run). */
	problems: string[]
	/** Per-event group counts for a healthy file, e.g. "PreToolUse×2". */
	groupCounts: string[]
}

interface HookEntryLike {
	id?: unknown
	type?: unknown
	command?: unknown
}

interface HookGroupLike {
	matcher?: unknown
	hooks?: unknown
}

export function validateHooksText(text: string | null): HooksFileValidation {
	if (text === null) {
		return { exists: false, problems: [], groupCounts: [] }
	}

	let parsed: unknown
	try {
		parsed = JSON.parse(text)
	} catch (error) {
		return {
			exists: true,
			parseError: error instanceof Error ? error.message : String(error),
			problems: [],
			groupCounts: [],
		}
	}

	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		return {
			exists: true,
			parseError: "Root value must be a JSON object keyed by event type (PreToolUse, PostToolUse, …).",
			problems: [],
			groupCounts: [],
		}
	}

	const config = parsed as Record<string, unknown>
	const problems: string[] = []
	const groupCounts: string[] = []

	const unknownKeys = Object.keys(config).filter((key) => !(SUPPORTED_EVENT_TYPES as readonly string[]).includes(key))
	if (unknownKeys.length > 0) {
		problems.push(
			`Unknown event type(s) ${unknownKeys.map((k) => `"${k}"`).join(", ")} — supported: ${SUPPORTED_EVENT_TYPES.join(", ")}. Hooks under unknown keys never fire.`,
		)
	}

	for (const eventType of SUPPORTED_EVENT_TYPES) {
		const groups = config[eventType]
		if (groups === undefined) continue
		if (!Array.isArray(groups)) {
			problems.push(`"${eventType}" must be an array of hook groups.`)
			continue
		}
		groupCounts.push(`${eventType}×${groups.length}`)

		// Declared, parsed and loaded — but never dispatched, so these hooks sit
		// there silently. Only worth saying when a hook actually exists to be
		// silenced: the message claims hooks load and never fire, which is untrue
		// of `"Stop": []`, of a group with no `hooks` key, and of one whose
		// `hooks` array is empty. Those shapes are reported below as the
		// structural problems they are, and saying both would be noise that
		// teaches people to skip the report.
		const hasConfiguredHook = groups.some(
			(group: HookGroupLike) =>
				Boolean(group) && typeof group === "object" && Array.isArray(group.hooks) && group.hooks.length > 0,
		)

		if (hasConfiguredHook && !DISPATCHED_EVENT_TYPES.includes(eventType)) {
			problems.push(
				`"${eventType}" is accepted but not yet dispatched — its hooks load and never fire. Currently dispatched: ${DISPATCHED_EVENT_TYPES.join(", ")}.`,
			)
		}

		groups.forEach((group: HookGroupLike, groupIndex) => {
			const where = `${eventType}[${groupIndex}]`
			if (!group || typeof group !== "object") {
				problems.push(`${where} is not an object.`)
				return
			}
			if (!Array.isArray(group.hooks) || group.hooks.length === 0) {
				problems.push(`${where} has no "hooks" array — the group does nothing.`)
				return
			}
			group.hooks.forEach((hook: HookEntryLike, hookIndex) => {
				const hookWhere = `${where}.hooks[${hookIndex}]`
				if (!hook || typeof hook !== "object") {
					problems.push(`${hookWhere} is not an object.`)
					return
				}
				if (typeof hook.command !== "string" || hook.command.trim() === "") {
					problems.push(`${hookWhere} is missing a "command" string.`)
				}
				if (hook.type !== undefined && !["command", "prompt", "builtin"].includes(hook.type as string)) {
					problems.push(
						`${hookWhere} has unsupported type "${String(hook.type)}" (expected "command", "prompt", or "builtin").`,
					)
				}
			})
		})
	}

	return { exists: true, problems, groupCounts }
}
