import { codebaseSearchTool } from "../CodebaseSearchTool"
import { CodeIndexManager } from "../../../services/code-index/manager"
import type { ToolUse } from "../../../shared/tools"

vi.mock("../../../services/code-index/manager", () => ({
	CodeIndexManager: {
		getInstance: vi.fn(),
	},
}))

vi.mock("../../../utils/path", () => ({
	getWorkspacePath: vi.fn(() => "/first/root"),
}))

const SECOND_ROOT = "/second/root"

describe("codebaseSearchTool", () => {
	let mockTask: any
	let mockManager: any

	const block: ToolUse = {
		type: "tool_use",
		name: "codebase_search",
		params: { query: "how is auth wired" },
		nativeArgs: { query: "how is auth wired" },
		partial: false,
	} as ToolUse

	const callbacks = () => ({
		askApproval: vi.fn().mockResolvedValue(true),
		handleError: vi.fn(),
		pushToolResult: vi.fn(),
	})

	beforeEach(() => {
		vi.clearAllMocks()

		mockManager = {
			isFeatureEnabled: true,
			isFeatureConfigured: true,
			searchIndex: vi.fn().mockResolvedValue([]),
		}
		vi.mocked(CodeIndexManager.getInstance).mockReturnValue(mockManager)

		mockTask = {
			cwd: SECOND_ROOT,
			consecutiveMistakeCount: 0,
			didToolFailInCurrentTurn: false,
			providerRef: { deref: () => ({ context: { extensionPath: "/ext" } }) },
			say: vi.fn().mockResolvedValue(undefined),
			ask: vi.fn().mockResolvedValue({}),
			sayAndCreateMissingParamError: vi.fn().mockResolvedValue("missing param"),
		}
	})

	it("binds the index manager to the task's workspace, not the first root", async () => {
		await codebaseSearchTool.handle(mockTask, block as ToolUse<"codebase_search">, callbacks())

		expect(CodeIndexManager.getInstance).toHaveBeenCalledWith(expect.anything(), SECOND_ROOT)
	})

	it("falls back to the resolved workspace path when the task has no cwd", async () => {
		mockTask.cwd = ""

		await codebaseSearchTool.handle(mockTask, block as ToolUse<"codebase_search">, callbacks())

		expect(CodeIndexManager.getInstance).toHaveBeenCalledWith(expect.anything(), "/first/root")
	})

	it("does not run the search when the workspace cannot be determined", async () => {
		const { getWorkspacePath } = await import("../../../utils/path")
		vi.mocked(getWorkspacePath).mockReturnValueOnce("")
		mockTask.cwd = ""
		const cbs = callbacks()

		await codebaseSearchTool.handle(mockTask, block as ToolUse<"codebase_search">, cbs)

		expect(cbs.handleError).toHaveBeenCalled()
		expect(CodeIndexManager.getInstance).not.toHaveBeenCalled()
	})
})
