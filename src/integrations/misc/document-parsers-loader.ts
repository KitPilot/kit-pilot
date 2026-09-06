import * as path from "path"
import { createRequire } from "module"

import type * as DocumentParsers from "./document-parsers"

export type DocumentParserModule = typeof DocumentParsers

let cached: Promise<DocumentParserModule> | undefined

/**
 * Loads the document parsers on demand.
 *
 * In a packaged build, `esbuild.mjs` writes the parsers to
 * `dist/document-parsers.js` and defines `process.env.KITPILOT_BUNDLED_PARSERS`.
 * The condition below is then constant, so esbuild removes the import of the
 * source module and keeps `pdf-parse`, `mammoth` and `exceljs` out of
 * `dist/extension.js`. The `require` path is computed, so esbuild cannot follow
 * it either.
 *
 * In development and in a test, the variable is not defined. The module then
 * comes from the source tree.
 */
export function loadDocumentParsers(): Promise<DocumentParserModule> {
	if (!cached) {
		cached = importDocumentParsers()
	}
	return cached
}

async function importDocumentParsers(): Promise<DocumentParserModule> {
	if (process.env.KITPILOT_BUNDLED_PARSERS === "1") {
		const requireSibling = createRequire(__filename)
		return requireSibling(path.join(__dirname, "document-parsers.js")) as DocumentParserModule
	}

	// esbuild resolves an import target before it removes a dead branch, so a
	// literal specifier here puts the parsers back into the activation bundle.
	// A variable specifier stops that. Vite keeps it as written.
	const sourceModule = "./document-parsers"
	return (await import(/* @vite-ignore */ sourceModule)) as DocumentParserModule
}

/**
 * Drops the cached module. For tests only.
 */
export function resetDocumentParsersForTest(): void {
	cached = undefined
}
