const { readConfig } = require("../config/parse")

function describe(text) {
	const config = readConfig(text)
	return `debug=${config.debug}`
}

module.exports = { describe }
