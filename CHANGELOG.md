# KitPilot Changelog

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
