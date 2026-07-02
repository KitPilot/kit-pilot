import { useTranslation } from "react-i18next"

import { StandardTooltip } from "@/components/ui"

export const DEFAULT_BUDGET_WARNING_PERCENT = 80

interface BudgetProgressProps {
	/** Cost (USD) of the current auto-approval budget window. */
	spent: number
	/** The configured cost cap (allowedMaxCost, USD). */
	cap: number
	/** Warn threshold in percent of the cap (default 80). */
	warnPercent?: number
	/** Extra tooltip line (e.g. the aggregated cost including subtasks). */
	extraTooltip?: React.ReactNode
}

/** Fill color for the budget bar/label at a given percentage used. */
export function budgetFillColor(pctUsed: number, warnPercent: number): string {
	if (pctUsed >= 100) return "var(--vscode-errorForeground)"
	if (pctUsed >= warnPercent) return "var(--vscode-editorWarning-foreground)"
	return "var(--vscode-foreground)"
}

/**
 * Thin progress bar showing budget-window spend against the configured cost
 * cap ("$1.23 / $5.00"), colored when approaching or exceeding the cap.
 * Modeled on ContextWindowProgress.
 */
export const BudgetProgress = ({
	spent,
	cap,
	warnPercent = DEFAULT_BUDGET_WARNING_PERCENT,
	extraTooltip,
}: BudgetProgressProps) => {
	const { t } = useTranslation()

	const safeSpent = Math.max(0, spent)
	const pctUsed = cap > 0 ? (safeSpent / cap) * 100 : 0
	const barPercent = Math.min(100, pctUsed)
	const fillColor = budgetFillColor(pctUsed, warnPercent)

	const tooltipContent = (
		<div className="space-y-1">
			<div>
				{t("chat:costs.budgetWindow", {
					spent: safeSpent.toFixed(2),
					cap: cap.toFixed(2),
				})}
			</div>
			{extraTooltip && <div className="text-xs">{extraTooltip}</div>}
		</div>
	)

	return (
		<div className="flex items-center gap-2 flex-1 whitespace-nowrap">
			<div data-testid="budget-spent" style={{ color: fillColor }}>
				${safeSpent.toFixed(2)}
			</div>
			<StandardTooltip content={tooltipContent} side="top" sideOffset={8}>
				<div className="flex-1 relative">
					<div className="flex items-center h-1 rounded-[2px] overflow-hidden w-full bg-[color-mix(in_srgb,var(--vscode-foreground)_20%,transparent)]">
						<div
							className="relative h-full transition-width duration-300 ease-out"
							style={{ width: `${barPercent}%`, backgroundColor: fillColor }}
							data-testid="budget-used-bar"
						/>
					</div>
				</div>
			</StandardTooltip>
			<div data-testid="budget-cap">${cap.toFixed(2)}</div>
		</div>
	)
}
