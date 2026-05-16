import type { ProviderSettings, OrganizationAllowList } from "@kit-pilot/types"

export class ProfileValidator {
	public static isProfileAllowed(profile: ProviderSettings, allowList: OrganizationAllowList): boolean {
		// vscode-lm-only build: reject any profile not using the VS Code LM API
		// regardless of what the org allowlist says. Belt-and-braces against the
		// runtime guard in buildApiHandler.
		if (profile.apiProvider !== "vscode-lm") {
			return false
		}

		if (allowList.allowAll) {
			return true
		}

		if (!profile.apiProvider) {
			return false
		}

		if (!this.isProviderAllowed(profile.apiProvider, allowList)) {
			return false
		}

		const modelId = this.getModelIdFromProfile(profile)

		if (!modelId) {
			return allowList.providers[profile.apiProvider]?.allowAll === true
		}

		return this.isModelAllowed(profile.apiProvider, modelId, allowList)
	}

	private static isProviderAllowed(providerName: string, allowList: OrganizationAllowList): boolean {
		if (allowList.allowAll) {
			return true
		}

		return providerName in allowList.providers
	}

	private static isModelAllowed(providerName: string, modelId: string, allowList: OrganizationAllowList): boolean {
		if (allowList.allowAll) {
			return true
		}

		const providerAllowList = allowList.providers[providerName]

		if (!providerAllowList) {
			return false
		}

		if (providerAllowList.allowAll) {
			return true
		}

		return providerAllowList.models?.includes(modelId) ?? false
	}

	private static getModelIdFromProfile(profile: ProviderSettings): string | undefined {
		// vscode-lm-only build: the only valid profile shape carries a
		// vsCodeLmModelSelector whose id (when set) is the model id.
		return profile.vsCodeLmModelSelector?.id
	}
}
