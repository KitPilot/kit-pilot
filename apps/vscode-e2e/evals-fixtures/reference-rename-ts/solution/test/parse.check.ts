import assert from "node:assert"
import { readConfig } from "../src/config/parse.ts"

const config = readConfig("port = 1234\ndebug = true\n")

assert.strictEqual(config.port, 1234)
assert.strictEqual(config.debug, true)
assert.strictEqual(config.host, "localhost")

process.stdout.write("parse checks passed\n")
