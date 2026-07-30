import * as vscode from "vscode"

/**
 * Schemes KitPilot is willing to hand to the OS via `vscode.env.openExternal`.
 *
 * Anything else — `file:`, `vscode:`, `javascript:`, custom app handlers — is
 * refused. Opening an arbitrary scheme launches whatever the OS has registered
 * for it, so the set stays deliberately small.
 */
const ALLOWED_SCHEMES = new Set(["http", "https"])

/**
 * Parse a URL and return it only if it is safe to open externally.
 *
 * Returns the parsed `Uri` rather than a boolean so callers open exactly the
 * value that was validated — re-parsing after a check invites the two
 * representations to disagree.
 *
 * @returns the parsed Uri, or `undefined` when the input is unparseable, uses a
 * disallowed scheme, or carries no host (e.g. `https:evil`, which parses as a
 * scheme plus an opaque path rather than a web address).
 */
export function parseExternalUri(url: string): vscode.Uri | undefined {
	if (typeof url !== "string" || url.trim() === "") {
		return undefined
	}

	let uri: vscode.Uri
	try {
		uri = vscode.Uri.parse(url, true)
	} catch {
		return undefined
	}

	if (!ALLOWED_SCHEMES.has(uri.scheme.toLowerCase())) {
		return undefined
	}

	// `https:foo` and `https:javascript` parse with an empty authority. A real
	// web link always has a host.
	if (!uri.authority) {
		return undefined
	}

	return uri
}

/**
 * Open a URL externally when it passes {@link parseExternalUri}.
 *
 * @returns whether the URL was opened.
 */
export async function openExternalUrl(url: string): Promise<boolean> {
	const uri = parseExternalUri(url)

	if (!uri) {
		console.warn(`KitPilot: refused to open external URL with disallowed scheme or missing host: ${url}`)
		return false
	}

	await vscode.env.openExternal(uri)
	return true
}
