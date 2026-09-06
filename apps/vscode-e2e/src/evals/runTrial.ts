import {
	KitPilotEventName,
	type KitPilotAPI,
	type KitPilotSettings,
	type TokenUsage,
	type ToolUsage,
} from "@kit-pilot/types"

import { waitFor } from "../suite/utils"
import { mergeToolUsage, summarizeToolUsage } from "./metrics"
import type { EvalCase, EvalVariant, TrialResult } from "./types"
import { resetWorkspace } from "./workspace"

export interface TrialOptions {
	/** Which build to run. See EvalVariant. */
	variant: EvalVariant
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
		// The only difference between the two variants. `disabledTools` drops the
		// tool and its description from the request, so the baseline never sees
		// that the tool exists.
		disabledTools: options.variant === "baseline" ? ["find_symbol"] : [],
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
	 *
	 * The presence of an entry says nothing. `Task` saves the first user message
	 * before it asks the model, and `hasTokenUsageChanged` treats the first
	 * snapshot as a change, so every trial gets an entry of zeros before any
	 * work happens. Whether a trial was measured therefore depends on what the
	 * entries hold, not on how many there are. See `didAnyWork`.
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
		behaviorChecked: false,
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

	const summary = summarizeToolUsage(tools)

	return {
		caseId: evalCase.id,
		variant: options.variant,
		trial,
		passed: graded.passed,
		detail: graded.detail,
		behaviorChecked: graded.behaviorChecked,
		elapsedMs,
		timedOut,
		aborted,
		error,
		// A trial that did no work did not run. The report must not read that as
		// a cheap trial that needed no exploration.
		usageMissing: !didAnyWork(summary.totalCalls, tokensIn, tokensOut),
		tools: summary,
		tokensIn,
		tokensOut,
		cost,
	}
}

/**
 * Says whether a trial did any work.
 *
 * A tool call is the strongest sign, and it stands on its own: Copilot has
 * reported a cost of zero, so a trial that ran tools must still count when the
 * cost is missing. Tokens cover a turn that answered without a tool. Cost is
 * not part of the test, for the same reason.
 */
export function didAnyWork(totalCalls: number, tokensIn: number, tokensOut: number): boolean {
	return totalCalls > 0 || tokensIn > 0 || tokensOut > 0
}
