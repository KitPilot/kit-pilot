import { render, screen } from "@testing-library/react"

import { BudgetProgress, budgetFillColor, DEFAULT_BUDGET_WARNING_PERCENT } from "../BudgetProgress"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => `${key}:${JSON.stringify(opts)}` }),
}))

vi.mock("@/components/ui", () => ({
	StandardTooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

describe("budgetFillColor", () => {
	it("is normal below the warn threshold", () => {
		expect(budgetFillColor(79, 80)).toBe("var(--vscode-foreground)")
	})

	it("warns at/above the threshold", () => {
		expect(budgetFillColor(80, 80)).toBe("var(--vscode-editorWarning-foreground)")
		expect(budgetFillColor(99, 80)).toBe("var(--vscode-editorWarning-foreground)")
	})

	it("errors at/above 100%", () => {
		expect(budgetFillColor(100, 80)).toBe("var(--vscode-errorForeground)")
		expect(budgetFillColor(150, 80)).toBe("var(--vscode-errorForeground)")
	})
})

describe("BudgetProgress", () => {
	it("renders spent and cap as dollar amounts", () => {
		render(<BudgetProgress spent={1.234} cap={5} />)
		expect(screen.getByTestId("budget-spent")).toHaveTextContent("$1.23")
		expect(screen.getByTestId("budget-cap")).toHaveTextContent("$5.00")
	})

	it("clamps the bar width at 100% when over budget", () => {
		render(<BudgetProgress spent={10} cap={5} />)
		expect(screen.getByTestId("budget-used-bar").style.width).toBe("100%")
	})

	it("sizes the bar proportionally", () => {
		render(<BudgetProgress spent={2.5} cap={5} />)
		expect(screen.getByTestId("budget-used-bar").style.width).toBe("50%")
	})

	it("uses the warning color at the default threshold", () => {
		render(<BudgetProgress spent={4} cap={5} />)
		// jsdom drops var() values from parsed style properties; assert on the raw attribute.
		expect(screen.getByTestId("budget-used-bar").getAttribute("style")).toContain(
			budgetFillColor(80, DEFAULT_BUDGET_WARNING_PERCENT),
		)
	})
})
