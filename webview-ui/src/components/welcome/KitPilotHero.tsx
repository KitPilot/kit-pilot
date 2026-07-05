import { useState } from "react"
import { useTranslation } from "react-i18next"

const KitPilotHero = () => {
	const { t } = useTranslation()
	const [imagesBaseUri] = useState(() => {
		const w = window as any
		return w.IMAGES_BASE_URI || ""
	})
	const [isHovered, setIsHovered] = useState(false)

	return (
		<div
			className="mb-4 relative group flex flex-col items-center gap-3 pt-4 select-none"
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}>
			<img
				src={imagesBaseUri + "/kit-hero.png"}
				alt="KitPilot — a tiger cub in an aviator cap"
				className="h-24 w-24 kitpilot-home-hero__mascot"
				style={{
					// Hover bounce takes over from the idle float.
					animation: isHovered ? "smooth-bounce 1s ease-in-out infinite" : undefined,
				}}
			/>
			<div className="flex flex-col items-center gap-1">
				<div className="kitpilot-home-hero__wordmark">KitPilot</div>
				<div className="kitpilot-home-hero__tagline">{t("chat:home.tagline")}</div>
			</div>
		</div>
	)
}

export default KitPilotHero
