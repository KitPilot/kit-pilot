# CLAUDE.md

Guidance for agents that work in this repository. See also [AGENTS.md](./AGENTS.md)
for code patterns.

## Writing standard

Write all prose in this repository in Simplified Technical English (STE), as
specified by ASD-STE100. This applies to documentation, the changelog, commit
messages, pull request descriptions, code comments, and all strings that the
user sees.

Get the specification from https://asd-ste100.org. Part 1 gives the writing
rules and Part 2 gives the dictionary of approved words. The dictionary is the
authority on a word.

These are the rules that apply most often here. The specification is the full
standard:

1. Give one meaning to one word. Do not use a synonym for variety.
2. Use the active voice.
3. Write one instruction in one sentence.
4. Keep a procedural sentence to 20 words. Keep a descriptive sentence to 25.
5. Keep a paragraph to six sentences.
6. Use the simple present tense. Do not use the "-ing" form of a verb.
7. Do not use idioms, metaphors, humor, or slang.
8. Do not use a dash to add a second thought. Write a new sentence.
9. Keep the articles "a", "an", and "the".
10. Do not put more than three nouns together.

## Terminology

Use these terms. Do not use the alternatives.

| Use             | Do not use                                  |
| --------------- | ------------------------------------------- |
| KitPilot        | the extension, the assistant, the tool, Roo |
| task            | job, session, conversation                  |
| subtask         | child task, sub-agent                       |
| run             | a task and all of its subtasks              |
| spending limit  | budget, cost cap, cost limit                |
| background task | background job, background process          |
| hook            | trigger, callback                           |
| tool            | function, action, capability                |
| model           | LLM, AI, the model provider                 |
| settings        | preferences, configuration, options         |
| start, stop     | kick off, spin up, fire, kill               |
| Copilot         | GH Copilot, the provider                    |

Write "VS Code", not "VSCode" or "vscode". Use American spelling.

## Changelog entries

Keep the current structure: a version heading, then `Added`, `Changed`,
`Fixed`, or `Security`. Write each entry for the person who uses KitPilot. Do
not write it for the person who changed the code.

Start the entry with a bold sentence that states the change. Then state what
was wrong before, and what happens now. Keep the entry to six sentences.

Do not write:

> **The spending limit now covers a whole run, not each task separately.** If
> you set a cost limit and KitPilot broke your work into subtasks, every
> subtask used to start its own budget from zero — so a job could quietly spend
> several times the limit before asking you.

Write:

> **The spending limit now covers a whole run.** Before, each subtask started a
> new budget. Thus a run could go past your limit several times. KitPilot did
> not ask you first. Now the limit counts the whole run, and KitPilot asks you
> before it continues.

## Exceptions

Do not rewrite this text:

- `LICENSE` and `NOTICE`.
- The attribution and trademark paragraphs in `README.md`. The wording is
  legal, and pull request #69 restored it on purpose.
- Quoted material: command output, log extracts, and text from Roo Code or
  Cline.
- Code identifiers and API names, for example `vscode.lm`, `ContextProxy`, and
  `cachedState`.
- Changelog entries for releases that are already published.
