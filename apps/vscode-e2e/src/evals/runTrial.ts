import {
	KitPilotEventName,
	type KitPilotAPI,
	type KitPilotSettings,
	type TokenUsage,
	type ToolUsage,
} from "@kit-pilot/types"

import { waitFor } from "../suite/utils"
import { summarizeToolUsage } from "./metrics"
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
	let tokenUsage: TokenUsage | undefined
	let toolUsage: ToolUsage | undefined
	let completed = false
	let aborted = false

	const onCompleted = (taskId: string, usage: TokenUsage, tools: ToolUsage) => {
		if (taskId === startedTaskId) {
			tokenUsage = usage
			toolUsage = tools
			completed = true
		}
	}
	const onAborted = (taskId: string) => {
		if (taskId === startedTaskId) {
			aborted = true
		}
	}

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

	return {
		caseId: evalCase.id,
		trial,
		passed: graded.passed,
		detail: graded.detail,
		elapsedMs,
		timedOut,
		aborted,
		error,
		tools: summarizeToolUsage(toolUsage),
		tokensIn: tokenUsage?.totalTokensIn ?? 0,
		tokensOut: tokenUsage?.totalTokensOut ?? 0,
		cost: tokenUsage?.totalCost ?? 0,
	}
}
