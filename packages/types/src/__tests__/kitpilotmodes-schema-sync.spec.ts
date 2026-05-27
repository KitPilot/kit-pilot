import { describe, it, expect } from "vitest"
import * as fs from "fs"
import * as path from "path"
import { fileURLToPath } from "url"

import { generateRoomodesJsonSchema } from "../kitpilotmodes-schema.js"

/**
 * This test verifies that the checked-in schemas/kitpilotmodes.json matches what
 * would be generated from the current Zod schemas. If this test fails, run:
 *
 *   pnpm --filter @kit-pilot/types generate:schema
 *
 * to regenerate the schema file.
 */
describe("kitpilotmodes schema sync", () => {
	it("should match the dynamically generated schema from Zod types", () => {
		const __dirname = path.dirname(fileURLToPath(import.meta.url))
		const schemaPath = path.resolve(__dirname, "../../../../schemas/kitpilotmodes.json")
		const checkedIn = JSON.parse(fs.readFileSync(schemaPath, "utf-8"))

		const generated = generateRoomodesJsonSchema()

		expect(checkedIn).toEqual(generated)
	})
})
