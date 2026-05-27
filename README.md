# KitPilot

> An agentic coding assistant for VS Code, powered exclusively by GitHub Copilot.

KitPilot is a streamlined fork of [KitPilot](https://github.com/KitPilotInc/KitPilot), purpose-built for users whose organizations only authorize GitHub Copilot. Every non-Copilot AI provider integration has been removed; the extension routes all model traffic through VS Code's [Language Model API](https://code.visualstudio.com/api/extension-guides/language-model) — meaning if you have Copilot, you're already set up.

## Why KitPilot

Most agentic coding extensions ship with 20+ provider integrations (Anthropic, OpenAI, Bedrock, Vertex, Gemini, Mistral, …). For a Copilot-only user, that flexibility is dead weight: extra dependencies, larger system prompts, more tokens spent per request, and a long settings page full of options you can't use.

KitPilot strips all of that out:

- **One provider, by design.** Only `vscode-lm` (Copilot). No third-party SDKs, no API key prompts.
- **Smaller install.** ~50 npm packages removed vs. the upstream extension; bundle is leaner.
- **Lower token cost per turn.** Delta-only environment injection and trimmed-history sends mean roughly 3× fewer tokens vs. base KitPilot for the same conversation.
- **Same agent depth.** Full multi-mode chat, tool use, MCP, custom modes — all of it works through Copilot.

## What Can KitPilot Do For You

- Generate code from natural-language descriptions
- Refactor and debug existing code across multiple files
- Adapt to your workflow with modes: Code, Architect, Ask, Debug, Orchestrator, or your own custom mode
- Write and update documentation
- Answer questions about your codebase
- Execute terminal commands and consume their output as context
- Talk to MCP servers for resources, tools, and prompts

## Modes

- **Code Mode** — everyday coding, edits, and file ops
- **Architect Mode** — plan systems, write specs, design migrations
- **Ask Mode** — fast answers, explanations, and docs
- **Debug Mode** — trace issues, add logs, isolate root causes
- **Orchestrator Mode** — break work into delegated subtasks
- **Custom Modes** — build specialized modes for your team or workflow

## Code Indexing (Optional)

Semantic `codebase_search` is supported via local [Ollama](https://ollama.ai/) embeddings. No external API keys required. Install Ollama, pull an embedding model (e.g. `nomic-embed-text`), and point KitPilot at it in settings. Indexing is off by default — KitPilot works without it, falling back to grep and file listings.

## Requirements

- VS Code 1.84 or later
- An active [GitHub Copilot](https://github.com/features/copilot) subscription
- (Optional, for semantic search) Local Ollama install

## Credits

KitPilot is a fork of [KitPilot](https://github.com/KitPilotInc/KitPilot), which itself is a fork of [Cline](https://cline.bot/). Both projects deserve the credit for the underlying agent design, mode system, and tool architecture. This fork's contribution is the Copilot-only narrowing, the token-efficiency work, and the rebrand.

## License

[Apache 2.0](./LICENSE) © KitPilot contributors. Original KitPilot work © KitPilot, Inc. See [NOTICE](./NOTICE) for the full attribution chain.

## Disclaimer

KitPilot is provided **"AS IS"** and **"AS AVAILABLE"** without warranties or
conditions of any kind, express or implied. KitPilot contributors make no
representations regarding any code, models, configurations, or other tools
provided or made available in connection with this extension, nor regarding
any resulting outputs. You assume all risks associated with use of the
extension and its outputs, including without limitation: bugs, errors,
inaccuracies, intellectual property issues in generated content, data loss,
downtime, and any operational consequences of running AI-generated commands
or code on your system.

KitPilot is **not affiliated with, endorsed by, or sponsored by**
KitPilot, Inc., GitHub, Inc., Microsoft Corporation, or the maintainers of
any other upstream project. Trademarks such as "GitHub Copilot," "VS Code,"
and "KitPilot" remain the property of their respective owners and are used
here only for the descriptive purpose of identifying the products that
KitPilot integrates with or derives from.
