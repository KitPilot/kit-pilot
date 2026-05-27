import { z } from "zod"

import { clineMessageSchema, queuedMessageSchema, tokenUsageSchema } from "./message.js"
import { modelInfoSchema } from "./model.js"
import { toolNamesSchema, toolUsageSchema } from "./tool.js"

/**
 * KitPilotEventName
 */

export enum KitPilotEventName {
	// Task Provider Lifecycle
	TaskCreated = "taskCreated",

	// Task Lifecycle
	TaskStarted = "taskStarted",
	TaskCompleted = "taskCompleted",
	TaskAborted = "taskAborted",
	TaskFocused = "taskFocused",
	TaskUnfocused = "taskUnfocused",
	TaskActive = "taskActive",
	TaskInteractive = "taskInteractive",
	TaskResumable = "taskResumable",
	TaskIdle = "taskIdle",

	// Subtask Lifecycle
	TaskPaused = "taskPaused",
	TaskUnpaused = "taskUnpaused",
	TaskSpawned = "taskSpawned",
	TaskDelegated = "taskDelegated",
	TaskDelegationCompleted = "taskDelegationCompleted",
	TaskDelegationResumed = "taskDelegationResumed",

	// Task Execution
	Message = "message",
	TaskModeSwitched = "taskModeSwitched",
	TaskAskResponded = "taskAskResponded",
	TaskUserMessage = "taskUserMessage",
	QueuedMessagesUpdated = "queuedMessagesUpdated",

	// Task Analytics
	TaskTokenUsageUpdated = "taskTokenUsageUpdated",
	TaskToolFailed = "taskToolFailed",

	// Configuration Changes
	ModeChanged = "modeChanged",
	ProviderProfileChanged = "providerProfileChanged",

	// Query Responses
	CommandsResponse = "commandsResponse",
	ModesResponse = "modesResponse",
	ModelsResponse = "modelsResponse",
}

/**
 * KitPilotEvents
 */

export const kitpilotCodeEventsSchema = z.object({
	[KitPilotEventName.TaskCreated]: z.tuple([z.string()]),

	[KitPilotEventName.TaskStarted]: z.tuple([z.string()]),
	[KitPilotEventName.TaskCompleted]: z.tuple([
		z.string(),
		tokenUsageSchema,
		toolUsageSchema,
		z.object({
			isSubtask: z.boolean(),
		}),
	]),
	[KitPilotEventName.TaskAborted]: z.tuple([z.string()]),
	[KitPilotEventName.TaskFocused]: z.tuple([z.string()]),
	[KitPilotEventName.TaskUnfocused]: z.tuple([z.string()]),
	[KitPilotEventName.TaskActive]: z.tuple([z.string()]),
	[KitPilotEventName.TaskInteractive]: z.tuple([z.string()]),
	[KitPilotEventName.TaskResumable]: z.tuple([z.string()]),
	[KitPilotEventName.TaskIdle]: z.tuple([z.string()]),

	[KitPilotEventName.TaskPaused]: z.tuple([z.string()]),
	[KitPilotEventName.TaskUnpaused]: z.tuple([z.string()]),
	[KitPilotEventName.TaskSpawned]: z.tuple([z.string(), z.string()]),
	[KitPilotEventName.TaskDelegated]: z.tuple([
		z.string(), // parentTaskId
		z.string(), // childTaskId
	]),
	[KitPilotEventName.TaskDelegationCompleted]: z.tuple([
		z.string(), // parentTaskId
		z.string(), // childTaskId
		z.string(), // completionResultSummary
	]),
	[KitPilotEventName.TaskDelegationResumed]: z.tuple([
		z.string(), // parentTaskId
		z.string(), // childTaskId
	]),

	[KitPilotEventName.Message]: z.tuple([
		z.object({
			taskId: z.string(),
			action: z.union([z.literal("created"), z.literal("updated")]),
			message: clineMessageSchema,
		}),
	]),
	[KitPilotEventName.TaskModeSwitched]: z.tuple([z.string(), z.string()]),
	[KitPilotEventName.TaskAskResponded]: z.tuple([z.string()]),
	[KitPilotEventName.TaskUserMessage]: z.tuple([z.string()]),
	[KitPilotEventName.QueuedMessagesUpdated]: z.tuple([z.string(), z.array(queuedMessageSchema)]),

	[KitPilotEventName.TaskToolFailed]: z.tuple([z.string(), toolNamesSchema, z.string()]),
	[KitPilotEventName.TaskTokenUsageUpdated]: z.tuple([z.string(), tokenUsageSchema, toolUsageSchema]),

	[KitPilotEventName.ModeChanged]: z.tuple([z.string()]),
	[KitPilotEventName.ProviderProfileChanged]: z.tuple([z.object({ name: z.string(), provider: z.string() })]),

	[KitPilotEventName.CommandsResponse]: z.tuple([
		z.array(
			z.object({
				name: z.string(),
				source: z.enum(["global", "project", "built-in"]),
				filePath: z.string().optional(),
				description: z.string().optional(),
				argumentHint: z.string().optional(),
			}),
		),
	]),
	[KitPilotEventName.ModesResponse]: z.tuple([z.array(z.object({ slug: z.string(), name: z.string() }))]),
	[KitPilotEventName.ModelsResponse]: z.tuple([z.record(z.string(), modelInfoSchema)]),
})

