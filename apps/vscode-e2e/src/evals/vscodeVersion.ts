import * as fs from "fs/promises"
import * as path from "path"

/** The extension manifest, relative to the compiled `out/evals` directory. */
export const EXTENSION_PATH = path.resolve(__dirname, "../../../../src")

let cached: string | undefined

/**
 * The VS Code version to run against.
 *
 * The extension declares a floor in `engines.vscode`. A VS Code below that
 * floor refuses to activate it, and every trial then fails with "extension not
 * found" rather than with a result. Thus the default comes from the manifest
 * and cannot fall behind it.
 *
 * Set VSCODE_VERSION to test against another version.
 */
export async function vsCodeVersion(): Promise<string> {
	const fromEnv = process.env.VSCODE_VERSION
	if (fromEnv) {
		return fromEnv
	}
	if (cached) {
		return cached
	}

	cached = (await readEnginesFloor(EXTENSION_PATH)) ?? "stable"
	return cached
}

export async function readExtensionVersion(extensionPath: string): Promise<string> {
	const manifest = await readManifest(extensionPath)
	return manifest?.version ?? "unknown"
}

async function readEnginesFloor(extensionPath: string): Promise<string | undefined> {
	const manifest = await readManifest(extensionPath)
	const range = manifest?.engines?.vscode
	if (!range) {
		return undefined
	}
	// "^1.107.0" gives 1.107.0, the oldest version that can load the extension.
	const match = /(\d+\.\d+\.\d+)/.exec(range)
	return match?.[1]
}

interface Manifest {
	version?: string
	engines?: { vscode?: string }
}

async function readManifest(extensionPath: string): Promise<Manifest | undefined> {
	try {
		return JSON.parse(await fs.readFile(path.join(extensionPath, "package.json"), "utf8")) as Manifest
	} catch {
		return undefined
	}
}
