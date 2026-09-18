import { Bug, CodeXml, DraftingCompass, MessagesSquare, Workflow, type LucideIcon } from "lucide-react"

import { DEFAULT_MODES, type ModeConfig } from "@kit-pilot/types"

const modeIcons: Readonly<Record<string, LucideIcon>> = {
	architect: DraftingCompass,
	code: CodeXml,
	ask: MessagesSquare,
	debug: Bug,
	orchestrator: Workflow,
}

export function ModeName({ mode }: { mode?: Pick<ModeConfig, "slug" | "name"> }) {
	if (!mode) return null

	const defaultMode = DEFAULT_MODES.find((item) => item.slug === mode.slug)
	// Replace only the default label. Preserve names that the user supplies.
	const Icon = defaultMode?.name === mode.name ? modeIcons[mode.slug] : undefined
	const name = Icon ? mode.name.slice(mode.name.indexOf(" ") + 1) : mode.name

	return (
		<span className="inline-flex items-center gap-1.5 min-w-0 max-w-full">
			{Icon && <Icon size="1em" strokeWidth={1.75} className="shrink-0" aria-hidden="true" focusable="false" />}
			<span className="truncate">{name}</span>
		</span>
	)
}
