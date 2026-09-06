import * as fs from "fs/promises"
import * as path from "path"

/** The extension manifest, relative to the compiled `out/evals` directory. */
export const EXTENSION_PATH = path.resolve(__dirname, "../../../../src")

/**
 * The VS Code version to run against.
 *
 * "stable" on purpose. The floor in `engines.vscode` is the oldest VS Code that
 * KitPilot supports, and it was the default here at first. That was wrong: the
 * harness installs the newest Copilot extension, and the newest Copilot needs a
 * recent VS Code. Measured on 2026-09-06, `github.copilot-chat` 0.48.1 requires
 * `^1.120.0` while the floor was 1.107.0, so VS Code refused the extension,
 * fell back to an older one, and its sign-in failed. The harness had installed
 * an extension it could not run.
 *
 * A pinned floor also rots. It works on the day it is written and drifts out of
 * Copilot's range as Copilot moves on.
 *
 * Both variants run inside one VS Code instance, so a comparison never spans
 * two versions. The report records the version that actually ran.
 *
 * Set VSCODE_VERSION to pin a version.
 */
export async function vsCodeVersion(): Promise<string> {
	return process.env.VSCODE_VERSION ?? "stable"
}

/**
 * The oldest VS Code that can load the extension, for a warning only.
 */
export async function enginesFloor(): Promise<string | undefined> {
	return readEnginesFloor(EXTENSION_PATH)
}

/**
 * The executable to launch, given the path that `downloadAndUnzipVSCode`
 * returned.
 *
 * VS Code renamed its macOS binary. 1.107.0 ships `Contents/MacOS/Electron`;
 * 1.136.1 ships `Contents/MacOS/Code`. `@vscode/test-electron` 2.5.2 builds the
 * `Electron` path only, so it cannot start a current VS Code and fails with
 * ENOENT. This takes the path it built and, when nothing is there, looks for
 * the other name beside it.
 */
export async function resolveExecutable(downloaded: string): Promise<string> {
	if (await exists(downloaded)) {
		return downloaded
	}

	const dir = path.dirname(downloaded)
	for (const name of ["Code", "Electron"]) {
		const candidate = path.join(dir, name)
		if (await exists(candidate)) {
			return candidate
		}
	}

	return downloaded
}

/** The version inside an installed VS Code, for the report. */
export async function installedVersion(executable: string): Promise<string | undefined> {
	// <app>/Contents/MacOS/<binary> gives <app>/Contents/Info.plist.
	const plist = path.resolve(path.dirname(executable), "..", "Info.plist")
	try {
		const text = await fs.readFile(plist, "utf8")
		return /<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/.exec(text)?.[1]
	} catch {
		return undefined
	}
}

async function exists(candidate: string): Promise<boolean> {
	try {
		await fs.access(candidate)
		return true
	} catch {
		return false
	}
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
