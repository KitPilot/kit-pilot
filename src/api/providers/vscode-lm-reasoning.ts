import * as vscode from "vscode"

/**
 * Keeps the model's reasoning between turns for the VS Code LM provider.
 *
 * Copilot streams the reasoning as `LanguageModelThinkingPart`s. If KitPilot
 * sends those parts back on the earlier Assistant messages, Copilot gives them
 * to the model again (Claude thinking with its signature, GPT encrypted
 * reasoning). Without them, the model starts each turn without its earlier
 * reasoning.
 *
 * `LanguageModelThinkingPart` and `includeEncryptedThinking` are not in the
 * public VS Code typings. They exist at run time in VS Code 1.136. This module
 * finds them at run time, and the feature does nothing when they are missing.
 */

/** One reasoning part, stored as JSON in the task API history. */
export type VsCodeLmReplayPart = {
	// Copilot models give an id. Anthropic and Gemini models with your own key
	// (BYOK) give no id, and put the complete reasoning in the metadata.
	id?: string
	value: string
	metadata?: Record<string, unknown>
}

/** The reasoning of one assistant message, and the model that wrote it. */
export type VsCodeLmReplayRecord = {
	// The model family, or the id if there is no family. See getReplayModelKey.
	modelId: string
	vendor: string
	parts: VsCodeLmReplayPart[]
}

type ThinkingPartConstructor = new (value: string, id?: string, metadata?: Record<string, unknown>) => object

/** The runtime model that KitPilot uses to replay reasoning, if replay is on. */
export type VsCodeLmReplayTarget = {
	modelId: string
	vendor: string
	ThinkingPart: ThinkingPartConstructor
}

let diagnosticChannel: vscode.OutputChannel | undefined

/**
 * Writes one line to the "KitPilot Reasoning" output channel. VS Code also
 * saves the channel to its log folder, so the lines can be read after a test.
 * A failure here never stops a request.
 */
export function logReasoningDiagnostic(line: string): void {
	try {
		diagnosticChannel ??= vscode.window.createOutputChannel("KitPilot Reasoning")
		diagnosticChannel.appendLine(`${new Date().toISOString()} ${line}`)
	} catch {
		// Diagnostics are optional.
	}
}

/** Describes the shape of a stream part without its content. */
export function describePartShape(chunk: unknown): string {
	if (!chunk || typeof chunk !== "object") return typeof chunk
	const part = chunk as Record<string, unknown>
	const ctor = (part.constructor as { name?: string } | undefined)?.name ?? "?"
	const metadataKeys = part.metadata && typeof part.metadata === "object" ? Object.keys(part.metadata).join("+") : ""
	return `${ctor}{${Object.keys(part).join(",")}}${metadataKeys ? `[metadata:${metadataKeys}]` : ""}${
		typeof part.id === "string" && part.id ? "" : "[no-id]"
	}`
}

export function readPreserveReasoning(): boolean {
	return vscode.workspace.getConfiguration("kit-pilot").get<boolean>("experimentalPreserveReasoning", false)
}

export function getThinkingPartConstructor(): ThinkingPartConstructor | undefined {
	const ctor = (vscode as unknown as { LanguageModelThinkingPart?: unknown }).LanguageModelThinkingPart
	return typeof ctor === "function" ? (ctor as ThinkingPartConstructor) : undefined
}

/**
 * `copilot/auto` sends each request to a model of its choice. Reasoning from
 * one model must not go to a different model, so replay is off for it.
 *
 * On some Copilot plans every model has the id "auto", and the family names
 * the real model (for example `claude-fable-5.1`). Thus the family decides.
 */
export function isAutoModel(client: { id: string; family?: string }): boolean {
	return client.family ? client.family === "auto" : client.id === "auto"
}

/**
 * The key that identifies the model that wrote the reasoning. The family is
 * used because the id can be "auto" for every model on some Copilot plans.
 */
export function getReplayModelKey(client: { id: string; family?: string }): string {
	return client.family || client.id
}

/**
 * Identifies a thinking part in the response stream. Call it only after the
 * text, tool call and data part checks, because a text part also has a
 * `value`. Duck-typed, because the part can come from another JavaScript realm.
 */
