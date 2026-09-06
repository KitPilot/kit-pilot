const { roundCents } = require("./money")

const RATE = 0.0825

function taxFor(subtotal) {
	return roundCents(subtotal * RATE)
}

module.exports = { taxFor }
