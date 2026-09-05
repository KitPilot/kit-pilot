import { VERSION } from "@/lib/utils/version.js"
import { isRecord } from "@/lib/utils/guards.js"

const RELEASES_URL = "https://api.github.com/repos/KitPilot/kit-pilot/releases?per_page=100"

export interface UpgradeOptions {
	currentVersion?: string
	fetchImpl?: typeof fetch
	runInstaller?: () => Promise<void>
}

function parseVersion(version: string): number[] {
	const cleaned = version
		.trim()
		.replace(/^cli-v/, "")
		.replace(/^v/, "")
	const core = cleaned.split("+", 1)[0]?.split("-", 1)[0]

	if (!core) {
		throw new Error(`Invalid version: ${version}`)
	}

	const parts = core.split(".")
	if (parts.length === 0) {
		throw new Error(`Invalid version: ${version}`)
	}

	return parts.map((part) => {
		if (!/^\d+$/.test(part)) {
			throw new Error(`Invalid version: ${version}`)
		}

		return Number.parseInt(part, 10)
	})
}

/**
 * Returns:
 * - 1 when `a > b`
 * - 0 when `a === b`
 * - -1 when `a < b`
 */
export function compareVersions(a: string, b: string): number {
	const aParts = parseVersion(a)
	const bParts = parseVersion(b)
	const maxLength = Math.max(aParts.length, bParts.length)

	for (let i = 0; i < maxLength; i++) {
		const aPart = aParts[i] ?? 0
		const bPart = bParts[i] ?? 0

		if (aPart > bPart) {
			return 1
		}

		if (aPart < bPart) {
			return -1
		}
	}

	return 0
}

export async function getLatestCliVersion(fetchImpl: typeof fetch = fetch): Promise<string> {
	const response = await fetchImpl(RELEASES_URL, {
		headers: {
			Accept: "application/vnd.github+json",
			"User-Agent": "kitpilot-cli",
		},
	})

	if (!response.ok) {
		throw new Error(`Failed to check latest version (HTTP ${response.status})`)
	}

	const releases = await response.json()
	if (!Array.isArray(releases)) {
		throw new Error("Invalid release response from GitHub.")
	}

	let latestVersion: string | undefined

	for (const release of releases) {
		if (!isRecord(release)) {
			continue
		}

		const tagName = release.tag_name
		if (typeof tagName === "string" && tagName.startsWith("cli-v")) {
			const candidate = tagName.slice("cli-v".length)
			try {
				if (!latestVersion || compareVersions(candidate, latestVersion) > 0) {
					latestVersion = candidate
				}
			} catch {
				// Ignore malformed CLI tags and keep scanning other releases.
			}
		}
	}

	if (latestVersion) {
		return latestVersion
	}

	throw new Error("Could not determine the latest CLI release version.")
}

// The CLI is quarantined and no release contains it, so there is nothing to
// install. This function refuses instead of downloading and running a shell
// script. See apps/cli/README.md.
export function runUpgradeInstaller(_version?: string): Promise<void> {
	return Promise.reject(
		new Error(
			"The KitPilot CLI is not distributed, so it cannot upgrade itself. Build it from the repository instead.",
		),
	)
}

export async function upgrade(options: UpgradeOptions = {}): Promise<void> {
	const currentVersion = options.currentVersion ?? VERSION
	const fetchImpl = options.fetchImpl ?? fetch
	const runInstaller = options.runInstaller

	console.log(`Current version: ${currentVersion}`)

	const latestVersion = await getLatestCliVersion(fetchImpl)
	console.log(`Latest version: ${latestVersion}`)

	if (compareVersions(latestVersion, currentVersion) <= 0) {
		console.log("KitPilot CLI is already up to date.")
		return
	}

	console.log(`Upgrading KitPilot CLI from ${currentVersion} to ${latestVersion}...`)
	if (runInstaller) {
		await runInstaller()
	} else {
		await runUpgradeInstaller(latestVersion)
	}
	console.log("✓ Upgrade completed.")
}
