import { readConfig } from "../config/parse.ts"

export function describe(text: string): string {
	const config = readConfig(text)
	return `debug=${config.debug}`
}
