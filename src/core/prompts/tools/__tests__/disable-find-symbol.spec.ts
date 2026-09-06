import { describe, expect, it } from "vitest"

import { getNativeTools } from "../native-tools"
import { filterNativeToolsForMode } from "../filter-tools-for-mode"

function toolNames(disabledTools?: string[]): string[] {
	const filtered = filterNativeToolsForMode(getNativeTools(), "code", undefined, undefined, undefined, {
		disabledTools,
	})
	return filtered.map((tool) => ("function" in tool ? tool.function.name : ""))
}

/**
 * The evaluation compares one build against itself with `find_symbol` turned
 * off through the `disabledTools` setting. If that setting left the tool in
 * place, the "baseline" would still carry the tool and its description, and the
 * comparison would measure nothing at all. These pin that it does not.
 */
describe("turning find_symbol off through disabledTools", () => {
	it("offers the tool by default", () => {
		expect(toolNames()).toContain("find_symbol")
	})

	it("removes the tool when it is disabled", () => {
		expect(toolNames(["find_symbol"])).not.toContain("find_symbol")
	})

	// The description is the prompt guidance. It travels with the definition, so
	// removing the definition removes the guidance too.
	it("removes the description with the tool", () => {
		const filtered = filterNativeToolsForMode(getNativeTools(), "code", undefined, undefined, undefined, {
			disabledTools: ["find_symbol"],
		})
		const text = JSON.stringify(filtered)

		expect(text).not.toContain("find_symbol")
		expect(text).not.toContain("Go to Definition")
	})

	it("leaves every other read tool in place", () => {
		const names = toolNames(["find_symbol"])

		for (const tool of ["read_file", "search_files", "list_files"]) {
			expect(names).toContain(tool)
		}
	})

	it("changes nothing else about the tool list", () => {
		const withTool = toolNames().filter((name) => name !== "find_symbol")

		expect(toolNames(["find_symbol"])).toEqual(withTool)
	})
})
