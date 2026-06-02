/**
 * KitPilot mascot — a small SVG stick figure tapping on a laptop, shown
 * in a footer strip above the chat input while the agent is working.
 *
 * Visibility is controlled by the `active` prop (usually wired to
 * ChatView's `isStreaming`). The mascot fades in/out with a short
 * opacity transition so it doesn't flash on quick API turns.
 *
 * Honors prefers-reduced-motion: animations are disabled and the figure
 * stays statically rendered.
 */

import { useEffect, useState } from "react"

interface KitPilotMascotProps {
	active: boolean
	/** Optional status text shown to the right of the figure (e.g. "Coding…"). */
	label?: string
}

export const KitPilotMascot = ({ active, label }: KitPilotMascotProps) => {
	// Keep the element mounted briefly after `active` flips false so the fade
	// animation can play out before we unmount and free the layout slot.
	const [mounted, setMounted] = useState(active)
	useEffect(() => {
		if (active) {
			setMounted(true)
			return
		}
		const t = setTimeout(() => setMounted(false), 250)
		return () => clearTimeout(t)
	}, [active])

	if (!mounted) return null

	return (
		<div
			role="status"
			aria-live="polite"
			aria-label={label ?? "Agent is working"}
			className="kitpilot-mascot"
			data-active={active ? "true" : "false"}>
			<svg viewBox="0 0 60 40" width="48" height="32" aria-hidden="true">
				{/* Head */}
				<circle cx="30" cy="8" r="4" />
				{/* Body */}
				<line x1="30" y1="12" x2="30" y2="20" />
				{/* Arms reaching toward the keyboard */}
				<line x1="30" y1="14" x2="20" y2="21" />
				<line x1="30" y1="14" x2="40" y2="21" />
				{/* Keyboard slab */}
				<line x1="14" y1="24" x2="46" y2="24" strokeLinecap="round" />
				{/* Tapping "fingers" (the four little vertical strokes above the keyboard).
					Animated via CSS — staggered translateY so they tap in sequence. */}
				<line className="kitpilot-mascot__finger kitpilot-mascot__finger--1" x1="22" y1="24" x2="22" y2="21" />
				<line className="kitpilot-mascot__finger kitpilot-mascot__finger--2" x1="27" y1="24" x2="27" y2="21" />
				<line className="kitpilot-mascot__finger kitpilot-mascot__finger--3" x1="33" y1="24" x2="33" y2="21" />
				<line className="kitpilot-mascot__finger kitpilot-mascot__finger--4" x1="38" y1="24" x2="38" y2="21" />
			</svg>
			{label && <span className="kitpilot-mascot__label">{label}</span>}
		</div>
	)
}
