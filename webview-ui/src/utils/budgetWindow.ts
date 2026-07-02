import type { ClineMessage } from "@kit-pilot/types"

import { getApiMetrics } from "@kitpilot/getApiMetrics"

export interface BudgetWindowMetrics {
	/** Aggregated token/cost metrics for the current budget window. */
	metrics: ReturnType<typeof getApiMetrics>
	/**
	 * Timestamp of the first message in the window — a stable key for "this
	 * window" (e.g. to remember a dismissed warning until the window resets).
	 */
	windowStartTs: number
}

/**
 * Cost of the current auto-approval budget window, mirroring
 * AutoApprovalHandler's reset semantics: the window restarts after each
 * answered `auto_approval_max_req_reached` ask (whichever of the request/cost
 * limits raised it — the handler shares one reset index between them).
 *
 * An ask that is still the last message is pending, not answered, so it does
 * not start a new window. If the user denies the ask the task ends, so
 * "answered" is detectable as "no longer the final message".
 *
 * Expects the post-`combineApiRequests` message list (costs live on
 * `api_req_started` messages there).
 */
export function getBudgetWindowMetrics(modifiedMessages: ClineMessage[]): BudgetWindowMetrics {
	let start = 0
	for (let i = modifiedMessages.length - 1; i >= 0; i--) {
		const message = modifiedMessages[i]
		if (message.type === "ask" && message.ask === "auto_approval_max_req_reached") {
			if (i < modifiedMessages.length - 1) {
				start = i + 1
			}
			break
		}
	}
	return {
		metrics: getApiMetrics(modifiedMessages.slice(start)),
		windowStartTs: modifiedMessages[start]?.ts ?? 0,
	}
}
