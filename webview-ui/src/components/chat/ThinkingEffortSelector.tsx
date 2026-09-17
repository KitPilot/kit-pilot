import { useCallback, useEffect, useState } from "react"
import { useEvent } from "react-use"

import {
	getVsCodeLmEffortKey,
	type ExtensionMessage,
	type ProviderSettings,
	type VsCodeLmEffort,
} from "@kit-pilot/types"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, StandardTooltip } from "@/components/ui"
import { useKitPilotPortal } from "@/components/ui/hooks/useKitPilotPortal"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { vscode } from "@/utils/vscode"

interface ThinkingEffortSelectorProps {
	apiConfiguration?: ProviderSettings
	profileName?: string
	disabled?: boolean
	onSavingChange?: (saving: boolean) => void
}

export function ThinkingEffortSelector({
	apiConfiguration,
	profileName,
	disabled,
	onSavingChange,
}: ThinkingEffortSelectorProps) {
	const { t } = useAppTranslation()
	const portalContainer = useKitPilotPortal("kitpilot-portal")
	const [models, setModels] = useState<NonNullable<ExtensionMessage["vsCodeLmModels"]>>([])
	const [pendingRequest, setPendingRequest] = useState<string>()
	const [saveFailed, setSaveFailed] = useState(false)
	const selector = apiConfiguration?.vsCodeLmModelSelector
	const modelKey = getVsCodeLmEffortKey(selector)
	const levels = models.find((model) => getVsCodeLmEffortKey(model) === modelKey)?.effortLevels ?? []
	const savedEffort = modelKey ? apiConfiguration?.vsCodeLmModelEfforts?.[modelKey] : undefined
	const effort = savedEffort && levels.includes(savedEffort) ? savedEffort : "default"

	const onMessage = useCallback(
		(event: MessageEvent<ExtensionMessage>) => {
			const message = event.data
			if (message.type === "vsCodeLmModels") setModels(message.vsCodeLmModels ?? [])
			if (message.type === "vsCodeLmEffortSaved" && pendingRequest && message.requestId === pendingRequest) {
				setPendingRequest(undefined)
				setSaveFailed(message.success !== true)
			}
		},
		[pendingRequest],
	)
	useEvent("message", onMessage)

	useEffect(() => {
		vscode.postMessage({ type: "requestVsCodeLmModels" })
	}, [])

	useEffect(() => {
		onSavingChange?.(!!pendingRequest)
		return () => onSavingChange?.(false)
	}, [pendingRequest, onSavingChange])

	useEffect(() => {
		setPendingRequest(undefined)
		setSaveFailed(false)
	}, [modelKey, profileName])

	useEffect(() => {
		if (!pendingRequest) return
		const timer = setTimeout(() => {
			setPendingRequest(undefined)
			setSaveFailed(true)
		}, 10_000)
		return () => clearTimeout(timer)
	}, [pendingRequest])

	if (!modelKey || levels.length === 0 || !profileName) return null

	const label = t(`chat:thinkingEffort.levels.${effort}`)
	return (
		<div className="flex items-center gap-1 shrink-0">
			<Select
				value={effort}
				disabled={disabled || !!pendingRequest}
				onValueChange={(value) => {
					if (!selector?.vendor || !selector.family || value === effort) return
					const requestId = crypto.randomUUID()
					setPendingRequest(requestId)
					setSaveFailed(false)
					vscode.postMessage({
						type: "setVsCodeLmEffort",
						text: profileName,
						requestId,
						vsCodeLmEffortSelection: {
							vendor: selector.vendor,
							family: selector.family,
							effort: value as VsCodeLmEffort | "default",
						},
					})
				}}>
				<StandardTooltip content={t("chat:thinkingEffort.selectorTooltip")}>
					<SelectTrigger
						aria-label={t("chat:thinkingEffort.aria", { level: label })}
						aria-busy={!!pendingRequest}
						className="h-auto gap-1 rounded-md px-1.5 py-1 text-xs bg-transparent border-[rgba(255,255,255,0.08)] text-vscode-foreground [&_svg]:size-3">
						<span aria-hidden="true">✻</span>
						<SelectValue />
					</SelectTrigger>
				</StandardTooltip>
				<SelectContent container={portalContainer}>
					<SelectItem value="default">{t("chat:thinkingEffort.levels.default")}</SelectItem>
					{levels.map((level) => (
						<SelectItem key={level} value={level}>
							{t(`chat:thinkingEffort.levels.${level}`)}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			{saveFailed && (
				<StandardTooltip content={t("chat:thinkingEffort.saveFailed")}>
					<span
						role="alert"
						aria-label={t("chat:thinkingEffort.saveFailed")}
						className="text-vscode-errorForeground">
						!
					</span>
				</StandardTooltip>
			)}
		</div>
	)
}
