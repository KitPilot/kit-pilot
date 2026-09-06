function formatDuration(ms) {
	const minutes = Math.floor(ms / 60000)
	return `${minutes}m`
}

module.exports = { formatDuration }
