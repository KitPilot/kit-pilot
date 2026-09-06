import { NativeToolCallParser } from "../NativeToolCallParser"

/**
 * The parser is the boundary the earlier tests missed.
 *
 * A core tool without a case in the argument switch falls to the default
 * branch, builds no nativeArgs, and the parser throws. The tool then never
 * reaches its handler, however complete the handler and its own tests are.
 */
describe("NativeToolCallParser find_symbol", () => {
	beforeEach(() => {
		NativeToolCallParser.clearAllStreamingToolCalls()
		NativeToolCallParser.clearRawChunkState()
	})

	it("parses a definition lookup", () => {
		const result = NativeToolCallParser.parseToolCall({
			id: "toolu_1",
			name: "find_symbol" as const,
			arguments: JSON.stringify({ symbol: "parseConfig", lookup: "definition" }),
		})

		expect(result).not.toBeNull()
		expect(result?.type).toBe("tool_use")
		if (result?.type === "tool_use") {
			expect(result.name).toBe("find_symbol")
			expect(result.nativeArgs).toEqual({ symbol: "parseConfig", lookup: "definition" })
		}
	})

	it("parses a reference lookup", () => {
		const result = NativeToolCallParser.parseToolCall({
			id: "toolu_2",
			name: "find_symbol" as const,
			arguments: JSON.stringify({ symbol: "parseConfig", lookup: "references" }),
		})

		expect(result?.type).toBe("tool_use")
		if (result?.type === "tool_use") {
			expect(result.nativeArgs).toEqual({ symbol: "parseConfig", lookup: "references" })
		}
	})

	// A payload the schema does not satisfy builds no nativeArgs, and the parser
	// drops the call. This is exactly what happened to every find_symbol call
	// before the case existed, and nothing in the transcript said why.
	it("drops a call that has no symbol", () => {
		const result = NativeToolCallParser.parseToolCall({
			id: "toolu_3",
			name: "find_symbol" as const,
			arguments: JSON.stringify({ lookup: "definition" }),
		})

		expect(result).toBeNull()
	})

	it("drops a call that has no lookup", () => {
		const result = NativeToolCallParser.parseToolCall({
			id: "toolu_4",
			name: "find_symbol" as const,
			arguments: JSON.stringify({ symbol: "parseConfig" }),
		})

		expect(result).toBeNull()
	})
})
