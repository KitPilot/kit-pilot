import * as fs from "fs/promises"
import * as os from "os"
import * as path from "path"

const MEMORY_DIR_NAME = path.join(".kitpilot", "memory")
const INDEX_FILE = "MEMORY.md"
const MAX_TOTAL_BYTES = 50 * 1024
const MAX_BODY_FILES = 50

interface LoadedMemory {
	index: string
	bodies: Array<{ name: string; content: string }>
	totalBytes: number
	truncated: boolean
}

async function safeRead(filePath: string): Promise<string | null> {
	try {
		return await fs.readFile(filePath, "utf-8")
	} catch {
		return null
	}
}

function getMemoryDir(): string {
	return path.join(os.homedir(), MEMORY_DIR_NAME)
}

async function loadMemory(memoryDir: string): Promise<LoadedMemory | null> {
	const indexRaw = await safeRead(path.join(memoryDir, INDEX_FILE))
	if (!indexRaw || indexRaw.trim().length === 0) {
		return null
	}

	const index = indexRaw.trim()
	let totalBytes = Buffer.byteLength(index, "utf-8")
	const bodies: Array<{ name: string; content: string }> = []
	let truncated = false

	let entries: string[]
	try {
		entries = await fs.readdir(memoryDir)
	} catch {
		return { index, bodies, totalBytes, truncated }
	}

	const bodyFiles = entries
		.filter((e) => e.endsWith(".md") && e !== INDEX_FILE)
		.sort()
		.slice(0, MAX_BODY_FILES)

	for (const name of bodyFiles) {
		const content = await safeRead(path.join(memoryDir, name))
		if (content === null) continue
		const trimmed = content.trim()
		if (trimmed.length === 0) continue

		const entryBytes = Buffer.byteLength(trimmed, "utf-8") + name.length + 32
		if (totalBytes + entryBytes > MAX_TOTAL_BYTES) {
			truncated = true
			break
		}
		totalBytes += entryBytes
		bodies.push({ name, content: trimmed })
	}

	return { index, bodies, totalBytes, truncated }
}

function formatMemoryBlock(memory: LoadedMemory): string {
	const parts: string[] = []
	parts.push("## Index")
	parts.push(memory.index)

	if (memory.bodies.length > 0) {
		parts.push("\n## Entries")
		for (const body of memory.bodies) {
			parts.push(`### ${body.name}\n${body.content}`)
		}
	}

	if (memory.truncated) {
		parts.push(`\n_(Truncated: total memory exceeded ${Math.floor(MAX_TOTAL_BYTES / 1024)}KB cap)_`)
	}

	const header = [
		"# Auto-loaded user memory",
		"",
		"Persistent notes the user has saved across sessions (loaded from `~/.kitpilot/memory/`).",
		"Use these to tailor your responses to the user's role, preferences, and project context.",
		"If a note conflicts with what you observe in the current workspace, trust the workspace.",
		"",
	].join("\n")

	return `<user_memory>\n${header}${parts.join("\n\n")}\n</user_memory>`
}

/**
 * Loads persistent memory from `~/.kitpilot/memory/` and returns it as a
 * `<user_memory>` block to be embedded in the system prompt.
 *
 * Returns an empty string if the directory or index file is absent, so the
 * feature is opt-in by the user creating the directory + index.
 */
export async function getUserMemorySection(): Promise<string> {
	try {
		const memoryDir = getMemoryDir()
		const memory = await loadMemory(memoryDir)
		if (!memory) return ""
		return formatMemoryBlock(memory)
	} catch {
		return ""
	}
}
