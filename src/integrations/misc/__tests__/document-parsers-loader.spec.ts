import * as os from "os"
import * as path from "path"
import fs from "fs/promises"

import ExcelJS from "exceljs"

import { loadDocumentParsers, resetDocumentParsersForTest } from "../document-parsers-loader"
import { extractTextFromFile } from "../extract-text"

describe("loadDocumentParsers", () => {
	beforeEach(() => {
		resetDocumentParsersForTest()
	})

	it("loads the parsers from the source tree when the bundle is absent", async () => {
		const parsers = await loadDocumentParsers()

		expect(typeof parsers.extractTextFromPDF).toBe("function")
		expect(typeof parsers.extractTextFromDOCX).toBe("function")
		expect(typeof parsers.extractTextFromXLSX).toBe("function")
	})

	it("loads the module one time only", async () => {
		const first = await loadDocumentParsers()
		const second = await loadDocumentParsers()

		expect(second).toBe(first)
	})
})

describe("extractTextFromFile with a document format", () => {
	let dir: string

	beforeEach(async () => {
		resetDocumentParsersForTest()
		dir = await fs.mkdtemp(path.join(os.tmpdir(), "kitpilot-parsers-"))
	})

	afterEach(async () => {
		await fs.rm(dir, { recursive: true, force: true })
	})

	it("reads an XLSX file through the parsers that load on demand", async () => {
		const workbook = new ExcelJS.Workbook()
		const worksheet = workbook.addWorksheet("Sheet1")
		worksheet.getCell("A1").value = "Hello"
		worksheet.getCell("B1").value = "World"

		const filePath = path.join(dir, "book.xlsx")
		await workbook.xlsx.writeFile(filePath)

		const result = await extractTextFromFile(filePath)

		expect(result).toContain("--- Sheet: Sheet1 ---")
		expect(result).toContain("Hello\tWorld")
	})
})
