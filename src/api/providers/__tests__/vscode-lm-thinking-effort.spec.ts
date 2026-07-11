import type { Mock } from "vitest"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"

vi.mock("vscode", () => ({
	Uri: {
		file: (p: string) => ({ scheme: "file", fsPath: p }),
	},
	lm: {
		selectChatModels: vi.fn(),
	},
}))

import * as vscode from "vscode"
import {
	getChatLanguageModelsFilePath,
	readCopilotThinkingEffort,
	watchChatLanguageModelsFile,
} from "../vscode-lm-thinking-effort"

// Fake extension context: globalStorageUri at <userDir>/globalStorage/<ext-id>,
// so the module resolves the config file to <userDir>/chatLanguageModels.json.
const makeContext = (userDir: string, scheme = "file") =>
	({
		globalStorageUri: { scheme, fsPath: path.join(userDir, "globalStorage", "kit-pilot") },
		subscriptions: [],
	}) as never

const copilotModel = { id: "claude-sonnet-4.6", vendor: "copilot", family: "claude-sonnet-4.6" }

describe("vscode-lm-thinking-effort", () => {
	let userDir: string

	beforeEach(async () => {
		vi.clearAllMocks()
		userDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "kitpilot-lm-effort-"))
		;(vscode.lm.selectChatModels as Mock).mockResolvedValue([copilotModel])
	})

	afterEach(async () => {
		await fs.promises.rm(userDir, { recursive: true, force: true })
	})

	const writeConfig = (content: unknown) =>
		fs.promises.writeFile(
			path.join(userDir, "chatLanguageModels.json"),
			typeof content === "string" ? content : JSON.stringify(content),
		)

	it("resolves the config path two levels above globalStorage", () => {
		const filePath = getChatLanguageModelsFilePath(makeContext(userDir))
		expect(filePath).toBe(path.join(userDir, "chatLanguageModels.json"))
	})

	it("returns null (unknown) off-desktop where globalStorage isn't a file URI", () => {
		expect(getChatLanguageModelsFilePath(makeContext(userDir, "vscode-remote"))).toBeUndefined()
	})

	it("returns the explicit override for the current model", async () => {
		await writeConfig([
			{
				name: "GitHub Copilot",
				vendor: "copilot",
				settings: { "claude-sonnet-4.6": { reasoningEffort: "low" } },
			},
		])
		await expect(readCopilotThinkingEffort(makeContext(userDir), {})).resolves.toBe("low")
	})

	it("returns undefined (default) when the file has no entry for the model", async () => {
		await writeConfig([{ name: "Google", vendor: "gemini", apiKey: "${input:secret}" }])
		await expect(readCopilotThinkingEffort(makeContext(userDir), {})).resolves.toBeUndefined()
	})

	it("returns undefined (default) when the file doesn't exist", async () => {
		await expect(readCopilotThinkingEffort(makeContext(userDir), {})).resolves.toBeUndefined()
	})

	it("ignores overrides from groups of a different vendor", async () => {
		await writeConfig([
			{ name: "Anthropic", vendor: "anthropic", settings: { "claude-sonnet-4.6": { reasoningEffort: "xhigh" } } },
		])
		await expect(readCopilotThinkingEffort(makeContext(userDir), {})).resolves.toBeUndefined()
	})

	it("returns null (unknown) on malformed JSON", async () => {
		await writeConfig("{not json")
		await expect(readCopilotThinkingEffort(makeContext(userDir), {})).resolves.toBeNull()
	})

	it("returns null (unknown) when no model matches the selector", async () => {
		;(vscode.lm.selectChatModels as Mock).mockResolvedValue([])
		await expect(readCopilotThinkingEffort(makeContext(userDir), {})).resolves.toBeNull()
	})

	it("watcher fires (debounced) when the config file changes", async () => {
		await writeConfig([])
		const onChange = vi.fn()
		const watcher = watchChatLanguageModelsFile(makeContext(userDir), onChange)
		try {
			await writeConfig([{ name: "GitHub Copilot", vendor: "copilot" }])
			await vi.waitFor(() => expect(onChange).toHaveBeenCalled(), { timeout: 2000 })
		} finally {
			watcher.dispose()
		}
	})

	it("watcher is a safe no-op off-desktop", () => {
		const watcher = watchChatLanguageModelsFile(makeContext(userDir, "vscode-remote"), vi.fn())
		expect(() => watcher.dispose()).not.toThrow()
	})
})
