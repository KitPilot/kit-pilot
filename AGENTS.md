# AGENTS.md

This file provides guidance to agents when working with code in this repository.

- Settings View Pattern: When working on `SettingsView`, inputs must bind to the local `cachedState`, NOT the live `useExtensionState()`. The `cachedState` acts as a buffer for user edits, isolating them from the `ContextProxy` source-of-truth until the user explicitly clicks "Save". Wiring inputs directly to the live state causes race conditions.

- Writing standard: all prose in this repository follows ASD-STE100 (Simplified Technical English). See [CLAUDE.md](./CLAUDE.md) for the rules, the approved terminology, and the exceptions.
