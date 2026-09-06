const assert = require("assert")
const { subtotal, total } = require("../src/cart")

const cases = [
	{
		name: "subtotal keeps the exact price",
		run: () => assert.strictEqual(subtotal([{ price: 19.99, quantity: 1 }]), 19.99),
	},
	{
		name: "total adds tax",
		run: () => assert.strictEqual(total([{ price: 10.0, quantity: 1 }]), 10.83),
	},
	{
		name: "total of a larger cart",
		run: () => assert.strictEqual(total([{ price: 2.49, quantity: 7 }]), 18.87),
	},
]

let failed = 0

for (const testCase of cases) {
	try {
		testCase.run()
		process.stdout.write(`ok   ${testCase.name}\n`)
	} catch (error) {
		failed += 1
		process.stdout.write(`FAIL ${testCase.name}: ${error.message}\n`)
	}
}

process.stdout.write(`${cases.length - failed}/${cases.length} passed\n`)
process.exit(failed === 0 ? 0 : 1)
