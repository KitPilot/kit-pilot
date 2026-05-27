import path from "path"
import { fileExistsAtPath } from "../../utils/fs"
import fs from "fs/promises"
import fsSync from "fs"
import ignore, { Ignore } from "ignore"
import * as vscode from "vscode"

export const LOCK_TEXT_SYMBOL = "\u{1F512}"

const KITPILOT_IGNORE_FILENAME = ".kitpilotignore"
const LEGACY_IGNORE_FILENAME = ".kitpilotignore"

/**
 * Controls LLM access to files by enforcing ignore patterns.
 * Reads either `.kitpilotignore` (preferred) or legacy `.kitpilotignore` from the workspace root.
 */
export class KitPilotIgnoreController {
	private cwd: string
	private ignoreInstance: Ignore
	private disposables: vscode.Disposable[] = []
	private activeIgnoreFilename: string = KITPILOT_IGNORE_FILENAME
	kitpilotIgnoreContent: string | undefined

	constructor(cwd: string) {
		this.cwd = cwd
		this.ignoreInstance = ignore()
		this.kitpilotIgnoreContent = undefined
		this.setupFileWatcher()
	}

	async initialize(): Promise<void> {
		await this.loadKitPilotIgnore()
	}

	private setupFileWatcher(): void {
		// Watch both new and legacy filenames; either changing triggers a reload.
		for (const name of [KITPILOT_IGNORE_FILENAME, LEGACY_IGNORE_FILENAME]) {
			const pattern = new vscode.RelativePattern(this.cwd, name)
			const watcher = vscode.workspace.createFileSystemWatcher(pattern)
			this.disposables.push(
				watcher.onDidChange(() => this.loadKitPilotIgnore()),
				watcher.onDidCreate(() => this.loadKitPilotIgnore()),
				watcher.onDidDelete(() => this.loadKitPilotIgnore()),
				watcher,
			)
		}
	}

	private async loadKitPilotIgnore(): Promise<void> {
		try {
			this.ignoreInstance = ignore()
			const kitpilotPath = path.join(this.cwd, KITPILOT_IGNORE_FILENAME)
			const legacyPath = path.join(this.cwd, LEGACY_IGNORE_FILENAME)

			let activePath: string | undefined
			if (await fileExistsAtPath(kitpilotPath)) {
				activePath = kitpilotPath
				this.activeIgnoreFilename = KITPILOT_IGNORE_FILENAME
			} else if (await fileExistsAtPath(legacyPath)) {
				activePath = legacyPath
				this.activeIgnoreFilename = LEGACY_IGNORE_FILENAME
			}

			if (activePath) {
				const content = await fs.readFile(activePath, "utf8")
				this.kitpilotIgnoreContent = content
				this.ignoreInstance.add(content)
				this.ignoreInstance.add(this.activeIgnoreFilename)
			} else {
				this.kitpilotIgnoreContent = undefined
				this.activeIgnoreFilename = KITPILOT_IGNORE_FILENAME
			}
		} catch (error) {
			console.error("Unexpected error loading ignore file:", error)
		}
	}

	/**
	 * Check if a file should be accessible to the LLM
	 * Automatically resolves symlinks
	 * @param filePath - Path to check (relative to cwd)
	 * @returns true if file is accessible, false if ignored
	 */
	validateAccess(filePath: string): boolean {
		// Always allow access if .kitpilotignore does not exist
		if (!this.kitpilotIgnoreContent) {
			return true
		}
		try {
			const absolutePath = path.resolve(this.cwd, filePath)

			// Follow symlinks to get the real path
			let realPath: string
			try {
				realPath = fsSync.realpathSync(absolutePath)
			} catch {
				// If realpath fails (file doesn't exist, broken symlink, etc.),
				// use the original path
				realPath = absolutePath
			}

			// Convert real path to relative for .kitpilotignore checking
			const relativePath = path.relative(this.cwd, realPath).toPosix()

			// Check if the real path is ignored
			return !this.ignoreInstance.ignores(relativePath)
		} catch (error) {
			// Allow access to files outside cwd or on errors (backward compatibility)
			return true
		}
	}

	/**
	 * Check if a terminal command should be allowed to execute based on file access patterns
	 * @param command - Terminal command to validate
	 * @returns path of file that is being accessed if it is being accessed, undefined if command is allowed
	 */
	validateCommand(command: string): string | undefined {
		// Always allow if no .kitpilotignore exists
		if (!this.kitpilotIgnoreContent) {
			return undefined
		}

		// Split command into parts and get the base command
		const parts = command.trim().split(/\s+/)
		const baseCommand = parts[0].toLowerCase()

		// Commands that read file contents
		const fileReadingCommands = [
			// Unix commands
			"cat",
			"less",
			"more",
			"head",
			"tail",
			"grep",
			"awk",
			"sed",
			// PowerShell commands and aliases
			"get-content",
			"gc",
			"type",
			"select-string",
			"sls",
		]

		if (fileReadingCommands.includes(baseCommand)) {
			// Check each argument that could be a file path
			for (let i = 1; i < parts.length; i++) {
				const arg = parts[i]
				// Skip command flags/options (both Unix and PowerShell style)
				if (arg.startsWith("-") || arg.startsWith("/")) {
					continue
				}
				// Ignore PowerShell parameter names
				if (arg.includes(":")) {
					continue
				}
				// Validate file access
				if (!this.validateAccess(arg)) {
					return arg
				}
			}
		}

		return undefined
	}

	/**
	 * Filter an array of paths, removing those that should be ignored
	 * @param paths - Array of paths to filter (relative to cwd)
	 * @returns Array of allowed paths
	 */
	filterPaths(paths: string[]): string[] {
		try {
			return paths
				.map((p) => ({
					path: p,
					allowed: this.validateAccess(p),
				}))
				.filter((x) => x.allowed)
				.map((x) => x.path)
		} catch (error) {
			console.error("Error filtering paths:", error)
			return [] // Fail closed for security
		}
	}

	/**
	 * Clean up resources when the controller is no longer needed
	 */
	dispose(): void {
		this.disposables.forEach((d) => d.dispose())
		this.disposables = []
	}

	/**
	 * Get formatted instructions about the ignore file for the LLM.
	 * @returns Formatted instructions or undefined if no ignore file exists
	 */
	getInstructions(): string | undefined {
		if (!this.kitpilotIgnoreContent) {
			return undefined
		}
		const name = this.activeIgnoreFilename
		return `# ${name}\n\n(The following is provided by a root-level ${name} file where the user has specified files and directories that should not be accessed. When using list_files, you'll notice a ${LOCK_TEXT_SYMBOL} next to files that are blocked. Attempting to access the file's contents e.g. through read_file will result in an error.)\n\n${this.kitpilotIgnoreContent}\n${name}`
	}
}
