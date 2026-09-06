import { boot } from "./server/boot.ts"
import { describe } from "./cli/main.ts"

const text = ["# example", "host = example.com", "port = 9000", "debug = true"].join("\n")

process.stdout.write(`${boot(text)}\n${describe(text)}\n`)
