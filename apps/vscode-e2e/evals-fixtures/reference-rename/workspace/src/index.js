const { boot } = require("./server/boot")
const { describe } = require("./cli/main")

const text = ["# example", "host = example.com", "port = 9000", "debug = true"].join("\n")

process.stdout.write(`${boot(text)}\n${describe(text)}\n`)
