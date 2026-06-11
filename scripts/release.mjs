#!/usr/bin/env node
/**
 * KitPilot release preflight + build.
 *
 * Automates the mechanical parts of a release and guards against the ways
 * past releases went wrong:
 *
 *   - version already published (0.1.10 / 0.1.17: a pre-release-channel
 *     version can never be re-published to stable, forcing version jumps)
 *   - missing/mismatched CHANGELOG entry
 *   - stale webview bundle (`vsce package` does NOT rebuild webview-ui)
 *   - lint/type/test failures discovered after tagging
 *   - malformed vsix (wrong manifest version, missing bundles)
 *
 * It deliberately does NOT publish — publishing needs the marketplace PAT
 * and stays a human step. It prints the exact next steps instead.
 *
 * Usage:
 *   node scripts/release.mjs                       # preflight + build current version
 *   node scripts/release.mjs --bump patch          # bump src/package.json first
 *   node scripts/release.mjs --set-version 0.2.0
 *   node scripts/release.mjs --check-only          # preflight only, no build
 *   node scripts/release.mjs --skip-tests          # gates: lint + types only
 */

import { execFileSync, execSync } from "node:child_process"
import * as fs from "node:fs"
import * as path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const SRC_PKG_PATH = path.join(ROOT, "src", "package.json")
const CHANGELOG_PATH = path.join(ROOT, "CHANGELOG.md")

const GREEN = "\x1b[32m"
const YELLOW = "\x1b[33m"
const RED = "\x1b[31m"
const BOLD = "\x1b[1m"
const RESET = "\x1b[0m"

const ok = (msg) => console.log(`${GREEN}✔${RESET} ${msg}`)
const warn = (msg) => console.log(`${YELLOW}⚠${RESET} ${msg}`)
const step = (msg) => console.log(`\n${BOLD}— ${msg}${RESET}`)
const die = (msg) => {
	console.error(`${RED}✖ ${msg}${RESET}`)
	process.exit(1)
}

function parseArgs(argv) {
	const args = { bump: undefined, setVersion: undefined, skipTests: false, checkOnly: false }
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i]
		if (arg === "--bump") {
			args.bump = argv[++i]
			if (!["patch", "minor", "major"].includes(args.bump)) die(`--bump must be patch|minor|major, got "${args.bump}"`)
		} else if (arg === "--set-version") {
			args.setVersion = argv[++i]
			if (!/^\d+\.\d+\.\d+$/.test(args.setVersion ?? "")) die(`--set-version must be X.Y.Z, got "${args.setVersion}"`)
		} else if (arg === "--skip-tests") {
			args.skipTests = true
		} else if (arg === "--check-only") {
			args.checkOnly = true
		} else {
			die(`Unknown argument "${arg}" (expected --bump, --set-version, --skip-tests, --check-only)`)
		}
	}
	if (args.bump && args.setVersion) die("Use either --bump or --set-version, not both")
	return args
}

function bumpVersion(version, kind) {
	const [major, minor, patch] = version.split(".").map(Number)
	if (kind === "major") return `${major + 1}.0.0`
	if (kind === "minor") return `${major}.${minor + 1}.0`
	return `${major}.${minor}.${patch + 1}`
}

function run(cmd, opts = {}) {
	execSync(cmd, { cwd: ROOT, stdio: "inherit", ...opts })
}

function readSrcPackage() {
	return JSON.parse(fs.readFileSync(SRC_PKG_PATH, "utf8"))
}

// --- 1. Resolve target version -------------------------------------------

const args = parseArgs(process.argv.slice(2))
const pkg = readSrcPackage()
let version = pkg.version

step("Version")
if (args.bump || args.setVersion) {
	const next = args.setVersion ?? bumpVersion(version, args.bump)
	// Plain string replace on the raw text preserves formatting; the version
	// field appears once near the top of the manifest.
	const raw = fs.readFileSync(SRC_PKG_PATH, "utf8")
	const updated = raw.replace(`"version": "${version}"`, `"version": "${next}"`)
	if (updated === raw) die(`Could not find "version": "${version}" in src/package.json`)
	fs.writeFileSync(SRC_PKG_PATH, updated)
	ok(`Bumped src/package.json: ${version} → ${next}`)
	version = next
} else {
	ok(`Releasing current version: ${version}`)
}

// --- 2. Changelog entry ----------------------------------------------------