export function isThinkingPart(chunk: unknown, ctor?: ThinkingPartConstructor): boolean {
	if (!chunk || typeof chunk !== "object") return false
	if (ctor && chunk instanceof ctor) return true
	const part = chunk as Record<string, unknown>
	return (
		!("mimeType" in part) &&
		!("callId" in part) &&
		("id" in part || "metadata" in part) &&
		(typeof part.value === "string" || Array.isArray(part.value))
	)
}

/**
 * Collects the thinking parts of one response, in the two shapes that the
 * providers stream:
 *
 * - A part with an `id` (Copilot models). The collector merges the parts by
 *   `id`, the same way as Copilot does before it replays them.
 * - A part without an `id` (BYOK Anthropic and Gemini models). The streamed
 *   text pieces have no metadata, and the provider ignores them on replay. The
 *   last part holds the complete reasoning and its signature in the metadata
 *   (`_completeThinking`, `signature`, `redactedData`). The collector keeps
 *   each part without an `id` that has metadata, and ignores the others.
 */
export class ThinkingPartCollector {
	private readonly parts = new Map<string, VsCodeLmReplayPart>()
	private unnamedCount = 0

	add(chunk: unknown): void {
		const part = chunk as { id?: unknown; value?: unknown; metadata?: unknown }
		const value = Array.isArray(part.value) ? part.value.join("") : String(part.value ?? "")
		const metadata = toJsonObject(part.metadata)

		if (typeof part.id !== "string" || !part.id) {
			if (metadata && Object.keys(metadata).length) {
				// The key only keeps the order. It is not stored.
				this.parts.set(`\0${this.unnamedCount++}`, { value, metadata })
			}
			return
		}

		const existing = this.parts.get(part.id)
		const merged: VsCodeLmReplayPart = {
			id: part.id,
			value: (existing?.value ?? "") + value,
		}
		if (existing?.metadata || metadata) {
			merged.metadata = { ...existing?.metadata, ...metadata }
		}
		this.parts.set(part.id, merged)
	}

	result(): VsCodeLmReplayPart[] {
		return [...this.parts.values()]
	}
}

/**
 * Gives the thinking parts to put at the start of an Assistant message. It
 * gives no parts when the stored reasoning came from a different model.
 */
export function buildReplayParts(record: unknown, target: VsCodeLmReplayTarget | undefined): object[] {
	if (!target || !isReplayRecord(record)) return []
	if (record.modelId !== target.modelId || record.vendor !== target.vendor) return []
	return record.parts.map((part) => new target.ThinkingPart(part.value, part.id, part.metadata))
}

/** Gives the text of a thinking part, for the estimate of input tokens. */
export function getThinkingPartText(item: unknown): string | undefined {
	if (!isThinkingPart(item)) return undefined
	const part = item as { value: string | string[]; metadata?: { _completeThinking?: unknown } }
	const value = Array.isArray(part.value) ? part.value.join("") : part.value
	// A BYOK Anthropic part keeps its reasoning in the metadata, not in the value.
	const complete = part.metadata?._completeThinking
	return !value && typeof complete === "string" ? complete : value
}

function isReplayRecord(value: unknown): value is VsCodeLmReplayRecord {
	const record = value as VsCodeLmReplayRecord | undefined
	return (
		!!record &&
		typeof record.modelId === "string" &&
		typeof record.vendor === "string" &&
		Array.isArray(record.parts) &&
		record.parts.every(
			(part) =>
				!!part && (part.id === undefined || typeof part.id === "string") && typeof part.value === "string",
		)
	)
}

/**
 * Makes a copy of the metadata that survives JSON serialization, because the
 * task history is a JSON file. Gives undefined if the metadata cannot be
 * serialized.
 */
function toJsonObject(value: unknown): Record<string, unknown> | undefined {
	if (!value || typeof value !== "object") return undefined
	try {
		const copy = JSON.parse(JSON.stringify(value))
		return copy && typeof copy === "object" && !Array.isArray(copy) ? copy : undefined
	} catch {
		return undefined
	}
}
