import { readConfig } from "../config/index.ts"

export function boot(text: string): string {
	const config = readConfig(text)
	return `listening on ${config.host}:${config.port}`
}
