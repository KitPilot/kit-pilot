# Auxiliary-call model routing

- **Status:** Rejected
- **Decision date:** 2026-07-28
- **Related item:** TODO #3

## Context

KitPilot added local, cross-session usage measurement in version 0.1.25 to
determine whether auxiliary LLM calls—especially context condensation—used
enough tokens to justify routing them to a separate, cheaper model.

The decision rule was set before collecting the data:

- Build auxiliary-call routing if condensation accounts for approximately 10%
  or more of measured tokens.
- Drop it if condensation accounts for 3% or less.
- Collect more data if the result falls between those thresholds.

## Evidence

Diagnostics collected on 2026-07-28 covered the window beginning
2026-07-07T13:17:22.099Z:

| Purpose     |   Calls |   Input tokens | Output tokens | Token share |
| ----------- | ------: | -------------: | ------------: | ----------: |
| Main bucket |     380 |     46,049,405 |       605,856 |       99.5% |
| Condense    |       1 |        231,873 |         1,876 |        0.5% |
| **Total**   | **381** | **46,281,278** |   **607,732** |    **100%** |

The measurement therefore covered 46,889,010 input and output tokens over
381 completed calls. Condensation accounted for 233,749 tokens, or 0.5%.

The report also contained 40,699,801 cache-read tokens in the main bucket.
These are a subset of the input tokens already counted above—Copilot reports
them under `prompt_tokens_details.cached_tokens`—not additional traffic, so
the window totals 46,889,010 tokens rather than 87,588,811. They are reported
separately and do not affect the share calculation. Condensation can
invalidate a prompt-prefix cache, so its effective cost may be somewhat higher
than its direct token count. The observed share is nevertheless well below
both the 10% build threshold and the predefined 3% rejection threshold.

## Decision

Do not implement auxiliary-call model routing. Close TODO #3 as not justified
by measured usage.

Routing a single observed condensation call would add model-selection,
configuration, readiness, fallback, and testing complexity for less than 0.5%
of directly measured tokens. A cheaper auxiliary model would still consume
tokens, so the achievable saving would be lower than the measured share.

## Consequences

- Do not add a separate model configuration or routing path for condensation.
- Keep per-purpose usage metrics as local diagnostics and regression evidence.
- `enhance` and `title` calls currently fall into the `main` bucket. They may
  be tagged separately in a future instrumentation cleanup, but that work does
  not reopen this decision by itself.
- Reconsider routing only if later representative measurements show auxiliary
  usage above the original thresholds or the product introduces materially
  more frequent auxiliary calls.
