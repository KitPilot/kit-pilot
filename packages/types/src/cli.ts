import { z } from "zod"

import { kitpilotCodeSettingsSchema } from "./global-settings.js"

/**
 * KitPilot CLI stdin commands
 */

export const kitpilotCliCommandNames = ["start", "message", "cancel", "ping", "shutdown"] as const

export const kitpilotCliCommandNameSchema = z.enum(kitpilotCliCommandNames)

export type KitPilotCliCommandName = z.infer<typeof kitpilotCliCommandNameSchema>

export const kitpilotCliCommandBaseSchema = z.object({
	command: kitpilotCliCommandNameSchema,
	requestId: z.string().min(1),
})

export type KitPilotCliCommandBase = z.infer<typeof kitpilotCliCommandBaseSchema>

const kitpilotCliSessionIdSchema = z
	.string()
	.trim()
	.regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)

export const kitpilotCliStartCommandSchema = kitpilotCliCommandBaseSchema.extend({
	command: z.literal("start"),
	prompt: z.string(),
	taskId: kitpilotCliSessionIdSchema.optional(),
	images: z.array(z.string()).optional(),
	configuration: kitpilotCodeSettingsSchema.optional(),
})

export type KitPilotCliStartCommand = z.infer<typeof kitpilotCliStartCommandSchema>

export const kitpilotCliMessageCommandSchema = kitpilotCliCommandBaseSchema.extend({
	command: z.literal("message"),
	prompt: z.string(),
	images: z.array(z.string()).optional(),
})

export type KitPilotCliMessageCommand = z.infer<typeof kitpilotCliMessageCommandSchema>

export const kitpilotCliCancelCommandSchema = kitpilotCliCommandBaseSchema.extend({
	command: z.literal("cancel"),
})

export type KitPilotCliCancelCommand = z.infer<typeof kitpilotCliCancelCommandSchema>

export const kitpilotCliPingCommandSchema = kitpilotCliCommandBaseSchema.extend({
	command: z.literal("ping"),
})

export type KitPilotCliPingCommand = z.infer<typeof kitpilotCliPingCommandSchema>

export const kitpilotCliShutdownCommandSchema = kitpilotCliCommandBaseSchema.extend({
	command: z.literal("shutdown"),
})

export type KitPilotCliShutdownCommand = z.infer<typeof kitpilotCliShutdownCommandSchema>

export const kitpilotCliInputCommandSchema = z.discriminatedUnion("command", [
	kitpilotCliStartCommandSchema,
	kitpilotCliMessageCommandSchema,
	kitpilotCliCancelCommandSchema,
	kitpilotCliPingCommandSchema,
	kitpilotCliShutdownCommandSchema,
])

export type KitPilotCliInputCommand = z.infer<typeof kitpilotCliInputCommandSchema>

/**
 * KitPilot CLI stream-json output
 */

export const kitpilotCliOutputFormats = ["text", "json", "stream-json"] as const

export const kitpilotCliOutputFormatSchema = z.enum(kitpilotCliOutputFormats)

export type KitPilotCliOutputFormat = z.infer<typeof kitpilotCliOutputFormatSchema>

export const kitpilotCliEventTypes = [
	"system",
	"control",
	"queue",
	"assistant",
	"user",
	"tool_use",
	"tool_result",
	"thinking",
	"error",
	"result",
] as const

export const kitpilotCliEventTypeSchema = z.enum(kitpilotCliEventTypes)

export type KitPilotCliEventType = z.infer<typeof kitpilotCliEventTypeSchema>

export const kitpilotCliControlSubtypes = ["ack", "done", "error"] as const

export const kitpilotCliControlSubtypeSchema = z.enum(kitpilotCliControlSubtypes)

export type KitPilotCliControlSubtype = z.infer<typeof kitpilotCliControlSubtypeSchema>

export const kitpilotCliQueueItemSchema = z.object({
	id: z.string().min(1),
	text: z.string().optional(),
	imageCount: z.number().optional(),
	timestamp: z.number().optional(),
})

export type KitPilotCliQueueItem = z.infer<typeof kitpilotCliQueueItemSchema>

export const kitpilotCliToolUseSchema = z.object({
	name: z.string(),
	input: z.record(z.unknown()).optional(),
})

export type KitPilotCliToolUse = z.infer<typeof kitpilotCliToolUseSchema>

export const kitpilotCliToolResultSchema = z.object({
	name: z.string(),
	output: z.string().optional(),
	error: z.string().optional(),
	exitCode: z.number().optional(),
})

export type KitPilotCliToolResult = z.infer<typeof kitpilotCliToolResultSchema>

export const kitpilotCliCostSchema = z.object({
	totalCost: z.number().optional(),
	inputTokens: z.number().optional(),
	outputTokens: z.number().optional(),
	cacheWrites: z.number().optional(),
	cacheReads: z.number().optional(),
})

export type KitPilotCliCost = z.infer<typeof kitpilotCliCostSchema>

export const kitpilotCliStreamEventSchema = z
	.object({
		type: kitpilotCliEventTypeSchema.optional(),
		subtype: z.string().optional(),
		requestId: z.string().optional(),
		command: kitpilotCliCommandNameSchema.optional(),
		taskId: z.string().optional(),
		code: z.string().optional(),
		content: z.string().optional(),
		success: z.boolean().optional(),
		id: z.number().optional(),
		done: z.boolean().optional(),
		queueDepth: z.number().optional(),
		queue: z.array(kitpilotCliQueueItemSchema).optional(),
		schemaVersion: z.number().optional(),
		protocol: z.string().optional(),
		capabilities: z.array(z.string()).optional(),
		tool_use: kitpilotCliToolUseSchema.optional(),
		tool_result: kitpilotCliToolResultSchema.optional(),
		cost: kitpilotCliCostSchema.optional(),
	})
	.passthrough()

export type KitPilotCliStreamEvent = z.infer<typeof kitpilotCliStreamEventSchema>

export const kitpilotCliControlEventSchema = kitpilotCliStreamEventSchema.extend({
	type: z.literal("control"),
	subtype: kitpilotCliControlSubtypeSchema,
	requestId: z.string().min(1),
})

export type KitPilotCliControlEvent = z.infer<typeof kitpilotCliControlEventSchema>

export const kitpilotCliFinalOutputSchema = z.object({
	type: z.literal("result"),
	success: z.boolean(),
	content: z.string().optional(),
	cost: kitpilotCliCostSchema.optional(),
	events: z.array(kitpilotCliStreamEventSchema),
})

export type KitPilotCliFinalOutput = z.infer<typeof kitpilotCliFinalOutputSchema>
