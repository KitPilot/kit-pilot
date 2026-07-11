import * as fs from "fs"
import * as path from "path"
import * as vscode from "vscode"

/**
 * Best-effort reader for the Thinking Effort that VS Code's Copilot model
 * picker applies to a model.
 *
 * KitPilot cannot SET reasoning effort through the LM API (Copilot reads it
 * only from `modelConfiguration`, which isn't exposed to consumers), but the
 * value the user picks is persisted to a plain JSON file in the user profile:
 * `<UserDir>/chatLanguageModels.json`, as provider groups shaped like
 * `{ vendor, name, settings: { [modelId]: { reasoningEffort: "low", … } } }`
 * (see `updateModelConfiguration` in VS Code's languageModels.ts). VS Code
 * REMOVES values equal to the schema default, so an absent entry means "the
 * model runs at its default effort" — we report that as `undefined`, never a
 * guessed level.
 *
 * The file format is internal and undocumented; everything here is tolerant:
 * on any read/parse problem the caller gets `null` ("unknown") and the UI
 * hides the indicator rather than showing a wrong value.
 */

/** Effort read result: a level string, undefined = model default, null = unknown/unreadable. */
export type CopilotThinkingEffort = string | undefined | null

const CONFIG_FILE_NAME = "chatLanguageModels.json"

/**
 * Resolve the user-profile `chatLanguageModels.json` path from the extension's
 * global storage URI (`<UserDir>/globalStorage/<ext-id>` → two levels up).
 * Returns undefined off-desktop (non-file scheme) or for non-default VS Code
 * profiles where the file lives elsewhere — callers treat that as "unknown".
 */
export function getChatLanguageModelsFilePath(context: vscode.ExtensionContext): string | undefined {
	const storage = context.globalStorageUri
	if (storage.scheme !== "file") {
		return undefined
	}
	return path.join(path.dirname(path.dirname(storage.fsPath)), CONFIG_FILE_NAME)
}

interface ProviderGroup {
	vendor?: string
	settings?: Record<string, Record<string, unknown>>
}

/**
 * Read the persisted thinking effort for the model matching `selector`.
 * - string → an explicit non-default level ("low" | "medium" | "high" | "xhigh" | "none")
 * - undefined → no override on record; the model runs at its Copilot default
 * - null → can't tell (no matching model, unreadable file, non-desktop, …)
 */
export async function readCopilotThinkingEffort(
	context: vscode.ExtensionContext,
	selector: vscode.LanguageModelChatSelector | undefined,
): Promise<CopilotThinkingEffort> {
	try {
		const models = await vscode.lm.selectChatModels(selector ?? {})
		const model = models?.[0]
		if (!model) {
			return null
		}

		const filePath = getChatLanguageModelsFilePath(context)
		if (!filePath) {
			return null
		}

		let raw: string
		try {
			raw = await fs.promises.readFile(filePath, "utf8")
		} catch (error) {
			// Missing file = the user never changed any model configuration, so
			// every model is at its default. Anything else is "unknown".
			return (error as NodeJS.ErrnoException)?.code === "ENOENT" ? undefined : null
		}

		const groups = JSON.parse(raw) as unknown
		if (!Array.isArray(groups)) {
			return null
		}

		for (const group of groups as ProviderGroup[]) {
			if (group?.vendor !== model.vendor) {
				continue
			}
			const effort = group.settings?.[model.id]?.["reasoningEffort"]
			if (typeof effort === "string") {
				return effort
			}
		}

		// File exists but carries no override for this model → default.
		return undefined
	} catch (error) {
		console.debug(
			"KitPilot <Language Model API>: failed to read thinking effort:",
			error instanceof Error ? error.message : error,
		)
		return null
	}
}

/**
 * Watch `chatLanguageModels.json` for changes (the picker writes to it when
 * the user changes Thinking Effort) and invoke `onChange`, debounced. Watches
 * the containing directory so create/delete of the file are caught too.
 * Returns a Disposable; safe no-op when the path can't be resolved.
 */
export function watchChatLanguageModelsFile(context: vscode.ExtensionContext, onChange: () => void): vscode.Disposable {
	const filePath = getChatLanguageModelsFilePath(context)
	if (!filePath) {
		return { dispose: () => {} }
	}

	let timer: ReturnType<typeof setTimeout> | undefined
	let watcher: fs.FSWatcher | undefined
	try {
		watcher = fs.watch(path.dirname(filePath), (_event, fileName) => {
			if (fileName && fileName !== CONFIG_FILE_NAME) {
				return
			}
			if (timer) {
				clearTimeout(timer)
			}
			timer = setTimeout(onChange, 300)
		})
	} catch (error) {
		console.debug(
			"KitPilot <Language Model API>: failed to watch model config file:",
			error instanceof Error ? error.message : error,
		)
		return { dispose: () => {} }
	}

	return {
		dispose: () => {
			if (timer) {
				clearTimeout(timer)
			}
			watcher?.close()
		},
	}
}
