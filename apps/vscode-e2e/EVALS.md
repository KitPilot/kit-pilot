# KitPilot evaluation harness

This harness measures how well KitPilot does a task, so that a change to its
context or its navigation can be accepted on evidence. It exists for TODO
Tier 2 #14, definition and reference lookup.

It runs real tasks against a real model. Thus it costs credits. It is not part
of the ordinary test run. The self test is, because it costs nothing.

## What it measures

Three numbers for each trial:

1. **Task correctness.** A grader reads the workspace after the run and says
   whether the code does what the prompt asked. The grader never reads the
   transcript, so a task passes on what it did, not on what it said.
2. **Exploratory tool calls.** The count of `read_file`, `search_files`,
   `list_files` and `codebase_search`. This is the number that definition and
   reference lookup is expected to lower.
3. **Elapsed time.** From the start of the task to its completion.

It also records edit calls, shell calls, failed calls, tokens and cost.

Shell calls are counted apart from exploratory calls. A shell call can search
or build, and the tool usage record does not say which. Putting them in either
group would make the headline number wrong.

## The cases

| Case                | Category            | What it measures                                                           |
| ------------------- | ------------------- | -------------------------------------------------------------------------- |
| `definition-bugfix` | bug-fix             | Fix a defect whose cause is three imports away from the symptom.           |
| `reference-rename`  | cross-file-refactor | Rename an exported function that five places use, across four directories. |
| `failing-test`      | test-failure        | Fix a failing test whose cause is two modules away from the assertion.     |

Each case names no file in its prompt. The model must first find where the
code lives. Thus each case measures what definition and reference lookup is
expected to improve.

Two categories in the plan have no case yet:

- **project-memory.** It needs the harness to seed `~/.kitpilot/memory/` and
  then restore it, which touches the user's own memory directory.
- **interrupted-task.** It needs the harness to cancel a task partway and then
  resume it, which needs a signal for "partway" that does not depend on the
  model's wording.

Add them when the harness can do those two things safely.

## Sign in one time

VS Code runs the evaluation in its own profile, at
`apps/vscode-e2e/.vscode-eval/`. That profile has neither the Copilot extension
nor a GitHub sign-in, and `vscode-lm` offers no model without both.

The harness installs the Copilot extensions itself. The sign-in needs you:

```bash
pnpm --filter @kit-pilot/vscode-e2e evals -- --signin
```

VS Code opens on the evaluation profile. Sign in to GitHub, open the Copilot
chat view one time, then close the window. The sign-in stays in the profile,
so this is needed one time only.

The profile is separate from your own VS Code profile on purpose. An
evaluation must not change your settings, and your settings must not change an
evaluation.

If a model is still missing, the run stops before the first trial and says so.
It also prints every model id that the profile does offer, which is how to find
the id for `EVAL_MODEL_ID`.

## Run it

Pin the model. A baseline that does not name its model cannot be compared with
a later run.

```bash
EVAL_MODEL_ID=<copilot model id> pnpm --filter @kit-pilot/vscode-e2e evals
```

One case, more trials:

```bash
EVAL_MODEL_ID=<id> pnpm --filter @kit-pilot/vscode-e2e evals -- --case definition-bugfix --trials 5
```

Name the run, so the report says what it is:

```bash
EVAL_MODEL_ID=<id> pnpm --filter @kit-pilot/vscode-e2e evals -- --label "before lookup tool"
```

To see the model ids that the evaluation profile offers, start a run with any
id. The preflight prints the ids it found before the first trial.

The report lands in `apps/vscode-e2e/evals-results/<timestamp>/`, as
`report.md`, `run.json` and one JSON file for each case.

### Environment

| Variable            | Default                        | Meaning                                                |
| ------------------- | ------------------------------ | ------------------------------------------------------ |
| `EVAL_MODEL_ID`     | none, required                 | The Copilot model id.                                  |
| `EVAL_TRIALS`       | 3                              | Trials for each case.                                  |
| `EVAL_TIMEOUT_MS`   | 600000                         | How long one task may run.                             |
| `EVAL_MAX_REQUESTS` | 40                             | Upper bound on requests, so one trial cannot run away. |
| `EVAL_LABEL`        | `baseline`                     | The name of the run in the report.                     |
| `VSCODE_VERSION`    | 1.101.2                        | The VS Code version to test against.                   |
| `EVAL_PROFILE_DIR`  | `apps/vscode-e2e/.vscode-eval` | The VS Code profile the evaluation runs in.            |
| `EVAL_SKIP_INSTALL` | unset                          | Set to `1` to skip the Copilot extension install.      |

## How it runs

VS Code starts one time for each case, with a temporary workspace that holds
that case's fixture. A task runs in the workspace folder, so one workspace
cannot hold two cases without the model seeing both.

Between trials the harness copies the fixture over the workspace again. Thus
every trial starts from the same files. Checkpoints are off, because a shadow
Git repository does not expect the files to change under it.

## The self test

```bash
pnpm --filter @kit-pilot/vscode-e2e evals:selftest
```

It proves that each grader fails on the starting workspace and passes on the
solution, and that it rejects the two obvious wrong answers: an edit to the
test file, and an edit to the entry point. It also covers the tool grouping
and the statistics. It runs no model, so `pnpm test` runs it.

A grader that passes on the starting files would report progress that did not
happen. A grader that fails on the solution would hide a real improvement.
Both make the baseline worthless, so the self test guards them.

## Reading a result

The model gives a different answer each run. Thus the report gives the median,
the range and the sample standard deviation, not the mean alone. Three trials
show the spread but they do not prove a small difference. Raise the trial count
before you accept a change that moves a number by less than its spread.

Correctness comes first. Fewer exploratory calls with a lower pass rate is not
an improvement.
