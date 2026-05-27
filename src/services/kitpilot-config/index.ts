import * as path from "path"
import * as os from "os"
import fs from "fs/promises"
import fsSync from "fs"

/**
 * Gets the global .kitpilot directory path based on the current platform
 *
 * @returns The absolute path to the global .kitpilot directory
 *
 * @example Platform-specific paths:
 * ```
 * // macOS/Linux: ~/.kitpilot/
 * // Example: /Users/john/.kitpilot
 *
 * // Windows: %USERPROFILE%\.kitpilot\
 * // Example: C:\Users\john\.kitpilot
 * ```
 *
 * @example Usage:
 * ```typescript
 * const globalDir = getGlobalKitPilotDirectory()
 * // Returns: "/Users/john/.kitpilot" (on macOS/Linux)
 * // Returns: "C:\\Users\\john\\.kitpilot" (on Windows)
 * ```
 */
export function getGlobalKitPilotDirectory(): string {
	return path.join(os.homedir(), ".kitpilot")
}

/**
 * Always returns the canonical `.kitpilot` global directory path, regardless of which dirs exist on disk.
 * Use this at write sites that should always create the new-name directory.
 */
export function getGlobalKitpilotDirectory(): string {
	return path.join(os.homedir(), ".kitpilot")
}

/**
 * Gets the global .agents directory path based on the current platform.
 * This is a shared directory for agent skills across different AI coding tools.
 *
 * @returns The absolute path to the global .agents directory
 *
 * @example Platform-specific paths:
 * ```
 * // macOS/Linux: ~/.agents/
 * // Example: /Users/john/.agents
 *
 * // Windows: %USERPROFILE%\.agents\
 * // Example: C:\Users\john\.agents
 * ```
 *
 * @example Usage:
 * ```typescript
 * const globalAgentsDir = getGlobalAgentsDirectory()
 * // Returns: "/Users/john/.agents" (on macOS/Linux)
 * // Returns: "C:\\Users\\john\\.agents" (on Windows)
 * ```
 */
export function getGlobalAgentsDirectory(): string {
	const homeDir = os.homedir()
	return path.join(homeDir, ".agents")
}

/**
 * Gets the project-local .agents directory path for a given cwd.
 * This is a shared directory for agent skills across different AI coding tools.
 *
 * @param cwd - Current working directory (project path)
 * @returns The absolute path to the project-local .agents directory
 *
 * @example
 * ```typescript
 * const projectAgentsDir = getProjectAgentsDirectoryForCwd('/Users/john/my-project')
 * // Returns: "/Users/john/my-project/.agents"
 * ```
 */
export function getProjectAgentsDirectoryForCwd(cwd: string): string {
	return path.join(cwd, ".agents")
}

/**
 * Gets the project-local .kitpilot directory path for a given cwd
 *
 * @param cwd - Current working directory (project path)
 * @returns The absolute path to the project-local .kitpilot directory
 *
 * @example
 * ```typescript
 * const projectDir = getProjectKitPilotDirectoryForCwd('/Users/john/my-project')
 * // Returns: "/Users/john/my-project/.kitpilot"
 *
 * const windowsProjectDir = getProjectKitPilotDirectoryForCwd('C:\\Users\\john\\my-project')
 * // Returns: "C:\\Users\\john\\my-project\\.kitpilot"
 * ```
 *
 * @example Directory structure:
 * ```
 * /Users/john/my-project/
 * ├── .kitpilot/                    # Project-local configuration directory
 * │   ├── rules/
 * │   │   └── rules.md
 * │   ├── custom-instructions.md
 * │   └── config/
 * │       └── settings.json
 * ├── src/
 * │   └── index.ts
 * └── package.json
 * ```
 */
export function getProjectKitPilotDirectoryForCwd(cwd: string): string {
	return path.join(cwd, ".kitpilot")
}

/**
 * Always returns the canonical `.kitpilot` project directory path. Use this at write sites that should always create the new-name directory.
 */
export function getProjectKitpilotDirectoryForCwd(cwd: string): string {
	return path.join(cwd, ".kitpilot")
}

/**
 * Checks if a directory exists
 */
export async function directoryExists(dirPath: string): Promise<boolean> {
	try {
		const stat = await fs.stat(dirPath)
		return stat.isDirectory()
	} catch (error: any) {
		// Only catch expected "not found" errors
		if (error.code === "ENOENT" || error.code === "ENOTDIR") {
			return false
		}
		// Re-throw unexpected errors (permission, I/O, etc.)
		throw error
	}
}

/**
 * Checks if a file exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
	try {
		const stat = await fs.stat(filePath)
		return stat.isFile()
	} catch (error: any) {
		// Only catch expected "not found" errors
		if (error.code === "ENOENT" || error.code === "ENOTDIR") {
			return false
		}
		// Re-throw unexpected errors (permission, I/O, etc.)
		throw error
	}
}

/**
 * Reads a file safely, returning null if it doesn't exist
 */
