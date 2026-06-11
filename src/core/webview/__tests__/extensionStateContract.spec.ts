// pnpm --filter kit-pilot test core/webview/__tests__/extensionStateContract.spec.ts
//
// Extension half of the webview <-> extension state contract.
//
// `getStateToPostToWebview()` output is serialized into a committed fixture
// (__fixtures__/extension-state.contract.json). The webview-side counterpart
// (webview-ui/src/context/__tests__/extensionStateContract.spec.tsx) hydrates
// the real ExtensionStateContext from the SAME fixture and asserts the
// decisions the webview derives from it. Together they pin the wire format so
// the two sides cannot drift apart silently — the bug class behind the 0.1.7
// grey icon and both image-button regressions.
//
// If this test fails after an intentional state-shape change, regenerate with:
//   UPDATE_STATE_CONTRACT=1 pnpm --filter kit-pilot test core/webview/__tests__/extensionStateContract.spec.ts
// and re-run the webview contract spec to confirm consumption still works.

import { readFileSync, writeFileSync } from "node:fs"
import * as path from "node:path"

import * as vscode from "vscode"

import { ContextProxy } from "../../config/ContextProxy"
import { ClineProvider } from "../ClineProvider"

vi.mock("p-wait-for", () => ({
	__esModule: true,
	default: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("fs/promises", () => ({
	mkdir: vi.fn().mockResolvedValue(undefined),
	writeFile: vi.fn().mockResolvedValue(undefined),
	readFile: vi.fn().mockResolvedValue(""),
	unlink: vi.fn().mockResolvedValue(undefined),
	rmdir: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("axios", () => ({
	default: {
		get: vi.fn().mockResolvedValue({ data: { data: [] } }),
		post: vi.fn(),
	},
	get: vi.fn().mockResolvedValue({ data: { data: [] } }),
	post: vi.fn(),
}))

vi.mock("../../../utils/safeWriteJson")

vi.mock("../../../utils/storage", () => ({
	getSettingsDirectoryPath: vi.fn().mockResolvedValue("/test/settings/path"),
	getTaskDirectoryPath: vi.fn().mockResolvedValue("/test/task/path"),
	getGlobalStoragePath: vi.fn().mockResolvedValue("/test/storage/path"),
}))

vi.mock("@modelcontextprotocol/sdk/types.js", () => ({
	CallToolResultSchema: {},
	ListResourcesResultSchema: {},
	ListResourceTemplatesResultSchema: {},
	ListToolsResultSchema: {},
	ReadResourceResultSchema: {},
	ErrorCode: {
		InvalidRequest: "InvalidRequest",
		MethodNotFound: "MethodNotFound",
		InternalError: "InternalError",
	},
	McpError: class McpError extends Error {
		code: string
		constructor(code: string, message: string) {
			super(message)
			this.code = code
			this.name = "McpError"
		}
	},
}))

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
	Client: vi.fn().mockImplementation(() => ({
		connect: vi.fn().mockResolvedValue(undefined),
		close: vi.fn().mockResolvedValue(undefined),
		listTools: vi.fn().mockResolvedValue({ tools: [] }),
		callTool: vi.fn().mockResolvedValue({ content: [] }),
	})),
}))

vi.mock("@modelcontextprotocol/sdk/client/stdio.js", () => ({
	StdioClientTransport: vi.fn().mockImplementation(() => ({
		connect: vi.fn().mockResolvedValue(undefined),
		close: vi.fn().mockResolvedValue(undefined),
	})),
}))

vi.mock("delay", () => {
	const delayFn = (_ms: number) => Promise.resolve()
	delayFn.createDelay = () => delayFn
	delayFn.reject = () => Promise.reject(new Error("Delay rejected"))
	delayFn.range = () => Promise.resolve()
	return { default: delayFn }
})

vi.mock("vscode", () => ({
	ExtensionContext: vi.fn(),
	OutputChannel: vi.fn(),
	WebviewView: vi.fn(),
	Uri: {
		joinPath: vi.fn(),
		file: vi.fn(),
	},
	CodeActionKind: {
		QuickFix: { value: "quickfix" },
		RefactorRewrite: { value: "refactor.rewrite" },
	},
	commands: {
		executeCommand: vi.fn().mockResolvedValue(undefined),
	},
	window: {
		showInformationMessage: vi.fn(),
		showWarningMessage: vi.fn(),
		showErrorMessage: vi.fn(),
		onDidChangeActiveTextEditor: vi.fn(() => ({ dispose: vi.fn() })),
		createTextEditorDecorationType: vi.fn().mockReturnValue({ dispose: vi.fn() }),
		tabGroups: {
			all: [],
			close: vi.fn(),
			onDidChangeTabs: vi.fn(() => ({ dispose: vi.fn() })),
		},
		visibleTextEditors: [],
	},
	workspace: {
		getConfiguration: vi.fn().mockReturnValue({
			get: vi.fn().mockReturnValue([]),
			update: vi.fn(),
		}),
		onDidChangeConfiguration: vi.fn().mockImplementation(() => ({ dispose: vi.fn() })),
		onDidSaveTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
		onDidChangeTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
		onDidOpenTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
		onDidCloseTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
	},
	env: {
		uriScheme: "vscode",
		language: "en",
		appName: "Visual Studio Code",
	},
	ExtensionMode: {
		Production: 1,
		Development: 2,
		Test: 3,
	},
	version: "1.85.0",
}))

vi.mock("../../../utils/tts", () => ({
	setTtsEnabled: vi.fn(),
	setTtsSpeed: vi.fn(),
}))

vi.mock("../../../api", () => ({
	buildApiHandler: vi.fn().mockReturnValue({
		getModel: vi.fn().mockReturnValue({ id: "claude-sonnet-4" }),
	}),
}))

vi.mock("../../prompts/system", () => ({
	SYSTEM_PROMPT: vi.fn().mockResolvedValue("mocked system prompt"),
	codeMode: "code",
}))

vi.mock("../../../integrations/workspace/WorkspaceTracker", () => ({
	default: vi.fn().mockImplementation(() => ({
		initializeFilePaths: vi.fn(),
		dispose: vi.fn(),
	})),
}))

vi.mock("../../../api/providers/fetchers/modelCache", () => ({
	getModels: vi.fn().mockResolvedValue({}),
	flushModels: vi.fn(),
	getModelsFromCache: vi.fn().mockReturnValue(undefined),
}))

const FIXTURE_PATH = path.join(__dirname, "__fixtures__", "extension-state.contract.json")

/**
 * Fields that legitimately vary between machines or runs. They are pinned to
 * stable values in the fixture; the webview contract does not depend on them.
 */
function normalizeVolatileFields(state: Record<string, unknown>): Record<string, unknown> {
	return {
		...state,
		cwd: "/test/workspace",
	}
}

function sortKeysDeep(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortKeysDeep)
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>)
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([k, v]) => [k, sortKeysDeep(v)]),
		)
	}
	return value
}

