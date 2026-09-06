import assert from "node:assert"
import { parseConfig } from "../src/config/parse.ts"

const config = parseConfig("port = 1234\ndebug = true\n")

assert.strictEqual(config.port, 1234)
assert.strictEqual(config.debug, true)
assert.strictEqual(config.host, "localhost")

process.stdout.write("parse checks passed\n")
