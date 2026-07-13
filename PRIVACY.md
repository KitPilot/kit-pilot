# KitPilot Privacy Notice

**Last Updated:** 2026-05-16

This document describes what data KitPilot processes, where it goes, and
what choices you have. It is a plain-language summary, not a legal contract.

## Short version

KitPilot is a VS Code extension that runs locally on your machine. It does
not have its own backend. It does not collect telemetry. It never sees your
Copilot credentials, and it holds no LLM-provider API keys (the only secret
it can store is an optional Qdrant API key for code indexing, kept in VS
Code's SecretStorage). The only outbound network traffic the extension
itself initiates is to **GitHub Copilot** via VS Code's Language Model API
(`vscode.lm`), and — only if you enable code indexing — to the **Ollama and
Qdrant endpoints you configure yourself** (typically local, but you may point
them at any host you control).

## What data is processed and where it goes

### Code, files, and prompts → GitHub Copilot

When you chat with KitPilot, your prompts and any code context the
extension assembles are passed to VS Code's Language Model API. VS Code
forwards them to GitHub Copilot under your existing Copilot subscription.

What Copilot does with that data — including retention, training use, and
enterprise data controls — is governed by GitHub's own privacy practices,
not by us. See:

- GitHub Copilot privacy: https://docs.github.com/en/copilot/responsible-use-of-github-copilot-features/privacy-statement-for-the-github-copilot-extension
- GitHub general privacy: https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement

KitPilot itself does not receive, log, or store these messages anywhere
outside your local VS Code session.

### Code embeddings → your Ollama + Qdrant (optional, off by default)

If you enable code indexing in settings, KitPilot computes embeddings of
your workspace files using an Ollama instance you configure, and stores the
vectors in a Qdrant database you configure. Both endpoints default to
`localhost`; if you point them at a remote host, embedding traffic goes to
that host — you choose where. An optional Qdrant API key, if you set one, is
stored in VS Code's SecretStorage on your machine and sent only to your
configured Qdrant endpoint. KitPilot offers no cloud embedding providers.

### Commands and terminal output → local only

Commands you run through KitPilot execute on your machine. Their output
may be sent to Copilot as part of subsequent conversation context (so the
model can react to it), per the same path as your prompts above.

### Settings, chat history, and API keys → local only

- Settings are stored in VS Code's standard settings storage on your
  machine.
- Chat history is stored on disk in VS Code's per-extension storage
  directory.
- API keys: KitPilot does **not** request LLM-provider API keys. Copilot
  authentication is handled by VS Code and the GitHub Copilot extension; we
  never see your credentials. The one optional secret KitPilot stores (in VS
  Code's SecretStorage) is a Qdrant API key for code indexing, if you use one.
  On upgrade, KitPilot deletes credentials and profile fields left by retired
  provider integrations rather than loading or re-exporting them.

### Telemetry → none

KitPilot does not collect telemetry. There is no analytics SDK in the
extension. There is no anonymous usage data sent anywhere. The upstream
KitPilot extension included PostHog telemetry; that has been removed in
this fork.

## What we do **not** do

- We do not sell your data.
- We do not train AI models on your data.
- We do not have a server. There is no KitPilot backend.
- We do not have access to your code, prompts, settings, or anything else
  that runs locally.

## Your choices

- Disable code indexing if you do not want embeddings computed: settings →
  `codebaseIndexEnabled = false` (off by default).
- Uninstall the extension to stop all processing.
- Configure VS Code / Copilot enterprise privacy controls separately
  through GitHub's settings if your organization requires.

## Security and updates

We take reasonable measures to keep the extension safe, but no software is
guaranteed secure. Vulnerability reports go via the process in
[SECURITY.md](./SECURITY.md). If this privacy notice changes materially,
the change will be noted in [CHANGELOG.md](./CHANGELOG.md).

## Contact

Open a [GitHub issue](https://github.com/KitPilot/kit-pilot/issues) for
privacy-related questions or concerns. For security-sensitive disclosures,
follow the process in SECURITY.md instead.
