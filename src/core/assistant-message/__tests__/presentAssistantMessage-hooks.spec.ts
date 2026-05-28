// npx vitest src/core/assistant-message/__tests__/presentAssistantMessage-hooks.spec.ts

import { beforeEach, describe, expect, it, vi } from "vitest"
import { presentAssistantMessage } from "../presentAssistantMessage"

// Mock dependencies
vi.mock("../../task/Task")
vi.mock("../../tools/validateToolUse", () => ({
	validateToolUse: vi.fn(),
	isValidToolName: vi.fn(() => true),
}))

// Mock the hook service — gives us a knob to make hooks block or pass per-test
// without spinning up a real shell subprocess.
vi.mock("../../../services/hooks", () => ({
	processHookEvent: vi.fn(),
}))

// Mock ReadFileTool so we can spy on whether the handler was reached.
vi.mock("../../tools/ReadFileTool", () => ({
	readFileTool: {
		handle: vi.fn().mockResolvedValue(undefined),
		getReadFileToolDescription: vi.fn(() => "[read_file]"),
	},
}))

describe("presentAssistantMessage — hook integration", () => {
	let mockTask: any
	let processHookEvent: ReturnType<typeof vi.fn>
	let readFileTool: { handle: ReturnType<typeof vi.fn> }

	beforeEach(async () => {
		processHookEvent = (await import("../../../services/hooks")).processHookEvent as any
		readFileTool = (await import("../../tools/ReadFileTool")).readFileTool as any
		processHookEvent.mockReset()
		readFileTool.handle.mockClear()

		mockTask = {
			taskId: "test-task-id",
			instanceId: "test-instance",
			cwd: "/tmp/kitpilot-test",
			abort: false,
			presentAssistantMessageLocked: false,
			presentAssistantMessageHasPendingUpdates: false,
			currentStreamingContentIndex: 0,
			assistantMessageContent: [],
			userMessageContent: [],
			didCompleteReadingStream: false,
			didRejectTool: false,
			didAlreadyUseTool: false,
			consecutiveMistakeCount: 0,
			clineMessages: [],
			api: { getModel: () => ({ id: "test-model", info: {} }) },
			recordToolUsage: vi.fn(),
			recordToolError: vi.fn(),
			recordToolOutcome: vi.fn(),
			toolRepetitionDetector: { check: vi.fn().mockReturnValue({ allowExecution: true }) },
			providerRef: {
				deref: () => ({
					getState: vi.fn().mockResolvedValue({ mode: "code", customModes: [] }),
				}),
			},
			say: vi.fn().mockResolvedValue(undefined),
			ask: vi.fn().mockResolvedValue({ response: "yesButtonClicked" }),
		}

		mockTask.pushToolResultToUserContent = vi.fn().mockImplementation((toolResult: any) => {
			const existing = mockTask.userMessageContent.find(
				(b: any) => b.type === "tool_result" && b.tool_use_id === toolResult.tool_use_id,
			)
			if (existing) return false
			mockTask.userMessageContent.push(toolResult)
			return true
		})
	})

	it("PreToolUse block prevents the handler from running and pushes the block reason", async () => {
		processHookEvent.mockImplementation(async (_cwd: string, event: any) => {
			if (event.eventType === "PreToolUse") {
				return {
					blocked: true,
					executedHooks: 1,
					results: [],
					blockingReason: "Forbidden by guard hook",
					totalDurationMs: 0,
				}
			}
			return { blocked: false, executedHooks: 0, results: [], totalDurationMs: 0 }
		})

		const toolCallId = "tool_call_pre_block"
		mockTask.assistantMessageContent = [
			{
				type: "tool_use",
				id: toolCallId,
				name: "read_file",
				params: { path: "secrets.env" },
				nativeArgs: { path: "secrets.env" },
				partial: false,
			},
		]

		await presentAssistantMessage(mockTask)

		// Handler must NOT have been called.
		expect(readFileTool.handle).not.toHaveBeenCalled()

		// Tool result must contain the block reason.
		const result = mockTask.userMessageContent.find(
			(b: any) => b.type === "tool_result" && b.tool_use_id === toolCallId,
		)
		expect(result).toBeDefined()
		expect(result.content).toContain("Forbidden by guard hook")

		// recordToolError should have been called with the reason.
		expect(mockTask.recordToolError).toHaveBeenCalledWith("read_file", expect.stringContaining("Forbidden"))
	})

	it("PreToolUse pass-through lets the handler run", async () => {
		processHookEvent.mockResolvedValue({
			blocked: false,
			executedHooks: 0,
			results: [],
			totalDurationMs: 0,
		})

		const toolCallId = "tool_call_pass"
		mockTask.assistantMessageContent = [
			{
				type: "tool_use",
				id: toolCallId,
				name: "read_file",
				params: { path: "src/index.ts" },
				nativeArgs: { path: "src/index.ts" },
				partial: false,
			},
		]

		await presentAssistantMessage(mockTask)

		// Handler MUST have been called exactly once.
		expect(readFileTool.handle).toHaveBeenCalledTimes(1)
	})

	it("hooks are skipped for partial (streaming) blocks", async () => {
		processHookEvent.mockResolvedValue({
			blocked: false,
			executedHooks: 0,
			results: [],
			totalDurationMs: 0,
		})

		mockTask.assistantMessageContent = [
			{
				type: "tool_use",
				id: "tool_call_partial",
				name: "read_file",
				params: { path: "incomplete" },
				nativeArgs: { path: "incomplete" },
				partial: true,
			},
		]

		await presentAssistantMessage(mockTask)

		// Neither PreToolUse nor PostToolUse should have been fired for partials.
		expect(processHookEvent).not.toHaveBeenCalled()
	})
})
