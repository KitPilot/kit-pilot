function roundCents(value) {
	return Math.round((value + Number.EPSILON) * 100) / 100
}

function addMoney(a, b) {
	return roundCents(a + b)
}

module.exports = { roundCents, addMoney }
