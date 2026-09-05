# Quarantine the command line interface

- **Status:** Accepted
- **Decision date:** 2026-09-05
- **Affects:** `apps/cli`

## Context

`apps/cli` is documented as a working product. It is not one. It cannot reach
a model, and no configuration makes it run.

KitPilot sends every model request through GitHub Copilot with the VS Code
Language Model API. That API exists only inside VS Code. A terminal program
cannot call it.

## Evidence

Each item below was confirmed in the tree at version 0.2.4.

| Fact                                                                                      | Location                       |
| ----------------------------------------------------------------------------------------- | ------------------------------ |
| The accepted provider list holds one entry, `vscode-lm`                                   | `src/types/types.ts:6`         |
| A comment states the CLI cannot use `vscode-lm`, because it needs the VS Code API         | `src/lib/utils/provider.ts:2`  |
| The default provider is `openrouter`                                                      | `src/commands/cli/run.ts:125`  |
| The check that follows rejects `openrouter` and calls `process.exit(1)`                   | `src/commands/cli/run.ts:177`  |
| Six files carry `@ts-nocheck`                                                             | `src/`                         |
| `envVarMap` is typed `Record<SupportedProvider, string>` but lists five retired providers | `src/lib/utils/provider.ts:11` |

Thus both paths fail. The default provider is refused. The one accepted
provider cannot work outside VS Code.

The tests pass, but they hold the retired provider assumptions and they stop
at the API factory. A green test run is not evidence that the CLI runs.

### The install instructions were a hazard

`README.md` told the reader to run this command:

```
curl -fsSL https://raw.githubusercontent.com/KitPilotInc/KitPilot/main/apps/cli/install.sh | sh
```

`src/commands/cli/upgrade.ts` ran the same command through `sh -c`, without a
person present.

The account `KitPilotInc` does not exist. The GitHub API returns 404 for both
the organization and the user. The name is free, so anybody can register it,
add the repository, and then decide what that command downloads and runs on
the machine of every person who follows the instructions. The `upgrade`
command made this worse, because it needed no reader at all.

The README also named a release workflow, `.github/workflows/cli-release.yml`,
that does not exist. The repository holds four workflows: `ci.yml`,
`codeql.yml`, `credential-preflight.yml`, and `release.yml`.

## Decision

Quarantine the package. Do not delete it, and do not publish it.

1. Replace `README.md` with a notice that states the package does not run,
   why it does not run, and what must be true before it ships.
2. Remove every pointer to `KitPilotInc` from the CLI. Repoint the release
   lookup in `upgrade.ts` at the real repository.
3. Make `runUpgradeInstaller` refuse. It no longer downloads or runs a script.
4. Correct the install script header and the build script summary.

The package is already `private: true`, so npm does not receive it. The VSIX
does not contain it.

### Why quarantine and not deletion

The code is a usable starting point for a later CLI. Deletion throws that
away and gains little, because the package is 1.3 MB of source that nothing
else imports. Only `packages/vscode-shim` is coupled to it.

### Why the package stays in the workspace

The type checker, the linter, and the tests keep running against it. This
stops further decay at almost no cost, because turbo caches the result. The
harm was the product surface, not the presence of the code.

## Consequences

- Do not advertise the CLI. Do not restore the install instructions from the
  git history.
- `runUpgradeInstaller` now rejects. Its callers report the error. No test
  covered this path directly, because the tests inject `runInstaller`.
- `@ts-nocheck` stays for now. Removing it is part of the work listed in the
  README, not of this decision.
- The name `KitPilotInc` still appears elsewhere in the repository, in issue
  templates, schema identifiers, npm metadata for `@kit-pilot/types`, test
  fixtures, and code comments. None of those download or run anything, so
  they are a separate and smaller job.
- Reopen this decision when the CLI has a transport that reaches a model from
  a terminal.
