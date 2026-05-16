# Roo Code — VS Code LM API Notes

Session date: 2026-05-15

---

## 1. What to keep if using only VS Code LM API (Copilot)

**Keep (~1,900 lines):**
- `src/api/providers/vscode-lm.ts` (602 lines) — the VS Code LM handler
- `src/api/transform/vscode-lm-format.ts` (197 lines) — message format conversion
- Core API infrastructure: `base-provider.ts`, `api/index.ts`, `stream.ts` (~900 lines)
- Everything else: webview UI, tools, MCP, task engine, integrations — untouched

**Remove (~13,300 lines + ~300MB node_modules):**
- 27 other provider handlers (Anthropic, OpenAI, Bedrock, Gemini, Vertex, Ollama, etc.)
- Provider-specific format transforms (Bedrock, Gemini, Mistral, etc.)
- Provider tests
- ~40 npm packages (`@anthropic-ai/sdk`, `@aws-sdk/*`, `@google/genai`, `@ai-sdk/*`, etc.)

**Key touchpoints for the removal:**
- `buildApiHandler()` in `src/api/index.ts` — strip all non-vscode-lm cases
- `src/shared/ProfileValidator.ts` — remove 24 provider cases
- `packages/types/src/provider-settings.ts` — remove 24 provider schemas
- `src/api/providers/index.ts` — remove 24 exports

---

## 2. Bugs/issues found in vscode-lm.ts

| # | Issue | Location | Fix |
|---|---|---|---|
| 1 | System prompt sent as `Assistant` message, not `System` | `vscode-lm.ts:382` | Use `vscode.LanguageModelChatMessage.System()` if available |
| 2 | Token counting fires N API calls per request (one per message) | `vscode-lm.ts:304–308` | Cache counts per message; only recount last N changed messages |
| 3 | Fake fallback client silently returns error string instead of throwing | `vscode-lm.ts:142–165` | Hard throw with a clear message pointing to Copilot extension |
| 4 | `supportsPromptCache: true` causes Anthropic-style cache_control blocks to be sent — Copilot ignores/garbles them | `vscode-lm.ts:541` | Set to `false` |
| 5 | `completePrompt` creates a `CancellationTokenSource` that is never disposed | `vscode-lm.ts:571` | Wrap in `try/finally`, call `.dispose()` |
| 6 | Hardcoded model blacklist will go stale | `vscode-lm.ts:590–591` | Filter dynamically by capabilities or handle tool-call failure gracefully |
| 7 | Images silently dropped as placeholder text, wasting tokens | `vscode-lm-format.ts:75–79` | Strip images before sending, or surface a UI warning |
| 8 | No retry on transient Copilot errors | `vscode-lm.ts` | Add exponential backoff (2–3 retries) on non-cancellation errors |

---

## 3. Why Roo Code uses ~4x tokens vs native Copilot

| Component | Tokens/request |
|---|---|
| Tool definitions (27 tools, very verbose) | ~7,500–10,000 |
| System prompt sections | ~4,000–5,000 |
| `<environment_details>` block (sent every turn) | ~1,000–4,000 |
| Conversation history (env_details accumulate O(N)) | grows unbounded |
| Custom instructions | ~500–1,500 |
| **Total** | **14,000–25,000** |
| Native Copilot baseline | ~3,500–5,000 |

**Root cause:** Roo Code was designed for direct API providers (Anthropic/OpenAI) where prompt caching makes repeated static content cheap. With VS Code LM / Copilot there is no explicit prompt caching — every token sent is a charged token.

---

## 4. Structural fix implemented (2026-05-15)

### Change 1 — `src/core/task/Task.ts`

Added `envDetailsCache` property to Task class:
```typescript
envDetailsCache: {
    visibleFiles: string
    openTabs: string
    modeSlug: string
    lastTimeSentMs: number
} = { visibleFiles: "", openTabs: "", modeSlug: "", lastTimeSentMs: 0 }
```

In `buildCleanConversationHistory()`, strip `<environment_details>` blocks from all historical user messages except the last one before the API call. Stored history is untouched — only what's sent to the model is pruned.

```
// Before: 10-turn conversation sends 10 copies of env_details to model
// After:  10-turn conversation sends 1 copy (current turn only)
```

### Change 2 — `src/core/environment/getEnvironmentDetails.ts`

Made the function delta-aware. Sections are now skipped if unchanged since last turn:
- **Visible files** — only sent when the user opens/closes a file
- **Open tabs** — only sent when the tab list changes  
- **Current mode** — only sent on first turn or when switched
- **Current time** — only sent on first turn, then every 5 minutes

Terminal output and recently modified files were already consume-once queues (delta by design), so those are untouched.

---

## 5. Tradeoff introduced by the fix

The original behavior (env_details in every historical message) was intentional for direct API providers:

- **Workspace state audit trail**: Per-turn env_details created a timeline of which files were open and what changed when. Useful for long debugging sessions.
- **"Recently modified files" as changelog**: Each turn's block contained files changed *since that turn*, giving the model a running history of edits.
- **Prompt caching made it free**: With Anthropic caching, unchanged blocks hit the cache and cost almost nothing. Made sense for Anthropic/OpenAI billing.

After the fix, the model loses the per-turn workspace state history. For most tasks this doesn't matter. For very long sessions with lots of context-switching it's a minor loss.

**Safer middle ground** (not yet implemented): Replace stripped historical env_details with a one-line placeholder instead of removing them entirely:
```
<environment_details>(prior turn snapshot — stripped to save tokens)</environment_details>
```

---

## 6. Remaining high-impact optimizations (not yet done)

1. **Tool definition verbosity** — 27 tools × ~1.5 KB descriptions = 30–40 KB per request. Trim descriptions to 1–2 sentences. Drop tools not needed for vscode-lm path.
2. **System prompt** — ~16–17 KB. Strip mode descriptions for inactive modes; inject only OS-relevant rules.
3. **Tool results in history** — After a `read_file` result is consumed, replace the raw file content in history with a compact summary.
4. **History condensation threshold** — Lower the default so summarization kicks in earlier, before the context window is nearly full.
