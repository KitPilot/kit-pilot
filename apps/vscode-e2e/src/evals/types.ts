import type { TokenUsage, ToolUsage } from "@kit-pilot/types"

/**
 * The categories in the evaluation plan. Each category holds the kind of task
 * that a change to KitPilot's context or navigation is expected to improve.
 */
export type EvalCategory = "bug-fix" | "cross-file-refactor" | "test-failure" | "project-memory" | "interrupted-task"

/**
 * The two builds under comparison.
 *
 * Both are the same commit and the same build. "baseline" turns `find_symbol`
 * off through the `disabledTools` setting, which drops the tool and its
 * description from the request. Nothing else differs, thus a difference in the
 * result belongs to the tool and not to some other change between commits.
 */
export type EvalVariant = "baseline" | "treatment"

export const EVAL_VARIANTS: readonly EvalVariant[] = ["baseline", "treatment"]

export interface GradeResult {
	passed: boolean
	/** Why it passed or failed. Goes into the report. */
	detail: string
	/**
	 * Whether the grader ran the code, or only read it.
	 *
	 * The TypeScript case runs on Node 23 and later. On an older Node its grader
	 * checks the rename and nothing else. A pass of that kind is weaker, so the
	 * report keeps the two apart rather than adding them together.
	 */
	behaviorChecked: boolean
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
	variant: EvalVariant
	trial: number
	passed: boolean
	detail: string
	/** Whether the grader ran the code, or only read it. */
	behaviorChecked: boolean
	/** From the start of the task to its completion, in milliseconds. */
	elapsedMs: number
	/** True when the task did not finish inside the timeout. */
	timedOut: boolean
	/** True when the task was aborted. */
	aborted: boolean
	error?: string
	/** True when no usage event arrived, thus the trial produced no measurement. */
	usageMissing: boolean
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
	variant: EvalVariant
	category: EvalCategory
	/** Trials whose grader ran the code. The rest only read it. */
	behaviorChecked: number
	trials: number
	passed: number
	passRate: number
	/** Trials that reported usage. Only these feed the call and cost statistics. */
	measured: number
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
	/** The variants that ran, in the order they were asked for. */
	variants: EvalVariant[]
	cases: CaseSummary[]
	trialResults: TrialResult[]
	/** Cases that could not run at all, for example when VS Code failed to start. */
	failures: CaseFailure[]
}

export interface CaseFailure {
	caseId: string
	reason: string
}

export interface RawTaskMetrics {
	tokenUsage?: TokenUsage
	toolUsage?: ToolUsage
}
