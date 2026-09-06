import * as assert from "assert"
import * as fs from "fs/promises"
import * as os from "os"
import * as path from "path"

import { EVAL_CASES } from "../cases"
import { applySolution, resetWorkspace } from "../workspace"

/**
 * Proves that every grader tells a solved workspace from an unsolved one.
 *
 * A grader that passes on the starting files would report progress that did
 * not happen, and a grader that fails on the solution would hide a real
 * improvement. Both make the baseline worthless. This runs no model, so it
 * costs nothing and belongs in the ordinary test run.
 */
suite("evals/graders", function () {
	this.timeout(60_000)

	for (const evalCase of EVAL_CASES) {
		test(`${evalCase.id} fails on the starting workspace`, async () => {
			const dir = await mkTempDir(evalCase.id)
			try {
				await resetWorkspace(evalCase.fixture, dir)
				const result = await evalCase.grade(dir)
				assert.strictEqual(result.passed, false, `grader passed before any change: ${result.detail}`)
			} finally {
				await fs.rm(dir, { recursive: true, force: true })
			}
		})

		test(`${evalCase.id} passes on the solution`, async () => {
			const dir = await mkTempDir(evalCase.id)
			try {
				await resetWorkspace(evalCase.fixture, dir)
				await applySolution(evalCase.fixture, dir)
				const result = await evalCase.grade(dir)
				assert.strictEqual(result.passed, true, `grader failed on the solution: ${result.detail}`)
			} finally {
				await fs.rm(dir, { recursive: true, force: true })
			}
		})
	}

	test("the failing-test grader rejects an edit to the test file", async () => {
		const evalCase = EVAL_CASES.find((c) => c.id === "failing-test")!
		const dir = await mkTempDir("failing-test-cheat")
		try {
			await resetWorkspace(evalCase.fixture, dir)
			// The cheapest wrong answer: make the test agree with the defect.
			await fs.writeFile(path.join(dir, "test/run.js"), "process.exit(0)\n", "utf8")
			const result = await evalCase.grade(dir)
			assert.strictEqual(result.passed, false)
			assert.ok(result.detail.includes("test/run.js"), result.detail)
		} finally {
			await fs.rm(dir, { recursive: true, force: true })
		}
	})

	test("the definition-bugfix grader rejects an edit to the entry point", async () => {
		const evalCase = EVAL_CASES.find((c) => c.id === "definition-bugfix")!
		const dir = await mkTempDir("definition-bugfix-cheat")
		try {
			await resetWorkspace(evalCase.fixture, dir)
			// Printing the wanted text straight from the entry point.
			await fs.writeFile(
				path.join(dir, "src/index.js"),
				'process.stdout.write("install: 45s\\ncompile: 1m 30s\\ntest: 2m\\npackage: 8s\\n")\n',
				"utf8",
			)
			const result = await evalCase.grade(dir)
			assert.strictEqual(result.passed, false)
			assert.ok(result.detail.includes("src/index.js"), result.detail)
		} finally {
			await fs.rm(dir, { recursive: true, force: true })
		}
	})
})

function mkTempDir(name: string): Promise<string> {
	return fs.mkdtemp(path.join(os.tmpdir(), `kitpilot-eval-selftest-${name}-`))
}
