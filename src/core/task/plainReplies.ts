/**
 * True if a response ends the turn as a plain reply: it has text and no tool
 * call. KitPilot then waits for the user, as Claude Code does. Before 0.2.14
 * KitPilot told the model that a reply without a tool was an error.
 */
export function isPlainReplyTurnEnd(didToolUse: boolean, assistantText: string): boolean {
	return !didToolUse && assistantText.trim().length > 0
}
