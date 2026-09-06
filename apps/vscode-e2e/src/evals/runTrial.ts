import {
	KitPilotEventName,
	type KitPilotAPI,
	type KitPilotSettings,
	type TokenUsage,
	type ToolUsage,
} from "@kit-pilot/types"

import { waitFor } from "../suite/utils"
import { mergeToolUsage, summarizeToolUsage } from "./metrics"
import type { EvalCase, TrialResult } from "./types"
import { resetWorkspace } from "./workspace"

export interface TrialOptions {
	/** How long one task may run before the trial counts as a timeout. */
	timeoutMs: number
	/** The Copilot model id, for example "gpt-4.1". */
	modelId: string
	/** Upper bound on requests, so one trial cannot run away. */
	maxRequests: number
}

/**
 * Settings for every trial.
 *
 * Approval is automatic, because a trial has nobody to answer a prompt.
 *
 * `alwaysAllowExecute` alone is not enough: `getCommandDecision` returns false
 * when the allowlist is empty, so every command would wait for an approval that
 * never comes and the trial would end in a timeout. The wildcard is safe here
 * and only here, because a trial runs in a temporary workspace that holds a
 * copy of the fixture and nothing else. The denylist is stated rather than left
 * out, so the setting is a decision and not an oversight.
 *
 * Checkpoints are off, because the harness copies the fixture over the
 * workspace between trials and a shadow Git repository does not expect that.
 */
function trialConfiguration(evalCase: EvalCase, options: TrialOptions): KitPilotSettings {
	return {
		mode: evalCase.mode,
		apiProvider: "vscode-lm",
		vsCodeLmModelSelector: { vendor: "copilot", id: options.modelId },
		autoApprovalEnabled: true,
		alwaysAllowReadOnly: true,
		alwaysAllowWrite: true,
		alwaysAllowExecute: true,
		allowedCommands: ["*"],
		deniedCommands: [],
		alwaysAllowModeSwitch: true,
		alwaysAllowSubtasks: true,
		alwaysApproveResubmit: true,
		enableCheckpoints: false,
		allowedMaxRequests: options.maxRequests,
		allowedMaxCost: null,
	} as KitPilotSettings
}

export async function runTrial(
	api: KitPilotAPI,
	evalCase: EvalCase,
	workspaceDir: string,
	trial: number,
	options: TrialOptions,
): Promise<TrialResult> {
	await resetWorkspace(evalCase.fixture, workspaceDir)

	let startedTaskId = ""
	let completed = false
	let aborted = false

	/**
	 * The latest usage of every task seen during the trial, keyed by task id.
	 *
	 * A trial that times out or aborts never fires TaskCompleted. Reading usage
	 * from that event alone would report zero calls and zero cost for a trial
	 * that in fact made many calls. Those zeros would then lower the median
	 * number of exploratory calls, which is the very measure the harness exists
	 * to compare. Thus the trial also follows TaskTokenUsageUpdated, which fires
	 * while the task runs.
	 *
	 * A subtask reports under its own id, so the map holds the whole run.
	 */
	const usageByTask = new Map<string, { tokens: TokenUsage; tools: ToolUsage }>()

	const onUsage = (taskId: string, tokens: TokenUsage, tools: ToolUsage) => {
		usageByTask.set(taskId, { tokens, tools })
	}
	const onCompleted = (taskId: string, tokens: TokenUsage, tools: ToolUsage) => {
		usageByTask.set(taskId, { tokens, tools })
		if (taskId === startedTaskId) {
			completed = true
		}
	}
	const onAborted = (taskId: string) => {
		if (taskId === startedTaskId) {
			aborted = true
		}
	}

	api.on(KitPilotEventName.TaskTokenUsageUpdated, onUsage)
	api.on(KitPilotEventName.TaskCompleted, onCompleted)
	api.on(KitPilotEventName.TaskAborted, onAborted)

	const startedAt = Date.now()
	let timedOut = false
	let error: string | undefined

	try {
		startedTaskId = await api.startNewTask({
			configuration: trialConfiguration(evalCase, options),
			text: evalCase.prompt,
		})

		await waitFor(() => completed || aborted, { timeout: options.timeoutMs, interval: 500 })
	} catch (caught) {
		timedOut = true
		error = caught instanceof Error ? caught.message : String(caught)
	} finally {
		api.off(KitPilotEventName.TaskTokenUsageUpdated, onUsage)
		api.off(KitPilotEventName.TaskCompleted, onCompleted)
		api.off(KitPilotEventName.TaskAborted, onAborted)
	}

	const elapsedMs = Date.now() - startedAt

	// Stop whatever is still running before the grader reads the files.
	try {
		await api.cancelCurrentTask()
	} catch {
		// There is nothing to cancel.
	}
	try {
		await api.clearCurrentTask()
	} catch {
		// There is nothing to clear.
	}

	const graded = await evalCase.grade(workspaceDir).catch((caught: unknown) => ({
		passed: false,
		detail: `the grader threw: ${caught instanceof Error ? caught.message : String(caught)}`,
	}))

	let tools: ToolUsage | undefined
	let tokensIn = 0
	let tokensOut = 0
	let cost = 0

	for (const entry of usageByTask.values()) {
		tools = mergeToolUsage(tools, entry.tools)
		tokensIn += entry.tokens.totalTokensIn
		tokensOut += entry.tokens.totalTokensOut
		cost += entry.tokens.totalCost
	}

	return {
		caseId: evalCase.id,
		trial,
		passed: graded.passed,
		detail: graded.detail,
		elapsedMs,
		timedOut,
		aborted,
		error,
		// A trial that reported no usage at all did not run. The report must not
		// read that as a cheap trial that needed no exploration.
		usageMissing: usageByTask.size === 0,
		tools: summarizeToolUsage(tools),
		tokensIn,
		tokensOut,
		cost,
	}
}
