#!/usr/bin/env node
/**
 * Shared VSIX artifact validator — the single source of truth for what a
 * publishable KitPilot package must (and must not) contain. Used by:
 *   - scripts/release.mjs (local release gate)
 *   - .github/workflows/ci.yml (PR artifact job)
 *   - .github/workflows/release.yml (validates the exact artifact before publish)
 *
 * Usage: node scripts/validate-vsix.mjs <path-to-vsix> [--expect-version X.Y.Z]
 * Exits non-zero with a reason on any violation.
 */

import fs from "fs"
import path from "path"
import { execFileSync } from "child_process"

const RED = "\x1b[31m"
const GREEN = "\x1b[32m"
const RESET = "\x1b[0m"

const die = (msg) => {
	console.error(`${RED}✖ ${msg}${RESET}`)
	process.exit(1)
}
const ok = (msg) => console.log(`${GREEN}✔${RESET} ${msg}`)

/** Compressed-size ceiling. The trust-release build measures 18.5 MiB versus
 * 27.5 MiB for 0.2.0 with source maps. 22 MiB leaves ~19% growth headroom
 * while still catching a material packaging regression. */
const MAX_COMPRESSED_MB = 22

/** Bundles without which the extension cannot run. */
const REQUIRED_FILES = [
	"extension/dist/extension.js",
	"extension/webview-ui/build/assets/index.js",
	"extension/changelog.md",
]

/** Files that must never ship: secrets, credentials, debug maps, nested
 * packages, key material. Each entry is [pattern, reason]. */
const FORBIDDEN = [
	[/\.map$/, "source map (download bloat + source disclosure)"],
	[/(^|\/)\.env(\..+)?$/, ".env file (potential secrets)"],
	[/\.(pem|key|p12|pfx|jks|keystore)$/, "key material"],
	[/\.vsix$/, "nested VSIX package"],
	[/(^|\/)(id_rsa|id_dsa|id_ecdsa|id_ed25519)(\..+)?$/, "SSH key"],
	[/(^|\/)\.(npmrc|netrc|git-credentials)$/, "credential store file"],
	[/(^|\/)credentials(\.json)?$/, "credentials file"],
]

const [, , vsixArg, ...rest] = process.argv
if (!vsixArg) die("Usage: node scripts/validate-vsix.mjs <path-to-vsix> [--expect-version X.Y.Z]")

const expectIdx = rest.indexOf("--expect-version")
const expectedVersion = expectIdx >= 0 ? rest[expectIdx + 1] : undefined

const vsixPath = path.resolve(vsixArg)
if (!fs.existsSync(vsixPath)) die(`Artifact not found: ${vsixPath}`)

// --- manifest version ---------------------------------------------------------
const manifestRaw = execFileSync("unzip", ["-p", vsixPath, "extension/package.json"], { encoding: "utf8" })
const manifest = JSON.parse(manifestRaw)
if (expectedVersion && manifest.version !== expectedVersion) {
	die(`Packaged manifest version is ${manifest.version}, expected ${expectedVersion} — stale build?`)
}
ok(`Manifest version: ${manifest.version}${expectedVersion ? " (matches expected)" : ""}`)

// --- content listing ----------------------------------------------------------
const listing = execFileSync("unzip", ["-Z1", vsixPath], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
const files = listing.split("\n").filter(Boolean)

for (const requiredFile of REQUIRED_FILES) {
	if (!files.includes(requiredFile)) die(`vsix is missing required file: ${requiredFile}`)
}
ok("Required bundles present (extension, webview, changelog)")

const violations = []
for (const file of files) {
	for (const [pattern, reason] of FORBIDDEN) {
		if (pattern.test(file)) {
			violations.push(`${file} — ${reason}`)
		}
	}
}
if (violations.length > 0) {
	die(`Forbidden files inside the vsix (fix .vscodeignore / build outputs):\n  ${violations.join("\n  ")}`)
}
ok(`No forbidden files (${files.length} files scanned)`)

// --- top-level path allowlist ---------------------------------------------------
// Anything outside these roots means the packaging globs regressed.
const ALLOWED_TOP_LEVEL = new Set(["extension", "[Content_Types].xml", "extension.vsixmanifest"])
const unexpectedRoots = [...new Set(files.map((f) => f.split("/")[0]))].filter((r) => !ALLOWED_TOP_LEVEL.has(r))
if (unexpectedRoots.length > 0) {
	die(`Unexpected top-level paths in the vsix: ${unexpectedRoots.join(", ")}`)
}
ok("Top-level package layout as expected")

// --- dangling sourceMappingURL references ---------------------------------------
// Maps are not shipped; a JS bundle still referencing one means a build step
// regressed (and would make browsers/devtools fire 404 lookups).
const jsBundles = files.filter((f) => /^extension\/(dist|webview-ui\/build)\/.*\.js$/.test(f))
let danglingRefs = 0
for (const bundle of jsBundles) {
	const content = execFileSync("unzip", ["-p", vsixPath, bundle], {
		encoding: "utf8",
		maxBuffer: 256 * 1024 * 1024,
	})
	// Build tools emit the bundle's own pragma at EOF. Dependencies such as
	// workerpool may embed worker source (including its original pragma) inside
	// a template literal, so scanning every line would produce false positives.
	const trailingSourceMapPragma = /(?:\/\/[#@]\s*sourceMappingURL=[^\r\n]+|\/\*#\s*sourceMappingURL=[\s\S]*?\*\/)\s*$/
	if (trailingSourceMapPragma.test(content)) {
		console.error(`${RED}  dangling sourceMappingURL in ${bundle}${RESET}`)
		danglingRefs++
	}
}
if (danglingRefs > 0) {
	die(`${danglingRefs} shipped JS bundle(s) still reference source maps — remove sourcemap emission for production.`)
}
ok(`No dangling sourceMappingURL references (${jsBundles.length} bundles checked)`)

// --- size ceiling ---------------------------------------------------------------
const sizeMb = fs.statSync(vsixPath).size / (1024 * 1024)
if (sizeMb > MAX_COMPRESSED_MB) {
	die(
		`Artifact is ${sizeMb.toFixed(1)} MiB compressed — over the ${MAX_COMPRESSED_MB} MiB ceiling. ` +
			"Something heavy regressed into the package.",
	)
}
ok(`Size: ${sizeMb.toFixed(1)} MiB compressed (ceiling ${MAX_COMPRESSED_MB} MiB)`)

console.log(`${GREEN}VSIX validation passed.${RESET}`)
