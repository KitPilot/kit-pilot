# Security Policy

## Supported versions

KitPilot is an early-stage open-source project. Only the latest published
release receives security fixes. Older versions are not patched.

## Reporting a vulnerability

**Do not open public GitHub issues for security-sensitive reports.** Instead,
use GitHub's private vulnerability reporting:

1. Go to https://github.com/KitPilot/kit-pilot/security/advisories
2. Click **"Report a vulnerability"**
3. Fill in the form with reproduction steps and impact assessment

Alternatively, you can email the maintainers directly at the address listed
on the [GitHub organization page](https://github.com/KitPilot).

Please include:

- A short summary of the issue
- Steps to reproduce or a proof of concept
- Logs, stack traces, or screenshots that help us understand the problem
- The version of KitPilot, VS Code, and your operating system

We aim to acknowledge reports within seven days and to release a fix or
mitigation within 30 days for confirmed vulnerabilities. While we
investigate, please keep the details private.

## Scope

Issues considered in scope:

- Code execution from untrusted MCP servers, slash commands, or workspace
  files
- Bypasses of the Roo-ignore / file-allowlist protections
- Credential or token leakage through logs, errors, or transcripts
- Sandbox escapes affecting host system files outside the user's workspace
- Vulnerabilities in third-party dependencies that ship with the extension

Out of scope:

- Issues in GitHub Copilot, the VS Code Language Model API, or other
  upstream products — report those to their respective vendors
- Social-engineering attacks that require the user to install a malicious
  MCP server or slash command knowingly
- Theoretical issues without a working proof of concept

Thank you for helping keep KitPilot users safe.
