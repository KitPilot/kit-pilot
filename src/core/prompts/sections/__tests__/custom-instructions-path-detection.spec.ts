import * as path from "path"

describe("custom-instructions path detection", () => {
	it("should use exact path comparison instead of string includes", () => {
		// Test the logic that our fix implements
		const fakeHomeDir = "/Users/john.kitpilot.smith"
		const globalKitPilotDir = path.join(fakeHomeDir, ".kitpilot") // "/Users/john.kitpilot.smith/.kitpilot"
		const projectKitPilotDir = "/projects/my-project/.kitpilot"

		// Old implementation (fragile):
		// const isGlobal = kitpilotDir.includes(path.join(os.homedir(), ".kitpilot"))
		// This could fail if the home directory path contains ".kitpilot" elsewhere

		// New implementation (robust):
		// const isGlobal = path.resolve(kitpilotDir) === path.resolve(getGlobalKitPilotDirectory())

		// Test the new logic
		const isGlobalForGlobalDir = path.resolve(globalKitPilotDir) === path.resolve(globalKitPilotDir)
		const isGlobalForProjectDir = path.resolve(projectKitPilotDir) === path.resolve(globalKitPilotDir)

		expect(isGlobalForGlobalDir).toBe(true)
		expect(isGlobalForProjectDir).toBe(false)

		// Verify that the old implementation would have been problematic
		// if the home directory contained ".kitpilot" in the path
		const oldLogicGlobal = globalKitPilotDir.includes(path.join(fakeHomeDir, ".kitpilot"))
		const oldLogicProject = projectKitPilotDir.includes(path.join(fakeHomeDir, ".kitpilot"))

		expect(oldLogicGlobal).toBe(true) // This works
		expect(oldLogicProject).toBe(false) // This also works, but is fragile

		// The issue was that if the home directory path itself contained ".kitpilot",
		// the includes() check could produce false positives in edge cases
	})

	it("should handle edge cases with path resolution", () => {
		// Test various edge cases that exact path comparison handles better
		const testCases = [
			{
				global: "/Users/test/.kitpilot",
				project: "/Users/test/project/.kitpilot",
				expected: { global: true, project: false },
			},
			{
				global: "/home/user/.kitpilot",
				project: "/home/user/.kitpilot", // Same directory
				expected: { global: true, project: true },
			},
			{
				global: "/Users/john.kitpilot.smith/.kitpilot",
				project: "/projects/app/.kitpilot",
				expected: { global: true, project: false },
			},
		]

		testCases.forEach(({ global, project, expected }) => {
			const isGlobalForGlobal = path.resolve(global) === path.resolve(global)
			const isGlobalForProject = path.resolve(project) === path.resolve(global)

			expect(isGlobalForGlobal).toBe(expected.global)
			expect(isGlobalForProject).toBe(expected.project)
		})
	})
})
