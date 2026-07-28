# Decision records

This directory contains repository-wide product and architecture decisions
whose rationale should survive beyond an implementation branch or release
plan.

- Name records `YYYY-MM-DD-short-topic.md`.
- Include status, context, evidence, decision, and consequences.
- Preserve rejected and superseded records; add a new record that links back
  when a later decision replaces one.
- Correct factual errors in place, but do not rewrite the original rationale
  merely because the surrounding implementation changes.

Component-specific operating documentation belongs with that component. For
example, CLI documentation remains under `apps/cli/docs`.
