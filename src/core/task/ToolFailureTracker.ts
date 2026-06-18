import type { ApiHandler } from "../../api"

/**
 * Tracks consecutive per-tool failures so the turn loop can fire a one-shot
 * "deep analysis" secondary LLM call when the model gets stuck repeating the
 * same failing tool.
 *
 * Extracted from `Task` to keep this self-contained recovery heuristic — its
 * own small piece of state plus the secondary call — separate from the task's
 * session state. `Task` owns one instance and delegates to it.
 */
export class ToolFailureTracker {
	// Consecutive failure count per tool name; reset on any success.
	private readonly consecutiveFailures = new Map<string, number>()
	// Most recent error payload per tool name, used for the analysis prompt.
	private readonly lastErrorByName = new Map<string, string>()

	/**
	 * Record whether a tool invocation succeeded or failed. A success on any
	 * tool wipes that tool's consecutive-failure counter and cached error; a
	 * failure increments the counter AND caches the error string for the
	 * secondary analysis call.
	 */
	record(toolName: string, isError: boolean, errorPayload?: string): void {
		if (isError) {
			const prev = this.consecutiveFailures.get(toolName) ?? 0
			this.consecutiveFailures.set(toolName, prev + 1)
			if (errorPayload) {
				this.lastErrorByName.set(toolName, errorPayload)
			}
		} else {
			this.consecutiveFailures.delete(toolName)
			this.lastErrorByName.delete(toolName)
		}
	}

	/**
	 * Returns the first tool name that has just hit (or exceeded) the
	 * stuck-loop threshold. Returning a tool name signals that the deep
	 * analysis call should fire. We use exactly == 2 so the call fires once
	 * per stuck episode rather than on every subsequent failure.
	 */
	toolNeedingDeepAnalysis(): string | null {
		for (const [tool, count] of this.consecutiveFailures.entries()) {
			if (count === 2) return tool
		}
		return null
	}

	/**
	 * Secondary LLM call. Asks the model — with a focused, isolated system
	 * prompt — to analyze why a tool failed twice in a row and what to try
	 * differently. Returns a short analysis string that gets prepended to
	 * the next user turn as a <failure_analysis> block.
	 *
	 * Failures (network, etc.) are silently caught and return null — better
	 * to skip the analysis than to stall the main loop.
	 */
	async analyzeToolFailure(toolName: string, api: ApiHandler, taskId: string): Promise<string | null> {
		const errorPayload = this.lastErrorByName.get(toolName)
		if (!errorPayload) return null

		const systemPrompt =
			"You are an error analysis assistant for an agentic coding tool. " +
			"The agent just ran a tool and it failed twice in a row. " +
			"In 3-5 short sentences, explain why it likely failed and what concrete alternative the agent should try. " +
			"Reference the exact error text. Do not propose anything that requires asking the user. " +
			"Output only the analysis text — no XML wrappers, no preamble, no bullet lists unless essential."

		const userPrompt = `Tool: ${toolName}\nError payload (most recent): ${errorPayload}\n\nWhy did this fail twice? What concrete alternative should the agent try next?`

		try {
			const stream = api.createMessage(systemPrompt, [{ role: "user", content: userPrompt }], {
				taskId,
				purpose: "error-analysis",
			})
			let analysis = ""
			for await (const chunk of stream) {
				if (chunk.type === "text") {
					analysis += chunk.text
				}
			}
			analysis = analysis.trim()
			return analysis || null
		} catch (error) {
			console.warn(
				`[ToolFailureTracker#analyzeToolFailure] secondary analysis call failed:`,
				error instanceof Error ? error.message : error,
			)
			return null
		}
	}
}
