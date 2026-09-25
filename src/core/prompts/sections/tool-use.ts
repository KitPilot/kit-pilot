export function getSharedToolUseSection(plainReplies = false): string {
	const toolRequirement = plainReplies
		? "Call a tool when you need to act. When you only need to answer the user or ask them a question, reply in plain text without a tool. A reply without a tool ends your turn, and the user replies next."
		: "You must call at least one tool per assistant response."
	return `====

TOOL USE

You have access to a set of tools that are executed upon the user's approval. Use the provider-native tool-calling mechanism. Do not include XML markup or examples. ${toolRequirement} Prefer calling as many tools as are reasonably needed in a single response to reduce back-and-forth and complete tasks faster.`
}
