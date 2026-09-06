import { getObjectiveSection } from "../objective"

describe("getObjectiveSection", () => {
	it("should include proper numbered structure", () => {
		const objective = getObjectiveSection()

		// Check that all numbered items are present
		expect(objective).toContain("1. Analyze the user's task")
		expect(objective).toContain("2. Work through these goals sequentially")
		expect(objective).toContain("3. Remember, you have extensive capabilities")
		expect(objective).toContain("4. Once you've completed the user's task")
		expect(objective).toContain("5. The user may provide feedback")
	})

	it("should include analysis guidance", () => {
		const objective = getObjectiveSection()

		expect(objective).toContain("Before calling a tool, do some analysis")
		expect(objective).toContain("analyze the file structure provided in environment_details")
		expect(objective).toContain("think about which of the provided tools is the most relevant")
	})

	it("should include parameter inference guidance", () => {
		const objective = getObjectiveSection()

		expect(objective).toContain("Go through each of the required parameters")
		expect(objective).toContain(
			"determine if the user has directly provided or given enough information to infer a value",
		)
		expect(objective).toContain("DO NOT invoke the tool (not even with fillers for the missing params)")
		expect(objective).toContain("ask_followup_question tool")
	})

	it("should include guidance about not engaging in back and forth conversations", () => {
		const objective = getObjectiveSection()

		expect(objective).toContain("DO NOT continue in pointless back and forth conversations")
		expect(objective).toContain("don't end your responses with questions or offers for further assistance")
	})

	it("should include the OBJECTIVE header", () => {
		const objective = getObjectiveSection()

		expect(objective).toContain("OBJECTIVE")
		expect(objective).toContain("You accomplish a given task iteratively")
	})

	describe("verification command clause", () => {
		it("omits the clause when no verification command is set", () => {
			expect(getObjectiveSection()).not.toContain("verification command")
			expect(getObjectiveSection("")).not.toContain("verification command")
			expect(getObjectiveSection("   ")).not.toContain("verification command")
		})

		it("states the command and that KitPilot runs it", () => {
			const objective = getObjectiveSection("pnpm check-types")

			expect(objective).toContain("pnpm check-types")
			expect(objective).toContain("KitPilot runs it for you when you call `attempt_completion`")
		})

		// The hook on attempt_completion is the only execution path. A clause that
		// told the model to run the command first made an expensive suite run twice.
		it("tells the model not to run the command itself", () => {
			const objective = getObjectiveSection("pnpm test")

			expect(objective).toContain("Do NOT run it yourself with `execute_command` first")
			expect(objective).not.toContain("run the project's verification command via `execute_command`")
		})

		it("explains what a failure does", () => {
			const objective = getObjectiveSection("pnpm test")

			expect(objective).toContain("the completion is blocked")
			expect(objective).toContain("call `attempt_completion` again")
		})
	})
})
