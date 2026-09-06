const { parseConfig } = require("../config")

function boot(text) {
	const config = parseConfig(text)
	return `listening on ${config.host}:${config.port}`
}

module.exports = { boot }
