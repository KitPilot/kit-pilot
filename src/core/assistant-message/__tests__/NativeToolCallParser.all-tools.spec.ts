import { NativeToolCallParser } from "../NativeToolCallParser"
import { getNativeTools } from "../../prompts/tools/native-tools"

/**
 * A core tool without a case in the argument switch of parseToolCall falls to
 * the default branch, builds no nativeArgs, and the parser drops the call.
 * The model is not told. This happened to find_symbol, and then to
 * remember_this and forget_this, which never worked as native tool calls.
 *
 * This test builds a minimal valid call for every native tool from its own
 * schema, so that a new tool without a parser case fails here.
 */

type JsonSchema = {
	type?: string | string[]
	enum?: unknown[]
	properties?: Record<string, JsonSchema>
	required?: string[]
	items?: JsonSchema
	anyOf?: JsonSchema[]
}

function minimalValue(schema: JsonSchema): unknown {
	if (schema.enum?.length) return schema.enum[0]
	if (schema.anyOf?.length) return minimalValue(schema.anyOf.find((s) => s.type !== "null") ?? schema.anyOf[0])
	const type = Array.isArray(schema.type) ? schema.type.find((t) => t !== "null") : schema.type
	switch (type) {
		case "string":
			return "value"
		case "number":
		case "integer":
			return 1
		case "boolean":
			return true
		case "array":
			return schema.items ? [minimalValue(schema.items)] : []
		case "object":
			return minimalObject(schema)
		default:
			return "value"
	}
}

function minimalObject(schema: JsonSchema): Record<string, unknown> {
	const result: Record<string, unknown> = {}
	for (const name of schema.required ?? []) {
		result[name] = minimalValue(schema.properties?.[name] ?? {})
	}
	return result
}

describe("NativeToolCallParser accepts every native tool", () => {
	beforeEach(() => {
		NativeToolCallParser.clearAllStreamingToolCalls()
		NativeToolCallParser.clearRawChunkState()
	})

	const tools = getNativeTools().filter((tool) => tool.type === "function")

	it.each(tools.map((tool) => [tool.function.name, tool] as const))("parses a minimal call to %s", (name, tool) => {
		const args = minimalObject(tool.function.parameters as JsonSchema)
		const result = NativeToolCallParser.parseToolCall({
			id: "toolu_1",
			name: name as any,
			arguments: JSON.stringify(args),
		})

		expect(result, `${name} with ${JSON.stringify(args)}`).not.toBeNull()
		expect(result?.type).toBe("tool_use")
		if (result?.type === "tool_use") {
			expect(result.nativeArgs).toBeDefined()
		}
	})
})

describe("NativeToolCallParser memory tools", () => {
	it("parses remember_this with all four fields", () => {
		const args = { name: "cancel-variant", type: "project", description: "The 984 cancel variant", content: "Body" }
		const result = NativeToolCallParser.parseToolCall({
			id: "toolu_1",
			name: "remember_this" as const,
			arguments: JSON.stringify(args),
		})

		expect(result?.type).toBe("tool_use")
		if (result?.type === "tool_use") {
			expect(result.name).toBe("remember_this")
			expect(result.nativeArgs).toEqual(args)
		}
	})

	it("parses forget_this", () => {
		const result = NativeToolCallParser.parseToolCall({
			id: "toolu_2",
			name: "forget_this" as const,
			arguments: JSON.stringify({ name: "cancel-variant" }),
		})

		expect(result?.type).toBe("tool_use")
		if (result?.type === "tool_use") {
			expect(result.nativeArgs).toEqual({ name: "cancel-variant" })
		}
	})

	it("rejects remember_this without its required content", () => {
		const result = NativeToolCallParser.parseToolCall({
			id: "toolu_3",
			name: "remember_this" as const,
			arguments: JSON.stringify({ name: "x", type: "user", description: "d" }),
		})

		expect(result).toBeNull()
	})
})
