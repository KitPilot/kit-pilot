import os from "os"

vi.mock("os-name", () => ({
	default: () => {
		throw new Error("PowerShell is not available")
	},
}))

import { getWorkingSection } from "../sections/working"

describe("getWorkingSection operating system fallback", () => {
	it("uses the platform and release when os-name fails", () => {
		const section = getWorkingSection({ cwd: "/repo" })
		expect(section).toContain(`Operating system: ${os.platform()} ${os.release()}.`)
	})
})
