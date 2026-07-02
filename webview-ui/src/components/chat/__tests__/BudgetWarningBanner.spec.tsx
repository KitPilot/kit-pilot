import { render, screen, fireEvent } from "@testing-library/react"

import { BudgetWarningBanner } from "../BudgetWarningBanner"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}))

const mockState: { allowedMaxCost?: number | null; allowedMaxCostWarningPercent?: number | null } = {}

vi.mock("@src/context/ExtensionStateContext", () => ({
	useExtensionState: () => mockState,
}))

describe("BudgetWarningBanner", () => {
	beforeEach(() => {
		mockState.allowedMaxCost = 5
		mockState.allowedMaxCostWarningPercent = undefined
	})

	it("renders nothing when no cap is configured", () => {
		mockState.allowedMaxCost = undefined
		render(<BudgetWarningBanner taskId="t1" windowCost={100} windowStartTs={1} />)
		expect(screen.queryByTestId("budget-warning-banner")).toBeNull()
	})

	it("is hidden below the threshold", () => {
		render(<BudgetWarningBanner taskId="t1" windowCost={3.9} windowStartTs={1} />)
		expect(screen.queryByTestId("budget-warning-banner")).toBeNull()
	})

	it("shows at/above the default 80% threshold", () => {
		render(<BudgetWarningBanner taskId="t1" windowCost={4} windowStartTs={1} />)
		expect(screen.getByTestId("budget-warning-banner")).toHaveTextContent("chat:budget.warningMessage")
	})

	it("respects a custom threshold", () => {
		mockState.allowedMaxCostWarningPercent = 50
		render(<BudgetWarningBanner taskId="t1" windowCost={2.6} windowStartTs={1} />)
		expect(screen.getByTestId("budget-warning-banner")).toBeInTheDocument()
	})

	it("switches to the over-cap message above 100%", () => {
		render(<BudgetWarningBanner taskId="t1" windowCost={5.5} windowStartTs={1} />)
		expect(screen.getByTestId("budget-warning-banner")).toHaveTextContent("chat:budget.overCapMessage")
	})

	it("dismiss hides it for the current window only", () => {
		const { rerender } = render(<BudgetWarningBanner taskId="t1" windowCost={4.5} windowStartTs={1} />)
		fireEvent.click(screen.getByTestId("budget-warning-dismiss"))
		expect(screen.queryByTestId("budget-warning-banner")).toBeNull()

		// Same window stays dismissed even as cost climbs.
		rerender(<BudgetWarningBanner taskId="t1" windowCost={4.9} windowStartTs={1} />)
		expect(screen.queryByTestId("budget-warning-banner")).toBeNull()

		// A new window (post-approval) re-arms the banner.
		rerender(<BudgetWarningBanner taskId="t1" windowCost={4.5} windowStartTs={2} />)
		expect(screen.getByTestId("budget-warning-banner")).toBeInTheDocument()
	})
})
