import type { TokenUsage, ToolUsage } from "@kit-pilot/types"

/**
 * The categories in the evaluation plan. Each category holds the kind of task
 * that a change to KitPilot's context or navigation is expected to improve.
 */
export type EvalCategory = "bug-fix" | "cross-file-refactor" | "test-failure" | "project-memory" | "interrupted-task"

export interface GradeResult {
	passed: boolean
	/** Why it passed or failed. Goes into the report. */
	detail: string
}

export interface EvalCase {
	id: string
	category: EvalCategory
	/** What the case measures, in one sentence. */
	intent: string
	/** Directory under `evals-fixtures/`. It holds `workspace/` and `solution/`. */
	fixture: string
	/** The message given to KitPilot. */
	prompt: string
	/** The mode to run the task in. */
	mode: string
	/**
	 * Grades the workspace after the run.
	 *
	 * The grader reads the workspace only. It never reads the transcript, so a
	 * task passes on what it did to the code, not on what it said.
	 */
	grade: (workspaceDir: string) => Promise<GradeResult>
}

export interface ToolSummary {
	/** Calls that look for something: read_file, search_files, list_files, codebase_search. */
	exploratoryCalls: number
	/** Calls that change a file. */
	editCalls: number
	/** Shell calls. Counted apart, because a shell call can explore or build. */
	shellCalls: number
	/** Every call, including the ones in no group above. */
	totalCalls: number
	/** Calls that reported a failure, over all tools. */
	failedCalls: number
	/** Per tool name, for the report. */
	byTool: Record<string, number>
}

export interface TrialResult {
	caseId: string
	trial: number
	passed: boolean
	detail: string
	/** From the start of the task to its completion, in milliseconds. */
	elapsedMs: number
	/** True when the task did not finish inside the timeout. */
	timedOut: boolean
	/** True when the task was aborted. */
	aborted: boolean
	error?: string
	tools: ToolSummary
	tokensIn: number
	tokensOut: number
	cost: number
}

export interface Stat {
	mean: number
	median: number
	min: number
	max: number
	/** Sample standard deviation. It is 0 when there is one trial only. */
	stdDev: number
}

export interface CaseSummary {
	caseId: string
	category: EvalCategory
	trials: number
	passed: number
	passRate: number
	elapsedMs: Stat
	exploratoryCalls: Stat
	editCalls: Stat
	shellCalls: Stat
	totalCalls: Stat
	cost: Stat
}

export interface EvalRun {
	/** ISO 8601. */
	startedAt: string
	label: string
	modelId: string
	extensionVersion: string
	vscodeVersion: string
	trialsPerCase: number
	cases: CaseSummary[]
	trialResults: TrialResult[]
}

export interface RawTaskMetrics {
	tokenUsage?: TokenUsage
	toolUsage?: ToolUsage
}
