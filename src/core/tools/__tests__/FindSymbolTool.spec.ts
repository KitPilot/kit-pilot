import { describe, expect, it } from "vitest"

import { formatResult } from "../FindSymbolTool"
import type { LookupResult } from "../../../services/code-navigation"

function result(overrides: Partial<LookupResult> = {}): LookupResult {
	return { locations: [], omitted: 0, usedFallback: false, ...overrides }
}

describe("find_symbol result text", () => {
	it("groups locations by file", () => {
		const text = formatResult(
			"parseConfig",
			"references",
			result({
				locations: [
					{ path: "src/server/boot.js", line: 4, column: 9, text: "const c = parseConfig(t)" },
					{ path: "src/server/boot.js", line: 9, column: 3, text: "parseConfig(other)" },
					{ path: "src/cli/main.js", line: 2, column: 20, text: "const { parseConfig } = require(...)" },
				],
			}),
		)

		expect(text).toContain('3 references of "parseConfig"')
		expect(text).toContain("src/server/boot.js\n  4:9  const c = parseConfig(t)\n  9:3  parseConfig(other)")
		expect(text).toContain("src/cli/main.js\n  2:20")
	})

	it("uses the singular for one result", () => {
		const text = formatResult(
			"parseConfig",
			"definition",
			result({
				locations: [{ path: "src/config/parse.js", line: 3, column: 10, text: "function parseConfig()" }],
			}),
		)

		expect(text).toContain('1 definition of "parseConfig"')
	})

	it("shows the kind and the container when the provider gives them", () => {
		const text = formatResult(
			"handle",
			"definition",
			result({
				locations: [
					{
						path: "src/a.ts",
						line: 12,
						column: 2,
						text: "handle() {}",
						kind: "Method",
						container: "Server",
					},
				],
			}),
		)

		expect(text).toContain("Method handle() {} (in Server)")
	})

	it("says how many it left out", () => {
		const text = formatResult(
			"parseConfig",
			"references",
			result({ locations: [{ path: "a.js", line: 1, column: 1, text: "x" }], omitted: 12 }),
		)

		expect(text).toContain("12 more not shown")
	})

	// A tool that answers "no results" and stops there sends the task back to
	// reading files one after another, which is the cost this tool removes.
	it("names the next step when no provider answers", () => {
		const text = formatResult("parseConfig", "definition", result({ usedFallback: true }))

		expect(text).toContain('No definition found for "parseConfig"')
		expect(text).toContain("No language provider answered")
		expect(text).toContain('use search_files with the regex "parseConfig"'.replace("use", "Use"))
	})

	// A rename that trusts a short list looks done when it is not.
	it("warns when the reference list came from a text search alone", () => {
		const text = formatResult(
			"parseConfig",
			"references",
			result({
				usedFallback: true,
				locations: [{ path: "a.js", line: 1, column: 1, text: "parseConfig()" }],
			}),
		)

		expect(text).toContain("This list is from a text search")
		expect(text).toContain("may be missing")
	})

	it("does not mention the text search when the provider found everything", () => {
		const text = formatResult(
			"parseConfig",
			"references",
			result({ locations: [{ path: "a.js", line: 1, column: 1, text: "parseConfig()" }] }),
		)

		expect(text).not.toContain("text search")
	})

	// The measured case: the provider answers but reports only the uses inside
	// the declaring file. Silence here would be the most dangerous outcome,
	// because the list looks like a provider answer and is not a whole one.
	it("says when the provider answered but the text search found more", () => {
		const text = formatResult(
			"parseConfig",
			"references",
			result({
				usedFallback: false,
				joinedTextSearch: true,
				locations: [
					{ path: "src/config/parse.js", line: 3, column: 10, text: "function parseConfig()" },
					{ path: "src/server/boot.js", line: 5, column: 12, text: "parseConfig(t)" },
				],
			}),
		)

		expect(text).toContain("The language provider missed some of these")
		expect(text).toContain("check each one before you change it")
	})

	it("does not warn on a definition lookup", () => {
		const text = formatResult(
			"parseConfig",
			"definition",
			result({ usedFallback: true, locations: [{ path: "a.js", line: 1, column: 1, text: "x" }] }),
		)

		expect(text).not.toContain("text search")
	})

	it("says when the provider answered but every result was filtered out", () => {
		const text = formatResult("parseConfig", "references", result({ usedFallback: false }))

		expect(text).toContain("outside the workspace or ignored")
	})

	it("escapes a regex character in the suggested search", () => {
		const text = formatResult("Foo.bar", "definition", result({ usedFallback: true }))

		expect(text).toContain('"Foo\\.bar"')
	})
})
