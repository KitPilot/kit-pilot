import React from "react"
import { render, screen } from "@/utils/test-utils"

import KitPilotTips from "../KitPilotTips"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key, // Simple mock that returns the key
	}),
	Trans: ({
		children,
		components,
	}: {
		children?: React.ReactNode
		components?: Record<string, React.ReactElement>
	}) => {
		// Simple mock that renders children or the first component if no children
		return children || (components && Object.values(components)[0]) || null
	},
}))

vi.mock("@vscode/webview-ui-toolkit/react", () => ({
	VSCodeLink: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}))

describe("KitPilotTips Component", () => {
	beforeEach(() => {
		render(<KitPilotTips />)
	})

	test("renders the about box with a single docs link", () => {
		expect(screen.getAllByRole("link")).toHaveLength(1)
	})

	test("renders the description text", () => {
		expect(screen.getByText("kitpilotTips.modelAgnostic.description")).toBeInTheDocument()
	})
})
