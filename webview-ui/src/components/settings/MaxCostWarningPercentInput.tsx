import { useTranslation } from "react-i18next"

import { FormattedTextField, type InputFormatter } from "../common/FormattedTextField"

/**
 * Integer percentage in [1, 100]. Empty means "use the default" (80) — unlike
 * the cost/request limit formatters, where empty means "unlimited".
 */
export const percentFormatter: InputFormatter<number> = {
	parse: (input: string) => {
		if (input.trim() === "") return undefined
		const value = parseInt(input)
		if (isNaN(value) || value < 1) return undefined
		return Math.min(value, 100)
	},
	format: (value: number | undefined) => (value === undefined ? "" : value.toString()),
	filter: (input: string) => input.replace(/[^0-9]/g, ""),
}

interface MaxCostWarningPercentInputProps {
	allowedMaxCostWarningPercent?: number
	onValueChange: (value: number | undefined) => void
}

export function MaxCostWarningPercentInput({
	allowedMaxCostWarningPercent,
	onValueChange,
}: MaxCostWarningPercentInputProps) {
	const { t } = useTranslation()

	return (
		<>
			<label className="flex items-center gap-2 text-sm font-medium whitespace-nowrap">
				<span className="codicon codicon-bell" />
				{t("settings:autoApprove.apiCostLimit.warningPercent.title")}:
			</label>
			<FormattedTextField
				value={allowedMaxCostWarningPercent}
				onValueChange={onValueChange}
				formatter={percentFormatter}
				placeholder="80"
				style={{ maxWidth: "200px" }}
				data-testid="max-cost-warning-percent-input"
				rightNodes={[<span key="percent">%</span>]}
			/>
		</>
	)
}
