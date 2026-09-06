function roundCents(value) {
	return Math.floor(value * 100) / 100
}

function addMoney(a, b) {
	return roundCents(a + b)
}

module.exports = { roundCents, addMoney }
