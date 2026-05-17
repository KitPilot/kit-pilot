# KitPilot Changelog

## 0.1.5

### Fixed

- "Check our docs to get started" link on the welcome screen now points to the KitPilot repo (was still pointing to Roo Code's repo).
- Error boundary "report a bug" link → KitPilot issues.
- Settings → About "Report a bug" and "Security issue" links → KitPilot issues / security policy.
- ChatRow unknown-error fallback link → KitPilot issues.

The Announcement dialog's "fork of Roo Code" link intentionally still points to the Roo Code repo as upstream attribution.

## 0.1.4

### Added — agentic improvements

- **Workspace context on task start.** The first user message of every new task is now prefixed with a `<workspace_context>` block containing the top-level directory listing, `package.json` metadata, README first 50 lines, and (for git repos) the current branch, the last 5 commits, and the list of uncommitted changes. The agent stops wasting turns on basic `list_files` / `read_file` orientation.
- **Tool-failure self-reflection.** Every tool error response now carries a `reflectionRequired` field nudging the agent to think before retrying. Soft enforcement — net positive on capable models.
- **Smarter condensation prompt.** Replaced the inherited Roo Code condense template with a tighter, continuity-focused version that requires verbatim user intent, exact file paths, exact error messages, tool outcomes, decisions, and open blockers. Post-condensation hand-off is now meaningfully better.
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

- Replaced inherited Roo Code marketplace description (*"A whole dev team of AI agents in your editor"*) with KitPilot-accurate copy: *"An agentic coding assistant powered exclusively by GitHub Copilot."* Applied across all 18 locale files.
- Cleaned marketplace keywords — dropped stale `claude`, `troo pilot`, `troopilot` tags; added `github-copilot`, `agentic`, `code-assistant`, `chat`, `kit-pilot`, `kitpilot` for better discoverability.

## 0.1.1

### Changed

- Marketplace icon now uses a transparent background instead of a white card so it sits cleanly on light and dark surfaces.

## 0.1.0

Initial release. KitPilot is a fork of [Roo Code](https://github.com/RooCodeInc/Roo-Code) v3.53.0, narrowed for use with GitHub Copilot only.

### Changed

- **Single-provider build.** Removed all non-Copilot AI provider integrations (Anthropic, OpenAI, Bedrock, Vertex, Gemini, Mistral, OpenRouter, LiteLLM, Ollama chat, LM Studio, Requesty, Unbound, Poe, xAI, Z.ai, Fireworks, Vercel AI Gateway, MiniMax, Baseten, SambaNova, DeepSeek, Moonshot, Qwen Code, OpenAI Codex, fake-ai). VS Code Language Model API is the only supported provider.
- **Lower token cost.** Reworked environment-details injection to send only what changed between turns; historical `<environment_details>` blocks in sent history are now compact placeholders. Typical conversations use roughly 3× fewer tokens vs the upstream extension for the same workflow.
- **Code indexing.** Removed cloud embedders (OpenAI, Bedrock, Gemini, Mistral, OpenRouter, Vercel AI Gateway). Local [Ollama](https://ollama.ai/) is the only supported embedder; indexing is opt-in.
- **Image generation tool.** Disabled (`generate_image` is no longer registered).
- **Dependencies.** Removed ~50 npm packages tied to deleted providers (`@anthropic-ai/vertex-sdk`, `@aws-sdk/*`, `@google/genai`, `@lmstudio/sdk`, `@mistralai/mistralai`, all `@ai-sdk/*`, etc.).

### Renamed

- Extension display name, identifier, command IDs, view containers, configuration keys, and AI persona all rebranded from Roo Code to KitPilot.
