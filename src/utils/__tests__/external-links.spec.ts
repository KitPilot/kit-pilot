import * as vscode from "vscode"

import { parseExternalUri, openExternalUrl } from "../external-links"

// The shared vscode mock's Uri.parse reports scheme "file" for every input, so
// it cannot exercise scheme/authority logic. Model the real parser closely
// enough for the cases under test: RFC-3986 scheme, lowercased, with an
// authority only when the scheme is followed by "//".
vi.mock("vscode", () => {
	const parse = (value: string, strict?: boolean) => {
		const match = /^([A-Za-z][A-Za-z0-9+.\-]*):(.*)$/.exec(value)

		if (!match) {
			if (strict) {
				throw new Error(`cannot parse: ${value}`)
			}
			return { scheme: "", authority: "", path: value, toString: () => value }
		}

		const scheme = match[1].toLowerCase()
		let rest = match[2]
		let authority = ""

		if (rest.startsWith("//")) {
			rest = rest.slice(2)
			const end = rest.search(/[/?#]/)
			authority = end === -1 ? rest : rest.slice(0, end)
			rest = end === -1 ? "" : rest.slice(end)
		}

		return { scheme, authority, path: rest, toString: () => value }
	}

	return {
		Uri: { parse },
		env: { openExternal: vi.fn().mockResolvedValue(true) },
	}
})

describe("parseExternalUri", () => {
	it.each([
		["http://example.com", "http"],
		["https://example.com", "https"],
		["https://example.com/a/b?q=1#frag", "https"],
		["https://user:pw@example.com:8443/path", "https"],
	])("accepts %s", (url, scheme) => {
		const uri = parseExternalUri(url)
		expect(uri).toBeDefined()
		expect(uri!.scheme).toBe(scheme)
	})

	it("accepts uppercase schemes and normalizes them", () => {
		const uri = parseExternalUri("HTTPS://Example.com")
		expect(uri).toBeDefined()
		expect(uri!.scheme).toBe("https")
	})

	it.each([
		"file:///etc/passwd",
		"vscode://kitpilot/settings",
		"javascript:alert(1)",
		"JavaScript:alert(1)",
		"data:text/html,<script>alert(1)</script>",
		"mailto:someone@example.com",
	])("rejects disallowed scheme %s", (url) => {
		expect(parseExternalUri(url)).toBeUndefined()
	})

	it("rejects a scheme that merely starts with http", () => {
		expect(parseExternalUri("httpfoo://example.com")).toBeUndefined()
		expect(parseExternalUri("https-evil://example.com")).toBeUndefined()
	})

	it("rejects allowed schemes carrying no host", () => {
		// These parse as scheme + opaque path, not as web addresses.
		expect(parseExternalUri("https:javascript")).toBeUndefined()
		expect(parseExternalUri("https:foo")).toBeUndefined()
		expect(parseExternalUri("http:")).toBeUndefined()
	})

	it.each(["", "   ", "not a url", "://missing-scheme.com"])("rejects malformed input %j", (url) => {
		expect(parseExternalUri(url)).toBeUndefined()
	})

	it("does not throw on non-string input", () => {
		expect(() => parseExternalUri(undefined as unknown as string)).not.toThrow()
		expect(parseExternalUri(null as unknown as string)).toBeUndefined()
	})
})

describe("openExternalUrl", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("opens an allowed URL and returns true", async () => {
		await expect(openExternalUrl("https://example.com")).resolves.toBe(true)
		expect(vscode.env.openExternal).toHaveBeenCalledTimes(1)
	})

	it("passes the same Uri that was validated", async () => {
		await openExternalUrl("https://example.com/path?q=1")

		const opened = vi.mocked(vscode.env.openExternal).mock.calls[0][0] as vscode.Uri
		expect(opened.scheme).toBe("https")
		expect(opened.authority).toBe("example.com")
	})

	it("refuses a disallowed URL without opening anything", async () => {
		await expect(openExternalUrl("javascript:alert(1)")).resolves.toBe(false)
		expect(vscode.env.openExternal).not.toHaveBeenCalled()
	})

	it("refuses a hostless https URL", async () => {
		await expect(openExternalUrl("https:evil")).resolves.toBe(false)
		expect(vscode.env.openExternal).not.toHaveBeenCalled()
	})

	it("reports what the platform returned rather than assuming success", async () => {
		vi.mocked(vscode.env.openExternal).mockResolvedValueOnce(false)

		await expect(openExternalUrl("https://example.com")).resolves.toBe(false)
	})

	it("never logs the rejected URL itself", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

		await openExternalUrl("javascript:steal('sk-secret-token')")

		expect(warn).toHaveBeenCalledTimes(1)
		const logged = warn.mock.calls[0].join(" ")
		expect(logged).toContain('scheme "javascript"')
		expect(logged).not.toContain("sk-secret-token")

		warn.mockRestore()
	})

	it("describes an unparseable URL without echoing it", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

		await openExternalUrl("not a url with ?token=abc123")

		expect(warn.mock.calls[0].join(" ")).not.toContain("abc123")

		warn.mockRestore()
	})
})
