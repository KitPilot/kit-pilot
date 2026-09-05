# @kit-pilot/cli — quarantined, does not run

**Status: quarantined. Do not install this package. Do not advertise it.**

This package does not run. It is kept in the repository as the starting point
for a future command line interface. It is not a product, and no release
contains it.

See `docs/decisions/2026-09-05-cli-quarantine.md` for the full decision.

## Why it does not run

KitPilot sends every model request through GitHub Copilot with the VS Code
Language Model API. That API exists only inside VS Code. A terminal program
cannot call it. The CLI has no other transport, so it has no way to reach a
model.

The code shows the same conflict:

- `src/types/types.ts` accepts one provider, `vscode-lm`.
- `src/lib/utils/provider.ts` states in a comment that the CLI cannot use
  `vscode-lm`, because that provider needs the VS Code API.
- `src/commands/cli/run.ts` selects `openrouter` when you give no provider.
  The check that follows rejects `openrouter` and stops the program.

Thus both paths fail. The default provider is refused, and the one accepted
provider cannot work outside VS Code.

Six files carry `@ts-nocheck`. They compile only because the type checker
skips them. The tests pass, but they test the retired provider behavior and
they stop at the API factory. A green test run does not mean the CLI runs.

## What was removed

The earlier version of this file gave install instructions. Those
instructions told you to run a shell script from
`github.com/KitPilotInc/KitPilot`. That account does not exist. Anyone can
register the name and then control what the command downloads and runs.

Do not restore those instructions. Do not copy that command from the git
history.

## Before this package ships

Complete all of the following first:

1. Give the CLI a transport that reaches a model from a terminal.
2. Remove every `@ts-nocheck`, then make the package pass the type checker.
3. Write tests that cross the API factory and reach a real model call.
4. Publish the package from a release workflow that exists.
5. Write the documentation again from what the package then does.

## Local development

The build script still works for local development:

```bash
./apps/cli/scripts/build.sh
```

The package stays in the workspace, so the type checker, the linter, and the
tests still run against it. This keeps the code from decaying further. It
does not mean the code works.
