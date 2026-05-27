/**
 * Builds the Zod schema for .kitpilotmodes configuration files and converts it
 * to JSON Schema (draft-07). This module is the single source of truth for
 * both the generator script (scripts/generate-kitpilotmodes-schema.ts) and the
 * drift-detection test.
 */

import { z } from "zod"
import { zodToJsonSchema } from "zod-to-json-schema"

import { toolGroups, deprecatedToolGroups } from "./tool.js"
import { groupOptionsSchema, modeConfigSchema } from "./mode.js"

// Build a ToolGroup enum that includes deprecated groups so existing configs
// still validate.
const allToolGroups = [...toolGroups, ...deprecatedToolGroups] as [string, ...string[]]
const allToolGroupsSchema = z.enum(allToolGroups)

// Build a GroupEntry schema that uses the extended tool group list.
const groupEntrySchema = z.union([allToolGroupsSchema, z.tuple([allToolGroupsSchema, groupOptionsSchema])])

// Build the RuleFile schema (used during import/export but not part of the
// core Zod types).
const ruleFileSchema = z.object({
	relativePath: z.string(),
	content: z.string().optional(),
})

// Build an extended ModeConfig schema that includes rulesFiles and uses the
// extended groups (with deprecated entries).
const exportedModeConfigSchema = modeConfigSchema.omit({ groups: true }).extend({
	groups: z.array(groupEntrySchema),
	rulesFiles: z.array(ruleFileSchema).optional(),
})

// Build the top-level .kitpilotmodes schema.
const kitpilotmodesZodSchema = z
	.object({
		customModes: z.array(exportedModeConfigSchema),
	})
	.strict()

/**
 * Generates the JSON Schema object for .kitpilotmodes configuration files.
 * Includes metadata fields ($id, title, description).
 */
export function generateRoomodesJsonSchema(): Record<string, unknown> {
	const jsonSchema = zodToJsonSchema(kitpilotmodesZodSchema, {
		$refStrategy: "none",
		target: "jsonSchema7",
	}) as Record<string, unknown>

	jsonSchema["$id"] = "https://github.com/KitPilotInc/KitPilot/blob/main/schemas/kitpilotmodes.json"
	jsonSchema["title"] = "KitPilot Custom Modes"
	jsonSchema["description"] = "Schema for .kitpilotmodes configuration files used by KitPilot to define custom modes."

	return jsonSchema
}
