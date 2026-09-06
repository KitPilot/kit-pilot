const DEFAULTS = { host: "localhost", port: 8080, debug: false }

function readConfig(text) {
	const result = { ...DEFAULTS }

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
		} else {
			result[key] = value
		}
	}

	return result
}

module.exports = { readConfig }