export async function readFileIfExists(filePath: string): Promise<string | null> {
	try {
		return await fs.readFile(filePath, "utf-8")
	} catch (error: any) {
		// Only catch expected "not found" errors
		if (error.code === "ENOENT" || error.code === "ENOTDIR" || error.code === "EISDIR") {
			return null
		}
		// Re-throw unexpected errors (permission, I/O, etc.)
		throw error
	}
}

/**
 * Discovers all .kitpilot directories in subdirectories of the workspace
 *
 * @param cwd - Current working directory (workspace root)
 * @returns Array of absolute paths to .kitpilot directories found in subdirectories,
 *          sorted alphabetically. Does not include the root .kitpilot directory.
 *
 * @example
 * ```typescript
 * const subfolderRoos = await discoverSubfolderKitPilotDirectories('/Users/john/monorepo')
 * // Returns:
 * // [
 * //   '/Users/john/monorepo/package-a/.kitpilot',
 * //   '/Users/john/monorepo/package-b/.kitpilot',
 * //   '/Users/john/monorepo/packages/shared/.kitpilot'
 * // ]
 * ```
 *
 * @example Directory structure:
 * ```
 * /Users/john/monorepo/
 * ├── .kitpilot/                    # Root .kitpilot (NOT included - use getProjectKitPilotDirectoryForCwd)
 * ├── package-a/
 * │   └── .kitpilot/                # Included
 * │       └── rules/
 * ├── package-b/
 * │   └── .kitpilot/                # Included
 * │       └── rules-code/
 * └── packages/
 *     └── shared/
 *         └── .kitpilot/            # Included (nested)
 *             └── rules/
 * ```
 */
export async function discoverSubfolderKitPilotDirectories(cwd: string): Promise<string[]> {
	try {
		// Dynamic import to avoid vscode dependency at module load time
		// This is necessary because file-search.ts imports vscode, which is not
		// available in the webview context
		const { executeRipgrep } = await import("../search/file-search")

		// Use ripgrep to find any file inside any .kitpilot or .kitpilot directory
		const args = [
			"--files",
			"--hidden",
			"--follow",
			"-g",
			"**/.kitpilot/**",
			"-g",
			"**/.kitpilot/**",
			"-g",
			"!node_modules/**",
			"-g",
			"!.git/**",
			cwd,
		]

		const results = await executeRipgrep({ args, workspacePath: cwd })

		// Extract unique .kitpilot directory paths
		const kitpilotDirs = new Set<string>()
		const rootKitpilotDir = path.join(cwd, ".kitpilot")

		for (const result of results) {
			// Match ".kitpilot" segments, on Unix and Windows separators
			const match = result.path.match(/^(.+?)[/\\](\.kitpilot)[/\\]/)
			if (match) {
				const kitpilotDir = path.join(cwd, match[1], match[2])
				// Exclude root-level dirs (already handled by getProjectKitPilotDirectoryForCwd)
				if (kitpilotDir !== rootKitpilotDir) {
					kitpilotDirs.add(kitpilotDir)
				}
			}
		}

		// Return sorted alphabetically
		return Array.from(kitpilotDirs).sort()
	} catch (error) {
		// If discovery fails (e.g., ripgrep not available), return empty array
		return []
	}
}

/**
 * Gets the ordered list of .kitpilot directories to check (global first, then project-local)
 *
 * @param cwd - Current working directory (project path)
 * @returns Array of directory paths to check in order [global, project-local]
 *
 * @example
 * ```typescript
 * // For a project at /Users/john/my-project
 * const directories = getKitPilotDirectoriesForCwd('/Users/john/my-project')
 * // Returns:
 * // [
 * //   '/Users/john/.kitpilot',           // Global directory
 * //   '/Users/john/my-project/.kitpilot' // Project-local directory
 * // ]
 * ```
 *
 * @example Directory structure:
 * ```
 * /Users/john/
 * ├── .kitpilot/                    # Global configuration
 * │   ├── rules/
 * │   │   └── rules.md
 * │   └── custom-instructions.md
 * └── my-project/
 *     ├── .kitpilot/                # Project-specific configuration
 *     │   ├── rules/
 *     │   │   └── rules.md     # Overrides global rules
 *     │   └── project-notes.md
 *     └── src/
 *         └── index.ts
 * ```
 */
export function getKitPilotDirectoriesForCwd(cwd: string): string[] {
	const globalKitpilot = path.join(os.homedir(), ".kitpilot")
	const projectKitpilot = path.join(cwd, ".kitpilot")

	const directories: string[] = []
	// Order: less-specific first, more-specific last (later entries override earlier when merged).
	if (fsSync.existsSync(globalKitpilot)) directories.push(globalKitpilot)
	directories.push(projectKitpilot) // project-local kitpilot always included even if absent (for write-site callers)
	return directories
}

