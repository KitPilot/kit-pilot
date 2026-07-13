// npx vitest src/core/config/__tests__/ProviderSettingsManager.spec.ts

import { ExtensionContext } from "vscode"

import type { ProviderSettings } from "@kit-pilot/types"

import { ProviderSettingsManager, ProviderProfiles } from "../ProviderSettingsManager"

// Mock VSCode ExtensionContext
const mockSecrets = {
	get: vi.fn(),
	store: vi.fn(),
	delete: vi.fn(),
}

const mockGlobalState = {
	get: vi.fn(),
	update: vi.fn(),
}

const mockContext = {
	secrets: mockSecrets,
	globalState: mockGlobalState,
} as unknown as ExtensionContext

describe("ProviderSettingsManager", () => {
	let providerSettingsManager: ProviderSettingsManager

	beforeEach(() => {
		vi.clearAllMocks()
		// Reset all mock implementations to default successful behavior
		mockSecrets.get.mockResolvedValue(null)
		mockSecrets.store.mockResolvedValue(undefined)
		mockSecrets.delete.mockResolvedValue(undefined)
		mockGlobalState.get.mockReturnValue(undefined)
		mockGlobalState.update.mockResolvedValue(undefined)

		providerSettingsManager = new ProviderSettingsManager(mockContext)
	})

	describe("initialize", () => {
		it("should not write to storage when secrets.get returns null", async () => {
			// Mock readConfig to return null
			mockSecrets.get.mockResolvedValueOnce(null)

			await providerSettingsManager.initialize()

			// Should not write to storage because readConfig returns defaultConfig
			expect(mockSecrets.store).not.toHaveBeenCalled()
		})

		it("should not initialize config if it exists and migrations are complete", async () => {
			mockSecrets.get.mockResolvedValue(
				JSON.stringify({
					currentApiConfigName: "default",
					apiConfigs: {
						default: {
							apiProvider: "vscode-lm",
							id: "default",
						},
					},
					modeApiConfigs: {},
					migrations: {
						rateLimitSecondsMigrated: true,
						openAiHeadersMigrated: true,
						consecutiveMistakeLimitMigrated: true,
						todoListEnabledMigrated: true,
						claudeCodeLegacySettingsMigrated: true,
					},
				}),
			)

			await providerSettingsManager.initialize()

			expect(mockSecrets.store).not.toHaveBeenCalled()
		})

		it("should generate IDs for configs that lack them", async () => {
			// Mock a config with missing IDs
			mockSecrets.get.mockResolvedValue(
				JSON.stringify({
					currentApiConfigName: "default",
					apiConfigs: {
						default: {
							config: {},
						},
						test: {
							apiProvider: "anthropic",
						},
					},
					migrations: {
						rateLimitSecondsMigrated: true,
					},
				}),
			)

			await providerSettingsManager.initialize()

			// Should have written the config with new IDs
			expect(mockSecrets.store).toHaveBeenCalled()
			const calls = mockSecrets.store.mock.calls
			const storedConfig = JSON.parse(calls[calls.length - 1][1]) // Get the latest call
			expect(storedConfig.apiConfigs.default.id).toBeTruthy()
			expect(storedConfig.apiConfigs.test.id).toBeTruthy()
		})

		it("should call migrateRateLimitSeconds if it has not done so already", async () => {
			mockGlobalState.get.mockResolvedValue(42)

			mockSecrets.get.mockResolvedValue(
				JSON.stringify({
					currentApiConfigName: "default",
					apiConfigs: {
						default: {
							config: {},
							id: "default",
							rateLimitSeconds: undefined,
						},
						test: {
							apiProvider: "anthropic",
							rateLimitSeconds: undefined,
						},
						existing: {
							apiProvider: "anthropic",
							// this should not really be possible, unless someone has loaded a hand edited config,
							// but we don't overwrite so we'll check that
							rateLimitSeconds: 43,
						},
					},
					migrations: {
						rateLimitSecondsMigrated: false,
					},
				}),
			)

			await providerSettingsManager.initialize()

			// Get the last call to store, which should contain the migrated config
			const calls = mockSecrets.store.mock.calls
			const storedConfig = JSON.parse(calls[calls.length - 1][1])
			expect(storedConfig.apiConfigs.default.rateLimitSeconds).toEqual(42)
			expect(storedConfig.apiConfigs.test.rateLimitSeconds).toEqual(42)
			expect(storedConfig.apiConfigs.existing.rateLimitSeconds).toEqual(43)
		})

		it("should call migrateConsecutiveMistakeLimit if it has not done so already", async () => {
			mockSecrets.get.mockResolvedValue(
				JSON.stringify({
					currentApiConfigName: "default",
					apiConfigs: {
						default: {
							config: {},
							id: "default",
							consecutiveMistakeLimit: undefined,
						},
						test: {
							apiProvider: "anthropic",
							consecutiveMistakeLimit: undefined,
						},
						existing: {
							apiProvider: "anthropic",
							// this should not really be possible, unless someone has loaded a hand edited config,
							// but we don't overwrite so we'll check that
							consecutiveMistakeLimit: 5,
						},
					},
					migrations: {
						rateLimitSecondsMigrated: true,
						openAiHeadersMigrated: true,
						consecutiveMistakeLimitMigrated: false,
					},
				}),
			)

			await providerSettingsManager.initialize()

			// Get the last call to store, which should contain the migrated config
			const calls = mockSecrets.store.mock.calls
			const storedConfig = JSON.parse(calls[calls.length - 1][1])
			expect(storedConfig.apiConfigs.default.consecutiveMistakeLimit).toEqual(3)
			expect(storedConfig.apiConfigs.test.consecutiveMistakeLimit).toEqual(3)
			expect(storedConfig.apiConfigs.existing.consecutiveMistakeLimit).toEqual(5)
			expect(storedConfig.migrations.consecutiveMistakeLimitMigrated).toEqual(true)
		})

		it("should call migrateTodoListEnabled if it has not done so already", async () => {
			mockSecrets.get.mockResolvedValue(
				JSON.stringify({
					currentApiConfigName: "default",
					apiConfigs: {
						default: {
							config: {},
							id: "default",
							todoListEnabled: undefined,
						},
						test: {
							apiProvider: "anthropic",
							todoListEnabled: undefined,
						},
						existing: {
							apiProvider: "anthropic",
							// this should not really be possible, unless someone has loaded a hand edited config,
							// but we don't overwrite so we'll check that
							todoListEnabled: false,
						},
					},
					migrations: {
						rateLimitSecondsMigrated: true,
						openAiHeadersMigrated: true,
						consecutiveMistakeLimitMigrated: true,
						todoListEnabledMigrated: false,
					},
				}),
			)

			await providerSettingsManager.initialize()

			// Get the last call to store, which should contain the migrated config
			const calls = mockSecrets.store.mock.calls
			const storedConfig = JSON.parse(calls[calls.length - 1][1])
			expect(storedConfig.apiConfigs.default.todoListEnabled).toEqual(true)
			expect(storedConfig.apiConfigs.test.todoListEnabled).toEqual(true)
			expect(storedConfig.apiConfigs.existing.todoListEnabled).toEqual(false)
			expect(storedConfig.migrations.todoListEnabledMigrated).toEqual(true)
		})

		it("should throw error if secrets storage fails", async () => {
			mockSecrets.get.mockRejectedValue(new Error("Storage failed"))

			await expect(providerSettingsManager.initialize()).rejects.toThrow(
				"Failed to initialize config: Error: Failed to read provider profiles from secrets: Error: Storage failed",
			)
		})
	})

	describe("ListConfig", () => {
		it("uses vscode-lm for the fresh-install default profile", async () => {
			mockSecrets.get.mockResolvedValue(null)

			const configs = await providerSettingsManager.listConfig()

			expect(configs).toEqual([
				{
					name: "default",
					id: expect.any(String),
					apiProvider: "vscode-lm",
					modelId: undefined,
				},
			])
		})

		it("should list all available configs", async () => {
			const existingConfig: ProviderProfiles = {
				currentApiConfigName: "default",
				apiConfigs: {
					default: {
						id: "default",
					},
					test: {
						apiProvider: "anthropic",
						id: "test-id",
					},
				},
				modeApiConfigs: {
					code: "default",
					architect: "default",
					ask: "default",
				},
				migrations: {
					rateLimitSecondsMigrated: false,
				},
			}

			mockSecrets.get.mockResolvedValue(JSON.stringify(existingConfig))

			const configs = await providerSettingsManager.listConfig()
			expect(configs).toEqual([
				{ name: "default", id: "default", apiProvider: "vscode-lm", modelId: undefined },
				{ name: "test", id: "test-id", apiProvider: "vscode-lm", modelId: undefined },
			])
		})

		it("should handle empty config file", async () => {
			const emptyConfig: ProviderProfiles = {
				currentApiConfigName: "default",
				apiConfigs: {},
				modeApiConfigs: {
					code: "default",
					architect: "default",
					ask: "default",
				},
				migrations: {
					rateLimitSecondsMigrated: false,
				},
			}

			mockSecrets.get.mockResolvedValue(JSON.stringify(emptyConfig))

			const configs = await providerSettingsManager.listConfig()
			expect(configs).toEqual([])
		})

		it("should throw error if reading from secrets fails", async () => {
			mockSecrets.get.mockRejectedValue(new Error("Read failed"))

			await expect(providerSettingsManager.listConfig()).rejects.toThrow(
				"Failed to list configs: Error: Failed to read provider profiles from secrets: Error: Read failed",
			)
		})
	})

	describe("SaveConfig", () => {
		it("should normalize a new retired-provider config to vscode-lm", async () => {
			mockSecrets.get.mockResolvedValue(
				JSON.stringify({
					currentApiConfigName: "default",
					apiConfigs: {
						default: {},
					},
					modeApiConfigs: {
						code: "default",
						architect: "default",
						ask: "default",
					},
				}),
			)

			const newConfig: ProviderSettings = {
				apiProvider: "vertex",
				apiModelId: "gemini-2.5-flash-preview-05-20",
				vertexKeyFile: "test-key-file",
			}

			await providerSettingsManager.saveConfig("test", newConfig)

			// Get the actual stored config to check the generated ID
			const storedConfig = JSON.parse(mockSecrets.store.mock.calls[0][1])
			const testConfigId = storedConfig.apiConfigs.test.id

			const expectedConfig = {
				currentApiConfigName: "default",
				apiConfigs: {
					default: { apiProvider: "vscode-lm" },
					test: {
						apiProvider: "vscode-lm",
						id: testConfigId,
					},
				},
				modeApiConfigs: {
					code: "default",
					architect: "default",
					ask: "default",
				},
			}

			expect(mockSecrets.store.mock.calls[0][0]).toEqual("kitpilot_config_api_config")
			expect(storedConfig).toEqual(expectedConfig)
		})

		it("should only save provider relevant settings", async () => {
			mockSecrets.get.mockResolvedValue(
				JSON.stringify({
					currentApiConfigName: "default",
					apiConfigs: {
						default: {},
					},
					modeApiConfigs: {
						code: "default",
						architect: "default",
						ask: "default",
					},
				}),
			)

			// Active provider (vscode-lm): settings from other providers are stripped.
			const newConfig: ProviderSettings = {
				apiProvider: "vscode-lm",
				vsCodeLmModelSelector: { vendor: "copilot", family: "claude-sonnet-4" },
			}
			const newConfigWithExtra: ProviderSettings = {
				...newConfig,
				openRouterApiKey: "another-key",
			}

			await providerSettingsManager.saveConfig("test", newConfigWithExtra)

			// Get the actual stored config to check the generated ID
			const storedConfig = JSON.parse(mockSecrets.store.mock.calls[mockSecrets.store.mock.calls.length - 1][1])
			const testConfigId = storedConfig.apiConfigs.test.id

			const expectedConfig = {
				currentApiConfigName: "default",
				apiConfigs: {
					default: { apiProvider: "vscode-lm" },
					test: {
						...newConfig,
						id: testConfigId,
					},
				},
				modeApiConfigs: {
					code: "default",
					architect: "default",
					ask: "default",
				},
			}

			expect(mockSecrets.store.mock.calls[0][0]).toEqual("kitpilot_config_api_config")
			expect(storedConfig).toEqual(expectedConfig)
		})

		it("should purge provider fields when saving a retired-provider profile", async () => {
			mockSecrets.get.mockResolvedValue(
				JSON.stringify({
					currentApiConfigName: "default",
					apiConfigs: { default: {} },
				}),
			)

			const legacyConfig: ProviderSettings = {
				apiProvider: "anthropic",
				apiKey: "test-key",
				openRouterApiKey: "another-key",
			}

			await providerSettingsManager.saveConfig("legacy", legacyConfig)

			const storedConfig = JSON.parse(mockSecrets.store.mock.calls[mockSecrets.store.mock.calls.length - 1][1])
			expect(storedConfig.apiConfigs.legacy).toEqual({
				apiProvider: "vscode-lm",
				id: storedConfig.apiConfigs.legacy.id,
			})
		})

		it("should update existing config", async () => {
			const existingConfig: ProviderProfiles = {
				currentApiConfigName: "default",
				apiConfigs: {
					test: {
						apiProvider: "anthropic",
						apiKey: "old-key",
						id: "test-id",
					},
				},
				migrations: {
					rateLimitSecondsMigrated: false,
				},
			}

			mockSecrets.get.mockResolvedValue(JSON.stringify(existingConfig))

			const updatedConfig: ProviderSettings = {
				apiProvider: "anthropic",
				apiKey: "new-key",
			}

			await providerSettingsManager.saveConfig("test", updatedConfig)

			const expectedConfig = {
				currentApiConfigName: "default",
				apiConfigs: {
					test: {
						apiProvider: "vscode-lm",
						id: "test-id",
					},
				},
				migrations: {
					rateLimitSecondsMigrated: false,
				},
			}

			const storedConfig = JSON.parse(mockSecrets.store.mock.calls[mockSecrets.store.mock.calls.length - 1][1])
			expect(mockSecrets.store.mock.calls[mockSecrets.store.mock.calls.length - 1][0]).toEqual(
				"kitpilot_config_api_config",
			)
			expect(storedConfig).toEqual(expectedConfig)
		})

		it("should throw error if secrets storage fails", async () => {
			mockSecrets.get.mockResolvedValue(
				JSON.stringify({
					currentApiConfigName: "default",
					apiConfigs: { default: {} },
					migrations: {
						rateLimitSecondsMigrated: true,
						openAiHeadersMigrated: true,
					},
				}),
			)
			mockSecrets.store.mockRejectedValue(new Error("Storage failed"))

			await expect(providerSettingsManager.saveConfig("test", {})).rejects.toThrow(
				"Failed to save config: Error: Failed to write provider profiles to secrets: Error: Storage failed",
			)
		})

		it("should strip credentials and endpoints when saving retired provider profiles", async () => {
			mockSecrets.get.mockResolvedValue(
				JSON.stringify({
					currentApiConfigName: "default",
					apiConfigs: {
						default: {},
					},
					modeApiConfigs: {
						code: "default",
						architect: "default",
						ask: "default",
					},
				}),
			)

			const retiredConfig = {
				apiProvider: "groq",
				apiKey: "legacy-key",
				apiModelId: "legacy-model",
				openAiBaseUrl: "https://legacy.example/v1",
				openAiApiKey: "legacy-openai-key",
				modelMaxTokens: 4096,
				groqApiKey: "legacy-groq-specific-key",
			} as ProviderSettings

			await providerSettingsManager.saveConfig("retired", retiredConfig)

			const storedConfig = JSON.parse(mockSecrets.store.mock.calls[mockSecrets.store.mock.calls.length - 1][1])
			expect(storedConfig.apiConfigs.retired).toEqual({
				apiProvider: "vscode-lm",
				modelMaxTokens: 4096,
				id: storedConfig.apiConfigs.retired.id,
			})
		})
	})

	describe("DeleteConfig", () => {
		it("should delete existing config", async () => {
			const existingConfig: ProviderProfiles = {
				currentApiConfigName: "default",
				apiConfigs: {
					default: {
						id: "default",
					},
					test: {
						apiProvider: "anthropic",
						id: "test-id",
					},
				},
				migrations: {
					rateLimitSecondsMigrated: false,
				},
			}

			mockSecrets.get.mockResolvedValue(JSON.stringify(existingConfig))

			await providerSettingsManager.deleteConfig("test")

			// Get the stored config to check the ID
			const storedConfig = JSON.parse(mockSecrets.store.mock.calls[0][1])
			expect(storedConfig.currentApiConfigName).toBe("default")
			expect(Object.keys(storedConfig.apiConfigs)).toEqual(["default"])
			expect(storedConfig.apiConfigs.default.id).toBeTruthy()
		})

		it("should throw error when trying to delete non-existent config", async () => {
			mockSecrets.get.mockResolvedValue(
				JSON.stringify({
					currentApiConfigName: "default",
					apiConfigs: { default: {} },
				}),
			)

			await expect(providerSettingsManager.deleteConfig("nonexistent")).rejects.toThrow(
				"Config 'nonexistent' not found",
			)
		})

		it("should throw error when trying to delete last remaining config", async () => {
			mockSecrets.get.mockResolvedValue(
				JSON.stringify({
					currentApiConfigName: "default",
					apiConfigs: {
						default: {
							id: "default",
						},
					},
				}),
			)

			await expect(providerSettingsManager.deleteConfig("default")).rejects.toThrow(
				"Failed to delete config: Error: Cannot delete the last remaining configuration",
			)
		})
	})

	describe("LoadConfig", () => {
		it("normalizes retired KitPilot Router configs", async () => {
			const existingConfig = {
				currentApiConfigName: "default",
				apiConfigs: {
					default: {
						apiProvider: "kitpilot",
						apiModelId: "xai/grok-code-fast-1",
						kitpilotApiKey: "legacy-key",
						id: "default-id",
					},
				},
				migrations: {
					rateLimitSecondsMigrated: true,
					openAiHeadersMigrated: true,
					consecutiveMistakeLimitMigrated: true,
					todoListEnabledMigrated: true,
					claudeCodeLegacySettingsMigrated: true,
				},
			}

			mockSecrets.get.mockResolvedValue(JSON.stringify(existingConfig))

			const { name, ...providerSettings } = await providerSettingsManager.getProfile({ name: "default" })

			expect(name).toBe("default")
			expect(providerSettings).toEqual({ apiProvider: "vscode-lm", id: "default-id" })
		})

		it("should load config and update current config name", async () => {
			const existingConfig: ProviderProfiles = {
				currentApiConfigName: "default",
				apiConfigs: {
					test: {
						apiProvider: "anthropic",
						apiKey: "test-key",
						id: "test-id",
					},
				},
				migrations: {
					rateLimitSecondsMigrated: false,
				},
			}

			mockGlobalState.get.mockResolvedValue(42)
			mockSecrets.get.mockResolvedValue(JSON.stringify(existingConfig))

			const { name, ...providerSettings } = await providerSettingsManager.activateProfile({ name: "test" })

			expect(name).toBe("test")
			expect(providerSettings).toEqual({ apiProvider: "vscode-lm", id: "test-id" })

			// Get the stored config to check the structure.
			const calls = mockSecrets.store.mock.calls
			const storedConfig = JSON.parse(calls[calls.length - 1][1])
			expect(storedConfig.currentApiConfigName).toBe("test")

			expect(storedConfig.apiConfigs.test).toEqual({
				apiProvider: "vscode-lm",
				id: "test-id",
			})
		})

		it("should throw error when config does not exist", async () => {
			mockSecrets.get.mockResolvedValue(
				JSON.stringify({
					currentApiConfigName: "default",
					apiConfigs: { default: { config: {}, id: "default" } },
				}),
			)

			await expect(providerSettingsManager.activateProfile({ name: "nonexistent" })).rejects.toThrow(
				"Config with name 'nonexistent' not found",
			)
		})

		it("should throw error if secrets storage fails", async () => {
			mockSecrets.get.mockResolvedValue(
				JSON.stringify({
					currentApiConfigName: "default",
					apiConfigs: { test: { apiProvider: "anthropic", id: "test-id" } },
					migrations: {
						rateLimitSecondsMigrated: true,
						openAiHeadersMigrated: true,
					},
				}),
			)
			mockSecrets.store.mockRejectedValue(new Error("Storage failed"))

			await expect(providerSettingsManager.activateProfile({ name: "test" })).rejects.toThrow(
				"Failed to activate profile: Failed to write provider profiles to secrets: Error: Storage failed",
			)
		})

		it("should normalize both retired and unknown providers to vscode-lm", async () => {
			// This tests the fix for the infinite loop issue when a provider is removed
			const configWithUnknownProvider = {
				currentApiConfigName: "valid",
				apiConfigs: {
					valid: {
						apiProvider: "anthropic",
						apiKey: "valid-key",
						apiModelId: "claude-3-opus-20240229",
						id: "valid-id",
					},
					unknownProvider: {
						// Provider value that is neither active nor retired.
						id: "removed-id",
						apiProvider: "invalid-removed-provider",
						apiKey: "some-key",
						apiModelId: "some-model",
					},
				},
				migrations: {
					rateLimitSecondsMigrated: true,
					openAiHeadersMigrated: true,
					consecutiveMistakeLimitMigrated: true,
					todoListEnabledMigrated: true,
				},
			}

			mockSecrets.get.mockResolvedValue(JSON.stringify(configWithUnknownProvider))

			await providerSettingsManager.initialize()

			const storeCalls = mockSecrets.store.mock.calls
			expect(storeCalls.length).toBeGreaterThan(0)
			const finalStoredConfigJson = storeCalls[storeCalls.length - 1][1]

			const storedConfig = JSON.parse(finalStoredConfigJson)
			// Both profiles are retained, but their providers and credentials are normalized.
			expect(storedConfig.apiConfigs.valid).toBeDefined()
			expect(storedConfig.apiConfigs.valid.apiProvider).toBe("vscode-lm")
			expect(storedConfig.apiConfigs.valid.apiKey).toBeUndefined()

			expect(storedConfig.apiConfigs.unknownProvider).toBeDefined()
			expect(storedConfig.apiConfigs.unknownProvider.apiProvider).toBe("vscode-lm")
			expect(storedConfig.apiConfigs.unknownProvider.apiKey).toBeUndefined()
			expect(storedConfig.apiConfigs.unknownProvider.id).toBe("removed-id")
		})

		it("should purge retired provider fields during initialize", async () => {
			const configWithRetiredProvider = {
				currentApiConfigName: "retiredProvider",
				apiConfigs: {
					retiredProvider: {
						id: "retired-id",
						apiProvider: "groq",
						apiKey: "legacy-key",
						apiModelId: "legacy-model",
						openAiBaseUrl: "https://legacy.example/v1",
						modelMaxTokens: 1024,
						// Legacy provider-specific field no longer in schema
						groqApiKey: "legacy-groq-key",
					},
				},
				migrations: {
					rateLimitSecondsMigrated: false,
					openAiHeadersMigrated: true,
					consecutiveMistakeLimitMigrated: true,
					todoListEnabledMigrated: true,
					claudeCodeLegacySettingsMigrated: true,
				},
			}

			mockGlobalState.get.mockResolvedValue(0)
			mockSecrets.get.mockResolvedValue(JSON.stringify(configWithRetiredProvider))

			await providerSettingsManager.initialize()

			const storeCalls = mockSecrets.store.mock.calls
			expect(storeCalls.length).toBeGreaterThan(0)
			const finalStoredConfigJson = storeCalls[storeCalls.length - 1][1]
			const storedConfig = JSON.parse(finalStoredConfigJson)

			expect(storedConfig.apiConfigs.retiredProvider).toBeDefined()
			expect(storedConfig.apiConfigs.retiredProvider).toEqual({
				apiProvider: "vscode-lm",
				id: "retired-id",
				modelMaxTokens: 1024,
				rateLimitSeconds: 0,
			})
		})

		it("should sanitize invalid providers and remove non-object profiles during load", async () => {
			const invalidConfig = {
				currentApiConfigName: "valid",
				apiConfigs: {
					valid: {
						apiProvider: "anthropic",
						apiKey: "valid-key",
						apiModelId: "claude-3-opus-20240229",
						rateLimitSeconds: 0,
					},
					invalidProvider: {
						// Invalid API provider - should be sanitized (kept but apiProvider reset to undefined)
						id: "x.ai",
						apiProvider: "x.ai",
					},
					// Incorrect type - should be completely removed
					anotherInvalid: "not an object",
				},
				migrations: {
					rateLimitSecondsMigrated: true,
				},
			}

			mockSecrets.get.mockResolvedValue(JSON.stringify(invalidConfig))

			await providerSettingsManager.initialize()

			const storeCalls = mockSecrets.store.mock.calls
			expect(storeCalls.length).toBeGreaterThan(0) // Ensure store was called at least once.
			const finalStoredConfigJson = storeCalls[storeCalls.length - 1][1]

			const storedConfig = JSON.parse(finalStoredConfigJson)
			// Object profiles are retained and normalized to the only provider.
			expect(storedConfig.apiConfigs.valid).toBeDefined()
			expect(storedConfig.apiConfigs.valid.apiProvider).toBe("vscode-lm")
			expect(storedConfig.apiConfigs.valid.apiKey).toBeUndefined()

			expect(storedConfig.apiConfigs.invalidProvider).toBeDefined()
			expect(storedConfig.apiConfigs.invalidProvider.apiProvider).toBe("vscode-lm")
			expect(storedConfig.apiConfigs.invalidProvider.id).toBe("x.ai")

			// Non-object config should be completely removed
			expect(storedConfig.apiConfigs.anotherInvalid).toBeUndefined()

			expect(Object.keys(storedConfig.apiConfigs)).toEqual(["valid", "invalidProvider"])
			expect(storedConfig.currentApiConfigName).toBe("valid")
		})
	})

	describe("Export", () => {
		it("should export retired profiles without retired credentials or endpoints", async () => {
			const existingConfig: ProviderProfiles = {
				currentApiConfigName: "retired",
				apiConfigs: {
					retired: {
						id: "retired-id",
						apiProvider: "groq",
						apiKey: "legacy-key",
						apiModelId: "legacy-model",
						openAiBaseUrl: "https://legacy.example/v1",
						modelMaxTokens: 4096,
						modelMaxThinkingTokens: 2048,
					},
				},
			}

			mockSecrets.get.mockResolvedValue(JSON.stringify(existingConfig))

			const exported = await providerSettingsManager.export()

			expect(exported.apiConfigs.retired.apiProvider).toBe("vscode-lm")
			expect(exported.apiConfigs.retired.apiKey).toBeUndefined()
			expect(exported.apiConfigs.retired.apiModelId).toBeUndefined()
			expect(exported.apiConfigs.retired.openAiBaseUrl).toBeUndefined()
			expect(exported.apiConfigs.retired.modelMaxTokens).toBe(4096)
			expect(exported.apiConfigs.retired.modelMaxThinkingTokens).toBe(2048)
		})
	})

	describe("ResetAllConfigs", () => {
		it("should delete all stored configs", async () => {
			// Setup initial config
			mockSecrets.get.mockResolvedValue(
				JSON.stringify({
					currentApiConfigName: "test",
					apiConfigs: { test: { apiProvider: "anthropic", id: "test-id" } },
				}),
			)

			await providerSettingsManager.resetAllConfigs()

			// Should have called delete with the correct config key
			expect(mockSecrets.delete).toHaveBeenCalledWith("kitpilot_config_api_config")
		})
	})

	describe("HasConfig", () => {
		it("should return true for existing config", async () => {
			const existingConfig: ProviderProfiles = {
				currentApiConfigName: "default",
				apiConfigs: { default: { id: "default" }, test: { apiProvider: "anthropic", id: "test-id" } },
				migrations: { rateLimitSecondsMigrated: false },
			}

			mockSecrets.get.mockResolvedValue(JSON.stringify(existingConfig))

			const hasConfig = await providerSettingsManager.hasConfig("test")
			expect(hasConfig).toBe(true)
		})

		it("should return false for non-existent config", async () => {
			mockSecrets.get.mockResolvedValue(
				JSON.stringify({ currentApiConfigName: "default", apiConfigs: { default: {} } }),
			)

			const hasConfig = await providerSettingsManager.hasConfig("nonexistent")
			expect(hasConfig).toBe(false)
		})

		it("should throw error if secrets storage fails", async () => {
			mockSecrets.get.mockRejectedValue(new Error("Storage failed"))

			await expect(providerSettingsManager.hasConfig("test")).rejects.toThrow(
				"Failed to check config existence: Error: Failed to read provider profiles from secrets: Error: Storage failed",
			)
		})
	})
})
