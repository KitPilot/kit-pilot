import * as fs from "fs/promises"
import * as os from "os"
import * as path from "path"

import { downloadAndUnzipVSCode, runTests, runVSCodeCommand } from "@vscode/test-electron"

import { EVAL_CASES } from "./evals/cases"
import { evalProfileDir, profileLaunchArgs, REQUIRED_EXTENSIONS } from "./evals/profile"
import { renderReport } from "./evals/report"
import type { CaseFailure, CaseSummary, EvalRun, TrialResult } from "./evals/types"
import { EXTENSION_PATH, readExtensionVersion, vsCodeVersion } from "./evals/vscodeVersion"

/**
 * Installs the extensions that `vscode-lm` needs into the evaluation profile.
 *
 * VS Code prints a line and does nothing when an extension is already there,
 * thus this is safe to run every time. Set EVAL_SKIP_INSTALL=1 to skip it.
 */
async function ensureCopilot(): Promise<void> {
	if (process.env.EVAL_SKIP_INSTALL === "1") {
		return
	}

	for (const id of REQUIRED_EXTENSIONS) {
		process.stdout.write(`Installing ${id} into the evaluation profile...\n`)
		try {
			await runVSCodeCommand(["--install-extension", id, ...profileLaunchArgs()], {
				version: await vsCodeVersion(),
			})
		} catch (error) {
			console.error(`Could not install ${id}. Continuing, but a model may not be available.`, error)
		}
	}
}

/**
 * Opens VS Code on the evaluation profile so the user can sign in to GitHub.
 *
 * The sign-in is stored in the profile, so it is needed one time only.
 */
async function signIn(): Promise<void> {
	await ensureCopilot()

	const executable = await downloadAndUnzipVSCode({ version: await vsCodeVersion() })
	const args = profileLaunchArgs()

	console.log(
		[
			"",
			"VS Code is opening on the evaluation profile.",
			"",
			"1. Sign in to GitHub, then open the Copilot chat view one time.",
			"2. Close the window.",
			"",
			"The sign-in stays in the profile, so this is needed one time only.",
			`Profile: ${evalProfileDir()}`,
			"",
		].join("\n"),
	)

	const { spawn } = await import("child_process")
	await new Promise<void>((resolve) => {
		const child = spawn(executable, args, { stdio: "inherit" })
		child.on("close", () => resolve())
		child.on("error", () => resolve())
	})
}

/**
 * Host side of the evaluation harness.
 *
 * It starts VS Code one time for each case, with a temporary workspace that
 * holds that case's fixture. A task runs in the workspace folder, thus one
 * workspace cannot hold two cases without the model seeing both.
 *
 * Usage:
 *
 *   EVAL_MODEL_ID=<copilot model id> pnpm --filter @kit-pilot/vscode-e2e evals
 *   EVAL_MODEL_ID=<id> pnpm --filter @kit-pilot/vscode-e2e evals -- --case definition-bugfix --trials 5
 */
