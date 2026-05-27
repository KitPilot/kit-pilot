# KitPilot Changelog

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

- Replaced inherited KitPilot marketplace description (*"A whole dev team of AI agents in your editor"*) with KitPilot-accurate copy: *"An agentic coding assistant powered exclusively by GitHub Copilot."* Applied across all 18 locale files.
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
