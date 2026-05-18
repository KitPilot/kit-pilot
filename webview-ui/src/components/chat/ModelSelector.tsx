import { useState, useMemo, useCallback, useEffect } from "react"
import { useEvent } from "react-use"
import { Fzf } from "fzf"
import type { LanguageModelChatSelector } from "vscode"

import type { ExtensionMessage } from "@kit-pilot/types"

import { cn } from "@/lib/utils"
import { useRooPortal } from "@/components/ui/hooks/useRooPortal"
import { Popover, PopoverContent, PopoverTrigger, StandardTooltip } from "@/components/ui"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { vscode } from "@/utils/vscode"

interface ModelSelectorProps {
	value?: { vendor?: string; family?: string }
	title: string
	onChange: (selector: { vendor: string; family: string }) => void
	triggerClassName?: string
	disabled?: boolean
}

export const ModelSelector = ({ value, title, onChange, triggerClassName, disabled = false }: ModelSelectorProps) => {
	const { t } = useAppTranslation()
	const [open, setOpen] = useState(false)
	const [searchValue, setSearchValue] = useState("")
	const [models, setModels] = useState<LanguageModelChatSelector[]>([])
	const portalContainer = useRooPortal("roo-portal")

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
		const familyKey = (m: LanguageModelChatSelector) => (m.family ?? "").split("-")[0]
		return filtered
			.map((m, idx) => ({ m, idx }))
			.sort((a, b) => {
				const cmp = familyKey(a.m).localeCompare(familyKey(b.m))
				return cmp !== 0 ? cmp : a.idx - b.idx
			})
			.map(({ m }) => m)
	}, [filtered])

	const handleSelect = useCallback(
		(model: LanguageModelChatSelector) => {
			if (model.vendor && model.family) {
				onChange({ vendor: model.vendor, family: model.family })
			}
			setOpen(false)
			setSearchValue("")
		},
		[onChange],
	)

	const isSelected = useCallback(
		(m: LanguageModelChatSelector) => value?.vendor === m.vendor && value?.family === m.family,
		[value],
	)

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<StandardTooltip content={title}>
				<PopoverTrigger
					disabled={disabled}
					data-testid="model-selector-trigger"
					className={cn(
						"min-w-0 inline-flex items-center relative whitespace-nowrap px-1.5 py-1 text-xs",
						"bg-transparent border border-[rgba(255,255,255,0.08)] rounded-md text-vscode-foreground",
						"transition-all duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-vscode-focusBorder focus-visible:ring-inset",
						disabled
							? "opacity-50 cursor-not-allowed"
							: "opacity-90 hover:opacity-100 hover:bg-[rgba(255,255,255,0.03)] hover:border-[rgba(255,255,255,0.15)] cursor-pointer",
						triggerClassName,
					)}>
					<span className="truncate">{displayName}</span>
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
						<div className="py-3 px-3 text-sm text-vscode-foreground/70">{t("chat:loadingModels")}</div>
					) : filtered.length === 0 ? (
						<div className="py-2 px-3 text-sm text-vscode-foreground/70">{t("common:ui.no_results")}</div>
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
										{showVendor && m.vendor && (
											<span className="text-xs text-vscode-descriptionForeground opacity-60 shrink-0">
												{m.vendor}
											</span>
										)}
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
