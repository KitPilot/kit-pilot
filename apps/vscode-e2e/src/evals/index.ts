import * as fs from "fs/promises"
import * as vscode from "vscode"

import type { KitPilotAPI } from "@kit-pilot/types"

import { waitFor } from "../suite/utils"
import { findCase } from "./cases"
import { summarizeCase, variantOrder } from "./metrics"
import { runTrial } from "./runTrial"
import { DEFAULT_TRIALS, EVAL_VARIANTS, type CaseSummary, type EvalVariant, type TrialResult } from "./types"

/**
 * Runs the trials for one case inside VS Code.
 *
 * `runEvals.ts` starts VS Code one time for each case, because a task runs in
 * the workspace folder and each case needs its own. The case id, the workspace
 * and the output file come in through the environment.
 */
export async function run(): Promise<void> {
	const caseId = requireEnv("EVAL_CASE")
	const workspaceDir = requireEnv("EVAL_WORKSPACE")
	const outFile = requireEnv("EVAL_OUT")
	const modelId = requireEnv("EVAL_MODEL_ID")
	const trials = Number(process.env.EVAL_TRIALS ?? String(DEFAULT_TRIALS))
	const timeoutMs = Number(process.env.EVAL_TIMEOUT_MS ?? String(10 * 60 * 1000))
	const maxRequests = Number(process.env.EVAL_MAX_REQUESTS ?? "40")

	const evalCase = findCase(caseId)
	if (!evalCase) {
		throw new Error(`Unknown eval case: ${caseId}`)
	}

	const extension = vscode.extensions.getExtension<KitPilotAPI>("KitPilot.kit-pilot")
	if (!extension) {
		throw new Error("KitPilot extension not found")
	}

	const api = extension.isActive ? extension.exports : await extension.activate()

	await vscode.commands.executeCommand("kit-pilot.SidebarProvider.focus")
	await waitFor(() => api.isReady(), { timeout: 60_000 })

	await preflight(modelId)

	const variants = (process.env.EVAL_VARIANTS ?? EVAL_VARIANTS.join(",")).split(",") as EvalVariant[]
	const results: TrialResult[] = []

	for (let trial = 1; trial <= trials; trial++) {
		// The order flips on every trial, so a machine that drifts over a long
		// run does not push that drift onto one variant.
		for (const variant of variantOrder(trial, variants)) {
			console.log(`[evals] ${caseId} trial ${trial}/${trials} ${variant}`)
			const result = await runTrial(api, evalCase, workspaceDir, trial, {
				timeoutMs,
				modelId,
				maxRequests,
				variant,
			})
			console.log(
				`[evals] ${caseId} trial ${trial} ${variant}: ${result.passed ? "PASS" : "FAIL"} — ${result.detail} ` +
					`(${result.tools.exploratoryCalls} exploratory calls, ${Math.round(result.elapsedMs / 1000)}s)`,
			)
			results.push(result)
		}
	}

	const summaries: CaseSummary[] = variants.map((variant) =>
		summarizeCase(
			evalCase.id,
			variant,
			evalCase.category,
			results.filter((result) => result.variant === variant),
		),
	)
	await fs.writeFile(outFile, JSON.stringify({ summaries, results }, null, 2), "utf8")
}

/**
 * Checks that the wanted model is there before a trial starts.
 *
 * VS Code runs the evaluation in its own profile, so the Copilot extension and
 * the GitHub sign-in must both be in that profile. Without a model every trial
 * fails the same way, and the report then says the tasks failed when the truth
 * is that nothing ran. Thus this stops first and says what is wrong.
 */
async function preflight(modelId: string): Promise<void> {
	const models = await vscode.lm.selectChatModels({ vendor: "copilot" })
	const ids = models.map((model) => model.id)

	console.log(`[evals] models in the evaluation profile: ${ids.length > 0 ? ids.join(", ") : "(none)"}`)

	if (models.length === 0) {
		throw new Error(
			[
				"No Copilot model is available in the evaluation profile.",
				"",
				"Sign in one time with:",
				"",
				"  pnpm --filter @kit-pilot/vscode-e2e evals -- --signin",
			].join("\n"),
		)
	}

	if (!ids.includes(modelId)) {
		throw new Error(`EVAL_MODEL_ID "${modelId}" is not available. Models found: ${ids.join(", ")}`)
	}
}

function requireEnv(name: string): string {
	const value = process.env[name]
	if (!value) {
		throw new Error(`${name} is not set`)
	}
	return value
}
