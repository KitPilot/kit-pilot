import { describe, expect, it } from "vitest"

import { getNativeTools } from "../index"
import findSymbol from "../find_symbol"

describe("find_symbol tool definition", () => {
	it("is offered to the model", () => {
		const names = getNativeTools().map((tool) => ("function" in tool ? tool.function.name : ""))

		expect(names).toContain("find_symbol")
	})

	it("requires the symbol and the lookup", () => {
		const parameters = findSymbol.function.parameters as {
			required: string[]
			properties: { lookup: { enum: string[] } }
		}

		expect(parameters.required).toEqual(["symbol", "lookup"])
		expect(parameters.properties.lookup.enum).toEqual(["definition", "references"])
	})

	// The tool exists to replace reading files one after another. The
	// description has to say when to reach for it.
	it("tells the model to use it before reading files", () => {
		expect(findSymbol.function.description).toContain("BEFORE reading files")
	})

	// A reference list that is short by a call site would let a rename look
	// finished when it is not, and a text match is not proof of a use.
	it("states that a text match needs a look", () => {
		expect(findSymbol.function.description).toContain("comment, a string, or a different symbol")
	})

	it("does not let the list be read as a finished rename", () => {
		expect(findSymbol.function.description).toContain("does not prove that every use is there")
		expect(findSymbol.function.description).toContain("rename is complete")
	})
})
