import { APIError } from "openai"

export function checkContextWindowExceededError(error: unknown): boolean {
	return (
		checkIsOpenAIContextWindowError(error) ||
		checkIsOpenRouterContextWindowError(error) ||
		checkIsAnthropicContextWindowError(error) ||
		checkIsVsCodeLmContextWindowError(error)
	)
}

/**
 * The VS Code Language Model API gives a plain Error. Copilot puts the status
 * and the provider's JSON body in its message, for example:
 *
 *   Request Failed: 400 {"error":{"code":"model_max_prompt_tokens_exceeded",
 *   "message":"prompt is too long: 1138989 tokens > 1000000 maximum", ...}}
 *
 * The error has no `status` and no structured body, so the other checks do
 * not match it. Thus a request that was too long never got the automatic
 * context reduction and retry.
 */
function checkIsVsCodeLmContextWindowError(error: unknown): boolean {
	try {
		if (!error || typeof error !== "object") {
			return false
		}
		const message = String((error as { message?: unknown }).message ?? "")

		// Provider error codes that always mean that the prompt is too long.
		if (/\b(?:model_max_prompt_tokens_exceeded|context_length_exceeded)\b/.test(message)) {
			return true
		}

		// Otherwise require a 400 status and a context-length phrase.
		return (
			/\b400\b/.test(message) &&
			[/prompt is too long/i, /maximum context length/i, /\bcontext\s*(?:length|window)\s*exceeded\b/i].some(
				(pattern) => pattern.test(message),
			)
		)
	} catch {
		return false
	}
}

function checkIsOpenRouterContextWindowError(error: unknown): boolean {
	try {
		if (!error || typeof error !== "object") {
			return false
		}

		// Use Record<string, any> for proper type narrowing
		const err = error as Record<string, any>
		const status = err.status ?? err.code ?? err.error?.status ?? err.response?.status
		const message: string = String(err.message || err.error?.message || "")

		// Known OpenAI/OpenRouter-style signal (code 400 and message includes "context length")
		const CONTEXT_ERROR_PATTERNS = [
			/\bcontext\s*(?:length|window)\b/i,
			/\bmaximum\s*context\b/i,
			/\b(?:input\s*)?tokens?\s*exceed/i,
			/\btoo\s*many\s*tokens?\b/i,
		] as const

		return String(status) === "400" && CONTEXT_ERROR_PATTERNS.some((pattern) => pattern.test(message))
	} catch {
		return false
	}
}

// Docs: https://platform.openai.com/docs/guides/error-codes/api-errors
function checkIsOpenAIContextWindowError(error: unknown): boolean {
	try {
		// Check for LengthFinishReasonError
		if (error && typeof error === "object" && "name" in error && error.name === "LengthFinishReasonError") {
			return true
		}

		const KNOWN_CONTEXT_ERROR_SUBSTRINGS = ["token", "context length"] as const

		return (
			Boolean(error) &&
			error instanceof APIError &&
			error.code?.toString() === "400" &&
			KNOWN_CONTEXT_ERROR_SUBSTRINGS.some((substring) => error.message.includes(substring))
		)
	} catch {
		return false
	}
}

function checkIsAnthropicContextWindowError(response: unknown): boolean {
	try {
		// Type guard to safely access properties
		if (!response || typeof response !== "object") {
			return false
		}

		// Use type assertions with proper checks
		const res = response as Record<string, any>

		// Check for Anthropic-specific error structure with more specific validation
		if (res.error?.error?.type === "invalid_request_error") {
			const message: string = String(res.error?.error?.message || "")

			// More specific patterns for context window errors
			const contextWindowPatterns = [
				/prompt is too long/i,
				/maximum.*tokens/i,
				/context.*too.*long/i,
				/exceeds.*context/i,
				/token.*limit/i,
				/context_length_exceeded/i,
				/max_tokens_to_sample/i,
			]

			// Additional check for Anthropic-specific error codes
			const errorCode = res.error?.error?.code
			if (errorCode === "context_length_exceeded" || errorCode === "invalid_request_error") {
				return contextWindowPatterns.some((pattern) => pattern.test(message))
			}

			return contextWindowPatterns.some((pattern) => pattern.test(message))
		}

		return false
	} catch {
		return false
	}
}
