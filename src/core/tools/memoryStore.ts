import * as fs from "fs/promises"
import * as os from "os"
import * as path from "path"

export const MEMORY_TYPES = ["user", "feedback", "project", "reference"] as const
export type MemoryType = (typeof MEMORY_TYPES)[number]

const MEMORY_DIR_NAME = path.join(".kitpilot", "memory")
const INDEX_FILE = "MEMORY.md"
const INDEX_HEADER = "# KitPilot user memory\n\n"
const NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/

/**
 * Patterns that strongly suggest a credential leaked into the content. Erring
 * toward false positives — the agent can rephrase, but a leaked key persisted
 * to disk forever is much worse.
 */
const SECRET_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
	{ name: "OpenAI-style key (sk-…)", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
	{ name: "GitHub personal access token (ghp_…)", pattern: /\bghp_[A-Za-z0-9]{30,}\b/ },
	{ name: "GitHub OAuth token (gho_/ghu_/ghs_/ghr_…)", pattern: /\bgh[ousr]_[A-Za-z0-9]{30,}\b/ },
	{ name: "Slack token (xox[baprs]-…)", pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
	{ name: "AWS access key (AKIA…/ASIA…)", pattern: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/ },
	{ name: "GitLab PAT (glpat-…)", pattern: /\bglpat-[A-Za-z0-9_-]{20,}\b/ },
	{
		name: "credential-shaped assignment (key|secret|password|token = '…')",
		pattern:
			/\b(api[_-]?key|secret|password|passwd|token|private[_-]?key|access[_-]?key)\s*[:=]\s*['"][^'"\s]{8,}['"]/i,
	},
]

export interface SecretDetection {
	matched: boolean
	patternName?: string
}

export function detectSecrets(content: string): SecretDetection {
	if (typeof content !== "string") return { matched: false }
	for (const { name, pattern } of SECRET_PATTERNS) {
		if (pattern.test(content)) {
			return { matched: true, patternName: name }
		}
	}
	return { matched: false }
}

export function getMemoryDir(): string {
	return path.join(os.homedir(), MEMORY_DIR_NAME)
}

function memoryFilePath(name: string): string {
	return path.join(getMemoryDir(), `${name}.md`)
}

function indexFilePath(): string {
	return path.join(getMemoryDir(), INDEX_FILE)
}

export function validateMemoryName(name: unknown): asserts name is string {
	if (typeof name !== "string" || !NAME_PATTERN.test(name)) {
		throw new Error(
			`name must be a kebab-case slug ([a-z0-9_-]{1,64}, starting with alphanumeric). Got: ${JSON.stringify(name)}`,
		)
	}
}

export function validateMemoryType(type: unknown): asserts type is MemoryType {
	if (typeof type !== "string" || !MEMORY_TYPES.includes(type as MemoryType)) {
		throw new Error(`type must be one of ${MEMORY_TYPES.join(", ")}. Got: ${JSON.stringify(type)}`)
	}
}

function buildBody(params: {
	name: string
	type: MemoryType
	description: string
	content: string
}): string {
	const frontmatter = [
		"---",
		`name: ${params.name}`,
		`description: ${params.description.replace(/\r?\n/g, " ").trim()}`,
		"metadata:",
		`  type: ${params.type}`,
		"---",
		"",
		params.content.trim(),
		"",
	].join("\n")
	return frontmatter
}

async function readIndex(): Promise<string> {
	try {
		return await fs.readFile(indexFilePath(), "utf-8")
	} catch {
		return ""
	}
}

function buildIndexLine(name: string, description: string): string {
	const cleanedDesc = description.replace(/\r?\n/g, " ").trim() || "(no description)"
	return `- [${name}](${name}.md) — ${cleanedDesc}`
}

function upsertIndexLine(existingIndex: string, name: string, description: string): string {
	const newLine = buildIndexLine(name, description)
	const linkPattern = new RegExp(`^- \\[[^\\]]+\\]\\(${name}\\.md\\).*$`, "m")
	const trimmed = existingIndex.trimEnd()

	if (linkPattern.test(trimmed)) {
		return trimmed.replace(linkPattern, newLine) + "\n"
	}

	if (trimmed.length === 0) {
		return `${INDEX_HEADER}${newLine}\n`
	}
	return `${trimmed}\n${newLine}\n`
}

function removeIndexLine(existingIndex: string, name: string): string {
	if (!existingIndex) return existingIndex
	const linkPattern = new RegExp(`^- \\[[^\\]]+\\]\\(${name}\\.md\\).*\\r?\\n?`, "m")
	return existingIndex.replace(linkPattern, "")
}

export interface RememberParams {
	name: string
	type: MemoryType
	description: string
	content: string
}

export interface RememberResult {
	filePath: string
	created: boolean
}

export async function writeMemory(params: RememberParams): Promise<RememberResult> {
	validateMemoryName(params.name)
	validateMemoryType(params.type)
	if (typeof params.content !== "string" || params.content.trim().length === 0) {
		throw new Error("content must be a non-empty string")
	}
	if (typeof params.description !== "string" || params.description.trim().length === 0) {
		throw new Error("description must be a non-empty string")
	}

	const secret = detectSecrets(params.content)
	if (secret.matched) {
		throw new Error(
			`Refusing to save memory: content appears to contain a credential (${secret.patternName}). Memory is plain-text on disk and loaded into every system prompt — never persist secrets here. Re-call without the sensitive value (e.g. reference the secret by name or location instead).`,
		)
	}

	await fs.mkdir(getMemoryDir(), { recursive: true })

	const filePath = memoryFilePath(params.name)
	let created = true
	try {
		await fs.access(filePath)
		created = false
	} catch {
		// missing — will create
	}

	await fs.writeFile(filePath, buildBody(params), "utf-8")

	const existingIndex = await readIndex()
	const nextIndex = upsertIndexLine(existingIndex, params.name, params.description)
	await fs.writeFile(indexFilePath(), nextIndex, "utf-8")

	return { filePath, created }
}

export interface ForgetResult {
	filePath: string
	fileDeleted: boolean
	indexUpdated: boolean
}

export async function deleteMemory(name: string): Promise<ForgetResult> {
	validateMemoryName(name)

	const filePath = memoryFilePath(name)
	let fileDeleted = false
	try {
		await fs.unlink(filePath)
		fileDeleted = true
	} catch (err) {
		const code = (err as NodeJS.ErrnoException).code
		if (code !== "ENOENT") throw err
	}

	let indexUpdated = false
	const existingIndex = await readIndex()
	if (existingIndex) {
		const nextIndex = removeIndexLine(existingIndex, name)
		if (nextIndex !== existingIndex) {
			await fs.writeFile(indexFilePath(), nextIndex, "utf-8")
			indexUpdated = true
		}
	}

	return { filePath, fileDeleted, indexUpdated }
}