describe("extension -> webview state contract", () => {
	let provider: ClineProvider

	beforeEach(async () => {
		const globalState: Record<string, unknown> = {}
		const secrets: Record<string, string | undefined> = {}

		const mockContext = {
			extensionPath: "/test/path",
			extensionUri: {} as vscode.Uri,
			globalState: {
				get: vi.fn().mockImplementation((key: string) => globalState[key]),
				update: vi.fn().mockImplementation((key: string, value: unknown) => (globalState[key] = value)),
				keys: vi.fn().mockImplementation(() => Object.keys(globalState)),
			},
			secrets: {
				get: vi.fn().mockImplementation((key: string) => secrets[key]),
				store: vi.fn().mockImplementation((key: string, value: string | undefined) => (secrets[key] = value)),
				delete: vi.fn().mockImplementation((key: string) => delete secrets[key]),
			},
			workspaceState: {
				get: vi.fn().mockReturnValue(undefined),
				update: vi.fn().mockResolvedValue(undefined),
				keys: vi.fn().mockReturnValue([]),
			},
			subscriptions: [],
			extension: {
				packageJSON: { version: "0.0.0-contract" },
			},
			globalStorageUri: { fsPath: "/test/storage/path" },
		} as unknown as vscode.ExtensionContext

		const mockOutputChannel = {
			appendLine: vi.fn(),
			clear: vi.fn(),
			dispose: vi.fn(),
		} as unknown as vscode.OutputChannel

		provider = new ClineProvider(mockContext, mockOutputChannel, "sidebar", new ContextProxy(mockContext))

		// @ts-expect-error - replace the real CustomModesManager (reads disk).
		provider.customModesManager = {
			getCustomModes: vi.fn().mockResolvedValue([]),
			dispose: vi.fn(),
		}

		// Seed the profile every real install has: the vscode-lm provider with
		// a Copilot vision-capable model selected.
		await provider.contextProxy.setProviderSettings({
			apiProvider: "vscode-lm",
			vsCodeLmModelSelector: { vendor: "copilot", family: "claude-sonnet-4" },
		})
	})

	it("matches the committed contract fixture consumed by the webview tests", async () => {
		const state = await provider.getStateToPostToWebview()

		// postMessage JSON-serializes, so the JSON round-trip IS the wire format
		// (drops undefined fields exactly like the real channel does).
		const wireState = JSON.parse(
			JSON.stringify(normalizeVolatileFields(state as unknown as Record<string, unknown>)),
		)
		const serialized = JSON.stringify(sortKeysDeep(wireState), null, "\t") + "\n"

		if (process.env.UPDATE_STATE_CONTRACT) {
			writeFileSync(FIXTURE_PATH, serialized)
			return
		}

		let committed: string
		try {
			committed = readFileSync(FIXTURE_PATH, "utf8")
		} catch {
			throw new Error(
				`Contract fixture missing at ${FIXTURE_PATH}. Generate it with:\n` +
					"  UPDATE_STATE_CONTRACT=1 pnpm --filter kit-pilot test core/webview/__tests__/extensionStateContract.spec.ts",
			)
		}

		expect(
			JSON.parse(serialized),
			[
				"getStateToPostToWebview() output changed shape or values.",
				"If intentional, regenerate the fixture with UPDATE_STATE_CONTRACT=1 and",
				"re-run webview-ui/src/context/__tests__/extensionStateContract.spec.tsx",
				"to prove the webview still consumes the new shape correctly.",
			].join(" "),
		).toEqual(JSON.parse(committed))
	})

	it("serializes the invariants the webview depends on", async () => {
		const state = await provider.getStateToPostToWebview()

		// Welcome-screen gate: checkExistKey must recognize the profile or
		// users get stuck on the welcome screen.
		expect(state.apiConfiguration?.apiProvider).toBe("vscode-lm")
		expect(state.apiConfiguration?.vsCodeLmModelSelector).toEqual({
			vendor: "copilot",
			family: "claude-sonnet-4",
		})

		// Profile gate: ProfileValidator on the webview side rejects anything
		// non-vscode-lm, which disables sending (the 0.1.20 ChatView bug).
		expect(state.organizationAllowList).toBeDefined()

		// Hydration basics.
		expect(typeof state.version).toBe("string")
		expect(Array.isArray(state.clineMessages)).toBe(true)
		expect(Array.isArray(state.taskHistory)).toBe(true)
	})
})
