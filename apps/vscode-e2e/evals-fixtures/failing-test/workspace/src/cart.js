const { addMoney } = require("./money")
const { taxFor } = require("./tax")

function subtotal(items) {
	return items.reduce((sum, item) => addMoney(sum, item.price * item.quantity), 0)
}

function total(items) {
	const sub = subtotal(items)
	return addMoney(sub, taxFor(sub))
}

module.exports = { subtotal, total }
