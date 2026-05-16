import { type ProviderName, type ModelInfo } from "@kit-pilot/types"

// vscode-lm-only build: no provider in this list has static model definitions
// (vscode-lm discovers models dynamically via vscode.lm.selectChatModels).
export const MODELS_BY_PROVIDER: Partial<Record<ProviderName, Record<string, ModelInfo>>> = {}

// vscode-lm-only build: dropdown shows just VS Code LM. The rest of the
// providers are gated off at the runtime layer (see buildApiHandler).
export const PROVIDERS = [{ value: "vscode-lm", label: "VS Code LM API", proxy: false }]