export type KitPilotEvents = z.infer<typeof kitpilotCodeEventsSchema>

/**
 * TaskEvent
 */

export const taskEventSchema = z.discriminatedUnion("eventName", [
	// Task Provider Lifecycle
	z.object({
		eventName: z.literal(KitPilotEventName.TaskCreated),
		payload: kitpilotCodeEventsSchema.shape[KitPilotEventName.TaskCreated],
		taskId: z.number().optional(),
	}),

	// Task Lifecycle
	z.object({
		eventName: z.literal(KitPilotEventName.TaskStarted),
		payload: kitpilotCodeEventsSchema.shape[KitPilotEventName.TaskStarted],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(KitPilotEventName.TaskCompleted),
		payload: kitpilotCodeEventsSchema.shape[KitPilotEventName.TaskCompleted],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(KitPilotEventName.TaskAborted),
		payload: kitpilotCodeEventsSchema.shape[KitPilotEventName.TaskAborted],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(KitPilotEventName.TaskFocused),
		payload: kitpilotCodeEventsSchema.shape[KitPilotEventName.TaskFocused],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(KitPilotEventName.TaskUnfocused),
		payload: kitpilotCodeEventsSchema.shape[KitPilotEventName.TaskUnfocused],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(KitPilotEventName.TaskActive),
		payload: kitpilotCodeEventsSchema.shape[KitPilotEventName.TaskActive],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(KitPilotEventName.TaskInteractive),
		payload: kitpilotCodeEventsSchema.shape[KitPilotEventName.TaskInteractive],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(KitPilotEventName.TaskResumable),
		payload: kitpilotCodeEventsSchema.shape[KitPilotEventName.TaskResumable],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(KitPilotEventName.TaskIdle),
		payload: kitpilotCodeEventsSchema.shape[KitPilotEventName.TaskIdle],
		taskId: z.number().optional(),
	}),

	// Subtask Lifecycle
	z.object({
		eventName: z.literal(KitPilotEventName.TaskPaused),
		payload: kitpilotCodeEventsSchema.shape[KitPilotEventName.TaskPaused],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(KitPilotEventName.TaskUnpaused),
		payload: kitpilotCodeEventsSchema.shape[KitPilotEventName.TaskUnpaused],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(KitPilotEventName.TaskSpawned),
		payload: kitpilotCodeEventsSchema.shape[KitPilotEventName.TaskSpawned],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(KitPilotEventName.TaskDelegated),
		payload: kitpilotCodeEventsSchema.shape[KitPilotEventName.TaskDelegated],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(KitPilotEventName.TaskDelegationCompleted),
		payload: kitpilotCodeEventsSchema.shape[KitPilotEventName.TaskDelegationCompleted],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(KitPilotEventName.TaskDelegationResumed),
		payload: kitpilotCodeEventsSchema.shape[KitPilotEventName.TaskDelegationResumed],
		taskId: z.number().optional(),
	}),

	// Task Execution
	z.object({
		eventName: z.literal(KitPilotEventName.Message),
		payload: kitpilotCodeEventsSchema.shape[KitPilotEventName.Message],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(KitPilotEventName.TaskModeSwitched),
		payload: kitpilotCodeEventsSchema.shape[KitPilotEventName.TaskModeSwitched],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(KitPilotEventName.TaskAskResponded),
		payload: kitpilotCodeEventsSchema.shape[KitPilotEventName.TaskAskResponded],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(KitPilotEventName.QueuedMessagesUpdated),
		payload: kitpilotCodeEventsSchema.shape[KitPilotEventName.QueuedMessagesUpdated],
		taskId: z.number().optional(),
	}),

	// Task Analytics
	z.object({
		eventName: z.literal(KitPilotEventName.TaskToolFailed),
		payload: kitpilotCodeEventsSchema.shape[KitPilotEventName.TaskToolFailed],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(KitPilotEventName.TaskTokenUsageUpdated),
		payload: kitpilotCodeEventsSchema.shape[KitPilotEventName.TaskTokenUsageUpdated],
		taskId: z.number().optional(),
	}),

	// Query Responses
	z.object({
		eventName: z.literal(KitPilotEventName.CommandsResponse),
		payload: kitpilotCodeEventsSchema.shape[KitPilotEventName.CommandsResponse],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(KitPilotEventName.ModesResponse),
		payload: kitpilotCodeEventsSchema.shape[KitPilotEventName.ModesResponse],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(KitPilotEventName.ModelsResponse),
		payload: kitpilotCodeEventsSchema.shape[KitPilotEventName.ModelsResponse],
		taskId: z.number().optional(),
	}),
])

export type TaskEvent = z.infer<typeof taskEventSchema>
