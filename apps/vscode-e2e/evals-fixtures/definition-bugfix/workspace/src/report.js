const { formatDuration } = require("./util/time")

function buildReport(steps) {
	return steps.map((step) => `${step.name}: ${formatDuration(step.ms)}`).join("\n") + "\n"
}

module.exports = { buildReport }
