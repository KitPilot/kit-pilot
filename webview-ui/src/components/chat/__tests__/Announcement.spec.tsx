import React from "react"

import { render, screen } from "@/utils/test-utils"

import Announcement from "../Announcement"

vi.mock("@src/utils/vscode", () => ({
	vscode: {
		postMessage: vi.fn(),
	},
}))

vi.mock("@kitpilot/package", () => ({
	Package: {
		version: "0.1.20",
	},
}))

vi.mock("@vscode/webview-ui-toolkit/react", () => ({
	VSCodeLink: ({ children, href, onClick, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
		<a href={href} onClick={onClick} {...props}>
			{children}
		</a>
	),
}))

vi.mock("react-i18next", () => ({
	Trans: ({ i18nKey, components }: { i18nKey: string; components?: Record<string, React.ReactElement> }) => {
		if (i18nKey === "chat:announcement.finalRelease.intro") {
			return (
				<span>
					KitPilot is a fork of{" "}
					{components?.announcementLink && React.cloneElement(components.announcementLink, {}, "KitPilot")}{" "}
					running on{" "}
					{components?.roomoteLink &&
						React.cloneElement(components.roomoteLink, {}, "the VS Code Language Model API")}
					.
				</span>
			)
		}

		return <span>{i18nKey}</span>
	},
}))

vi.mock("@src/i18n/TranslationContext", () => ({
	useAppTranslation: () => ({
		t: (key: string, options?: { version?: string }) => {
			const translations: Record<string, string> = {
				"chat:announcement.finalRelease.title": `Welcome to KitPilot ${options?.version ?? ""}`.trim(),
				"chat:announcement.finalRelease.continuity":
					"If your organization permits GitHub Copilot, you can use KitPilot.",
				"chat:announcement.finalRelease.alternatives": "Full agentic workflows are supported.",
				"chat:announcement.finalRelease.signoff": "Happy coding!",
			}

			return translations[key] ?? key
		},
	}),
}))

describe("Announcement", () => {
	it("renders the welcome announcement", () => {
		render(<Announcement hideAnnouncement={vi.fn()} />)

		expect(screen.getByText("Welcome to KitPilot 0.1.20")).toBeInTheDocument()
		expect(
			screen.getByText("If your organization permits GitHub Copilot, you can use KitPilot."),
		).toBeInTheDocument()
		expect(screen.getByText("Full agentic workflows are supported.")).toBeInTheDocument()
		expect(screen.getByText("Happy coding!")).toBeInTheDocument()
	})

	it("renders the external links", () => {
		render(<Announcement hideAnnouncement={vi.fn()} />)

		expect(screen.getByRole("link", { name: "KitPilot" })).toHaveAttribute(
			"href",
			"https://github.com/KitPilot/kit-pilot",
		)
		expect(screen.getByRole("link", { name: "the VS Code Language Model API" })).toHaveAttribute(
			"href",
			"https://code.visualstudio.com/api/extension-guides/language-model",
		)
	})

	it("calls hideAnnouncement when the dialog is dismissed", () => {
		const hideAnnouncement = vi.fn()
		render(<Announcement hideAnnouncement={hideAnnouncement} />)

		// Radix dialogs close on Escape.
		document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))

		expect(hideAnnouncement).toHaveBeenCalled()
	})
})
