import * as fs from "fs/promises"
import * as path from "path"

import type { EvalCase, GradeResult } from "../types"
import { fixtureWorkspaceDir, listFiles, runInWorkspace } from "../workspace"

/** A pass whose grader ran the code. */
function pass(detail: string): GradeResult {
	return { passed: true, detail, behaviorChecked: true }
}

/**
 * A pass whose grader only read the code.
 *
 * This is a weaker result than one that ran, so the report keeps the two apart.
 */
function passWithoutRunning(detail: string): GradeResult {
	return { passed: true, detail, behaviorChecked: false }
}

function fail(detail: string): GradeResult {
	return { passed: false, detail, behaviorChecked: false }
}

/**
 * Fails the case if the task changed a file that it must not change.
 *
 * A task can otherwise pass by editing the test rather than the code.
 */
async function assertUnchanged(
	fixture: string,
	workspaceDir: string,
	relativePath: string,
): Promise<string | undefined> {
	const [expected, actual] = await Promise.all([
		fs.readFile(path.join(fixtureWorkspaceDir(fixture), relativePath), "utf8").catch(() => undefined),
		fs.readFile(path.join(workspaceDir, relativePath), "utf8").catch(() => undefined),
	])

	if (actual === undefined) {
		return `${relativePath} was deleted`
	}
	if (expected !== actual) {
		return `${relativePath} was changed, and the task must not change it`
	}
	return undefined
}

const DEFINITION_BUGFIX_EXPECTED = ["install: 45s", "compile: 1m 30s", "test: 2m", "package: 8s", ""].join("\n")

/**
 * The evaluation set.
 *
 * Each case gives one task whose answer is in a file that the prompt does not
 * name. The model must first find where the code lives. Thus the cases measure
 * what definition and reference lookup is expected to improve.
 *
 * Two categories in the plan have no case yet: "project-memory" and
 * "interrupted-task". Both need harness support that does not exist here. See
 * the README.
 */
