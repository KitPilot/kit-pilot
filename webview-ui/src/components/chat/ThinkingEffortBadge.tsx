import { useCallback, useEffect, useState } from "react"
import { useEvent } from "react-use"

import type { ExtensionMessage } from "@kit-pilot/types"

import { StandardTooltip } from "@/components/ui"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { vscode } from "@/utils/vscode"

interface ThinkingEffortBadgeProps {
	/** Currently selected vscode-lm model; changes trigger a re-read. */
	modelSelector?: { vendor?: string; family?: string }
}

/**
 * Read-only indicator for the Thinking Effort the current Copilot model runs
 * at. The value is owned by VS Code's model picker (KitPilot can't set it via
 * the LM API — it auto-applies to our requests), so this only surfaces it:
 * an explicit level when the user overrode it there, "Default" otherwise,
 * hidden entirely when the extension can't determine it.
 */
export const ThinkingEffortBadge = ({ modelSelector }: ThinkingEffortBadgeProps) => {
	const { t } = useAppTranslation()

	// undefined = no response yet (render nothing), null = unknown (render
	// nothing), string = explicit level, "default" sentinel = model default.
	const [effort, setEffort] = useState<string | null | undefined>(undefined)

	useEffect(() => {
		setEffort(undefined)
		vscode.postMessage({ type: "requestCopilotThinkingEffort" })
	}, [modelSelector?.vendor, modelSelector?.family])

	const onMessage = useCallback((event: MessageEvent) => {
		const message: ExtensionMessage = event.data
		if (message.type === "copilotThinkingEffort") {
			// Field absent on the message means "model default".
			setEffort(message.copilotThinkingEffort === undefined ? "default" : message.copilotThinkingEffort)
		}
	}, [])

	useEvent("message", onMessage)

	if (effort === undefined || effort === null) {
		return null
	}

	const levelKey = ["none", "low", "medium", "high", "xhigh", "default"].includes(effort) ? effort : "default"
	const label = t(`chat:thinkingEffort.levels.${levelKey}`)

	return (
		<StandardTooltip content={t("chat:thinkingEffort.tooltip")}>
			<span
				className="kitpilot-thinking-badge flex-shrink-0 select-none"
				aria-label={t("chat:thinkingEffort.aria", { level: label })}>
				✻ {label}
			</span>
		</StandardTooltip>
	)
}
