import { render, screen, fireEvent } from "@testing-library/react"

import { MaxCostWarningPercentInput, percentFormatter } from "../MaxCostWarningPercentInput"

vi.mock("@/utils/vscode", () => ({
	vscode: { postMessage: vi.fn() },
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => (key === "settings:autoApprove.apiCostLimit.warningPercent.title" ? "Warn At" : key),
	}),
}))

describe("percentFormatter", () => {
	it("parses integers in range", () => {
		expect(percentFormatter.parse("50")).toBe(50)
		expect(percentFormatter.parse("100")).toBe(100)
		expect(percentFormatter.parse("1")).toBe(1)
	})

	it("returns undefined for empty (meaning: default)", () => {
		expect(percentFormatter.parse("")).toBeUndefined()
		expect(percentFormatter.parse("  ")).toBeUndefined()
	})

	it("rejects zero and clamps above 100", () => {
		expect(percentFormatter.parse("0")).toBeUndefined()
		expect(percentFormatter.parse("250")).toBe(100)
	})

	it("filters non-digits", () => {
		expect(percentFormatter.filter!("8a0%")).toBe("80")
	})
})

describe("MaxCostWarningPercentInput", () => {
	const onValueChange = vi.fn()

	beforeEach(() => onValueChange.mockClear())

	it("shows the default placeholder (80) when unset", () => {
		render(<MaxCostWarningPercentInput allowedMaxCostWarningPercent={undefined} onValueChange={onValueChange} />)
		expect(screen.getByPlaceholderText("80")).toHaveValue("")
	})

	it("shows the configured value", () => {
		render(<MaxCostWarningPercentInput allowedMaxCostWarningPercent={65} onValueChange={onValueChange} />)
		expect(screen.getByPlaceholderText("80")).toHaveValue("65")
	})

	it("emits parsed values on input", () => {
		render(<MaxCostWarningPercentInput allowedMaxCostWarningPercent={undefined} onValueChange={onValueChange} />)
		fireEvent.input(screen.getByPlaceholderText("80"), { target: { value: "70" } })
		expect(onValueChange).toHaveBeenCalledWith(70)
	})

	it("emits undefined when cleared", () => {
		render(<MaxCostWarningPercentInput allowedMaxCostWarningPercent={65} onValueChange={onValueChange} />)
		fireEvent.input(screen.getByPlaceholderText("80"), { target: { value: "" } })
		expect(onValueChange).toHaveBeenCalledWith(undefined)
	})
})
