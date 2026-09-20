import { useState, useMemo, useCallback, useEffect } from "react"
import { useEvent } from "react-use"
import { Fzf } from "fzf"
import { SiClaude, SiGoogle, SiGooglegemini, SiOpenai } from "react-icons/si"

import type { ExtensionMessage } from "@kit-pilot/types"

import { cn } from "@/lib/utils"
import { useKitPilotPortal } from "@/components/ui/hooks/useKitPilotPortal"
import { Popover, PopoverContent, PopoverTrigger, StandardTooltip } from "@/components/ui"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { vscode } from "@/utils/vscode"
import { formatLargeNumber } from "@/utils/format"

type ChatModel = NonNullable<ExtensionMessage["vsCodeLmModels"]>[number]

function getContextLength(model?: ChatModel): number | undefined {
	const limit = model?.maxInputTokens
	return typeof limit === "number" && Number.isFinite(limit) && limit > 0 ? limit : undefined
}

function ModelContextLength({ value }: { value?: number }) {
	const { t } = useAppTranslation()
	if (value === undefined) return null
	const label = t("chat:modelContextLimit", { count: value.toLocaleString() })
	return (
		<span className="shrink-0 text-xs tabular-nums" title={label} aria-label={label}>
			{formatLargeNumber(value)
				.replace(/\.0([kmb])$/, "$1")
				.toUpperCase()}
		</span>
	)
}

interface ModelSelectorProps {
	value?: { vendor?: string; family?: string }
	title: string
	onChange: (selector: { vendor: string; family: string }) => void
	triggerClassName?: string
	disabled?: boolean
}

function getModelIcon(family?: string, vendor?: string) {
	if (!family) return null

	const modelFamily = family.toLowerCase()
	if (/\b(claude|opus|sonnet|haiku)\b/.test(modelFamily)) return SiClaude
	if (/\b(gpt|chatgpt|codex|o\d+)\b/.test(modelFamily)) return SiOpenai
	if (/\bgemini\b/.test(modelFamily)) return SiGooglegemini
	if (/\bgemma\b/.test(modelFamily)) return SiGoogle

	switch (vendor?.toLowerCase()) {
		case "anthropic":
			return SiClaude
		case "openai":
			return SiOpenai
		case "google":
			return SiGoogle
		default:
			return null
	}
}

