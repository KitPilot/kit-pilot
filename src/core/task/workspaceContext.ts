import { execFile } from "child_process"
import * as fs from "fs/promises"
import * as path from "path"
import { promisify } from "util"

const execFileAsync = promisify(execFile)

/**
 * Builds a compact, human/model-readable summary of the workspace to prepend
 * to the very first user message of a task. Saves the agent a few turns of
 * exploratory `list_files`/`read_file` calls just to figure out what kind of
 * project it's looking at.
 *
 * Bounded by design:
 *   - Top-level directory listing is capped at 40 entries; obvious noise
 *     (`node_modules`, `.git`, `dist`, etc.) is filtered out.
 *   - `package.json` is parsed only for a handful of fields; no transitive
 *     resolution.
 *   - README is truncated to the first 50 lines.
 *
 * Failures are swallowed — if we can't read something, the section is
 * omitted. We never want this helper to crash task start.
 */

const IGNORED_TOP_LEVEL = new Set([
	"node_modules",
	".git",
	".turbo",
	".next",
	".vscode",
	".idea",
	"dist",
	"build",
	"out",
	"coverage",
	".pnpm-store",
	".DS_Store",
])

const MAX_DIR_ENTRIES = 40
const MAX_DEPENDENCIES = 15
const MAX_README_LINES = 50
const MAX_COMMITS = 5
const MAX_DIRTY_FILES = 20
const GIT_TIMEOUT_MS = 1500

interface GitContext {
	branch?: string
	commits: string[]
	dirty: string[]
}

async function readGitContext(cwd: string): Promise<GitContext | null> {
	// Quick check that this is actually a git workspace. We use rev-parse
	// rather than checking for a .git directory so submodules and worktrees
	// also count.
	const opts = { cwd, timeout: GIT_TIMEOUT_MS, maxBuffer: 1024 * 256 }
	try {
		await execFileAsync("git", ["rev-parse", "--is-inside-work-tree"], opts)
	} catch {
		return null
	}

	const ctx: GitContext = { commits: [], dirty: [] }

	try {
		const { stdout } = await execFileAsync("git", ["branch", "--show-current"], opts)
		const branch = stdout.trim()
		if (branch) ctx.branch = branch
	} catch {
		// non-fatal
	}

	try {
		const { stdout } = await execFileAsync(
			"git",
			["log", `-${MAX_COMMITS}`, "--pretty=format:%h %s"],
			opts,
		)
		ctx.commits = stdout
			.split("\n")
			.map((l) => l.trim())
			.filter(Boolean)
	} catch {
		// non-fatal
	}

	try {
		const { stdout } = await execFileAsync("git", ["status", "--porcelain"], opts)
		ctx.dirty = stdout
			.split("\n")
			.map((l) => l.trim())
			.filter(Boolean)
			.slice(0, MAX_DIRTY_FILES)
	} catch {
		// non-fatal
	}

	const empty = !ctx.branch && ctx.commits.length === 0 && ctx.dirty.length === 0
	return empty ? null : ctx
}

function formatGitSection(ctx: GitContext): string {
	const parts: string[] = []
	if (ctx.branch) parts.push(`- branch: \`${ctx.branch}\``)
	if (ctx.commits.length > 0) {
		parts.push(`- last ${ctx.commits.length} commits:\n${ctx.commits.map((c) => `  - ${c}`).join("\n")}`)
	}
	if (ctx.dirty.length > 0) {
		const more = ctx.dirty.length === MAX_DIRTY_FILES ? `\n  - … (truncated at ${MAX_DIRTY_FILES})` : ""
		parts.push(`- uncommitted changes (\`git status --porcelain\`):\n${ctx.dirty.map((d) => `  - ${d}`).join("\n")}${more}`)
	} else {
		parts.push(`- working tree: clean`)
	}
	return `## Git state\n${parts.join("\n")}`
}

async function listTopLevel(cwd: string): Promise<string[] | null> {
	try {
		const entries = await fs.readdir(cwd, { withFileTypes: true })
		const filtered = entries
			.filter((entry) => !IGNORED_TOP_LEVEL.has(entry.name) && !entry.name.startsWith(".env"))
			.slice(0, MAX_DIR_ENTRIES)
			.map((entry) => (entry.isDirectory() ? `${entry.name}/` : entry.name))
			.sort()
		return filtered
	} catch {
		return null
	}
}

interface PackageMeta {
	name?: string
	description?: string
	dependencies: string[]
}

async function readPackageMeta(cwd: string): Promise<PackageMeta | null> {
	try {
		const raw = await fs.readFile(path.join(cwd, "package.json"), "utf8")
		const parsed = JSON.parse(raw) as Record<string, unknown>
		const name = typeof parsed.name === "string" ? parsed.name : undefined
		const description = typeof parsed.description === "string" ? parsed.description : undefined
		const deps = parsed.dependencies && typeof parsed.dependencies === "object"
			? Object.keys(parsed.dependencies as Record<string, unknown>)
			: []
		return { name, description, dependencies: deps.slice(0, MAX_DEPENDENCIES) }
	} catch {
		return null
	}
}

async function readReadme(cwd: string): Promise<string | null> {
	// Common README casing variants — try each in order.
	const candidates = ["README.md", "Readme.md", "readme.md", "README.MD"]
	for (const name of candidates) {
		try {
			const raw = await fs.readFile(path.join(cwd, name), "utf8")
			const lines = raw.split(/\r?\n/).slice(0, MAX_README_LINES)
			return lines.join("\n")
		} catch {
			// try the next variant
		}
	}
	return null
}

/**
 * Build the `<workspace_context>` XML block for the first user message.
 * Returns an empty string if no useful context could be gathered.
 */
export async function getInitialWorkspaceContext(cwd: string): Promise<string> {
	const [entries, pkg, readme, git] = await Promise.all([
		listTopLevel(cwd),
		readPackageMeta(cwd),
		readReadme(cwd),
		readGitContext(cwd),
	])

	const sections: string[] = []

	if (entries && entries.length > 0) {
		sections.push(`## Top-level files and folders\n${entries.map((e) => `- ${e}`).join("\n")}`)
	}

	if (pkg) {
		const lines: string[] = []
		if (pkg.name) lines.push(`- name: ${pkg.name}`)
		if (pkg.description) lines.push(`- description: ${pkg.description}`)
		if (pkg.dependencies.length > 0) {
			lines.push(`- top dependencies (first ${pkg.dependencies.length}): ${pkg.dependencies.join(", ")}`)
		}
		if (lines.length > 0) {
			sections.push(`## package.json metadata\n${lines.join("\n")}`)
		}
	}

	if (git) {
		sections.push(formatGitSection(git))
	}

	if (readme) {
		sections.push(`## README (first ${MAX_README_LINES} lines)\n\`\`\`\n${readme}\n\`\`\``)
	}

	if (sections.length === 0) {
		return ""
	}

	return `<workspace_context>\n# Auto-generated workspace overview\n\nThis section is generated by KitPilot at task start so you don't need to spend turns running list_files or read_file just to orient yourself. Treat it as a hint, not a substitute for reading specific files when needed.\n\n${sections.join("\n\n")}\n</workspace_context>\n\n`
}
