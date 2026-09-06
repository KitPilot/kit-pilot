import { parseConfig } from "../config/index.ts"

export function boot(text: string): string {
	const config = parseConfig(text)
	return `listening on ${config.host}:${config.port}`
}
