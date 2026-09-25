vi.mock("vscode", () => ({}))

import {
	ThinkingPartCollector,
	buildReplayParts,
	getThinkingPartText,
	getReplayModelKey,
	isAutoModel,
	isThinkingPart,
	type VsCodeLmReplayTarget,
} from "../vscode-lm-reasoning"

class ThinkingPart {
	constructor(
		public value: string | string[],
		public id?: string,
		public metadata?: Record<string, unknown>,
	) {}
}

const target: VsCodeLmReplayTarget = { modelId: "claude-sonnet", vendor: "copilot", ThinkingPart }

describe("ThinkingPartCollector", () => {
	it("merges the streamed pieces of one part by id", () => {
		const collector = new ThinkingPartCollector()
		collector.add(new ThinkingPart("Let me ", "t1"))
		collector.add(new ThinkingPart(["look at ", "the file."], "t1"))
		collector.add(new ThinkingPart("", "t1", { signature: "sig" }))
		expect(collector.result()).toEqual([
			{ id: "t1", value: "Let me look at the file.", metadata: { signature: "sig" } },
		])
	})

	it("ignores a part without an id that has no metadata", () => {
		const collector = new ThinkingPartCollector()
		collector.add(new ThinkingPart("no id"))
		expect(collector.result()).toEqual([])
	})

	it("keeps the complete reasoning that a BYOK Anthropic model streams without ids", () => {
		// The BYOK Anthropic provider streams text pieces without an id, then one
		// empty part whose metadata holds the complete reasoning and signature.
		const collector = new ThinkingPartCollector()
		collector.add(new ThinkingPart("Let me "))
		collector.add(new ThinkingPart("check."))
		collector.add(new ThinkingPart("", undefined, { signature: "sig", _completeThinking: "Let me check." }))
		collector.add(new ThinkingPart("", undefined, { redactedData: "opaque" }))

		expect(collector.result()).toEqual([
			{ value: "", metadata: { signature: "sig", _completeThinking: "Let me check." } },
			{ value: "", metadata: { redactedData: "opaque" } },
		])
	})

	it("keeps the parts in the order they arrived", () => {
		const collector = new ThinkingPartCollector()
		collector.add(new ThinkingPart("a", "t1"))
		collector.add(new ThinkingPart("b", "t2"))
		expect(collector.result().map((p) => p.id)).toEqual(["t1", "t2"])
	})

	it("stores metadata as a JSON copy and drops metadata that cannot be serialized", () => {
		const collector = new ThinkingPartCollector()
		const metadata = { encrypted_content: "blob" }
		collector.add(new ThinkingPart("", "t1", metadata))
		const circular: Record<string, unknown> = {}
		circular.self = circular
		collector.add(new ThinkingPart("x", "t2", circular))

		const [first, second] = collector.result()
		expect(first.metadata).toEqual({ encrypted_content: "blob" })
		expect(first.metadata).not.toBe(metadata)
		expect(second).toEqual({ id: "t2", value: "x" })
	})
})

describe("buildReplayParts", () => {
	const record = {
		modelId: "claude-sonnet",
		vendor: "copilot",
		parts: [{ id: "t1", value: "why", metadata: { signature: "s" } }],
	}

	it("rebuilds thinking parts for the same model", () => {
		const parts = buildReplayParts(record, target) as ThinkingPart[]
		expect(parts).toHaveLength(1)
		expect(parts[0]).toBeInstanceOf(ThinkingPart)
		expect(parts[0]).toMatchObject({ value: "why", id: "t1", metadata: { signature: "s" } })
	})

	it("rebuilds a part without an id, with its metadata", () => {
		const byok = {
			modelId: "claude-sonnet",
			vendor: "copilot",
			parts: [{ value: "", metadata: { signature: "sig", _completeThinking: "why" } }],
		}
		const [part] = buildReplayParts(byok, target) as ThinkingPart[]
		expect(part).toBeInstanceOf(ThinkingPart)
		expect(part.id).toBeUndefined()
		expect(part.metadata).toEqual({ signature: "sig", _completeThinking: "why" })
	})

	it("gives no parts for a different model or vendor", () => {
		expect(buildReplayParts({ ...record, modelId: "gpt-5" }, target)).toEqual([])
		expect(buildReplayParts({ ...record, vendor: "other" }, target)).toEqual([])
	})

	it("gives no parts when replay is off or the record is not valid", () => {
		expect(buildReplayParts(record, undefined)).toEqual([])
		expect(buildReplayParts(undefined, target)).toEqual([])
		expect(
			buildReplayParts({ modelId: "claude-sonnet", vendor: "copilot", parts: [{ value: 1 }] }, target),
		).toEqual([])
	})
})

describe("isThinkingPart", () => {
	it("identifies a thinking part by its constructor or by its shape", () => {
		expect(isThinkingPart(new ThinkingPart("x", "t1"), ThinkingPart)).toBe(true)
		expect(isThinkingPart({ value: "x", id: "t1", metadata: {} })).toBe(true)
	})

	it("does not match text, tool call, or data parts", () => {
		expect(isThinkingPart({ value: "plain text" })).toBe(false)
		expect(isThinkingPart({ callId: "c1", name: "read_file", input: {} })).toBe(false)
		expect(isThinkingPart({ mimeType: "usage", data: new Uint8Array() })).toBe(false)
		expect(isThinkingPart(undefined)).toBe(false)
	})
})

describe("getThinkingPartText", () => {
	it("gives the text of a thinking part only", () => {
		expect(getThinkingPartText(new ThinkingPart(["a", "b"], "t1"))).toBe("ab")
		expect(getThinkingPartText({ value: "plain text" })).toBeUndefined()
	})

	it("gives the complete reasoning of a BYOK part, which has an empty value", () => {
		const part = new ThinkingPart("", undefined, { signature: "sig", _completeThinking: "Full reasoning." })
		expect(getThinkingPartText(part)).toBe("Full reasoning.")
	})
})

describe("isAutoModel", () => {
	it("identifies the Copilot Auto model", () => {
		expect(isAutoModel({ id: "auto", family: "auto" })).toBe(true)
		expect(isAutoModel({ id: "claude-sonnet", family: "claude-sonnet" })).toBe(false)
	})

	it("uses the family when every model has the id auto", () => {
		// Seen on a free Copilot plan: id "auto", family names the real model.
		expect(isAutoModel({ id: "auto", family: "claude-fable-5.1" })).toBe(false)
		expect(getReplayModelKey({ id: "auto", family: "claude-fable-5.1" })).toBe("claude-fable-5.1")
		expect(isAutoModel({ id: "auto" })).toBe(true)
	})
})
