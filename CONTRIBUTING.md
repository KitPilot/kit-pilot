# Contributing to KitPilot

Thanks for your interest in contributing. This document covers the basics.

## Getting started

1. Fork the repository on GitHub.
2. Clone your fork locally.
3. Run `pnpm install` from the repo root.
4. Open the project in VS Code and press F5 to launch the Extension
   Development Host.

A walkthrough of the codebase structure is in the top-level `README.md`.

## Reporting bugs

Open an issue at
[github.com/KitPilot/kit-pilot/issues](https://github.com/KitPilot/kit-pilot/issues).
Include:

- KitPilot version, VS Code version, and OS
- Minimal reproduction steps
- Expected vs. actual behavior
- Any relevant log output (Help → Toggle Developer Tools → Console)

For security-sensitive issues, follow [SECURITY.md](./SECURITY.md) instead.

## Proposing changes

For anything beyond a small bug fix, open an issue first to discuss the
approach. This avoids wasted work if the maintainers have concerns about
scope or design.

Pull requests should:

- Target the `main` branch.
- Include a clear description of what the change does and why.
- Be focused — one concern per PR. Split unrelated changes.
- Update tests where applicable.
- Pass `pnpm -r run check-types` and `pnpm -r run lint`.
- Update `CHANGELOG.md` under an `## Unreleased` heading if user-visible
  behavior changes.

## Coding conventions

- TypeScript throughout. Type checks must pass.
- Match the surrounding code's style; the repo uses ESLint and Prettier.
- New tests use Vitest. Co-locate them with the code under test.
- Public-facing strings go in `i18n/locales/en/` files, not inline.

## Developer Certificate of Origin (DCO)

By submitting a pull request, you certify that you wrote the contribution
yourself (or otherwise have the right to submit it under the project's
license), and that you license it to the project under the Apache License,
Version 2.0.

You do not need to sign a separate Contributor License Agreement.

## Licensing

KitPilot is licensed under Apache 2.0. Your contributions will be
distributed under the same license. See [LICENSE](./LICENSE) for the full
text and [NOTICE](./NOTICE) for the upstream attribution chain.

## Code of Conduct

Participation in this project is governed by the
[Code of Conduct](./CODE_OF_CONDUCT.md). By contributing you agree to abide
by it.
