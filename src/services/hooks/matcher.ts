/**
 * Pattern matching for hook filters.
 *
 * Matcher syntax (ported from code_puppy/hook_engine/matcher.py):
 *   - "*"                      → matches all tools
 *   - "ToolName"               → exact match (case-insensitive)
 *   - ".ext"                   → file extension match (looks in tool_args for a path)
 *   - "Pattern1 && Pattern2"   → AND (both must match)
 *   - "Pattern1 || Pattern2"   → OR (either matches)
 *   - regex                    → if pattern contains regex metacharacters
 */

const FILE_KEYS = [
	"file_path",
	"file",
	"path",
	"target",
	"input_file",
	"output_file",
	"source",
	"destination",
	"src",
	"dest",
	"filename",
]

const REGEX_METACHARS = ["^", "$", ".", "+", "?", "[", "]", "(", ")", "{", "}", "|", "\\"]

export function matches(matcher: string, toolName: string, toolArgs: Record<string, unknown>): boolean {
	if (!matcher) return false

	const trimmed = matcher.trim()
	if (trimmed === "*") return true

	if (trimmed.includes("||")) {
		return trimmed.split("||").some((part) => matches(part.trim(), toolName, toolArgs))
	}

	if (trimmed.includes("&&")) {
		return trimmed.split("&&").every((part) => matches(part.trim(), toolName, toolArgs))
	}

	return matchSingle(trimmed, toolName, toolArgs)
}

function matchSingle(pattern: string, toolName: string, toolArgs: Record<string, unknown>): boolean {
	if (pattern === toolName) return true
	if (pattern.toLowerCase() === toolName.toLowerCase()) return true

	// File extension match
	if (pattern.startsWith(".")) {
		const filePath = extractFilePath(toolArgs)
		return filePath ? filePath.endsWith(pattern) : false
	}

	// Glob-style wildcard
	if (pattern.includes("*")) {
		const parts = pattern.split("*").map(escapeRegex)
		const re = new RegExp(`^${parts.join(".*")}$`, "i")
		if (re.test(toolName)) return true
	}

	// Treat as regex if it contains metacharacters
	if (isRegexPattern(pattern)) {
		try {
			const re = new RegExp(pattern, "i")
			if (re.test(toolName)) return true
			const filePath = extractFilePath(toolArgs)
			if (filePath && re.test(filePath)) return true
		} catch {
			// invalid regex → no match
		}
	}

	return false
}

export function extractFilePath(toolArgs: Record<string, unknown>): string | undefined {
	for (const key of FILE_KEYS) {
		const v = toolArgs[key]
		if (typeof v === "string") return v
	}
	for (const v of Object.values(toolArgs)) {
		if (typeof v === "string" && looksLikeFilePath(v)) return v
	}
	return undefined
}

function looksLikeFilePath(value: string): boolean {
	if (!value) return false
	if (value.includes("/") || value.includes("\\")) return true
	if (value.includes(".") && !value.startsWith(".")) {
		const parts = value.split(".")
		const ext = parts[parts.length - 1]
		if (ext.length <= 10 && /^[a-zA-Z0-9]+$/.test(ext)) return true
	}
	return false
}

function isRegexPattern(pattern: string): boolean {
	return REGEX_METACHARS.some((c) => pattern.includes(c))
}

function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
