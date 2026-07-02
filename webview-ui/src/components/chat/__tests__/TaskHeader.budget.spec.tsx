// npx vitest src/components/chat/__tests__/TaskHeader.budget.spec.tsx

import React from "react"
import { render, screen, fireEvent } from "@/utils/test-utils"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import type { ProviderSettings } from "@kit-pilot/types"

import TaskHeader, { TaskHeaderProps } from "../TaskHeader"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
	initReactI18next: {
		type: "3rdParty",
		init: vi.fn(),
	},
}))

const { mockPostMessage } = vi.hoisted(() => ({
	mockPostMessage: vi.fn(),
}))
vi.mock("@/utils/vscode", () => ({
	vscode: {
		postMessage: mockPostMessage,
	},
}))

vi.mock("@vscode/webview-ui-toolkit/react", () => ({
	VSCodeBadge: ({ children }: { children: React.ReactNode }) => <div data-testid="vscode-badge">{children}</div>,
}))

const mockExtensionState: {
	apiConfiguration: ProviderSettings
	currentTaskItem: { id: string } | null
	clineMessages: any[]
	allowedMaxCost?: number | null
	allowedMaxCostWarningPercent?: number | null
} = {
	apiConfiguration: { apiProvider: "anthropic", apiKey: "k", apiModelId: "m" } as ProviderSettings,
	currentTaskItem: { id: "test-task-id" },
	clineMessages: [],
}

vi.mock("@src/context/ExtensionStateContext", () => ({
	useExtensionState: () => mockExtensionState,
}))

vi.mock("@kitpilot/array", () => ({
	findLastIndex: (array: any[], predicate: (item: any) => boolean) => {
		for (let i = array.length - 1; i >= 0; i--) {
			if (predicate(array[i])) return i
		}
		return -1
	},
}))

vi.mock("@/components/ui/hooks/useSelectedModel", () => ({
	useSelectedModel: () => ({
		provider: "anthropic",
		id: "test-model",
		info: undefined,
		isLoading: false,
		isError: false,
	}),
}))

vi.mock("@kitpilot/api", () => ({
	getModelMaxOutputTokens: () => 0,
}))

describe("TaskHeader budget meter", () => {
	const defaultProps: TaskHeaderProps = {
		task: { type: "say", ts: Date.now(), text: "Test task", images: [] },
		tokensIn: 1000,
		tokensOut: 50,
		cacheReads: 400,
		totalCost: 1.5,
		budgetWindowCost: 0.3,
		contextTokens: 200,
		buttonsDisabled: false,
		handleCondenseContext: vi.fn(),
	}

	const queryClient = new QueryClient()

	const renderTaskHeader = (props: Partial<TaskHeaderProps> = {}) => {
		return render(
			<QueryClientProvider client={queryClient}>
				<TaskHeader {...defaultProps} {...props} />
			</QueryClientProvider>,
		)
	}

	beforeEach(() => {
		mockExtensionState.allowedMaxCost = undefined
		mockExtensionState.allowedMaxCostWarningPercent = undefined
	})

	it("shows window cost against the cap when a cap is set", () => {
		mockExtensionState.allowedMaxCost = 5
		renderTaskHeader()
		expect(screen.getByText("$0.30 / $5.00")).toBeInTheDocument()
	})

	it("shows the meter even at zero cost when a cap is set", () => {
		mockExtensionState.allowedMaxCost = 5
		renderTaskHeader({ totalCost: 0, budgetWindowCost: 0 })
		expect(screen.getByText("$0.00 / $5.00")).toBeInTheDocument()
	})

	it("renders the legacy cost display when no cap is set", () => {
		renderTaskHeader()
		expect(screen.getByText("$1.50")).toBeInTheDocument()
		expect(screen.queryByText(/\/ \$/)).not.toBeInTheDocument()
	})

	it("hides cost entirely with no cap and zero cost", () => {
		renderTaskHeader({ totalCost: 0, budgetWindowCost: 0 })
		expect(screen.queryByText(/\$/)).not.toBeInTheDocument()
	})

	it("renders the BudgetProgress bar in the expanded metrics table", () => {
		mockExtensionState.allowedMaxCost = 5
		renderTaskHeader()
		fireEvent.click(screen.getByText("Test task"))
		expect(screen.getByTestId("budget-used-bar")).toBeInTheDocument()
		expect(screen.getByTestId("budget-spent")).toHaveTextContent("$0.30")
		expect(screen.getByTestId("budget-cap")).toHaveTextContent("$5.00")
	})

	it("shows the cache hit rate in the expanded cache row", () => {
		renderTaskHeader()
		fireEvent.click(screen.getByText("Test task"))
		// tokensIn=1000, cacheReads=400 → 40%
		expect(screen.getByTestId("cache-hit-rate")).toHaveTextContent("40%")
	})

	it("clamps the cache hit rate at 100%", () => {
		renderTaskHeader({ tokensIn: 100, cacheReads: 400 })
		fireEvent.click(screen.getByText("Test task"))
		expect(screen.getByTestId("cache-hit-rate")).toHaveTextContent("100%")
	})
})
