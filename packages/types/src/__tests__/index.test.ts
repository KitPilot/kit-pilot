// npx vitest run src/__tests__/index.test.ts

import { GLOBAL_STATE_KEYS, SECRET_STATE_KEYS, RETIRED_SECRET_STATE_KEYS } from "../index.js"

describe("GLOBAL_STATE_KEYS", () => {
	it("should contain provider settings keys", () => {
		expect(GLOBAL_STATE_KEYS).toContain("autoApprovalEnabled")
	})

	it("should not expose retired provider settings through global state", () => {
		expect(GLOBAL_STATE_KEYS).not.toContain("anthropicBaseUrl")
	})

	it("should not contain secret state keys", () => {
		expect(GLOBAL_STATE_KEYS).not.toContain("openRouterApiKey")
	})

	it("should not expose the retired OpenAI Compatible base URL setting", () => {
		expect(GLOBAL_STATE_KEYS).not.toContain("codebaseIndexOpenAiCompatibleBaseUrl")
	})

	it("should not contain OpenAI Compatible API key (secret)", () => {
		expect(GLOBAL_STATE_KEYS).not.toContain("codebaseIndexOpenAiCompatibleApiKey")
	})

	it("should hydrate only the active Qdrant secret", () => {
		expect(SECRET_STATE_KEYS).toEqual(["codeIndexQdrantApiKey"])
		expect(RETIRED_SECRET_STATE_KEYS).toContain("openRouterApiKey")
		expect(RETIRED_SECRET_STATE_KEYS).toContain("vertexJsonCredentials")
	})
})
