import type OpenAI from "openai"

const REMEMBER_THIS_DESCRIPTION = `Save a persistent memory to the user's KitPilot profile (~/.kitpilot/memory/). The memory will be auto-loaded into the system prompt of every future conversation, so use this for facts that should compound across sessions — not for short-term notes about the current task.

When to use:
- User shares stable facts about themselves (role, expertise, preferences)
- User corrects your approach in a way that should stick ("don't mock the database", "we always use pnpm")
- User mentions external systems worth remembering (dashboards, ticketing projects, repo conventions)
- User explicitly asks you to remember something

When NOT to use:
- In-progress task state (use update_todo_list instead)
- Code patterns derivable by reading the codebase
- Conversation-scoped context that won't matter next session
- Information already documented in CLAUDE.md / AGENTS.md / .kitpilot/rules/

Memory types:
- "user": facts about who the user is (role, expertise, preferences)
- "feedback": rules the user has corrected you on or confirmed (start with the rule, then **Why:** and **How to apply:** lines)
- "project": ongoing initiatives, deadlines, decisions specific to current work (convert relative dates to absolute)
- "reference": pointers to external systems (Linear projects, Grafana dashboards, Slack channels)

Saving an existing name overwrites it — use this to update memories that have changed.

Example:
{ "name": "user-role", "type": "user", "description": "User is a senior backend engineer focused on observability", "content": "User has 10+ years of Go experience and is currently leading the observability initiative. They prefer concise technical explanations and dislike marketing-speak." }`

export default {
	type: "function",
	function: {
		name: "remember_this",
		description: REMEMBER_THIS_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				name: {
					type: "string",
					description:
						"Kebab-case slug for the memory ([a-z0-9_-], 1-64 chars). Reusing an existing name overwrites it.",
				},
				type: {
					type: "string",
					enum: ["user", "feedback", "project", "reference"],
					description: "Category of memory. See description for guidance on which to pick.",
				},
				description: {
					type: "string",
					description:
						"One-line summary (under ~150 chars) for the MEMORY.md index. Be specific so future-you can decide relevance.",
				},
				content: {
					type: "string",
					description:
						"Full body of the memory. For feedback/project types, include **Why:** and **How to apply:** lines.",
				},
			},
			required: ["name", "type", "description", "content"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
