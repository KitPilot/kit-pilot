import * as vscode from "vscode"

/**
 * The experimentalPlainReplyEndsTurn setting. When it is on, a reply without a
 * tool ends the turn and KitPilot waits for the user, as Claude Code does. When
 * it is off, KitPilot tells the model that it must use a tool.
 */
/**
 * True if a response ends the turn as a plain reply: it has text, it has no
 * tool call, and the setting is on.
 */
export function isPlainReplyTurnEnd(didToolUse: boolean, assistantText: string, enabled: boolean): boolean {
	return enabled && !didToolUse && assistantText.trim().length > 0
}

export function readPlainReplyEndsTurn(): boolean {
	return vscode.workspace.getConfiguration("kit-pilot").get<boolean>("experimentalPlainReplyEndsTurn", false)
}
