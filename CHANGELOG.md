# KitPilot Changelog

## 0.2.0

KitPilot can now run commands in the background and keep working — the milestone this version number was waiting for.

### Added

- **Background tasks.** KitPilot can start long-running commands — dev servers, file watchers, big test suites, slow builds — in the background and keep working while they run. It gets a task handle back in about two seconds and carries on; commands that fail instantly (a typo, a missing tool) still report their error right away instead of pretending to run.
- **Watch for readiness.** When starting a background task, KitPilot can watch its output for a pattern — say, a dev server's "ready in 320ms" line — and gets told the moment it appears. That means it can start your server, keep coding while it boots, and only then go test the endpoint.
- **Check and stop.** Two new abilities go with this: checking a background task (its status plus only the output that's new since the last look, with an optional bounded wait for a pattern) and stopping one (cleanly killing the whole process tree when a server or watcher is no longer needed).
- **Wake on finish.** If a background task exits — or its watched pattern appears — while KitPilot is idle, KitPilot wakes up and reacts: a crashed dev server gets reported with its exit code and last output instead of sitting dead until you notice. A new checkbox under Terminal settings ("Wake the agent when a background task finishes", on by default) controls this; each wake costs one model request, so wakes are capped at three per minute. While KitPilot is actively working, background updates simply arrive with its next step at no extra cost.

### Changed

- Commands that KitPilot leaves running after a timeout are now tracked as background tasks too, so it can check on them or stop them later instead of losing track of them.

## 0.1.30

This release fixes models added with your own API key going missing from KitPilot.

### Fixed

- If you added a model to GitHub Copilot with your own API key (BYOK) — for example your own OpenAI, Anthropic, Gemini, or OpenRouter key — it stopped showing up in KitPilot's model list in 0.1.29. The new model filter was too strict and hid these along with the ones that genuinely don't work. KitPilot now recognizes Copilot's own bring-your-own-key models and shows them again, while still hiding the separate providers (like Claude Code or the Copilot CLI) that can't be used from KitPilot.

## 0.1.29

This release cleans up the model list and makes the chat input easier to read.

### Changed

- The placeholder and hint text inside the chat input are now brighter and a touch bolder, so they stay easy to read against the input's gradient background on both light and dark themes.
- The VS Code LM provider settings now include a short note about "Thinking Effort" (how hard Copilot models reason): it's set in VS Code's own model picker, not in KitPilot, and whatever level you choose there already applies to KitPilot — so there's nothing extra to configure here.

### Fixed

- Recent VS Code versions can list the same model under several providers — for example "Claude Opus — Copilot", "— Copilot CLI", and "— Claude Code". Only the Copilot ones actually work with KitPilot; picking one of the others failed with an authorization error. KitPilot now shows only the models it can genuinely use, so you can't accidentally select one that errors out.

## 0.1.28

This release refreshes the chat input and makes broken panels explain themselves.

### Changed

- The chat input has a new look: the text area and its controls (mode, model, send) now sit together in one rounded card with a soft blue-to-green gradient. It adapts to your theme — a deep wash on dark themes, a pastel one on light themes — and your text stays as readable as before.

### Fixed

- If KitPilot's panel ever fails to finish loading — which can happen right after VS Code updates the extension while the panel is open — KitPilot now notices within a few seconds and shows a message with a one-click **Reload Window** button, instead of leaving you with a silent blank panel wondering what broke.

## 0.1.27

This release gives KitPilot's home screen a face.

### Changed

- The welcome screen has a new look: a backdrop of tiny sky-blue 0s and 1s, the KitPilot aviator cub gently floating above a proper wordmark, and a new tagline — "Cleared for takeoff. What are we building?" (in your language). The pattern fades out behind the mascot to keep things calm, and it appears only on the home screen — your active chats look exactly as before.

## 0.1.26

This release lets you see your spending before it hits the limit, and promotes two features out of the Experimental section.

### Added

- If you've set a maximum cost in the auto-approval settings, the task header now shows your spending against it — for example **$1.23 / $5.00** — with a progress bar that turns amber as you approach the limit and red past it. It updates live while KitPilot works.
- A warning appears in the chat when a task has used 80% of its cost limit (you can change the percentage with the new "Warn At" setting next to Max Cost), so hitting the limit is never a surprise. Dismiss it and it stays away until the next budget round.
- The task details now show how much of your input was served from the prompt cache. Cached input costs about a tenth of the normal rate, so a high percentage here means cheaper requests.
- **Background editing** is now a regular setting (under Context settings, off by default) instead of an experiment. When on, KitPilot edits files quietly in the background without opening diff views or stealing your focus. If you had the experiment enabled, your choice carries over automatically.

### Changed

- KitPilot can now always use your slash commands and skills when it decides they'd help — this no longer requires enabling an experiment. Each use still asks for your approval first (or follows your auto-approval settings, where it counts as a read-only action).
- The Experimental section is down to two entries (AI image generation and custom tools — both stay experimental for good reasons), and some leftover descriptions for experiments that no longer exist have been cleaned out.

## 0.1.25

This release makes KitPilot's token-usage tracking survive restarts and easy to read.

### Added

- KitPilot now keeps a running record of where your tokens go — how much is spent on your actual coding requests versus background work like summarizing long conversations. The totals are saved to `~/.kitpilot/usage-metrics.json`, so they keep accumulating across window reloads and VS Code restarts instead of resetting every session.
- The **KitPilot: Run Diagnostics** report now includes a "Token usage by purpose" section showing that breakdown — the share, token counts, and cost for each kind of work since the measurement started. If you want to see (or share) where your Copilot credits are going, run diagnostics and read that section; no digging through log files needed.

## 0.1.24

This release makes the cost and token numbers accurate instead of estimated.

### Changed

- KitPilot now uses the real token counts GitHub Copilot reports for each request, instead of estimating them by counting characters. Your per-request token and cost figures — and the spending limit introduced in 0.1.23 — are now based on Copilot's actual numbers, including how many input tokens were served from cache. (Previously these were an approximation; they could drift from what Copilot actually billed.)

## 0.1.23

This release makes spending visible now that GitHub Copilot has switched to usage-based billing, and fixes model details showing incorrectly for some Copilot models.

### Added

- KitPilot now shows a cost estimate for your requests. GitHub Copilot moved to usage-based (token) billing on June 1, 2026, and KitPilot used to show every request as $0. It now estimates each request's cost from Copilot's per-model token rates, so you can see what a task is costing. (Estimates are based on token counts and published rates — treat them as a close guide, not your exact invoice.)
- The spending limit now actually works with Copilot. If you set a maximum cost in the auto-approval settings, KitPilot will pause and ask before going over it. Previously this limit did nothing, because every request registered as zero cost.

### Fixed

- Fixed model details — such as the context-window size and whether images are supported — showing incorrectly for some Copilot models, including newer Claude and Gemini ones. The image-attachment button is no longer wrongly disabled for models that do support images, and the model card no longer reports a misleading context size.

## 0.1.22

This release is all about steering — changing your mind while KitPilot is working now does what you'd expect, at every point.

### Added

- You can now interrupt KitPilot mid-task by just typing. While the agent is actively working, sending a new message stops what it's doing and continues with your new instruction, instead of waiting in line behind the current work. The Send button clearly changes to **Interrupt & send** so you know what will happen before you hit Enter, and the input briefly shows "Stopping current turn…" while it switches over. You can still queue a message instead with the queue button. (This applies to your main task; messages sent while a sub-task is running, or when you already have messages queued, still queue as before.)

### Changed

- Typing a message while KitPilot is waiting for you to approve an action now **redirects** the agent instead of approving. Previously, sending a message at an approval prompt approved the pending action and tacked your message on as a note — so "actually, do it differently" could run the very thing you were trying to change. Now, typing a message cancels the pending action and sends the agent your new instruction. To approve, use the **Approve** button.

### Fixed

- Fixed a bug where changing your mind mid-task could be silently undone. If you sent a new instruction while the agent was running a sub-task — for example "actually just delete that whole section" while it was editing a file — the agent could carry out your change and then quietly revert it, because the main task never learned what you'd asked. Your mid-task messages to a running sub-task are now passed back to the main task and shown in the timeline, so a change you requested is no longer treated as a mistake to undo.

## 0.1.21

### Fixed

- Solved an issue where starting a new task could hang on "API request..." for over half a minute on machines where saving checkpoints is slow (for example, work computers with antivirus scanning). The checkpoint timeout setting is now respected, so a slow checkpoint can never hold up your task for longer than the configured limit.
- Fixed opening a task from the history list being unreliable — clicks that did nothing, needed a double-click, or occasionally required reloading the window. Opening a task right after KitPilot starts now works on the first click, rapid clicks no longer interfere with each other, and if a task genuinely can't be opened you now get an error message instead of silence.

## 0.1.20

### Added

- New **KitPilot: Run Diagnostics** command that checks your setup (Copilot connection, file search, hooks, memory) and tells you exactly what's wrong when chat seems stuck.
- KitPilot now warns you when a hooks configuration file has a mistake in it, instead of silently skipping your hooks.
- If you upgraded from Roo Code, KitPilot now offers to bring over your old settings and configuration files with one click.

### Fixed

- Fixed a broken GitHub link in the welcome announcement.

## 0.1.19

### Added

- Added a small animated stick figure above the chat input that appears while KitPilot is working, so you can tell the agent isn't stuck.
- Added a safety check that asks for confirmation before running dangerous shell commands like `rm -rf /`, `git reset --hard`, `docker prune`, `Format-Volume`, and similar. Can be turned off via the `kit-pilot.destructiveCommandGuard` setting.
- Added a safety check that asks for confirmation before any `git push --force` (and its variants like `--force-with-lease`, `-f`, `+refspec`). Can be turned off via the `kit-pilot.forcePushGuard` setting.

### Fixed

- Solved an issue where chat got stuck on "API request…" because KitPilot couldn't find the ripgrep binary on newer versions of VS Code. It now also looks in the new location VS Code ships it in.

## 0.1.18

### Added

- **Hook system — declarative shell guards around tool execution.** Three event types fire around every tool call: `PreToolUse` (before the handler runs — exit code `1` blocks it), `PostToolUse` (after the handler runs — exit `1` rewrites the tool result to an error so the model reacts), and `UserPromptSubmit` (when a fresh user prompt arrives — exit `1` aborts the prompt before any LLM call). Wire format is identical to Claude Code hooks (stdin JSON, `CLAUDE_*` env vars, exit-code semantics 0/1/2) so hook scripts are portable across Claude Code, code_puppy, and KitPilot. Config lives in `~/.kitpilot/hooks.json` (global) and `.kitpilot/hooks.json` (project); matcher syntax supports `*`, exact tool name, file extension (`.ts`), `A && B`, `A || B`, and regex. See `src/services/hooks/README.md` for a worked example (refuse `rm -rf`, scan prompts for AWS keys).
- **`verifyCommand` is now actually enforced.** The `kit-pilot.verifyCommand` setting was previously prompt text only — a polite instruction the model could ignore. It is now a synthetic `PreToolUse` hook on `attempt_completion`: the verify command literally runs before the model can declare a task complete, and non-zero exit blocks completion and feeds the failure back to the model. The prompt-text hint is kept so the model knows to expect verification (avoids a wasted round-trip).

### Changed

- **Complete Roo Code → KitPilot rename, hard switch (no back-compat).** All internal references — config directory (`~/.kitpilot/`, project `.kitpilot/`), ignore files (`.kitpilotignore`), modes file (`.kitpilotmodes`), env vars (`KITPILOT_*`), IPC socket name, event names — moved to the KitPilot brand. **Existing pre-release testers with `.roo`/`.rooignore`/`.roomodes`/stored-config setups will need to migrate manually — those paths are no longer read.** Upstream attribution to Roo Code (and Cline before it) preserved in `LICENSE`, `NOTICE`, and `README.md` per Apache-2.0 terms. (Pre-released as 0.1.17 — stable users see the rename + hooks together as one upgrade from 0.1.16.)

## 0.1.17

> Released to the marketplace pre-release channel only as `v0.1.17-pre.1` (the Roo→KitPilot rename). The same version number couldn't be re-published to stable, so stable users jump straight from 0.1.16 to 0.1.18 — which includes the rename plus the new hook system.

### Changed

- Internal bookkeeping and housekeeping. No new features.

## 0.1.16

### Fixed

- **Image attach button no longer shows a "not-allowed" cursor for vision-capable models.** When a vision model was selected (e.g. Claude Sonnet 4 via Copilot), hovering the image button showed a red not-allowed cursor and the button was disabled, even though the model accepts images. The webview decided image support by looking the model's `family` up in a static registry, but the family strings Copilot reports (e.g. `claude-sonnet-4`) don't match the registry keys (e.g. `claude-4-sonnet`) — and unlisted families like `claude-3.7-sonnet` and `claude-opus-4` missed entirely. A registry miss fell back to `supportsImages: false`. The webview now derives image support from the same substring rules the backend vscode-lm provider already uses, so the button is enabled for every vision model regardless of registry coverage. The vision-detection logic is now shared (`modelSupportsVision` in `@kit-pilot/types`) so the two code paths can't drift again.

## 0.1.15

> 0.1.12, 0.1.13, and 0.1.14 were all uploaded but rejected by the VS Code Marketplace virus scanner with no specific signature reported. After escalating to vsmarketplace@microsoft.com with both manifests and a diff summary, support asked us to re-upload under a new version — 0.1.15 is that retry. Content is byte-identical to those failed builds.

### Fixed

- **Image attach button no longer appears disabled at chat startup.** The button was computing its disabled state from `!model?.supportsImages`, which evaluated to `true` while `apiConfiguration` was still loading async from the extension. Users saw a grayed-out button, tried pasting an image instead, and observed the button enable a moment later — making it look like paste was the trigger. Now only disables when the model is fully loaded AND explicitly reports no image support.
- **Image button styling cleanup.** The button had two conflicting opacity classes (`opacity-0` AND `opacity-40`) when disabled, plus a 1.75-second transition (`duration-1000` + `delay-750`) that made state changes look sluggish. Replaced with a clean two-state pattern using a standard 150ms opacity transition.

## 0.1.11

### Fixed

- **"Provider Error: API request failed" after long idle (laptop sleep) now self-recovers.** The VS Code Language Model handle was cached for the lifetime of the provider — after 1-2 hours of idle the underlying Copilot token would expire, every subsequent request would fail against the dead handle, and the only fix was reloading the window. The cached handle is now dropped automatically when a request fails so the next attempt re-acquires a fresh one via `vscode.lm.selectChatModels()`. Also proactively invalidates on `vscode.lm.onDidChangeChatModels` so the failure is often avoided entirely (e.g. when Copilot re-registers its provider after re-authenticating on wake). User cancellation is exempt — the handle is fine in that case.

## 0.1.10

> Released to the marketplace pre-release channel only as `v0.1.10-pre.1`. The same version number couldn't be re-published to stable, so stable users jump straight from 0.1.9 to 0.1.11 — which includes everything below plus the 0.1.11 fix.

### Added

- **Marketplace pre-release channel.** Tags matching `v0.1.X-pre.N` now publish to the VS Code Marketplace pre-release channel (visible only to users who opt in via the extension page's "Switch to Pre-Release Version" button). Lets us validate risky changes against real installs without polluting the stable channel.
- **KitPilot → KitPilot migration scripts** in `scripts/` (`migrate-from-kitpilot.sh` for macOS/Linux/Git Bash; `migrate-from-kitpilot.ps1` for Windows). Both forks share the same `globalStorage` layout, so the scripts copy missing task directories and merge the master `_index.json` (dedupes by id; KitPilot wins on conflict). Backs up KitPilot storage before any write; idempotent on re-run. Not bundled with the extension — pull the file you need from the repo and run it.

### Changed

- **Memory write tools auto-approve.** `remember_this` and `forget_this` no longer prompt per call. Both write to `~/.kitpilot/memory/` (user's own home directory) and are low-risk, so the approval friction was hurting the feature more than it was protecting anyone.
- **Memory write hardening.** Names are validated against a strict pattern (kebab/snake case only, no path traversal). Content is scanned for credential-shaped strings (OpenAI/Anthropic/GitHub/Slack/AWS/GitLab tokens, password/api_key/private_key assignments) and the write is refused with a clear error if any are found — keeps the agent from quietly persisting a leaked secret to a plaintext file under your home directory.

## 0.1.9

### Added

- **Memory write tools — agent can now save and forget memories on its own.** Completes the persistent memory feature that started in 0.1.8 (which only auto-loaded files the user wrote by hand). Two new tools:
    - `remember_this(name, type, description, content)` — saves a memory to `~/.kitpilot/memory/{name}.md` and updates the `MEMORY.md` index. Reusing a name overwrites. Types: `user` (who you are), `feedback` (rules to follow), `project` (ongoing work), `reference` (external systems).
    - `forget_this(name)` — deletes the memory file and removes its index entry. No-op success if it doesn't exist.
    - Both tools require approval per call (respects existing auto-approval settings).
- **Memory guidance in every system prompt.** The `<user_memory>` section now always emits, even when memory is empty, with explicit instructions about when to save (user shares stable facts, corrects your approach, mentions external systems) and when not to save (code patterns, in-progress state). Without this nudge, agents wouldn't proactively use the tools.

### Changed

- **`<user_memory>` block format reorganized** — memory body files are now nested under `### Entries` (was `## Entries`), and the empty state shows a placeholder instead of omitting the block entirely. This keeps the section structure consistent so the agent always knows the tools exist.

## 0.1.8

### Added

- **Persistent user memory.** KitPilot now auto-loads memory files from `~/.kitpilot/memory/` and injects them into every system prompt, so the agent retains context about you across sessions. Create a `MEMORY.md` index file plus any number of body `.md` files (e.g. `user-role.md`, `project-conventions.md`, `feedback-on-tests.md`) and the agent will see them on every turn — no more re-explaining who you are or how you like to work at the start of each task. Total memory is capped at ~50KB to protect the context window; bodies are loaded alphabetically and truncated with a notice if the cap is exceeded. The feature is opt-in: if the directory doesn't exist, nothing changes. This is the first piece of the larger "compounding context" roadmap (subagents, model routing, hooks coming later).

## 0.1.7

### Added

- **Image / vision support.** Paste a screenshot or `@`-mention an image file and KitPilot now sends the actual image bytes to Copilot via the VS Code Language Model API's `LanguageModelDataPart` — instead of replacing it with `[Image not supported]` placeholder text. Works on vision-capable Copilot models (GPT-4o, GPT-4o mini, GPT-4.1, GPT-5, Claude 3.5/3.7/Sonnet 4/Opus 4, Gemini 1.5/2.x, o1/o3/o4). Text-only models (e.g. `o3-mini`, `gpt-3.5`) continue to receive a clean placeholder.
- **Image-rejection warning.** If a vision-bearing request fails with an image-shaped error (`unsupported content type`, `vision`, etc.), a one-shot toast suggests switching to a vision-capable model. The original error still propagates so existing flows are unchanged.
- **Image token accounting.** `countTokens` now adds a per-image estimate (300/1000/2000 tokens by decoded byte size) on top of the text-token count, so context-window math stays roughly accurate when images are in the conversation. Real per-image cost is model-dependent; this is a conservative byte-size tier.

### Changed

- **Engine bump.** Minimum VS Code is now 1.107 (was 1.84). Required to access the stable `LanguageModelDataPart` API for image input.
- **Webview no longer hardcodes `supportsImages: false` for the VS Code LM provider.** The per-model `supportsImages` flag from the model registry now flows through to the UI; `gpt-4o-mini`, `o1`, and `o4-mini` registry entries corrected to `true` (all three accept image input).
- **5MB per-image cap.** Images exceeding 5MB after base64 decode become a clear placeholder (`[Image (..., XXXKB): exceeds the 5MB VS Code LM API limit and was not sent]`) instead of being sent in a request that would 4xx at the API boundary.

## 0.1.6

### Added

- **Model picker in the chat input bar.** You can now switch VS Code LM models directly from the bottom of the chat pane — no more round-trip through Settings → API Configuration → Model. Click the model name next to the mode selector and pick from the list of models VS Code exposes (Copilot GPT-4o, Claude Sonnet, etc.). Models cluster by family in the list, and the selection is saved to your current API configuration.

### Changed

- **Chat home page polished.** Replaced the cluttered tip cards with a single faint panel — "Supercharge GitHub Copilot." heading, a one-line description, and a docs link. Less noise on a fresh task.
- **The API Configuration selector has been removed from the chat input bar.** Since KitPilot only supports VS Code LM, the "configuration" concept added little — what users actually need to switch is the model. Named API configurations still exist in Settings for users who want to keep per-profile preferences like rate limits.
- **Workspace files no longer carry the KitPilot name.** KitPilot now writes its workspace files under `.kitpilot*` instead of `.kitpilot*`. Existing `.kitpilot*` files keep working — no manual migration needed.

## 0.1.5

### Fixed

- "Check our docs to get started" link on the welcome screen now points to the KitPilot repo (was still pointing to KitPilot's repo).
- Error boundary "report a bug" link → KitPilot issues.
- Settings → About "Report a bug" and "Security issue" links → KitPilot issues / security policy.
- ChatRow unknown-error fallback link → KitPilot issues.

The Announcement dialog's "fork of KitPilot" link intentionally still points to the KitPilot repo as upstream attribution.

## 0.1.4

### Added — agentic improvements

- **Workspace context on task start.** The first user message of every new task is now prefixed with a `<workspace_context>` block containing the top-level directory listing, `package.json` metadata, README first 50 lines, and (for git repos) the current branch, the last 5 commits, and the list of uncommitted changes. The agent stops wasting turns on basic `list_files` / `read_file` orientation.
- **Tool-failure self-reflection.** Every tool error response now carries a `reflectionRequired` field nudging the agent to think before retrying. Soft enforcement — net positive on capable models.
- **Smarter condensation prompt.** Replaced the inherited KitPilot condense template with a tighter, continuity-focused version that requires verbatim user intent, exact file paths, exact error messages, tool outcomes, decisions, and open blockers. Post-condensation hand-off is now meaningfully better.
- **System-prompt nudge toward planning.** Multi-step tasks should call `update_todo_list` first. Trivial actions are explicitly exempted — no process tax on simple edits.

### Added — opt-in agentic improvements

These are disabled by default; turn them on in VS Code Settings (search "kit-pilot").

- **`kit-pilot.deepErrorAnalysis`** (default `false`). When enabled, if the same tool fails twice in a row, KitPilot fires a focused secondary LLM call to analyze why and what to try instead. The analysis is prepended to the next turn as a `<failure_analysis>` block. Costs an extra API call per stuck episode.
- **`kit-pilot.verifyCommand`** (default empty). When set to a shell command like `pnpm run check-types` or `npm test`, the agent is instructed to run it before calling `attempt_completion` and address any errors first. Catches the class of bugs where the agent declares success but the code doesn't compile or tests fail.

### Fixed

- Lint hygiene: removed an unused `eslint-disable` directive in the disabled GenerateImageTool stub.

## 0.1.3

### Fixed

- Version indicator on the chat home screen was stuck displaying `v0.1.0` even after subsequent releases. The webview UI bundle wasn't being rebuilt between releases, so the baked-in `Package.version` constant never updated. From this release onward the GitHub Actions release workflow rebuilds the webview UI as part of every tag-triggered publish, preventing recurrence.

## 0.1.2

### Changed

- Replaced inherited KitPilot marketplace description (_"A whole dev team of AI agents in your editor"_) with KitPilot-accurate copy: _"An agentic coding assistant powered exclusively by GitHub Copilot."_ Applied across all 18 locale files.
- Cleaned marketplace keywords — dropped stale `claude`, `troo pilot`, `troopilot` tags; added `github-copilot`, `agentic`, `code-assistant`, `chat`, `kit-pilot`, `kitpilot` for better discoverability.

## 0.1.1

### Changed

- Marketplace icon now uses a transparent background instead of a white card so it sits cleanly on light and dark surfaces.

## 0.1.0

Initial release. KitPilot is a fork of [KitPilot](https://github.com/KitPilotInc/KitPilot) v3.53.0, narrowed for use with GitHub Copilot only.

### Changed

- **Single-provider build.** Removed all non-Copilot AI provider integrations (Anthropic, OpenAI, Bedrock, Vertex, Gemini, Mistral, OpenRouter, LiteLLM, Ollama chat, LM Studio, Requesty, Unbound, Poe, xAI, Z.ai, Fireworks, Vercel AI Gateway, MiniMax, Baseten, SambaNova, DeepSeek, Moonshot, Qwen Code, OpenAI Codex, fake-ai). VS Code Language Model API is the only supported provider.
- **Lower token cost.** Reworked environment-details injection to send only what changed between turns; historical `<environment_details>` blocks in sent history are now compact placeholders. Typical conversations use roughly 3× fewer tokens vs the upstream extension for the same workflow.
- **Code indexing.** Removed cloud embedders (OpenAI, Bedrock, Gemini, Mistral, OpenRouter, Vercel AI Gateway). Local [Ollama](https://ollama.ai/) is the only supported embedder; indexing is opt-in.
- **Image generation tool.** Disabled (`generate_image` is no longer registered).
- **Dependencies.** Removed ~50 npm packages tied to deleted providers (`@anthropic-ai/vertex-sdk`, `@aws-sdk/*`, `@google/genai`, `@lmstudio/sdk`, `@mistralai/mistralai`, all `@ai-sdk/*`, etc.).

### Renamed

- Extension display name, identifier, command IDs, view containers, configuration keys, and AI persona all rebranded from KitPilot to KitPilot.
