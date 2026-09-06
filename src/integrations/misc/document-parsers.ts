import fs from "fs/promises"
// @ts-ignore-next-line
import pdf from "pdf-parse/lib/pdf-parse"
import mammoth from "mammoth"

import { extractTextFromXLSX } from "./extract-text-from-xlsx"

/**
 * The document parsers, kept apart from the rest of the extension.
 *
 * `pdf-parse`, `mammoth` and `exceljs` are large. `pdf-parse` alone is
 * approximately 8 MB, because it requires its copy of `pdf.js` through a
 * computed path and esbuild therefore bundles all four versions. Only a read
 * of a PDF, DOCX or XLSX file needs them.
 *
 * `esbuild.mjs` builds this module as a second entry point. Load it through
 * `loadDocumentParsers()` in `./document-parsers-loader`. Do not import it
 * directly from code that the extension loads at activation, because a direct
 * import puts these libraries back into the activation bundle.
 *
 * The functions here return raw text. The caller adds the line numbers, which
 * keeps the output identical to the earlier in-line parsers.
 */

export async function extractTextFromPDF(filePath: string): Promise<string> {
	const dataBuffer = await fs.readFile(filePath)
	const data = await pdf(dataBuffer)
	return data.text
}

export async function extractTextFromDOCX(filePath: string): Promise<string> {
	const result = await mammoth.extractRawText({ path: filePath })
	return result.value
}

export { extractTextFromXLSX }
