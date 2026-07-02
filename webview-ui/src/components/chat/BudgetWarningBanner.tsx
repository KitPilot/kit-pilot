import { useState } from "react"
import { useTranslation } from "react-i18next"
import { X } from "lucide-react"

import { useExtensionState } from "@src/context/ExtensionStateContext"

import { DEFAULT_BUDGET_WARNING_PERCENT } from "./BudgetProgress"

interface BudgetWarningBannerProps {
	taskId?: string
	/** Cost (USD) of the current auto-approval budget window. */
	windowCost: number
	/** Stable key for the current window; a limit approval starts a new one. */
	windowStartTs: number
}

/**
 * Non-blocking banner shown when the budget window's spend crosses the warn
 * threshold of the configured cost cap. Dismissal is remembered per window
 * (and per task), so the banner re-arms after each "reset and continue"
 * approval. It stays visible over the cap too — the blocking ask only fires
 * at the next API request, and this bridges that gap.
 */
export const BudgetWarningBanner = ({ taskId, windowCost, windowStartTs }: BudgetWarningBannerProps) => {
	const { t } = useTranslation()
	const { allowedMaxCost, allowedMaxCostWarningPercent } = useExtensionState()
	const [dismissedKey, setDismissedKey] = useState<string | null>(null)

	const hasCap = typeof allowedMaxCost === "number" && allowedMaxCost > 0
	if (!hasCap) {
		return null
	}

	const warnPercent = allowedMaxCostWarningPercent ?? DEFAULT_BUDGET_WARNING_PERCENT
	const pctUsed = (windowCost / allowedMaxCost) * 100
	const windowKey = `${taskId ?? ""}:${windowStartTs}`

	if (pctUsed < warnPercent || dismissedKey === windowKey) {
		return null
	}

	const overCap = pctUsed >= 100

	return (
		<div className="px-3">
			<div
				data-testid="budget-warning-banner"
				className="flex items-center p-3 my-3 bg-vscode-inputValidation-warningBackground border border-vscode-inputValidation-warningBorder rounded">
				<span className="codicon codicon-warning mr-2" />
				<span className="text-vscode-foreground flex-1">
					{overCap
						? t("chat:budget.overCapMessage", {
								spent: windowCost.toFixed(2),
								cap: allowedMaxCost.toFixed(2),
							})
						: t("chat:budget.warningMessage", {
								spent: windowCost.toFixed(2),
								cap: allowedMaxCost.toFixed(2),
								percent: Math.round(pctUsed),
							})}
				</span>
				<button
					type="button"
					aria-label={t("chat:budget.dismiss")}
					data-testid="budget-warning-dismiss"
					className="ml-2 p-0.5 bg-transparent border-0 cursor-pointer text-vscode-foreground opacity-70 hover:opacity-100"
					onClick={() => setDismissedKey(windowKey)}>
					<X className="size-3.5" />
				</button>
			</div>
		</div>
	)
}
