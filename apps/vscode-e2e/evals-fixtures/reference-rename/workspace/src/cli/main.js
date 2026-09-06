const { parseConfig } = require("../config/parse")

function describe(text) {
	const config = parseConfig(text)
	return `debug=${config.debug}`
}

module.exports = { describe }