export const EVAL_CASES: EvalCase[] = [
	{
		id: "definition-bugfix",
		category: "bug-fix",
		intent: "Fix a defect whose cause is three imports away from the file that shows the symptom.",
		fixture: "definition-bugfix",
		mode: "code",
		prompt: [
			"The build report prints `0m` for every step that takes less than a minute.",
			"Run `node src/index.js` to see it.",
			"",
			"Fix the duration format:",
			"",
			"- Under one minute, show seconds only, for example `45s`.",
			"- Over one minute, show minutes and seconds, for example `1m 30s`.",
			"- A whole number of minutes shows minutes only, for example `2m`.",
			"",
			"Do not change the report layout and do not change the step list.",
		].join("\n"),
		grade: async (workspaceDir) => {
			const unchanged = await assertUnchanged("definition-bugfix", workspaceDir, "src/index.js")
			if (unchanged) {
				return fail(unchanged)
			}

			const result = await runInWorkspace("node", ["src/index.js"], workspaceDir)
			if (result.exitCode !== 0) {
				return fail(`node src/index.js exited ${result.exitCode}: ${result.stderr.trim() || "(no output)"}`)
			}
			if (result.stdout !== DEFINITION_BUGFIX_EXPECTED) {
				return fail(`output did not match. Got:\n${result.stdout}`)
			}
			return pass("the report prints every duration correctly")
		},
	},
	{
		id: "reference-rename",
		category: "cross-file-refactor",
		intent: "Rename an exported function that five places use, across four directories.",
		fixture: "reference-rename",
		mode: "code",
		prompt: [
			"Rename the function `parseConfig` to `readConfig`.",
			"",
			"Update its definition, its export, and every place that uses it.",
			"The behavior must not change.",
		].join("\n"),
		grade: async (workspaceDir) => {
			const files = await listFiles(workspaceDir)
			const leftovers: string[] = []

			for (const file of files) {
				if (!file.endsWith(".js")) {
					continue
				}
				const content = await fs.readFile(path.join(workspaceDir, file), "utf8")
				if (content.includes("parseConfig")) {
					leftovers.push(file)
				}
			}

			if (leftovers.length > 0) {
				return fail(`parseConfig is still in: ${leftovers.join(", ")}`)
			}

			const definition = await fs.readFile(path.join(workspaceDir, "src/config/parse.js"), "utf8").catch(() => "")
			if (!definition.includes("readConfig")) {
				return fail("src/config/parse.js does not define readConfig")
			}

			const app = await runInWorkspace("node", ["src/index.js"], workspaceDir)
			if (app.exitCode !== 0) {
				return fail(`node src/index.js exited ${app.exitCode}: ${app.stderr.trim() || "(no output)"}`)
			}
			if (!app.stdout.includes("listening on example.com:9000") || !app.stdout.includes("debug=true")) {
				return fail(`behavior changed. Got:\n${app.stdout}`)
			}

			const check = await runInWorkspace("node", ["test/parse.check.js"], workspaceDir)
			if (check.exitCode !== 0) {
				return fail(`node test/parse.check.js exited ${check.exitCode}: ${check.stderr.trim()}`)
			}

			return pass("every reference is renamed and the behavior is the same")
		},
	},
	{
		id: "reference-rename-ts",
		category: "cross-file-refactor",
		intent: "The same rename in TypeScript with ESM imports, to see whether the language matters.",
		fixture: "reference-rename-ts",
		mode: "code",
		prompt: [
			"Rename the function `parseConfig` to `readConfig`.",
			"",
			"Update its definition, its export, and every place that uses it.",
			"The behavior must not change.",
		].join("\n"),
		grade: async (workspaceDir) => {
			const files = await listFiles(workspaceDir)
			const leftovers: string[] = []

			for (const file of files) {
				if (!file.endsWith(".ts")) {
					continue
				}
				const content = await fs.readFile(path.join(workspaceDir, file), "utf8")
				if (content.includes("parseConfig")) {
					leftovers.push(file)
				}
			}

			if (leftovers.length > 0) {
				return fail(`parseConfig is still in: ${leftovers.join(", ")}`)
			}

			const definition = await fs.readFile(path.join(workspaceDir, "src/config/parse.ts"), "utf8").catch(() => "")
			if (!/export function readConfig\b/.test(definition)) {
				return fail("src/config/parse.ts does not export a readConfig function")
			}

			const barrel = await fs.readFile(path.join(workspaceDir, "src/config/index.ts"), "utf8").catch(() => "")
			if (!barrel.includes("readConfig")) {
				return fail("src/config/index.ts no longer re-exports the function")
			}

			// Node strips the types and runs the fixture from version 23. On an
			// older Node the behavior half cannot run, so the case is graded on
			// its structure alone and the detail says so. It must not read as a
			// failure by the model.
			if (!(await nodeCanRunTypeScript(workspaceDir))) {
				return passWithoutRunning(
					"every reference is renamed. Node here cannot run TypeScript, so the behavior was not run",
				)
			}

			const app = await runInWorkspace("node", ["src/index.ts"], workspaceDir)
			if (app.exitCode !== 0) {
				return fail(`node src/index.ts exited ${app.exitCode}: ${app.stderr.trim() || "(no output)"}`)
			}
			if (!app.stdout.includes("listening on example.com:9000") || !app.stdout.includes("debug=true")) {
				return fail(`behavior changed. Got:\n${app.stdout}`)
			}

			const check = await runInWorkspace("node", ["test/parse.check.ts"], workspaceDir)
			if (check.exitCode !== 0) {
				return fail(`node test/parse.check.ts exited ${check.exitCode}: ${check.stderr.trim()}`)
			}

			return pass("every reference is renamed and the behavior is the same")
		},
	},
	{
		id: "failing-test",
		category: "test-failure",
		intent: "Fix a failing test whose cause is two modules away from the assertion.",
		fixture: "failing-test",
		mode: "code",
		prompt: ["`node test/run.js` fails.", "", "Find the cause and fix it.", "Do not change the test file."].join(
			"\n",
		),
		grade: async (workspaceDir) => {
			const unchanged = await assertUnchanged("failing-test", workspaceDir, "test/run.js")
			if (unchanged) {
				return fail(unchanged)
			}

			const result = await runInWorkspace("node", ["test/run.js"], workspaceDir)
			if (result.exitCode !== 0) {
				return fail(`node test/run.js exited ${result.exitCode}:\n${result.stdout.trim()}`)
			}
			return pass("every test passes and the test file is unchanged")
		},
	},
]

/**
 * Says whether the Node on this machine can run a TypeScript file.
 *
 * Node strips the types from version 23. An older Node cannot run the
 * TypeScript fixture, and a grader that treated that as a failure would blame
 * the model for the machine.
 */
async function nodeCanRunTypeScript(workspaceDir: string): Promise<boolean> {
	const version = await runInWorkspace("node", ["--version"], workspaceDir, 5_000)
	const major = Number(/^v(\d+)/.exec(version.stdout.trim())?.[1] ?? "0")
	return major >= 23
}

export function findCase(id: string): EvalCase | undefined {
	return EVAL_CASES.find((evalCase) => evalCase.id === id)
}
