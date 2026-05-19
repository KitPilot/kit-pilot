import * as fs from "fs/promises"
import * as os from "os"
import * as path from "path"

import { writeMemory, deleteMemory, getMemoryDir, validateMemoryName } from "../memoryStore"

const TEST_HOME = path.join(os.tmpdir(), `kitpilot-memorystore-test-${process.pid}`)

vi.mock("os", async () => {
	const actual = await vi.importActual<typeof import("os")>("os")
	return { ...actual, homedir: vi.fn(() => path.join(actual.tmpdir(), `kitpilot-memorystore-test-${process.pid}`)) }
})

const memoryDir = path.join(TEST_HOME, ".kitpilot", "memory")

async function resetDir() {
	await fs.rm(memoryDir, { recursive: true, force: true })
}

async function readFile(rel: string): Promise<string> {
	return fs.readFile(path.join(memoryDir, rel), "utf-8")
}

describe("memoryStore", () => {
	beforeEach(resetDir)
	afterAll(resetDir)

	describe("getMemoryDir", () => {
		it("resolves under the user's home directory", () => {
			expect(getMemoryDir()).toBe(memoryDir)
		})
	})

	describe("validateMemoryName", () => {
		it("accepts kebab-case names", () => {
			expect(() => validateMemoryName("user-role")).not.toThrow()
			expect(() => validateMemoryName("user_role_2")).not.toThrow()
			expect(() => validateMemoryName("a")).not.toThrow()
		})

		it("rejects path traversal and unsafe names", () => {
			expect(() => validateMemoryName("../escape")).toThrow()
			expect(() => validateMemoryName("/etc/passwd")).toThrow()
			expect(() => validateMemoryName("user.role")).toThrow()
			expect(() => validateMemoryName("User-Role")).toThrow()
			expect(() => validateMemoryName("")).toThrow()
			expect(() => validateMemoryName("-leading-dash")).toThrow()
			expect(() => validateMemoryName(123 as unknown)).toThrow()
		})
	})

	describe("writeMemory", () => {
		it("creates the memory directory, body file, and index entry", async () => {
			const result = await writeMemory({
				name: "user-role",
				type: "user",
				description: "User is a backend engineer",
				content: "10+ years of Go experience.",
			})

			expect(result.created).toBe(true)
			const body = await readFile("user-role.md")
			expect(body).toContain("name: user-role")
			expect(body).toContain("type: user")
			expect(body).toContain("description: User is a backend engineer")
			expect(body).toContain("10+ years of Go experience.")

			const index = await readFile("MEMORY.md")
			expect(index).toContain("# KitPilot user memory")
			expect(index).toContain("- [user-role](user-role.md) — User is a backend engineer")
		})

		it("overwrites an existing memory and updates the index line", async () => {
			await writeMemory({
				name: "user-role",
				type: "user",
				description: "old description",
				content: "old content",
			})
			const second = await writeMemory({
				name: "user-role",
				type: "user",
				description: "new description",
				content: "new content",
			})

			expect(second.created).toBe(false)
			expect(await readFile("user-role.md")).toContain("new content")
			const index = await readFile("MEMORY.md")
			expect(index).toContain("- [user-role](user-role.md) — new description")
			expect(index).not.toContain("old description")
			expect(index.split("user-role.md").length - 1).toBe(1)
		})

		it("appends a second memory without disturbing the first index line", async () => {
			await writeMemory({
				name: "user-role",
				type: "user",
				description: "engineer",
				content: "body 1",
			})
			await writeMemory({
				name: "test-pref",
				type: "feedback",
				description: "no mocks in integration tests",
				content: "body 2",
			})
			const index = await readFile("MEMORY.md")
			expect(index).toContain("- [user-role](user-role.md) — engineer")
			expect(index).toContain("- [test-pref](test-pref.md) — no mocks in integration tests")
		})

		it("rejects invalid type", async () => {
			await expect(
				writeMemory({
					name: "bad",
					type: "wrong" as never,
					description: "x",
					content: "x",
				}),
			).rejects.toThrow(/type must be one of/)
		})

		it("rejects empty content or description", async () => {
			await expect(
				writeMemory({ name: "x", type: "user", description: "", content: "x" }),
			).rejects.toThrow(/description/)
			await expect(
				writeMemory({ name: "x", type: "user", description: "x", content: "  \n" }),
			).rejects.toThrow(/content/)
		})

		it("rejects unsafe names before touching disk", async () => {
			await expect(
				writeMemory({
					name: "../escape",
					type: "user",
					description: "x",
					content: "x",
				}),
			).rejects.toThrow()
		})
	})

	describe("deleteMemory", () => {
		it("removes the body file and the index entry", async () => {
			await writeMemory({
				name: "to-delete",
				type: "user",
				description: "x",
				content: "x",
			})
			const result = await deleteMemory("to-delete")
			expect(result.fileDeleted).toBe(true)
			expect(result.indexUpdated).toBe(true)
			await expect(readFile("to-delete.md")).rejects.toThrow()
			const index = await readFile("MEMORY.md")
			expect(index).not.toContain("to-delete.md")
		})

		it("returns a no-op success when the memory does not exist", async () => {
			const result = await deleteMemory("never-existed")
			expect(result.fileDeleted).toBe(false)
			expect(result.indexUpdated).toBe(false)
		})

		it("removes only the targeted index entry when multiple memories exist", async () => {
			await writeMemory({ name: "keep-me", type: "user", description: "k", content: "k" })
			await writeMemory({ name: "drop-me", type: "user", description: "d", content: "d" })
			await deleteMemory("drop-me")
			const index = await readFile("MEMORY.md")
			expect(index).toContain("keep-me.md")
			expect(index).not.toContain("drop-me.md")
		})

		it("rejects unsafe names", async () => {
			await expect(deleteMemory("../escape")).rejects.toThrow()
		})
	})
})
