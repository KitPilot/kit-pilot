export interface Config {
	host: string
	port: number
	debug: boolean
}

const DEFAULTS: Config = { host: "localhost", port: 8080, debug: false }

export function parseConfig(text: string): Config {
	const result: Config = { ...DEFAULTS }

	for (const line of text.split("\n")) {
		const trimmed = line.trim()
		if (trimmed === "" || trimmed.startsWith("#")) {
			continue
		}
		const index = trimmed.indexOf("=")
		if (index === -1) {
			continue
		}
		const key = trimmed.slice(0, index).trim()
		const value = trimmed.slice(index + 1).trim()
		if (key === "port") {
			result.port = Number(value)
		} else if (key === "debug") {
			result.debug = value === "true"
		} else if (key === "host") {
			result.host = value
		}
	}

	return result
}
