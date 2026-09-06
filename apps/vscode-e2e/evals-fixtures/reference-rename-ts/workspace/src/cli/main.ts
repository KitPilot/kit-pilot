import { parseConfig } from "../config/parse.ts"

export function describe(text: string): string {
	const config = parseConfig(text)
	return `debug=${config.debug}`
}
