import { useQuery } from "@tanstack/react-query"

import { type ModelRecord, type ExtensionMessage } from "@kit-pilot/types"

import { vscode } from "@src/utils/vscode"

// Request the live VS Code LM models from the extension and reduce them to a
// family-keyed ModelInfo record. The info is built extension-side (see
// buildVsCodeLmModelInfo) from the real `vscode.lm` handles, so the webview
// renders true context windows / vision support rather than reconstructing
// them from the static `vscodeLlmModels` registry, which drifts from Copilot's
// reported `family` strings.
const getVsCodeLmModels = async () =>
	new Promise<ModelRecord>((resolve, reject) => {
		const cleanup = () => {
			window.removeEventListener("message", handler)
		}

		const timeout = setTimeout(() => {
			cleanup()
			reject(new Error("VS Code LM models request timed out"))
		}, 10000)

		const handler = (event: MessageEvent) => {
			const message: ExtensionMessage = event.data

			if (message.type === "vsCodeLmModels") {
				clearTimeout(timeout)
				cleanup()

				const record: ModelRecord = {}
				for (const model of message.vsCodeLmModels ?? []) {
					if (model.family && model.info) {
						record[model.family] = model.info
					}
				}
				resolve(record)
			}
		}

		window.addEventListener("message", handler)
		vscode.postMessage({ type: "requestVsCodeLmModels" })
	})

export const useVsCodeLmModels = (enabled: boolean) =>
	useQuery({ queryKey: ["vsCodeLmModels"], queryFn: getVsCodeLmModels, enabled })
