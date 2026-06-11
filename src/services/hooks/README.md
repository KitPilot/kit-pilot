# Hook Engine

Declarative shell hooks that fire around tool execution. Lets users (and the
extension itself) enforce arbitrary commands at well-defined points in the
agent loop — block a tool call before it runs, or react to its result after.

Ported from [code_puppy's `hook_engine`](https://github.com/mpfaffenberger/code_puppy)
(Apache-2.0). The wire format (stdin JSON, `CLAUDE_*` env vars, exit-code
semantics) is identical, so hook scripts can be shared between Claude Code,
code_puppy, and KitPilot.

## Status

Wired and firing:

- `PreToolUse` — fires before any tool handler runs. Exit code `1` blocks the
  tool call; the block reason is sent back as the tool's `tool_result`.
- `PostToolUse` — fires after the handler completes. Exit code `1` rewrites the
  just-pushed tool result to an error so the model sees the block reason
  instead of the (now-invalidated) success result.
- `UserPromptSubmit` — fires when the user submits a new prompt (real input,
  not loop continuations). Exit code `1` aborts the prompt before any LLM call.
  The hook receives `tool_name: "user_prompt"` and `tool_input: { prompt: "..." }`.

Accepted in config but not yet wired: `SessionStart`, `SessionEnd`, `PreCompact`,
`Notification`, `Stop`, `SubagentStop`. These are observability/lifecycle events
with limited actionability; they'll be wired when a concrete use case comes up.

Not implemented: `type: "prompt"` hooks (currently echoed on stdout, not
injected), parallel execution, config validator, webview UI for editing hooks.

## Config

Two locations, merged with project appended to global:

- `~/.kitpilot/hooks.json` — global (across all projects)
- `<cwd>/.kitpilot/hooks.json` — project-local

Shape:

```jsonc
{
	"PreToolUse": [
		{
			"matcher": "execute_command",
			"hooks": [
				{
					"type": "command",
					"command": "echo \"about to run: $CLAUDE_TOOL_INPUT\" >&2",
					"timeout": 5000,
				},
			],
		},
	],
	"PostToolUse": [
		{
			"matcher": "write_to_file && .ts",
			"hooks": [{ "type": "command", "command": "pnpm tsc --noEmit", "timeout": 60000 }],
		},
	],
}
```

### Validation

A broken hooks file never crashes tool dispatch: the loader treats unparseable
or malformed config as "no hooks". To keep that fallback from being silent,
the config is validated (`validation.ts`) when the engine first loads — invalid
JSON, unknown event types, groups without a `hooks` array, and hooks without a
`command` each raise a one-per-session warning notification with an "Open File"
button. The same validator backs the hooks section of the **KitPilot: Run
Diagnostics** command.

### Matcher syntax

| Pattern     | Meaning                                          |
| ----------- | ------------------------------------------------ |
| `*`         | Match any tool                                   |
| `tool_name` | Exact tool name (case-insensitive)               |
| `.ts`       | File-extension match against a path arg          |
| `A && B`    | All sub-patterns must match                      |
| `A \|\| B`  | Any sub-pattern matches                          |
| `^read_.*`  | Regex (if pattern contains regex metacharacters) |

### Exit-code semantics

| Exit           | Effect                                                                            |
| -------------- | --------------------------------------------------------------------------------- |
| `0`            | Success. `stdout` is included in the tool's transcript.                           |
| `1`            | **Block** the operation. `stderr` becomes the block reason fed back to the model. |
| `2`            | Non-blocking error. `stderr` is surfaced to the model but the tool still runs.    |
| other non-zero | Treated as error (logged, non-blocking).                                          |

### Worked example: block `rm -rf` and scan prompts for AWS keys

`~/.kitpilot/hooks.json`:

```jsonc
{
	"PreToolUse": [
		{
			"matcher": "execute_command",
			"hooks": [
				{
					"type": "command",
					"command": "if echo \"$CLAUDE_TOOL_INPUT\" | grep -qE 'rm\\s+-rf'; then echo 'refusing dangerous rm' >&2; exit 1; fi",
				},
			],
		},
	],
	"UserPromptSubmit": [
		{
			"matcher": "*",
			"hooks": [
				{
					"type": "command",
					"command": "if echo \"$CLAUDE_TOOL_INPUT\" | grep -qE 'AKIA[0-9A-Z]{16}'; then echo 'AWS key detected in prompt' >&2; exit 1; fi",
				},
			],
		},
	],
}
```

The first hook refuses any `execute_command` containing `rm -rf`. The second
refuses any user prompt that looks like a leaked AWS access key.

### Input to your hook

Each hook script gets:

- **stdin** — JSON payload:

    ```json
    {
    	"session_id": "...",
    	"hook_event_name": "PreToolUse",
    	"tool_name": "execute_command",
    	"tool_input": { "command": "rm -rf /" },
    	"cwd": "/path/to/project",
    	"permission_mode": "default"
    }
    ```

    For `PostToolUse`, also `tool_result` and `tool_duration_ms`.

- **env vars** — `CLAUDE_TOOL_INPUT` (JSON string of args), `CLAUDE_TOOL_NAME`,
  `CLAUDE_HOOK_EVENT`, `CLAUDE_PROJECT_DIR`, `CLAUDE_FILE_PATH` (when a path
  arg is found), `CLAUDE_CODE_HOOK=1`.

- **substitutions** in the `command` string — `${file}`, `${tool_name}`,
  `${event_type}`, `${CLAUDE_PROJECT_DIR}`, `${CLAUDE_TOOL_INPUT}`.

## `verifyCommand` migration

The existing `kit-pilot.verifyCommand` VS Code setting is now enforced via a
synthetic `PreToolUse` hook on `attempt_completion` (see `injectVerifyCommandHook`
in `config.ts`). When you set `kit-pilot.verifyCommand` to e.g. `pnpm test`, that
command will actually run before completion and block it on non-zero exit — not
just be mentioned in the system prompt.

The prompt-text injection in `objective.ts` is kept as a hint so the model knows
to expect verification (avoids one wasted round-trip), but the hook is now the
source of truth.
