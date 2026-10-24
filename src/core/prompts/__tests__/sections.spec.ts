import { addCustomInstructions } from "../sections/custom-instructions"
import { getWorkingSection, getCommandChainOperator } from "../sections/working"
import * as shellUtils from "../../../utils/shell"

describe("addCustomInstructions", () => {
	it("adds vscode language to custom instructions", async () => {
		const result = await addCustomInstructions(
			"mode instructions",
			"global instructions",
			"/test/path",
			"test-mode",
			{ language: "fr" },
		)

		expect(result).toContain("Language Preference:")
		expect(result).toContain('You should always speak and think in the "Français" (fr) language')
	})

	it("works without vscode language", async () => {
		const result = await addCustomInstructions(
			"mode instructions",
			"global instructions",
			"/test/path",
			"test-mode",
		)

		expect(result).not.toContain("Language Preference:")
		expect(result).not.toContain("You should always speak and think in")
	})
})

describe("getWorkingSection", () => {
	const cwd = "/repo/project"

	it("gives the three core sections and the real project directory", () => {
		const section = getWorkingSection({ cwd })
		expect(section).toContain("HOW YOU WORK")
		expect(section).toContain("FORMAT")
		expect(section).toContain("ENVIRONMENT")
		expect(section).toContain("Project directory: /repo/project.")
		// The old system information section named a test placeholder path.
		expect(section).not.toContain("/test/path")
	})

	it("lets the model reply in plain text and asks it to stay in the project", () => {
		const section = getWorkingSection({ cwd })
		expect(section).toContain("reply in plain text without a tool")
		expect(section).toContain("Look only inside the project directory")
		expect(section).not.toContain("You must call at least one tool")
		expect(section).not.toContain("to avoid having to ask the user questions")
		expect(section).not.toContain("wait for the user's response after each tool use")
	})

	it("tells the model not to report an action that did not succeed", () => {
		const section = getWorkingSection({ cwd })
		expect(section).toContain("Never report an action as done if its tool call did not succeed.")
		expect(section).toContain("Mark an item completed only after the work for it has succeeded.")
	})

	it("states the verification command when there is one", () => {
		expect(getWorkingSection({ cwd, verifyCommand: "pnpm test" })).toContain("```\npnpm test\n```")
		expect(getWorkingSection({ cwd, verifyCommand: "  " })).not.toContain("verification command")
	})

	it("mentions MCP servers only when there are some", () => {
		expect(getWorkingSection({ cwd, hasMcpServers: true })).toContain("MCP servers give you more tools.")
		expect(getWorkingSection({ cwd })).not.toContain("MCP")
	})

	it("adds vendor confidentiality only for a stealth model", () => {
		expect(getWorkingSection({ cwd, isStealthModel: true })).toContain("VENDOR CONFIDENTIALITY")
		expect(getWorkingSection({ cwd, isStealthModel: false })).not.toContain("VENDOR CONFIDENTIALITY")
		expect(getWorkingSection({ cwd })).not.toContain("VENDOR CONFIDENTIALITY")
	})

	it("gives PowerShell guidance on PowerShell", () => {
		vi.spyOn(shellUtils, "getShell").mockReturnValue(
			"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
		)
		const section = getWorkingSection({ cwd })
		expect(section).toContain("chain commands with `;`")
		expect(section).toContain("`Select-String` for grep")
	})

	it("gives cmd.exe guidance on cmd.exe", () => {
		vi.spyOn(shellUtils, "getShell").mockReturnValue("C:\\Windows\\System32\\cmd.exe")
		expect(getWorkingSection({ cwd })).toContain("`findstr` for grep")
	})

	it("uses && and no Windows guidance on a Unix shell", () => {
		vi.spyOn(shellUtils, "getShell").mockReturnValue("/bin/zsh")
		const section = getWorkingSection({ cwd })
		expect(section).toContain("Chain commands with `&&`.")
		expect(section).not.toContain("Select-String")
	})
})

describe("getCommandChainOperator", () => {
	it("returns && for bash shell", () => {
		vi.spyOn(shellUtils, "getShell").mockReturnValue("/bin/bash")
		expect(getCommandChainOperator()).toBe("&&")
	})

	it("returns && for zsh shell", () => {
		vi.spyOn(shellUtils, "getShell").mockReturnValue("/bin/zsh")
		expect(getCommandChainOperator()).toBe("&&")
	})

	it("returns ; for PowerShell", () => {
		vi.spyOn(shellUtils, "getShell").mockReturnValue(
			"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
		)
		expect(getCommandChainOperator()).toBe(";")
	})

	it("returns ; for PowerShell Core (pwsh)", () => {
		vi.spyOn(shellUtils, "getShell").mockReturnValue("C:\\Program Files\\PowerShell\\7\\pwsh.exe")
		expect(getCommandChainOperator()).toBe(";")
	})

	it("returns && for cmd.exe", () => {
		vi.spyOn(shellUtils, "getShell").mockReturnValue("C:\\Windows\\System32\\cmd.exe")
		expect(getCommandChainOperator()).toBe("&&")
	})

	it("returns && for Git Bash on Windows", () => {
		vi.spyOn(shellUtils, "getShell").mockReturnValue("C:\\Program Files\\Git\\bin\\bash.exe")
		expect(getCommandChainOperator()).toBe("&&")
	})

	it("returns && for WSL bash", () => {
		vi.spyOn(shellUtils, "getShell").mockReturnValue("/bin/bash")
		expect(getCommandChainOperator()).toBe("&&")
	})
})
