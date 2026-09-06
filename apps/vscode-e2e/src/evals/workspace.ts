import * as fs from "fs/promises"
import * as path from "path"
import { spawn } from "child_process"

/** Where the fixtures live, relative to the compiled `out/evals` directory. */
export const FIXTURES_DIR = path.resolve(__dirname, "../../evals-fixtures")

export function fixtureWorkspaceDir(fixture: string): string {
	return path.join(FIXTURES_DIR, fixture, "workspace")
}

export function fixtureSolutionDir(fixture: string): string {
	return path.join(FIXTURES_DIR, fixture, "solution")
}

/**
 * Empties `target` and copies the fixture workspace into it.
 *
 * Every trial starts from the same files, so one trial cannot change the
 * starting point of the next one.
 */
export async function resetWorkspace(fixture: string, target: string): Promise<void> {
	await emptyDirectory(target)
	await fs.cp(fixtureWorkspaceDir(fixture), target, { recursive: true })
}

/**
 * Copies the solution over a workspace.
 *
 * The solution holds the changed files only. The self test uses it to prove
 * that a grader fails on the starting files and passes on the fixed ones.
 */
export async function applySolution(fixture: string, target: string): Promise<void> {
	await fs.cp(fixtureSolutionDir(fixture), target, { recursive: true, force: true })
}

async function emptyDirectory(target: string): Promise<void> {
	await fs.mkdir(target, { recursive: true })
	for (const entry of await fs.readdir(target)) {
		await fs.rm(path.join(target, entry), { recursive: true, force: true })
	}
}

export interface RunResult {
	exitCode: number
	stdout: string
	stderr: string
}

/**
 * Runs a command in the workspace and captures its output.
 *
 * A grader uses this to run the fixture's own entry point or its own test
 * runner. The fixtures need no dependency, thus `node` alone is enough.
 */
export function runInWorkspace(command: string, args: string[], cwd: string, timeoutMs = 30_000): Promise<RunResult> {
	return new Promise((resolve) => {
		let stdout = ""
		let stderr = ""
		let settled = false

		const child = spawn(command, args, { cwd })

		const timer = setTimeout(() => {
			if (settled) return
			settled = true
			try {
				child.kill("SIGKILL")
			} catch {
				// The process is already gone.
			}
			resolve({ exitCode: -1, stdout, stderr: `${stderr}\ntimed out after ${timeoutMs}ms` })
		}, timeoutMs)

		child.stdout?.on("data", (chunk: Buffer) => {
			stdout += chunk.toString("utf-8")
		})
		child.stderr?.on("data", (chunk: Buffer) => {
			stderr += chunk.toString("utf-8")
		})
		child.on("error", (error) => {
			if (settled) return
			settled = true
			clearTimeout(timer)
			resolve({ exitCode: -1, stdout, stderr: String(error) })
		})
		child.on("close", (code) => {
			if (settled) return
			settled = true
			clearTimeout(timer)
			resolve({ exitCode: code ?? 0, stdout, stderr })
		})
	})
}

/** Lists every file in the workspace, as paths relative to it. */
export async function listFiles(dir: string, prefix = ""): Promise<string[]> {
	const out: string[] = []
	for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
		if (entry.name === "node_modules" || entry.name === ".git") {
			continue
		}
		const relative = prefix ? `${prefix}/${entry.name}` : entry.name
		if (entry.isDirectory()) {
			out.push(...(await listFiles(path.join(dir, entry.name), relative)))
		} else {
			out.push(relative)
		}
	}
	return out.sort()
}
