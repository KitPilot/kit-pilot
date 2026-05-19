import type OpenAI from "openai"

const FORGET_THIS_DESCRIPTION = `Delete a persistent memory from the user's KitPilot profile. Use when:
- User explicitly asks you to forget something
- A memory has become wrong or outdated and you've replaced it with a fresh one (in that case prefer remember_this to overwrite by name, only use forget_this if the replacement has a different name)
- A memory was saved in error

Deleting a name that doesn't exist is a no-op success — safe to call defensively.

Example:
{ "name": "old-deadline-2024-q3" }`

export default {
	type: "function",
	function: {
		name: "forget_this",
		description: FORGET_THIS_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				name: {
					type: "string",
					description: "Kebab-case slug of the memory to delete ([a-z0-9_-], 1-64 chars).",
				},
			},
			required: ["name"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
