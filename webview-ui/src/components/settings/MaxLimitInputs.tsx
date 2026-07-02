import React from "react"
import { useTranslation } from "react-i18next"
import { MaxRequestsInput } from "./MaxRequestsInput"
import { MaxCostInput } from "./MaxCostInput"
import { MaxCostWarningPercentInput } from "./MaxCostWarningPercentInput"

export interface MaxLimitInputsProps {
	allowedMaxRequests?: number
	allowedMaxCost?: number
	allowedMaxCostWarningPercent?: number
	onMaxRequestsChange: (value: number | undefined) => void
	onMaxCostChange: (value: number | undefined) => void
	onMaxCostWarningPercentChange: (value: number | undefined) => void
}

export const MaxLimitInputs: React.FC<MaxLimitInputsProps> = ({
	allowedMaxRequests,
	allowedMaxCost,
	allowedMaxCostWarningPercent,
	onMaxRequestsChange,
	onMaxCostChange,
	onMaxCostWarningPercentChange,
}) => {
	const { t } = useTranslation()

	return (
		<div className="space-y-2">
			<div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-2 items-center">
				<MaxRequestsInput allowedMaxRequests={allowedMaxRequests} onValueChange={onMaxRequestsChange} />
				<MaxCostInput allowedMaxCost={allowedMaxCost} onValueChange={onMaxCostChange} />
				{allowedMaxCost !== undefined && (
					<MaxCostWarningPercentInput
						allowedMaxCostWarningPercent={allowedMaxCostWarningPercent}
						onValueChange={onMaxCostWarningPercentChange}
					/>
				)}
			</div>
			<div className="text-xs text-vscode-descriptionForeground">
				{t("settings:autoApprove.maxLimits.description")}
			</div>
		</div>
	)
}
