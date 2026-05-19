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

const TOOL_GUIDANCE = `## Using memory tools

You have two tools for managing this memory: \`remember_this\` and \`forget_this\`. Use them proactively when relevant — the user should not have to ask you to remember things.

**Save with \`remember_this\` when:**
- The user shares a stable fact about themselves (role, expertise, working style)
- The user corrects your approach in a way that should stick across sessions ("don't mock the database", "always run typecheck before claiming done")
- The user mentions an external system worth remembering (ticketing project, dashboard, Slack channel)
- The user explicitly asks you to remember

**Do NOT save:**
- Code patterns or architecture (those live in the codebase)
- In-progress task state (use \`update_todo_list\`)
- Information already in CLAUDE.md / AGENTS.md / .kitpilot/rules/
- Conversation-scoped context that won't matter next session

**Memory types:**
- \`user\`: who the user is
- \`feedback\`: rules they've corrected/confirmed (include **Why:** and **How to apply:** lines)
- \`project\`: ongoing work, deadlines, decisions (convert relative dates to absolute)
- \`reference\`: pointers to external systems

**Delete with \`forget_this\` when** the user asks to forget, or when a memory has become wrong. Reusing a name with \`remember_this\` overwrites — prefer that over delete-then-recreate.
`

function formatMemoryBlock(memory: LoadedMemory | null): string {
	const parts: string[] = []

	if (memory) {
		parts.push("## Saved memory")
		parts.push("### Index")
		parts.push(memory.index)

		if (memory.bodies.length > 0) {
			parts.push("### Entries")
			for (const body of memory.bodies) {
				parts.push(`#### ${body.name}\n${body.content}`)
			}
		}

		if (memory.truncated) {
			parts.push(`_(Truncated: total memory exceeded ${Math.floor(MAX_TOTAL_BYTES / 1024)}KB cap)_`)
		}
	} else {
		parts.push("## Saved memory")
		parts.push("_(No memories saved yet. Use `remember_this` to start building the user's profile.)_")
	}

	const header = [
		"# User memory",
		"",
		"Persistent notes about the user, their preferences, and ongoing work. Loaded from `~/.kitpilot/memory/`.",
		"If a memory conflicts with what you observe in the current workspace, trust the workspace and consider updating the memory.",
		"",
	].join("\n")

	return `<user_memory>\n${header}${parts.join("\n\n")}\n\n${TOOL_GUIDANCE}</user_memory>`
}

/**
 * Loads persistent memory from `~/.kitpilot/memory/` and returns it as a
 * `<user_memory>` block to be embedded in the system prompt. The block is
 * always emitted (even when no memories exist yet) so the agent knows the
 * remember_this / forget_this tools are available and when to use them.
 */
export async function getUserMemorySection(): Promise<string> {
	try {
		const memoryDir = getMemoryDir()
		const memory = await loadMemory(memoryDir)
		return formatMemoryBlock(memory)
	} catch {
		return formatMemoryBlock(null)
	}
}
