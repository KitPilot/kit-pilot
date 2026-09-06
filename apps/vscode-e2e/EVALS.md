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

| Case                  | Category            | What it measures                                                                                |
| --------------------- | ------------------- | ----------------------------------------------------------------------------------------------- |
| `definition-bugfix`   | bug-fix             | Fix a defect whose cause is three imports away from the symptom. CommonJS JavaScript.           |
| `reference-rename`    | cross-file-refactor | Rename an exported function that five places use, across four directories. CommonJS JavaScript. |
| `reference-rename-ts` | cross-file-refactor | The same rename in TypeScript with ESM imports.                                                 |
| `failing-test`        | test-failure        | Fix a failing test whose cause is two modules away from the assertion. CommonJS JavaScript.     |

### Report the two languages apart

`reference-rename` and `reference-rename-ts` ask for the same rename in two
module systems. Report them as two results. An average over the two would hide
the thing they were built to show.

Measured in VS Code 1.107, with no language extension beyond the built-in
support, by asking the reference provider at the declaration:

| Fixture                                 | Occurrences of the name | Reported by the provider | Files reached |
| --------------------------------------- | ----------------------- | ------------------------ | ------------- |
| `reference-rename` (CommonJS)           | 10                      | 2                        | 1 of 5        |
| `reference-rename-ts` (TypeScript, ESM) | 8                       | 8                        | 5 of 5        |

The CommonJS number does not improve when every file is open. The language
service builds no project-wide index across `require` in that setup.

**Neither number is a floor or a ceiling.** They are two points. A third
configuration, such as JavaScript with ESM imports or a project with a
`jsconfig.json`, could fall anywhere between them or outside them. Do not read
either as a bound on what the tool can do.

`reference-rename-ts` runs on Node 23 and later, which strips the types. On an
older Node its grader checks the rename and reports that it did not run the
behavior. It says so in the trial detail.

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

## What the run compares

One run compares two variants of **the same build**:

- **treatment** is the build as it is.
- **baseline** turns `find_symbol` off through the `disabledTools` setting,
  which removes the tool and its description from the request.

Nothing else differs. Both use the same commit, the same harness, the same
fixtures, the same graders and the same verification behavior. Comparing two
commits instead would measure every change between them, not the tool.

The two run inside one VS Code instance, and their order flips on every trial.
A long run drifts, and running all of one variant and then all of the other
would put that drift on one side.

`--variants treatment` runs one variant alone, which is useful for a dry run.

## Run it

Pin the model. A baseline that does not name its model cannot be compared with
a later run.

```bash
EVAL_MODEL_ID=<copilot model id> pnpm --filter @kit-pilot/vscode-e2e evals -- --trials 5
```

That runs every case, both variants, five trials each, from one commit. There
is no second checkout and no second build.

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
| `EVAL_LABEL`        | `comparison`                   | The name of the run in the report.                     |
| `EVAL_VARIANTS`     | `baseline,treatment`           | The variants to run, in order.                         |
| `VSCODE_VERSION`    | the `engines.vscode` floor     | The VS Code version to test against.                   |
| `EVAL_PROFILE_DIR`  | `apps/vscode-e2e/.vscode-eval` | The VS Code profile the evaluation runs in.            |
| `EVAL_SKIP_INSTALL` | unset                          | Set to `1` to skip the Copilot extension install.      |

A trial approves every command. `alwaysAllowExecute` alone approves nothing,
because an empty allowlist denies each command, so a trial would wait for an
approval that never comes and end in a timeout. The wildcard allowlist is safe
here and only here: a trial runs in a temporary workspace that holds a copy of
the fixture and nothing else.

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

## An incomplete run

A case that cannot run is not a case that scored zero. The harness records
every such case, marks the report incomplete, and exits non-zero. Thus a
missing sign-in cannot produce a clean-looking report with nothing in it.

A trial that reports no usage at all did not run either. It counts against the
pass rate, because it did not do the task, but it stays out of the call and
cost statistics, where its zeros would look like a cheap trial that needed no
exploration. The Measured column says how many trials reported usage.

## Reading a result

The model gives a different answer each run. Thus the report gives the median,
the range and the sample standard deviation, not the mean alone. Three trials
show the spread but they do not prove a small difference. Raise the trial count
before you accept a change that moves a number by less than its spread.

Correctness comes first. Fewer exploratory calls with a lower pass rate is not
an improvement.

Compare one commit with another under the same model and the same settings.
Run the same cases against each, and repeat each case. A result from one commit
alone says nothing, because there is nothing to compare it with.
