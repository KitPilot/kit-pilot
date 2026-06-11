import * as fs from "fs/promises"
import * as os from "os"
import * as path from "path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { copyLegacyArtifacts, detectLegacyRooArtifacts } from "../migrateLegacyRooConfig"

describe("migrateLegacyRooConfig", () => {
	let home: string
	let workspace: string

	beforeEach(async () => {
		home = await fs.mkdtemp(path.join(os.tmpdir(), "kitpilot-mig-home-"))
		workspace = await fs.mkdtemp(path.join(os.tmpdir(), "kitpilot-mig-ws-"))
	})

	afterEach(async () => {
		await fs.rm(home, { recursive: true, force: true })
		await fs.rm(workspace, { recursive: true, force: true })
	})

	describe("detectLegacyRooArtifacts", () => {
		it("returns nothing when no legacy artifacts exist", async () => {
			expect(await detectLegacyRooArtifacts(home, workspace)).toEqual([])
		})

		it("detects all four artifact kinds when no KitPilot counterparts exist", async () => {
			await fs.mkdir(path.join(home, ".roo"))
			await fs.mkdir(path.join(workspace, ".roo"))
			await fs.writeFile(path.join(workspace, ".rooignore"), "node_modules\n")
			await fs.writeFile(path.join(workspace, ".roomodes"), "{}")

			const items = await detectLegacyRooArtifacts(home, workspace)
			expect(items.map((i) => i.label).sort()).toEqual([".roo", ".roomodes", ".rooignore", "~/.roo"].sort())
		})

		it("skips artifacts whose KitPilot counterpart already exists", async () => {
			await fs.writeFile(path.join(workspace, ".rooignore"), "old\n")
			await fs.writeFile(path.join(workspace, ".kitpilotignore"), "new\n")
			await fs.writeFile(path.join(workspace, ".roomodes"), "{}")

			const items = await detectLegacyRooArtifacts(home, workspace)
			expect(items.map((i) => i.label)).toEqual([".roomodes"])
		})

		it("only checks the home artifact when no workspace is open", async () => {
			await fs.writeFile(path.join(workspace, ".rooignore"), "x\n")
			await fs.mkdir(path.join(home, ".roo"))

			const items = await detectLegacyRooArtifacts(home, undefined)
			expect(items.map((i) => i.label)).toEqual(["~/.roo"])
		})
	})

	describe("copyLegacyArtifacts", () => {
		it("copies directories recursively and preserves the originals", async () => {
			await fs.mkdir(path.join(home, ".roo", "rules"), { recursive: true })
			await fs.writeFile(path.join(home, ".roo", "rules", "style.md"), "be nice")
			await fs.writeFile(path.join(home, ".roo", "hooks.json"), "{}")

			const items = await detectLegacyRooArtifacts(home, undefined)
			const outcome = await copyLegacyArtifacts(items)

			expect(outcome.failed).toEqual([])
			expect(outcome.migrated).toHaveLength(1)
			expect(await fs.readFile(path.join(home, ".kitpilot", "rules", "style.md"), "utf8")).toBe("be nice")
			expect(await fs.readFile(path.join(home, ".kitpilot", "hooks.json"), "utf8")).toBe("{}")
			// Originals untouched.
			expect(await fs.readFile(path.join(home, ".roo", "hooks.json"), "utf8")).toBe("{}")
		})

		it("copies files and preserves the originals", async () => {
			await fs.writeFile(path.join(workspace, ".rooignore"), "dist\n")
			const items = await detectLegacyRooArtifacts(home, workspace)
			const outcome = await copyLegacyArtifacts(items)

			expect(outcome.failed).toEqual([])
			expect(await fs.readFile(path.join(workspace, ".kitpilotignore"), "utf8")).toBe("dist\n")
			expect(await fs.readFile(path.join(workspace, ".rooignore"), "utf8")).toBe("dist\n")
		})

		it("never overwrites an existing destination", async () => {
			await fs.writeFile(path.join(workspace, ".kitpilotignore"), "keep me\n")
			const outcome = await copyLegacyArtifacts([
				{
					from: path.join(workspace, ".rooignore"),
					to: path.join(workspace, ".kitpilotignore"),
					kind: "file",
					label: ".rooignore",
				},
			])

			expect(outcome.migrated).toEqual([])
			expect(outcome.failed).toHaveLength(1)
			expect(await fs.readFile(path.join(workspace, ".kitpilotignore"), "utf8")).toBe("keep me\n")
		})

		it("reports per-item failures without aborting the rest", async () => {
			await fs.writeFile(path.join(workspace, ".roomodes"), "{}")
			const items = [
				{
					from: path.join(workspace, "does-not-exist"),
					to: path.join(workspace, ".kitpilot"),
					kind: "dir" as const,
					label: ".roo",
				},
				{
					from: path.join(workspace, ".roomodes"),
					to: path.join(workspace, ".kitpilotmodes"),
					kind: "file" as const,
					label: ".roomodes",
				},
			]

			const outcome = await copyLegacyArtifacts(items)
			expect(outcome.failed).toHaveLength(1)
			expect(outcome.failed[0].item.label).toBe(".roo")
			expect(outcome.migrated.map((i) => i.label)).toEqual([".roomodes"])
		})
	})
})
