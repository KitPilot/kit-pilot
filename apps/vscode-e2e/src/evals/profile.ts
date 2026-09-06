import * as path from "path"

/**
 * The VS Code profile that the evaluation runs in.
 *
 * `@vscode/test-electron` starts VS Code with its own user data directory and
 * its own extensions directory, so the instance has neither the Copilot
 * extension nor a GitHub sign-in. Without both, `vscode-lm` offers no model and
 * every trial fails.
 *
 * Thus the harness names the two directories itself. They persist between runs,
 * so the sign-in happens one time only, and they stay apart from the user's own
 * VS Code profile.
 */
export function evalProfileDir(): string {
	return process.env.EVAL_PROFILE_DIR ?? path.resolve(__dirname, "../../.vscode-eval")
}

export function profileLaunchArgs(): string[] {
	const profile = evalProfileDir()
	return [
		`--user-data-dir=${path.join(profile, "user-data")}`,
		`--extensions-dir=${path.join(profile, "extensions")}`,
	]
}

/** The extensions that `vscode-lm` needs. */
export const REQUIRED_EXTENSIONS = ["GitHub.copilot", "GitHub.copilot-chat"]

/**
 * Flags for a VS Code that the harness opens for a person to use.
 *
 * `--disable-updates` is the one that matters. `runTests` passes it, but the
 * sign-in window did not, so that window updated itself on quit and wrote the
 * new version over the pinned one inside the download cache. The cache then
 * held a directory named for one version that contained another, with its
 * binary under a different name, and every later run failed to start it.
 *
 * The evaluation must run against the version it pins, thus no window that the
 * harness opens may update itself.
 */
export const INTERACTIVE_LAUNCH_ARGS = ["--disable-updates", "--skip-welcome", "--skip-release-notes"]