/**
 * Gets the ordered list of all .kitpilot directories including subdirectories
 *
 * @param cwd - Current working directory (project path)
 * @returns Array of directory paths in order: [global, project-local, ...subfolders (alphabetically)]
 *
 * @example
 * ```typescript
 * // For a monorepo at /Users/john/monorepo with .kitpilot in subfolders
 * const directories = await getAllKitPilotDirectoriesForCwd('/Users/john/monorepo')
 * // Returns:
 * // [
 * //   '/Users/john/.kitpilot',                    // Global directory
 * //   '/Users/john/monorepo/.kitpilot',           // Project-local directory
 * //   '/Users/john/monorepo/package-a/.kitpilot', // Subfolder (alphabetical)
 * //   '/Users/john/monorepo/package-b/.kitpilot'  // Subfolder (alphabetical)
 * // ]
 * ```
 */
export async function getAllKitPilotDirectoriesForCwd(cwd: string): Promise<string[]> {
	// Use the dual-aware roots (returns existing legacy + new canonical), then add subfolders.
	const directories = getKitPilotDirectoriesForCwd(cwd)
	const subfolderDirs = await discoverSubfolderKitPilotDirectories(cwd)
	directories.push(...subfolderDirs)
	return directories
}

/**
 * Gets parent directories containing .kitpilot folders, in order from root to subfolders
 *
 * @param cwd - Current working directory (project path)
 * @returns Array of parent directory paths (not .kitpilot paths) containing AGENTS.md or .kitpilot
 *
 * @example
 * ```typescript
 * const dirs = await getAgentsDirectoriesForCwd('/Users/john/monorepo')
 * // Returns: ['/Users/john/monorepo', '/Users/john/monorepo/package-a', ...]
 * ```
 */
export async function getAgentsDirectoriesForCwd(cwd: string): Promise<string[]> {
	const directories: string[] = []

	// Always include the root directory
	directories.push(cwd)

	// Get all subfolder .kitpilot directories
	const subfolderKitPilotDirs = await discoverSubfolderKitPilotDirectories(cwd)

	// Extract parent directories (remove .kitpilot from path)
	for (const kitpilotDir of subfolderKitPilotDirs) {
		const parentDir = path.dirname(kitpilotDir)
		directories.push(parentDir)
	}

	return directories
}

/**
 * Loads configuration from multiple .kitpilot directories with project overriding global
 *
 * @param relativePath - The relative path within each .kitpilot directory (e.g., 'rules/rules.md')
 * @param cwd - Current working directory (project path)
 * @returns Object with global and project content, plus merged content
 *
 * @example
 * ```typescript
 * // Load rules configuration for a project
 * const config = await loadConfiguration('rules/rules.md', '/Users/john/my-project')
 *
 * // Returns:
 * // {
 * //   global: "Global rules content...",     // From ~/.kitpilot/rules/rules.md
 * //   project: "Project rules content...",   // From /Users/john/my-project/.kitpilot/rules/rules.md
 * //   merged: "Global rules content...\n\n# Project-specific rules (override global):\n\nProject rules content..."
 * // }
 * ```
 *
 * @example File paths resolved:
 * ```
 * relativePath: 'rules/rules.md'
 * cwd: '/Users/john/my-project'
 *
 * Reads from:
 * - Global: /Users/john/.kitpilot/rules/rules.md
 * - Project: /Users/john/my-project/.kitpilot/rules/rules.md
 *
 * Other common relativePath examples:
 * - 'custom-instructions.md'
 * - 'config/settings.json'
 * - 'templates/component.tsx'
 * ```
 *
 * @example Merging behavior:
 * ```
 * // If only global exists:
 * { global: "content", project: null, merged: "content" }
 *
 * // If only project exists:
 * { global: null, project: "content", merged: "content" }
 *
 * // If both exist:
 * {
 *   global: "global content",
 *   project: "project content",
 *   merged: "global content\n\n# Project-specific rules (override global):\n\nproject content"
 * }
 * ```
 */
export async function loadConfiguration(
	relativePath: string,
	cwd: string,
): Promise<{
	global: string | null
	project: string | null
	merged: string
}> {
	const globalDir = getGlobalKitPilotDirectory()
	const projectDir = getProjectKitPilotDirectoryForCwd(cwd)

	const globalFilePath = path.join(globalDir, relativePath)
	const projectFilePath = path.join(projectDir, relativePath)

	// Read global configuration
	const globalContent = await readFileIfExists(globalFilePath)

	// Read project-local configuration
	const projectContent = await readFileIfExists(projectFilePath)

	// Merge configurations - project overrides global
	let merged = ""

	if (globalContent) {
		merged += globalContent
	}

	if (projectContent) {
		if (merged) {
			merged += "\n\n# Project-specific rules (override global):\n\n"
		}
		merged += projectContent
	}

	return {
		global: globalContent,
		project: projectContent,
		merged: merged || "",
	}
}

// Export with backward compatibility alias
export const loadKitPilotConfiguration: typeof loadConfiguration = loadConfiguration