step("Changelog")
const changelog = fs.readFileSync(CHANGELOG_PATH, "utf8")
const headings = [...changelog.matchAll(/^## (\S+)/gm)].map((m) => m[1])
if (!headings.includes(version)) {
	die(
		`CHANGELOG.md has no "## ${version}" section (top entries: ${headings.slice(0, 3).join(", ")}). ` +
			`Write the entry first — plain English, for end users.`,
	)
}
const section = changelog.split(`## ${version}`)[1]?.split(/^## /m)[0] ?? ""
const bullets = section.split("\n").filter((line) => line.trim().startsWith("- ")).length
if (bullets === 0) die(`The "## ${version}" changelog section has no bullet points.`)
if (headings[0] !== version) {
	warn(`"## ${version}" is not the top entry in CHANGELOG.md (top is "## ${headings[0]}") — is that intentional?`)
}
ok(`CHANGELOG.md has "## ${version}" with ${bullets} bullet(s)`)

// --- 3. Marketplace version collision ---------------------------------------

step("Marketplace version check")
try {
	const json = execFileSync("npx", ["vsce", "show", `${pkg.publisher}.${pkg.name}`, "--json"], {
		cwd: path.join(ROOT, "src"),
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
		timeout: 60_000,
	})
	const published = (JSON.parse(json).versions ?? []).map((v) => v.version)
	if (published.includes(version)) {
		die(
			`Version ${version} already exists on the marketplace (any channel, including pre-release and ` +
				`scanner-rejected uploads). It can never be reused — bump again (--bump patch).`,
		)
	}
	ok(`${version} is unused on the marketplace (${published.length} published versions checked)`)
} catch (error) {
	if (error.status !== undefined && error.status !== 0 && !error.killed) {
		// vsce ran but errored (offline, marketplace down, listing missing).
		warn(`Could not query the marketplace (${String(error.message).split("\n")[0]}) — collision check skipped.`)
	} else if (error instanceof SyntaxError) {
		warn("Marketplace returned unparseable data — collision check skipped.")
	} else if (error.killed) {
		warn("Marketplace query timed out — collision check skipped.")
	} else {
		throw error
	}
}

// --- 4. Git context ----------------------------------------------------------

step("Git")
const branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: ROOT, encoding: "utf8" }).trim()
if (branch === "main") {
	warn(`You are on "main". Release flow is branch + PR (git checkout -b release/${version}) — the pre-commit hook will refuse direct commits to main.`)
} else {
	ok(`On branch "${branch}"`)
}

// --- 5. Quality gates --------------------------------------------------------

step("Quality gates")
run("pnpm lint")
run("pnpm check-types")
if (args.skipTests) {
	warn("Tests skipped (--skip-tests)")
} else {
	run("pnpm test")
}
ok("Gates passed")

if (args.checkOnly) {
	console.log(`\n${BOLD}${GREEN}Preflight passed for ${version}.${RESET} Re-run without --check-only to build the vsix.`)
	process.exit(0)
}

// --- 6. Build (webview FIRST — vsce package does not rebuild it) -------------

step("Build")
run("pnpm --filter @kit-pilot/vscode-webview build")
run("pnpm --filter kit-pilot vsix")

// --- 7. Smoke-check the artifact ---------------------------------------------

step("Artifact smoke check")
const vsixPath = path.join(ROOT, "bin", `${pkg.name}-${version}.vsix`)
if (!fs.existsSync(vsixPath)) die(`Expected artifact not found: ${vsixPath}`)

const manifestRaw = execFileSync("unzip", ["-p", vsixPath, "extension/package.json"], { encoding: "utf8" })
const manifest = JSON.parse(manifestRaw)
if (manifest.version !== version) {
	die(`Packaged manifest version is ${manifest.version}, expected ${version} — stale build?`)
}
ok(`Manifest version matches (${version})`)

const listing = execFileSync("unzip", ["-Z1", vsixPath], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
const files = listing.split("\n")
const required = ["extension/dist/extension.js", "extension/webview-ui/build/assets/index.js", "extension/changelog.md"]
for (const requiredFile of required) {
	if (!files.includes(requiredFile)) die(`vsix is missing ${requiredFile}`)
}
ok("Extension bundle, webview bundle, and changelog are packaged")

// Files that have no business inside the package — and raise the odds of
// another marketplace virus-scanner rejection.
const suspicious = files.filter((f) => /\.(vsix|env|pem|key|p12)$|(^|\/)\.env(\..+)?$/.test(f))
if (suspicious.length > 0) {
	die(`Suspicious files inside the vsix (fix .vscodeignore):\n  ${suspicious.join("\n  ")}`)
}
ok("No suspicious files in the package")

const sizeMb = (fs.statSync(vsixPath).size / (1024 * 1024)).toFixed(1)
ok(`Artifact: ${path.relative(ROOT, vsixPath)} (${sizeMb} MB, ${files.filter(Boolean).length} files)`)

// --- 8. Next steps -------------------------------------------------------------

console.log(`
${BOLD}${GREEN}Release ${version} is built and verified.${RESET} Remaining (human) steps:

  1. Commit on a release branch and open the PR:
       git checkout -b release/${version}   # if not already on one
       git add -A && git commit             # never --no-verify
       gh pr create
  2. After merge, publish to the VS Code Marketplace:
       VSCE_PAT="$(security find-generic-password -s 'vscode-vsce' -a 'KitPilot' -w)" \\
         npx vsce publish --no-dependencies --packagePath ${path.relative(ROOT, vsixPath)} -p "$VSCE_PAT"
  3. Optional OpenVSX:
       npx ovsx publish --no-dependencies ${path.relative(ROOT, vsixPath)}
`)
