import type { ClineMessage } from "@kit-pilot/types"

/**
 * Surfacing user redirects given to a running subtask back to its parent.
 *
 * While a subtask runs it is the sole active task, so any message the user
 * types is delivered to the child and recorded there as a `user_feedback` say.
 * Subtasks normally run autonomously, so any such message is the user steering
 * the child mid-run. The parent only ever sees the child's final result, so
 * without this it can "correct" a user-requested change — e.g. re-adding a
 * README section the user had just told the subtask to delete.
 *
 * These two helpers are kept pure (no IO) so they can be unit-tested directly.
 */

/** Cap per-message length so a long pasted redirect can't blow up parent context. */
const MAX_REDIRECT_LEN = 800

/**
 * Extract the user's mid-subtask redirect messages from a child task's UI
 * messages, in order. Trims, drops empties, annotates attached images, and
 * length-bounds each entry.
 */
export function extractUserRedirects(messages: ClineMessage[]): string[] {
	return messages
		.filter((m) => m.say === "user_feedback")
		.map((m) => {
			let text = (m.text ?? "").trim()
			if (text.length > MAX_REDIRECT_LEN) {
				text = `${text.slice(0, MAX_REDIRECT_LEN)}… [truncated]`
			}
			if (m.images && m.images.length > 0) {
				text = text ? `${text} [+${m.images.length} image(s)]` : `[${m.images.length} image(s)]`
			}
			return text
		})
		.filter((text) => text.length > 0)
}

/**
 * Frame the redirects for the parent. Worded to stop the parent treating a
 * user-requested change as a subtask error (the exact failure this fixes)
 * while still letting it reconcile genuine clarifications.
 */
export function formatUserRedirectNote(redirects: string[]): string {
	const list = redirects.map((text, i) => `${i + 1}. "${text}"`).join("\n")
	return (
		`⚠️ While this subtask was running, the user sent it the following message(s) directly:\n${list}\n\n` +
		`These may update or override the original instructions you gave the subtask, so the subtask's outcome ` +
		`may reflect the user's newer intent rather than your original request. Reconcile them against the user's ` +
		`overall goal before deciding what to do next — do NOT treat a user-requested change as a subtask mistake to be undone.`
	)
}

/**
 * Build the result summary the parent receives: the child's own result, plus a
 * framed note about any user redirects. Returns the raw summary unchanged when
 * there were no redirects (backward-compatible).
 */
export function augmentSummaryWithRedirects(rawSummary: string, redirects: string[]): string {
	if (redirects.length === 0) {
		return rawSummary
	}
	return `${rawSummary}\n\n---\n${formatUserRedirectNote(redirects)}`
}
