import { describe, expect, it } from "vitest"
import { matches } from "../matcher"

describe("hooks/matcher", () => {
	describe("wildcard", () => {
		it("matches everything with *", () => {
			expect(matches("*", "execute_command", {})).toBe(true)
			expect(matches("*", "any_name", { foo: "bar" })).toBe(true)
		})
	})

	describe("exact match", () => {
		it("matches by exact tool name", () => {
			expect(matches("execute_command", "execute_command", {})).toBe(true)
		})

		it("matches case-insensitively", () => {
			expect(matches("Execute_Command", "execute_command", {})).toBe(true)
			expect(matches("EXECUTE_COMMAND", "execute_command", {})).toBe(true)
		})

		it("does not match different tools", () => {
			expect(matches("read_file", "write_to_file", {})).toBe(false)
		})
	})

	describe("file-extension match", () => {
		it("matches .ts against file_path arg", () => {
			expect(matches(".ts", "write_to_file", { file_path: "src/foo.ts" })).toBe(true)
		})

		it("matches .py against path arg", () => {
			expect(matches(".py", "write_to_file", { path: "main.py" })).toBe(true)
		})

		it("does not match when no path arg present", () => {
			expect(matches(".ts", "execute_command", {})).toBe(false)
		})

		it("does not match different extension", () => {
			expect(matches(".ts", "write_to_file", { file_path: "main.py" })).toBe(false)
		})

		it("falls back to scanning values for paths when no canonical key", () => {
			expect(matches(".ts", "custom_tool", { arbitrary: "/x/y/main.ts" })).toBe(true)
		})
	})

	describe("AND composition", () => {
		it("requires both sides to match", () => {
			expect(matches("write_to_file && .ts", "write_to_file", { file_path: "a.ts" })).toBe(true)
			expect(matches("write_to_file && .ts", "write_to_file", { file_path: "a.py" })).toBe(false)
			expect(matches("write_to_file && .ts", "read_file", { file_path: "a.ts" })).toBe(false)
		})
	})

	describe("OR composition", () => {
		it("matches if either side matches", () => {
			expect(matches("read_file || write_to_file", "read_file", {})).toBe(true)
			expect(matches("read_file || write_to_file", "write_to_file", {})).toBe(true)
			expect(matches("read_file || write_to_file", "execute_command", {})).toBe(false)
		})
	})

	describe("regex match", () => {
		it("matches tool names with regex when pattern has metacharacters", () => {
			expect(matches("^read_.*", "read_file", {})).toBe(true)
			expect(matches("^read_.*", "write_to_file", {})).toBe(false)
		})
	})

	describe("empty pattern", () => {
		it("returns false on empty matcher", () => {
			expect(matches("", "anything", {})).toBe(false)
		})
	})
})
