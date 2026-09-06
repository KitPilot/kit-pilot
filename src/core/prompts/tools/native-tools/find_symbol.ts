import type OpenAI from "openai"

const FIND_SYMBOL_DESCRIPTION = `Find where a named symbol is defined, or every place that uses it. Uses the same language support that the editor uses for "Go to Definition" and "Find All References", so it understands imports, re-exports and aliases that a text search does not.

Use this BEFORE reading files to answer "where is this defined?" or "who calls this?". It is faster and more exact than reading files one after another.

Parameters:
- symbol: (required) The exact name of the function, class, type, constant or variable. Do not pass a path, an expression or a phrase.
- lookup: (required) "definition" for where it is declared. "references" for every place that uses it, which includes the declaration.

"definition" answers only for a language whose extension is installed. If it finds nothing it says so; then use search_files.

"references" joins the language provider to a whole-word text search, so it still answers when no provider does. Each line is marked [provider] or [text]. A [provider] line is the symbol you asked for. A [text] line only shares the name: it can be a comment, a string, or a different symbol. Read a [text] line before you change it.

The list does not prove that every use is there. Do not treat it as proof that a rename is complete. For a rename, still check the result with search_files or by building the project.

Example: find where a function is declared
{ "symbol": "parseConfig", "lookup": "definition" }

Example: find every caller before a rename
{ "symbol": "parseConfig", "lookup": "references" }`

const SYMBOL_PARAMETER_DESCRIPTION = `Exact symbol name, for example a function, class or type name`

const LOOKUP_PARAMETER_DESCRIPTION = `"definition" for where the symbol is declared, "references" for every place that uses it`

export default {
	type: "function",
	function: {
		name: "find_symbol",
		description: FIND_SYMBOL_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				symbol: {
					type: "string",
					description: SYMBOL_PARAMETER_DESCRIPTION,
				},
				lookup: {
					type: "string",
					enum: ["definition", "references"],
					description: LOOKUP_PARAMETER_DESCRIPTION,
				},
			},
			required: ["symbol", "lookup"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
