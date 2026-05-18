import { Anthropic } from "@anthropic-ai/sdk"
import * as vscode from "vscode"

// Conservative ceiling matching the VS Code LM API's per-part data limit and
// `imageHelpers.DEFAULT_MAX_IMAGE_FILE_SIZE_MB`. Oversized images are dropped
// with a placeholder so the request body stays valid.
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

/**
 * Converts an Anthropic image block into a VS Code `LanguageModelDataPart`.
 * Falls back to a text placeholder for non-base64 sources, oversized payloads,
 * or decode failures so the model still sees a coherent message instead of a
 * missing turn or a request that gets rejected at the API boundary.
 */
function convertAnthropicImageToPart(
	imageBlock: Anthropic.ImageBlockParam,
): vscode.LanguageModelDataPart | vscode.LanguageModelTextPart {
	try {
		const source = imageBlock.source
		if (source?.type !== "base64" || !source.data) {
			return new vscode.LanguageModelTextPart(
				`[Image (${source?.type || "unknown source"}): only base64-encoded images are supported]`,
			)
		}

		// Accept both raw base64 and `data:image/...;base64,XXX` data URLs.
		// `source.data` should already be clean base64 (see responses.ts), but
		// be defensive in case another producer leaves the prefix on.
		let mime: string = source.media_type || "image/png"
		let b64 = source.data
		const dataUrl = b64.match(/^data:([^;]+);base64,(.*)$/)
		if (dataUrl) {
			mime = dataUrl[1]
			b64 = dataUrl[2]
		}

		const bytes = new Uint8Array(Buffer.from(b64, "base64"))
		if (bytes.byteLength > MAX_IMAGE_BYTES) {
			const sizeKb = Math.round(bytes.byteLength / 1024)
			const maxMb = Math.round(MAX_IMAGE_BYTES / (1024 * 1024))
			return new vscode.LanguageModelTextPart(
				`[Image (${mime}, ${sizeKb}KB): exceeds the ${maxMb}MB VS Code LM API limit and was not sent]`,
			)
		}
		return vscode.LanguageModelDataPart.image(bytes, mime)
	} catch (error) {
		console.warn("Roo Code <Language Model API>: Failed to convert image block:", error)
		return new vscode.LanguageModelTextPart("[Image: failed to decode]")
	}
}

/**
 * Safely converts a value into a plain object.
 */
function asObjectSafe(value: any): object {
	// Handle null/undefined
	if (!value) {
		return {}
	}

	try {
		// Handle strings that might be JSON
		if (typeof value === "string") {
			return JSON.parse(value)
		}

		// Handle pre-existing objects
		if (typeof value === "object") {
			return { ...value }
		}

		return {}
	} catch (error) {
		console.warn("Roo Code <Language Model API>: Failed to parse object:", error)
		return {}
	}
}

