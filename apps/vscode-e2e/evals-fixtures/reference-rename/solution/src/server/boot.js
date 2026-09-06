const { readConfig } = require("../config")

function boot(text) {
	const config = readConfig(text)
	return `listening on ${config.host}:${config.port}`
}

module.exports = { boot }
