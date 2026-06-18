/**
 * Parser for GitHub Copilot's usage payload, which the VS Code Language Model
 * API streams as a `LanguageModelDataPart` (a chunk carrying `data: Uint8Array`
 * + a `mimeType`). Before token billing this was ignored ("Unknown chunk type")
 * and KitPilot estimated token counts by counting characters. Now that Copilot
 * bills by token, we use the real counts when the data part is present.
 *
 * The payload is OpenAI-shaped with a Copilot extension (field names confirmed
 * against decoded VS Code logs; see kenmuse.com "Decoding Copilot Token Costs"):
 *
 *   {
 *     "prompt_tokens": 1234,
 *     "completion_tokens": 567,
 *     "total_tokens": 1801,
 *     "prompt_tokens_details": {
 *       "cached_tokens": 1000,
 *       "cache_creation_input_tokens": 200
 *     },
 *     "total_nano_aiu": 4500000000,         // exact cost: AIU = credits ($0.01)
 *     "copilot_usage": { "token_details": [ ... ] }
 *   }
 *
 * Kept provider-agnostic and side-effect-free so it can be unit-tested without
 * the VS Code runtime. The decode/log/duck-type detection lives in the provider.
 */

export interface VsCodeLmReportedUsage {
	inputTokens: number
	outputTokens: number
	cacheReadTokens?: number
	cacheWriteTokens?: number
	/**
	 * Exact cost in USD, derived from `total_nano_aiu` when present. 1 AIU = 1
	 * GitHub AI Credit = $0.01, and the value is in nano-AIU, so
	 * USD = total_nano_aiu / 1e9 (→ AIU) × 0.01 = total_nano_aiu / 1e11.
	 */
	totalCost?: number
}

function toNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

/** First defined numeric value among the given object keys. */
function pick(obj: Record<string, unknown>, keys: string[]): number | undefined {
	for (const key of keys) {
		const n = toNumber(obj[key])
		if (n !== undefined) {
			return n
		}
	}
	return undefined
}

/**
 * Extract token counts (and exact cost if reported) from a decoded usage
 * payload. Returns undefined if the object carries no recognizable token
 * counts, so the caller can fall back to its estimate.
 */
export function parseVsCodeLmUsage(decoded: unknown): VsCodeLmReportedUsage | undefined {
	if (!decoded || typeof decoded !== "object") {
		return undefined
	}

	const root = decoded as Record<string, unknown>
	// Some shapes nest the counts under a `usage` key; tolerate both.
	const usage = (
		root.usage && typeof root.usage === "object" ? (root.usage as Record<string, unknown>) : root
	) as Record<string, unknown>

	const inputTokens = pick(usage, ["prompt_tokens", "input_tokens", "inputTokens"])
	const outputTokens = pick(usage, ["completion_tokens", "output_tokens", "outputTokens"])

	// Not a usage part if neither token count is present.
	if (inputTokens === undefined && outputTokens === undefined) {
		return undefined
	}

	const details =
		usage.prompt_tokens_details && typeof usage.prompt_tokens_details === "object"
			? (usage.prompt_tokens_details as Record<string, unknown>)
			: undefined

	const cacheReadTokens = details ? pick(details, ["cached_tokens", "cache_read_input_tokens"]) : undefined
	const cacheWriteTokens = details ? pick(details, ["cache_creation_input_tokens", "cache_write_tokens"]) : undefined

	// total_nano_aiu is Copilot's exact charge: nano-AIU → AIU (/1e9) → USD (×$0.01).
	const totalNanoAiu = pick(usage, ["total_nano_aiu"]) ?? pick(root, ["total_nano_aiu"])
	const totalCost = totalNanoAiu !== undefined ? totalNanoAiu / 1e11 : undefined

	return {
		inputTokens: inputTokens ?? 0,
		outputTokens: outputTokens ?? 0,
		...(cacheReadTokens !== undefined ? { cacheReadTokens } : {}),
		...(cacheWriteTokens !== undefined ? { cacheWriteTokens } : {}),
		...(totalCost !== undefined ? { totalCost } : {}),
	}
}
