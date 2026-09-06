const assert = require("assert")
const { readConfig } = require("../src/config/parse")

const config = readConfig("port = 1234\ndebug = true\n")

assert.strictEqual(config.port, 1234)
assert.strictEqual(config.debug, true)
assert.strictEqual(config.host, "localhost")

process.stdout.write("parse checks passed\n")