async function main() {
	if (process.argv.includes("--signin")) {
		await signIn()
		return
	}

	const modelId = process.env.EVAL_MODEL_ID
	if (!modelId) {
		console.error(
			[
				"EVAL_MODEL_ID is not set.",
				"",
				"Set it to the Copilot model id to measure, for example:",
				"",
				"  EVAL_MODEL_ID=gpt-4.1 pnpm --filter @kit-pilot/vscode-e2e evals",
				"",
				"The model must be pinned, because a baseline that does not name its model",
				"cannot be compared with a later run.",
				"",
				"To see the ids that the evaluation profile offers, run with any id. The",
				"preflight lists every model it found before it starts a trial.",
				"",
				"If the preflight finds no model, sign in one time with:",
				"",
				"  pnpm --filter @kit-pilot/vscode-e2e evals -- --signin",
			].join("\n"),
		)
		process.exit(1)
	}

	const trials = Number(argValue("--trials") ?? process.env.EVAL_TRIALS ?? "3")
	const only = argValue("--case")
	const label = argValue("--label") ?? process.env.EVAL_LABEL ?? "baseline"
	const cases = only ? EVAL_CASES.filter((evalCase) => evalCase.id === only) : EVAL_CASES

	if (cases.length === 0) {
		console.error(`No case matches "${only}". Known cases: ${EVAL_CASES.map((c) => c.id).join(", ")}`)
		process.exit(1)
	}

	const extensionDevelopmentPath = EXTENSION_PATH
	const extensionTestsPath = path.resolve(__dirname, "./evals/index")
	const extensionVersion = await readExtensionVersion(extensionDevelopmentPath)
	const version = await vsCodeVersion()

	console.log(`KitPilot ${extensionVersion} on VS Code ${version}, model ${modelId}`)

	await ensureCopilot()

	const startedAt = new Date().toISOString()
	const outDir = path.resolve(__dirname, "../evals-results", startedAt.replace(/[:.]/g, "-"))
	await fs.mkdir(outDir, { recursive: true })

	const summaries: CaseSummary[] = []
	const trialResults: TrialResult[] = []
	const failures: CaseFailure[] = []

	for (const evalCase of cases) {
		const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), `kitpilot-eval-${evalCase.id}-`))
		const outFile = path.join(outDir, `${evalCase.id}.json`)

		console.log(`\n=== ${evalCase.id} (${trials} trials) ===`)
		console.log(evalCase.intent)

		try {
			await runTests({
				extensionDevelopmentPath,
				extensionTestsPath,
				launchArgs: [workspaceDir, ...profileLaunchArgs()],
				extensionTestsEnv: {
					...process.env,
					EVAL_CASE: evalCase.id,
					EVAL_WORKSPACE: workspaceDir,
					EVAL_OUT: outFile,
					EVAL_MODEL_ID: modelId,
					EVAL_TRIALS: String(trials),
				},
				version,
			})

			const parsed = JSON.parse(await fs.readFile(outFile, "utf8")) as {
				summary: CaseSummary
				results: TrialResult[]
			}
			summaries.push(parsed.summary)
			trialResults.push(...parsed.results)
		} catch (error) {
			// A case that could not run is not a case that scored zero. Record it,
			// so the report cannot read as a complete run with fewer cases.
			const reason = error instanceof Error ? error.message : String(error)
			console.error(`Case ${evalCase.id} did not run: ${reason}`)
			failures.push({ caseId: evalCase.id, reason })
		} finally {
			await fs.rm(workspaceDir, { recursive: true, force: true })
		}
	}

	const run: EvalRun = {
		startedAt,
		label,
		modelId,
		extensionVersion,
		vscodeVersion: version,
		trialsPerCase: trials,
		cases: summaries,
		trialResults,
		failures,
	}

	await fs.writeFile(path.join(outDir, "run.json"), JSON.stringify(run, null, 2), "utf8")
	const report = renderReport(run)
	await fs.writeFile(path.join(outDir, "report.md"), report, "utf8")

	console.log(`\n${report}`)
	console.log(`Report written to ${outDir}`)

	// An incomplete run must not look like a finished one. A missing sign-in, a
	// VS Code that will not start, or any other harness fault ends here with a
	// non-zero code, so a script or a person cannot read the report as a result.
	if (failures.length > 0) {
		console.error(
			`\n${failures.length} of ${cases.length} case(s) did not run: ${failures.map((f) => f.caseId).join(", ")}.` +
				"\nThis run is incomplete and must not be compared with another run.",
		)
		process.exit(1)
	}
}

function argValue(flag: string): string | undefined {
	const index = process.argv.indexOf(flag)
	return index === -1 ? undefined : process.argv[index + 1]
}

main().catch((error) => {
	console.error("Failed to run evals", error)
	process.exit(1)
})