export const ModelSelector = ({ value, title, onChange, triggerClassName, disabled = false }: ModelSelectorProps) => {
	const { t } = useAppTranslation()
	const [open, setOpen] = useState(false)
	const [searchValue, setSearchValue] = useState("")
	const [models, setModels] = useState<ChatModel[]>([])
	const portalContainer = useKitPilotPortal("kitpilot-portal")
	const ModelIcon = getModelIcon(value?.family, value?.vendor)
	const contextLength = getContextLength(
		models.find((model) => model.vendor === value?.vendor && model.family === value?.family),
	)

	useEffect(() => {
		vscode.postMessage({ type: "requestVsCodeLmModels" })
	}, [])

	useEffect(() => {
		if (open) {
			vscode.postMessage({ type: "requestVsCodeLmModels" })
		}
	}, [open])

	const onMessage = useCallback((event: MessageEvent) => {
		const message: ExtensionMessage = event.data
		if (message.type === "vsCodeLmModels") {
			setModels(message.vsCodeLmModels ?? [])
		}
	}, [])

	useEvent("message", onMessage)

	const displayName = useMemo(() => {
		if (!value?.family) return t("chat:noModelSelected")
		return value.family
	}, [value, t])

	const searchableItems = useMemo(
		() =>
			models.map((m) => ({
				original: m,
				searchStr: `${m.vendor ?? ""} ${m.family ?? ""}`.trim(),
			})),
		[models],
	)

	const fzfInstance = useMemo(
		() => new Fzf(searchableItems, { selector: (item) => item.searchStr }),
		[searchableItems],
	)

	const filtered = useMemo(() => {
		if (!searchValue) return models
		return fzfInstance.find(searchValue).map((r) => r.item.original)
	}, [models, searchValue, fzfInstance])

	const showVendor = useMemo(() => {
		const vendors = new Set(models.map((m) => m.vendor).filter(Boolean))
		return vendors.size > 1
	}, [models])

	const sortedModels = useMemo(() => {
		const familyKey = (m: ChatModel) => (m.family ?? "").split("-")[0]
		return filtered
			.map((m, idx) => ({ m, idx }))
			.sort((a, b) => {
				const cmp = familyKey(a.m).localeCompare(familyKey(b.m))
				return cmp !== 0 ? cmp : a.idx - b.idx
			})
			.map(({ m }) => m)
	}, [filtered])

	const handleSelect = useCallback(
		(model: ChatModel) => {
			if (model.vendor && model.family) {
				onChange({ vendor: model.vendor, family: model.family })
			}
			setOpen(false)
			setSearchValue("")
		},
		[onChange],
	)

	const isSelected = useCallback((m: ChatModel) => value?.vendor === m.vendor && value?.family === m.family, [value])

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<StandardTooltip
				content={
					contextLength === undefined
						? title
						: `${title} · ${t("chat:modelContextLimit", { count: contextLength.toLocaleString() })}`
				}>
				<PopoverTrigger
					disabled={disabled}
					data-testid="model-selector-trigger"
					className={cn(
						"min-w-0 inline-flex items-center gap-1 relative whitespace-nowrap px-1.5 py-1 text-xs",
						"kitpilot-chat-control border rounded-md",
						"transition-all duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-vscode-focusBorder focus-visible:ring-inset",
						disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
						triggerClassName,
					)}>
					{ModelIcon && <ModelIcon size="1em" className="shrink-0" aria-hidden="true" focusable="false" />}
					<span className="truncate">{displayName}</span>
					<ModelContextLength value={contextLength} />
				</PopoverTrigger>
			</StandardTooltip>
			<PopoverContent
				align="start"
				sideOffset={4}
				container={portalContainer}
				className="p-0 overflow-hidden w-[300px]">
				<div className="flex flex-col w-full">
					{models.length > 6 ? (
						<div className="relative p-2 border-b border-vscode-dropdown-border">
							<input
								aria-label={t("common:ui.search_placeholder")}
								value={searchValue}
								onChange={(e) => setSearchValue(e.target.value)}
								placeholder={t("common:ui.search_placeholder")}
								className="w-full h-8 px-2 py-1 text-xs bg-vscode-input-background text-vscode-input-foreground border border-vscode-input-border rounded focus:outline-0"
								autoFocus
							/>
							{searchValue.length > 0 && (
								<div className="absolute right-4 top-0 bottom-0 flex items-center justify-center">
									<span
										className="codicon codicon-close text-vscode-input-foreground opacity-50 hover:opacity-100 text-xs cursor-pointer"
										onClick={() => setSearchValue("")}
									/>
								</div>
							)}
						</div>
					) : null}

					{models.length === 0 ? (
						<div className="py-3 px-3 text-sm text-vscode-foreground">{t("chat:loadingModels")}</div>
					) : filtered.length === 0 ? (
						<div className="py-2 px-3 text-sm text-vscode-foreground">{t("common:ui.no_results")}</div>
					) : (
						<div className="max-h-[300px] overflow-y-auto py-1">
							{sortedModels.map((m) => {
								const selected = isSelected(m)
								return (
									<div
										key={`${m.vendor}/${m.family}`}
										onClick={() => handleSelect(m)}
										className={cn(
											"px-3 py-1 text-sm cursor-pointer flex items-center gap-2",
											"hover:bg-vscode-list-hoverBackground",
											selected &&
												"bg-vscode-list-activeSelectionBackground text-vscode-list-activeSelectionForeground",
										)}>
										<span className="flex-1 min-w-0 truncate">{m.family}</span>
										<ModelContextLength value={getContextLength(m)} />
										{showVendor && m.vendor && <span className="text-xs shrink-0">{m.vendor}</span>}
										{selected && <span className="codicon codicon-check text-xs shrink-0" />}
									</div>
								)
							})}
						</div>
					)}
				</div>
			</PopoverContent>
		</Popover>
	)
}
