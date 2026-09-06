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
 * Stops before a trial when no model is there.
 *
 * Measured on 2026-09-06. A profile that is fully signed in, and where KitPilot
 * has been granted a model and has completed a task in an ordinary window,
 * still offers no model inside the test host that `runTests` starts. The grant
 * does not carry across.
 *
 * Nothing about that is loud. `VsCodeLmHandler.createClient` answers an empty
 * model list with a stand-in model that yields the sentence "Language model
 * functionality is limited", so a task keeps its shape: it runs, it produces
 * text, it calls no tool, it retries, and it fills the time. One trial spent
 * 440 seconds and 118 messages that way and reported a plain FAIL.
 *
 * A run of that shape is worse than no run. Every trial fails the same way, in
 * both variants, and the report reads as a measurement. Thus this stops first.
 */
async function preflight(modelId: string): Promise<void> {
	let ids: string[] = []
	try {
		const models = await vscode.lm.selectChatModels({ vendor: "copilot" })
		ids = models.map((model) => model.id)
	} catch {
		// Treated as no model, which is what it means here.
	}

	console.log(`[evals] models in the test host: ${ids.length > 0 ? ids.join(", ") : "(none)"}`)

	if (ids.length === 0) {
		throw new Error(
			[
				"No Copilot model is available inside the test host.",
				"",
				"A sign-in is not enough, and neither is granting KitPilot a model in an",
				"ordinary window. The grant does not reach the host that runTests starts.",
				"",
				"Without this check every trial would spend its whole timeout talking to a",
				"stand-in model and report a plain failure, in both variants.",
			].join("\n"),
		)
	}

	if (!ids.includes(modelId)) {
		console.warn(`[evals] "${modelId}" is not in that list. KitPilot may fall back to another model.`)
	}
}

function requireEnv(name: string): string {
	const value = process.env[name]
	if (!value) {
		throw new Error(`${name} is not set`)
	}
	return value
}
