function formatDuration(ms) {
	const totalSeconds = Math.round(ms / 1000)
	const minutes = Math.floor(totalSeconds / 60)
	const seconds = totalSeconds % 60

	if (minutes === 0) {
		return `${seconds}s`
	}
	if (seconds === 0) {
		return `${minutes}m`
	}
	return `${minutes}m ${seconds}s`
}

module.exports = { formatDuration }
