import path from "path"
import { KitPilotProtectedController } from "../KitPilotProtectedController"

describe("KitPilotProtectedController", () => {
	const TEST_CWD = "/test/workspace"
	let controller: KitPilotProtectedController

	beforeEach(() => {
		controller = new KitPilotProtectedController(TEST_CWD)
	})

	describe("isWriteProtected", () => {
		it("should protect .kitpilotignore file", () => {
			expect(controller.isWriteProtected(".kitpilotignore")).toBe(true)
		})

		it("should protect files in .kitpilot directory", () => {
			expect(controller.isWriteProtected(".kitpilot/config.json")).toBe(true)
			expect(controller.isWriteProtected(".kitpilot/settings/user.json")).toBe(true)
			expect(controller.isWriteProtected(".kitpilot/modes/custom.json")).toBe(true)
		})

		it("should protect .rooprotected file", () => {
			expect(controller.isWriteProtected(".rooprotected")).toBe(true)
		})

		it("should protect .kitpilotmodes files", () => {
			expect(controller.isWriteProtected(".kitpilotmodes")).toBe(true)
		})

		it("should protect .roorules* files", () => {
			expect(controller.isWriteProtected(".roorules")).toBe(true)
			expect(controller.isWriteProtected(".roorules.md")).toBe(true)
		})

		it("should protect .clinerules* files", () => {
			expect(controller.isWriteProtected(".clinerules")).toBe(true)
			expect(controller.isWriteProtected(".clinerules.md")).toBe(true)
		})

		it("should protect files in .vscode directory", () => {
			expect(controller.isWriteProtected(".vscode/settings.json")).toBe(true)
			expect(controller.isWriteProtected(".vscode/launch.json")).toBe(true)
			expect(controller.isWriteProtected(".vscode/tasks.json")).toBe(true)
		})

		it("should protect .code-workspace files", () => {
			expect(controller.isWriteProtected("myproject.code-workspace")).toBe(true)
			expect(controller.isWriteProtected("pentest.code-workspace")).toBe(true)
			expect(controller.isWriteProtected(".code-workspace")).toBe(true)
			expect(controller.isWriteProtected("folder/workspace.code-workspace")).toBe(true)
		})

		it("should protect AGENTS.md file", () => {
			expect(controller.isWriteProtected("AGENTS.md")).toBe(true)
		})

		it("should protect AGENT.md file", () => {
			expect(controller.isWriteProtected("AGENT.md")).toBe(true)
		})

		it("should not protect other files starting with .kitpilot", () => {
			expect(controller.isWriteProtected(".roosettings")).toBe(false)
			expect(controller.isWriteProtected(".rooconfig")).toBe(false)
		})

		it("should not protect regular files", () => {
			expect(controller.isWriteProtected("src/index.ts")).toBe(false)
			expect(controller.isWriteProtected("package.json")).toBe(false)
			expect(controller.isWriteProtected("README.md")).toBe(false)
		})

		it("should not protect files that contain 'kitpilot' but don't start with .kitpilot", () => {
			expect(controller.isWriteProtected("src/kitpilot-utils.ts")).toBe(false)
			expect(controller.isWriteProtected("config/kitpilot.config.js")).toBe(false)
		})

		it("should handle nested paths correctly", () => {
			expect(controller.isWriteProtected(".kitpilot/config.json")).toBe(true) // .kitpilot/** matches at root
			expect(controller.isWriteProtected("nested/.kitpilotignore")).toBe(true) // .kitpilotignore matches anywhere by default
			expect(controller.isWriteProtected("nested/.kitpilotmodes")).toBe(true) // .kitpilotmodes matches anywhere by default
			expect(controller.isWriteProtected("nested/.roorules.md")).toBe(true) // .roorules* matches anywhere by default
		})

		it("should handle absolute paths by converting to relative", () => {
			const absolutePath = path.join(TEST_CWD, ".kitpilotignore")
			expect(controller.isWriteProtected(absolutePath)).toBe(true)
		})

		it("should handle paths with different separators", () => {
			expect(controller.isWriteProtected(".kitpilot\\config.json")).toBe(true)
			expect(controller.isWriteProtected(".kitpilot/config.json")).toBe(true)
		})

		it("should not throw for absolute paths outside cwd", () => {
			expect(controller.isWriteProtected("/tmp/comment-2-pr63.json")).toBe(false)
			expect(controller.isWriteProtected("/etc/passwd")).toBe(false)
		})
	})

	describe("getProtectedFiles", () => {
		it("should return set of protected files from a list", () => {
			const files = ["src/index.ts", ".kitpilotignore", "package.json", ".kitpilot/config.json", "README.md"]

			const protectedFiles = controller.getProtectedFiles(files)

			expect(protectedFiles).toEqual(new Set([".kitpilotignore", ".kitpilot/config.json"]))
		})

		it("should return empty set when no files are protected", () => {
			const files = ["src/index.ts", "package.json", "README.md"]

			const protectedFiles = controller.getProtectedFiles(files)

			expect(protectedFiles).toEqual(new Set())
		})
	})

	describe("annotatePathsWithProtection", () => {
		it("should annotate paths with protection status", () => {
			const files = ["src/index.ts", ".kitpilotignore", ".kitpilot/config.json", "package.json"]

			const annotated = controller.annotatePathsWithProtection(files)

			expect(annotated).toEqual([
				{ path: "src/index.ts", isProtected: false },
				{ path: ".kitpilotignore", isProtected: true },
				{ path: ".kitpilot/config.json", isProtected: true },
				{ path: "package.json", isProtected: false },
			])
		})
	})

	describe("getProtectionMessage", () => {
		it("should return appropriate protection message", () => {
			const message = controller.getProtectionMessage()
			expect(message).toBe("This is a KitPilot configuration file and requires approval for modifications")
		})
	})

	describe("getInstructions", () => {
		it("should return formatted instructions about protected files", () => {
			const instructions = controller.getInstructions()

			expect(instructions).toContain("# Protected Files")
			expect(instructions).toContain("write-protected")
			expect(instructions).toContain(".kitpilotignore")
			expect(instructions).toContain(".kitpilot/**")
			expect(instructions).toContain("\u{1F6E1}") // Shield symbol
		})
	})

	describe("getProtectedPatterns", () => {
		it("should return the list of protected patterns", () => {
			const patterns = KitPilotProtectedController.getProtectedPatterns()

			expect(patterns).toEqual([
				".kitpilotignore",
				".kitpilotmodes",
				".roorules*",
				".clinerules*",
				".kitpilot/**",
				".vscode/**",
				"*.code-workspace",
				".rooprotected",
				"AGENTS.md",
				"AGENT.md",
			])
		})
	})
})
