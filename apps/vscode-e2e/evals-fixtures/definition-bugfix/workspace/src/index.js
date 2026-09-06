const { buildReport } = require("./report")

const steps = [
	{ name: "install", ms: 45000 },
	{ name: "compile", ms: 90000 },
	{ name: "test", ms: 120000 },
	{ name: "package", ms: 8000 },
]

process.stdout.write(buildReport(steps))
