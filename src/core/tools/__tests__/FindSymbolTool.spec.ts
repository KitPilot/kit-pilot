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
					{
						source: "provider" as const,
						path: "src/server/boot.js",
						line: 4,
						column: 9,
						text: "const c = parseConfig(t)",
					},
					{
						source: "provider" as const,
						path: "src/server/boot.js",
						line: 9,
						column: 3,
						text: "parseConfig(other)",
					},
					{
						source: "provider" as const,
						path: "src/cli/main.js",
						line: 2,
						column: 20,
						text: "const { parseConfig } = require(...)",
					},
				],
			}),
		)

		expect(text).toContain('3 references of "parseConfig"')
		expect(text).toContain(
			"src/server/boot.js\n  4:9  [provider] const c = parseConfig(t)\n  9:3  [provider] parseConfig(other)",
		)
		expect(text).toContain("src/cli/main.js\n  2:20")
	})

	it("uses the singular for one result", () => {
		const text = formatResult(
			"parseConfig",
			"definition",
			result({
				locations: [
					{
						source: "provider" as const,
						path: "src/config/parse.js",
						line: 3,
						column: 10,
						text: "function parseConfig()",
					},
				],
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
						source: "provider" as const,
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
			result({
				locations: [{ source: "provider" as const, path: "a.js", line: 1, column: 1, text: "x" }],
				omitted: 12,
			}),
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
	it("says when the whole list came from a text search", () => {
		const text = formatResult(
			"parseConfig",
			"references",
			result({
				usedFallback: true,
				locations: [{ source: "text" as const, path: "a.js", line: 1, column: 1, text: "parseConfig()" }],
			}),
		)

		expect(text).toContain("No language provider answered")
		expect(text).toContain("every line above is a text match")
	})

	it("says so when every reference came from the provider", () => {
		const text = formatResult(
			"parseConfig",
			"references",
			result({
				locations: [{ source: "provider" as const, path: "a.js", line: 1, column: 1, text: "parseConfig()" }],
			}),
		)

		expect(text).toContain("Every line above came from the language provider")
		expect(text).not.toContain("[text]")
		// A text-match caution would be wrong here; there are no text matches.
		expect(text).not.toContain("can be in a comment")
	})

	// The measured case: the provider resolves the uses inside the declaring
	// file and a text search supplies the rest. The two are not of equal worth,
	// so the list has to say which is which.
	it("marks each reference with its source and counts the two apart", () => {
		const text = formatResult(
			"parseConfig",
			"references",
			result({
				usedFallback: false,
				joinedTextSearch: true,
				locations: [
					{
						source: "provider" as const,
						path: "src/config/parse.js",
						line: 3,
						column: 10,
						text: "function parseConfig()",
					},
					{
						source: "text" as const,
						path: "src/server/boot.js",
						line: 5,
						column: 12,
						text: "parseConfig(t)",
					},
					{
						source: "text" as const,
						path: "src/cli/main.js",
						line: 2,
						column: 8,
						text: "// parseConfig is gone",
					},
				],
			}),
		)

		expect(text).toContain("[provider] function parseConfig()")
		expect(text).toContain("[text] parseConfig(t)")
		expect(text).toContain("1 came from the language provider")
		expect(text).toContain("2 came from a text search alone")
	})

	// A text match can be a comment, a string, or a different symbol with the
	// same name. Saying so is the difference between a list that is useful and
	// one that is trusted too far.
	it("cautions about text matches whenever there is one", () => {
		const text = formatResult(
			"parseConfig",
			"references",
			result({
				locations: [{ source: "text" as const, path: "a.js", line: 1, column: 1, text: "// parseConfig" }],
			}),
		)

		expect(text).toContain("can be in a comment or a string")
		expect(text).toContain("different")
		expect(text).toContain("Read each one before you change it")
	})

	// The union raises what the answer covers. It cannot show that nothing is
	// missing, so the result must never be read as proof of a finished rename.
	it("never claims the list is complete", () => {
		for (const usedFallback of [true, false]) {
			const text = formatResult(
				"parseConfig",
				"references",
				result({
					usedFallback,
					locations: [
						{ source: "provider" as const, path: "a.js", line: 1, column: 1, text: "parseConfig()" },
					],
				}),
			)

			expect(text).toContain("does not prove that every use is here")
			expect(text).toContain("rename is complete")
		}
	})

	// A definition lookup asks the provider only, so none of the reference
	// wording applies to it.
	it("says nothing about sources on a definition lookup", () => {
		const text = formatResult(
			"parseConfig",
			"definition",
			result({
				usedFallback: true,
				locations: [{ source: "provider" as const, path: "a.js", line: 1, column: 1, text: "x" }],
			}),
		)

		expect(text).not.toContain("text search")
		expect(text).not.toContain("rename is complete")
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
