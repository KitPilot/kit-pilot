import { ApiHandlerOptions } from "../../../shared/api" // Adjust path if needed
import { EmbedderProvider } from "./manager"

/**
 * Configuration state for the code indexing feature.
 * vscode-lm-only build: Ollama is the only supported embedder, so the config
 * surface is Ollama + Qdrant. Legacy persisted cloud-provider values are
 * tolerated at parse time and coerced to Ollama on load.
 */
export interface CodeIndexConfig {
	isConfigured: boolean
	embedderProvider: EmbedderProvider
	modelId?: string
	modelDimension?: number
	ollamaOptions?: ApiHandlerOptions
	qdrantUrl?: string
	qdrantApiKey?: string
	searchMinScore?: number
	searchMaxResults?: number
}

/**
 * Snapshot of previous configuration used to determine if a restart is required
 */
export type PreviousConfigSnapshot = {
	enabled: boolean
	configured: boolean
	embedderProvider: EmbedderProvider
	modelId?: string
	modelDimension?: number
	ollamaBaseUrl?: string
	qdrantUrl?: string
	qdrantApiKey?: string
}
