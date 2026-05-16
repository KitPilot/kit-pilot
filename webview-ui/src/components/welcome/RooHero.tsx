import { useState } from "react"

const RooHero = () => {
	const [imagesBaseUri] = useState(() => {
		const w = window as any
		return w.IMAGES_BASE_URI || ""
	})
	const [isHovered, setIsHovered] = useState(false)

	return (
		<div
			className="mb-4 relative group flex flex-col items-center pt-4"
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}>
			<img
				src={imagesBaseUri + "/kit-hero.png"}
				alt="KitPilot logo"
				className="h-24 w-24 transition-transform duration-500"
				style={{
					animation: isHovered ? "smooth-bounce 1s ease-in-out infinite" : "none",
				}}
			/>
		</div>
	)
}

export default RooHero