export function convertToVsCodeLmMessages(
	anthropicMessages: Anthropic.Messages.MessageParam[],
): vscode.LanguageModelChatMessage[] {
	const vsCodeLmMessages: vscode.LanguageModelChatMessage[] = []

	for (const anthropicMessage of anthropicMessages) {
		// Handle simple string messages
		if (typeof anthropicMessage.content === "string") {
			vsCodeLmMessages.push(
				anthropicMessage.role === "assistant"
					? vscode.LanguageModelChatMessage.Assistant(anthropicMessage.content)
					: vscode.LanguageModelChatMessage.User(anthropicMessage.content),
			)
			continue
		}

		// Handle complex message structures
		switch (anthropicMessage.role) {
			case "user": {
				const { nonToolMessages, toolMessages } = anthropicMessage.content.reduce<{
					nonToolMessages: (Anthropic.TextBlockParam | Anthropic.ImageBlockParam)[]
					toolMessages: Anthropic.ToolResultBlockParam[]
				}>(
					(acc, part) => {
						if (part.type === "tool_result") {
							acc.toolMessages.push(part)
						} else if (part.type === "text" || part.type === "image") {
							acc.nonToolMessages.push(part)
						}
						return acc
					},
					{ nonToolMessages: [], toolMessages: [] },
				)

				// Process tool messages first then non-tool messages
				const contentParts = [
					// Convert tool messages to ToolResultParts
					...toolMessages.map((toolMessage) => {
						// Process tool result content into text + data parts
						const toolContentParts: Array<
							vscode.LanguageModelTextPart | vscode.LanguageModelDataPart
						> =
							typeof toolMessage.content === "string"
								? [new vscode.LanguageModelTextPart(toolMessage.content)]
								: (toolMessage.content?.map((part) => {
										if (part.type === "image") {
											return convertAnthropicImageToPart(part)
										}
										return new vscode.LanguageModelTextPart(part.text)
									}) ?? [new vscode.LanguageModelTextPart("")])

						return new vscode.LanguageModelToolResultPart(toolMessage.tool_use_id, toolContentParts)
					}),

					// Convert non-tool messages to text/data parts after tool messages
					...nonToolMessages.map((part) => {
						if (part.type === "image") {
							return convertAnthropicImageToPart(part)
						}
						return new vscode.LanguageModelTextPart(part.text)
					}),
				]

				// Add single user message with all content parts
				vsCodeLmMessages.push(vscode.LanguageModelChatMessage.User(contentParts))
				break
			}

			case "assistant": {
				const { nonToolMessages, toolMessages } = anthropicMessage.content.reduce<{
					nonToolMessages: (Anthropic.TextBlockParam | Anthropic.ImageBlockParam)[]
					toolMessages: Anthropic.ToolUseBlockParam[]
				}>(
					(acc, part) => {
						if (part.type === "tool_use") {
							acc.toolMessages.push(part)
						} else if (part.type === "text" || part.type === "image") {
							acc.nonToolMessages.push(part)
						}
						return acc
					},
					{ nonToolMessages: [], toolMessages: [] },
				)

				// Process non-tool messages first, then tool messages
				// Tool calls must come at the end so they are properly followed by user message with tool results
				const contentParts = [
					// Convert non-tool messages to text/data parts first.
					// Note: Anthropic assistants don't emit image blocks in practice; this branch
					// exists for symmetry with the user-message path.
					...nonToolMessages.map((part) => {
						if (part.type === "image") {
							return convertAnthropicImageToPart(part)
						}
						return new vscode.LanguageModelTextPart(part.text)
					}),

					// Convert tool messages to ToolCallParts after text
					...toolMessages.map(
						(toolMessage) =>
							new vscode.LanguageModelToolCallPart(
								toolMessage.id,
								toolMessage.name,
								asObjectSafe(toolMessage.input),
							),
					),
				]

				// Add the assistant message to the list of messages
				vsCodeLmMessages.push(vscode.LanguageModelChatMessage.Assistant(contentParts))
				break
			}
		}
	}

	return vsCodeLmMessages
}

export function convertToAnthropicRole(vsCodeLmMessageRole: vscode.LanguageModelChatMessageRole): string | null {
	switch (vsCodeLmMessageRole) {
		case vscode.LanguageModelChatMessageRole.Assistant:
			return "assistant"
		case vscode.LanguageModelChatMessageRole.User:
			return "user"
		default:
			return null
	}
}

/**
 * Extracts the text content from a VS Code Language Model chat message.
 * @param message A VS Code Language Model chat message.
 * @returns The extracted text content.
 */
export function extractTextCountFromMessage(message: vscode.LanguageModelChatMessage): string {
	let text = ""
	if (Array.isArray(message.content)) {
		for (const item of message.content) {
			if (item instanceof vscode.LanguageModelTextPart) {
				text += item.value
			}
			if (item instanceof vscode.LanguageModelToolResultPart) {
				text += item.callId
				for (const part of item.content) {
					if (part instanceof vscode.LanguageModelTextPart) {
						text += part.value
					}
				}
			}
			if (item instanceof vscode.LanguageModelToolCallPart) {
				text += item.name
				text += item.callId
				if (item.input && Object.keys(item.input).length > 0) {
					try {
						text += JSON.stringify(item.input)
					} catch (error) {
						console.error("Roo Code <Language Model API>: Failed to stringify tool call input:", error)
					}
				}
			}
		}
	} else if (typeof message.content === "string") {
		text += message.content
	}
	return text
}
