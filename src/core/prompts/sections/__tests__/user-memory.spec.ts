import * as fs from "fs/promises"
import * as os from "os"
import * as path from "path"

import { getUserMemorySection } from "../user-memory"

vi.mock("os", async () => {
	const actual = await vi.importActual<typeof import("os")>("os")
	return { ...actual, homedir: vi.fn(() => actual.tmpdir()) }
})

const fakeHome = os.tmpdir()
const memoryDir = path.join(fakeHome, ".kitpilot", "memory")

async function resetMemoryDir() {
	await fs.rm(memoryDir, { recursive: true, force: true })
}

async function writeMemoryFile(name: string, content: string) {
	await fs.mkdir(memoryDir, { recursive: true })
	await fs.writeFile(path.join(memoryDir, name), content, "utf-8")
}

describe("getUserMemorySection", () => {
	beforeEach(async () => {
		await resetMemoryDir()
	})

	afterAll(async () => {
		await resetMemoryDir()
	})

	it("returns empty string when memory directory is absent", async () => {
		const result = await getUserMemorySection()
		expect(result).toBe("")
	})

	it("returns empty string when MEMORY.md index is missing", async () => {
		await fs.mkdir(memoryDir, { recursive: true })
		await fs.writeFile(path.join(memoryDir, "stray.md"), "body", "utf-8")
		const result = await getUserMemorySection()
		expect(result).toBe("")
	})

	it("returns empty string when MEMORY.md is empty", async () => {
		await writeMemoryFile("MEMORY.md", "   \n\n")
		const result = await getUserMemorySection()
		expect(result).toBe("")
	})

	it("emits a <user_memory> block with just the index when only index exists", async () => {
		await writeMemoryFile("MEMORY.md", "- [user role](user-role.md) — user is a backend engineer")
		const result = await getUserMemorySection()
		expect(result).toContain("<user_memory>")
		expect(result).toContain("</user_memory>")
		expect(result).toContain("## Index")
		expect(result).toContain("user is a backend engineer")
		expect(result).not.toContain("## Entries")
	})

	it("includes referenced body files under ## Entries", async () => {
		await writeMemoryFile("MEMORY.md", "- [user role](user-role.md)")
		await writeMemoryFile("user-role.md", "User is a senior backend engineer working in Go.")
		const result = await getUserMemorySection()
		expect(result).toContain("## Index")
		expect(result).toContain("## Entries")
		expect(result).toContain("### user-role.md")
		expect(result).toContain("User is a senior backend engineer working in Go.")
	})

	it("excludes MEMORY.md itself from the ## Entries section", async () => {
		await writeMemoryFile("MEMORY.md", "index line")
		const result = await getUserMemorySection()
		expect(result).not.toContain("### MEMORY.md")
	})

	it("skips empty body files", async () => {
		await writeMemoryFile("MEMORY.md", "index")
		await writeMemoryFile("empty.md", "   \n")
		const result = await getUserMemorySection()
		expect(result).not.toContain("### empty.md")
	})

	it("emits a truncation notice when total bytes exceed the cap", async () => {
		await writeMemoryFile("MEMORY.md", "index")
		// Each file ~30KB. Two of them = 60KB which exceeds the 50KB cap.
		const big = "x".repeat(30 * 1024)
		await writeMemoryFile("aaa-big.md", big)
		await writeMemoryFile("bbb-big.md", big)
		const result = await getUserMemorySection()
		expect(result).toContain("### aaa-big.md")
		expect(result).not.toContain("### bbb-big.md")
		expect(result).toContain("Truncated")
	})
})
