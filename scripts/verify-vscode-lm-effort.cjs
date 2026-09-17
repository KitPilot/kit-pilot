// Run with the path to a VS Code executable. This test uses a local model stub.
// It uses an isolated profile and does not send requests to a model service.
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const { createRequire } = require("node:module")
const { build } = require("esbuild")

const repo = path.resolve(__dirname, "..")
const e2eRequire = createRequire(path.join(repo, "apps/vscode-e2e/package.json"))
const { runTests } = e2eRequire("@vscode/test-electron")

async function main() {
	const vscodeExecutablePath = process.argv[2]
	if (!vscodeExecutablePath) throw new Error("Supply the path to a VS Code executable.")
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), "kitpilot-effort-test-"))
	await fs.writeFile(
		path.join(directory, "package.json"),
		JSON.stringify({
			name: "effort-test",
			publisher: "kitpilot",
			version: "0.0.1",
			engines: { vscode: "^1.136.0" },
			main: "extension.cjs",
			contributes: {
				languageModelChatProviders: [{ vendor: "kitpilot-effort-test", displayName: "Effort test" }],
			},
		}),
	)
	await fs.writeFile(path.join(directory, "extension.cjs"), "exports.activate = () => {}")
	await build({
		stdin: {
			contents: `
import * as vscode from "vscode"
import { strict as assert } from "node:assert"
import { writeFile } from "node:fs/promises"
import { getVsCodeLmEffortOptions } from "./src/api/providers/vscode-lm-effort"
import { getVsCodeLmEffortKey } from "./packages/types/src/vscode-lm-effort"

export async function run() {
  const received = []
  const modelInfo = {
    id: "effort-test", name: "Effort test", family: "effort-test", version: "1",
    maxInputTokens: 4096, maxOutputTokens: 1024, capabilities: { toolCalling: false, imageInput: false },
    configurationSchema: { properties: { reasoningEffort: { type: "string", enum: ["low", "medium", "high"], default: "medium" } } },
  }
  const registration = vscode.lm.registerLanguageModelChatProvider("kitpilot-effort-test", {
    provideLanguageModelChatInformation: async () => [modelInfo],
    provideLanguageModelChatResponse: async (_model, _messages, options, progress) => {
      received.push(options)
      progress.report(new vscode.LanguageModelTextPart("ok"))
    },
    provideTokenCount: async () => 1,
  })
  try {
    const [transport] = await vscode.lm.selectChatModels({ vendor: "kitpilot-effort-test" })
    assert.ok(transport, "The local test model must be available.")
    const model = { vendor: "copilot", family: "claude-opus-5" }
    const key = getVsCodeLmEffortKey(model)
    for (const effort of ["low", "high", undefined]) {
      const options = getVsCodeLmEffortOptions(model, { vsCodeLmModelEfforts: effort ? { [key]: effort } : {} })
      const response = await transport.sendRequest([vscode.LanguageModelChatMessage.User("test")], options)
      for await (const _part of response.stream) {}
      const actual = received.at(-1)
      assert.equal(actual.modelConfiguration.reasoningEffort, effort ?? "medium")
      assert.equal(actual.modelOptions._enableThinking, true)
    }
    const report = { version: vscode.version, cases: received.map(options => ({
      effort: options.modelConfiguration.reasoningEffort, thinking: options.modelOptions._enableThinking,
    })) }
    await writeFile(process.env.KITPILOT_EFFORT_REPORT, JSON.stringify(report, null, 2))
    console.log("VS Code effort transport passed:", JSON.stringify(report))
  } finally { registration.dispose() }
}
`,
			resolveDir: repo,
			loader: "ts",
		},
		bundle: true,
		platform: "node",
		format: "cjs",
		external: ["vscode"],
		outfile: path.join(directory, "suite.cjs"),
	})
	const reportPath = path.join(directory, "verification.json")
	console.log(`Test directory: ${directory}`)
	await runTests({
		vscodeExecutablePath,
		extensionDevelopmentPath: directory,
		extensionTestsPath: path.join(directory, "suite.cjs"),
		extensionTestsEnv: { KITPILOT_EFFORT_REPORT: reportPath },
		launchArgs: [
			"--user-data-dir",
			path.join(directory, "profile"),
			"--extensions-dir",
			path.join(directory, "extensions"),
			"--disable-extensions",
			"--skip-welcome",
			"--skip-release-notes",
			"--disable-workspace-trust",
		],
	})
	console.log(await fs.readFile(reportPath, "utf8"))
}

main().catch((error) => {
	console.error(error)
	process.exitCode = 1
})
