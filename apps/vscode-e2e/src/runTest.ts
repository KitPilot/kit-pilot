import * as path from "path"
import * as os from "os"
import * as fs from "fs/promises"

import { downloadAndUnzipVSCode, runTests } from "@vscode/test-electron"

import { resolveExecutable, vsCodeVersion } from "./evals/vscodeVersion"

async function main() {
	try {
		// The folder containing the Extension Manifest package.json
		// Passed to `--extensionDevelopmentPath`
		const extensionDevelopmentPath = path.resolve(__dirname, "../../../src")

		// The path to the extension test script
		// Passed to --extensionTestsPath
		const extensionTestsPath = path.resolve(__dirname, "./suite/index")

		// Create a temporary workspace folder for tests
		const testWorkspace = await fs.mkdtemp(path.join(os.tmpdir(), "kitpilot-test-workspace-"))

		// Get test filter from command line arguments or environment variable
		// Usage examples:
		// - npm run test:e2e -- --grep "write-to-file"
		// - TEST_GREP="apply-diff" npm run test:e2e
		// - TEST_FILE="task.test.js" npm run test:e2e
		const testGrep = process.argv.find((arg, i) => process.argv[i - 1] === "--grep") || process.env.TEST_GREP
		const testFile = process.argv.find((arg, i) => process.argv[i - 1] === "--file") || process.env.TEST_FILE

		// Pass test filters as environment variables to the test runner
		const extensionTestsEnv = {
			...process.env,
			...(testGrep && { TEST_GREP: testGrep }),
			...(testFile && { TEST_FILE: testFile }),
		}

		// Download VS Code, unzip it and run the integration test
		await runTests({
			extensionDevelopmentPath,
			extensionTestsPath,
			launchArgs: [testWorkspace],
			extensionTestsEnv,
			// `@vscode/test-electron` builds the path to a binary named `Electron`,
			// but a current VS Code names it `Code`, so its own path fails with
			// ENOENT. Resolve the executable and hand it over.
			vscodeExecutablePath: await resolveExecutable(
				await downloadAndUnzipVSCode({ version: await vsCodeVersion() }),
			),
		})

		// Clean up the temporary workspace
		await fs.rm(testWorkspace, { recursive: true, force: true })
	} catch (error) {
		console.error("Failed to run tests", error)
		process.exit(1)
	}
}

main()
