import * as vscode from "vscode"
import { Ignore } from "ignore"

import type { EmbedderProvider } from "@kit-pilot/types"

import { t } from "../../i18n"

import { getDefaultModelId, getModelDimension } from "../../shared/embeddingModels"
import { Package } from "../../shared/package"

import { RooIgnoreController } from "../../core/ignore/RooIgnoreController"

import { CodeIndexOllamaEmbedder } from "./embedders/ollama"
import { QdrantVectorStore } from "./vector-store/qdrant-client"
import { codeParser, DirectoryScanner, FileWatcher } from "./processors"
import { ICodeParser, IEmbedder, IFileWatcher, IVectorStore } from "./interfaces"
import { CodeIndexConfigManager } from "./config-manager"
import { CacheManager } from "./cache-manager"
import { BATCH_SEGMENT_THRESHOLD } from "./constants"

/**
 * Factory class responsible for creating and configuring code indexing service dependencies.
 */
export class CodeIndexServiceFactory {
	constructor(
		private readonly configManager: CodeIndexConfigManager,
		private readonly workspacePath: string,
		private readonly cacheManager: CacheManager,
	) {}

	/**
	 * Creates an embedder instance based on the current configuration.
	 */
	public createEmbedder(): IEmbedder {
		// vscode-lm-only build: Ollama is the only supported embedder. Cloud
		// embedders (OpenAI, Bedrock, Gemini, etc.) were removed because they
		// require their own API keys outside the Copilot-only scope.
		const config = this.configManager.getConfig()
		const provider = config.embedderProvider as EmbedderProvider

		if (provider !== "ollama") {
			throw new Error(
				t("embeddings:serviceFactory.invalidEmbedderType", { embedderProvider: config.embedderProvider }),
			)
		}

		if (!config.ollamaOptions?.ollamaBaseUrl) {
			throw new Error(t("embeddings:serviceFactory.ollamaConfigMissing"))
		}

		return new CodeIndexOllamaEmbedder({
			...config.ollamaOptions,
			ollamaModelId: config.modelId,
		})
	}

	/**
	 * Validates an embedder instance to ensure it's properly configured.
	 * @param embedder The embedder instance to validate
	 * @returns Promise resolving to validation result
	 */
	public async validateEmbedder(embedder: IEmbedder): Promise<{ valid: boolean; error?: string }> {
		try {
			return await embedder.validateConfiguration()
		} catch (error) {
			// If validation throws an exception, preserve the original error message
			return {
				valid: false,
				error: error instanceof Error ? error.message : "embeddings:validation.configurationError",
			}
		}
	}

	/**
	 * Creates a vector store instance using the current configuration.
	 */
	public createVectorStore(): IVectorStore {
		const config = this.configManager.getConfig()

		const provider = config.embedderProvider as EmbedderProvider
		const defaultModel = getDefaultModelId(provider)
		// Use the embedding model ID from config, not the chat model IDs
		const modelId = config.modelId ?? defaultModel

		let vectorSize: number | undefined

		// First try to get the model-specific dimension from profiles
		vectorSize = getModelDimension(provider, modelId)

		// Only use manual dimension if model doesn't have a built-in dimension
		if (!vectorSize && config.modelDimension && config.modelDimension > 0) {
			vectorSize = config.modelDimension
		}

		if (vectorSize === undefined || vectorSize <= 0) {
			throw new Error(t("embeddings:serviceFactory.vectorDimensionNotDetermined", { modelId, provider }))
		}

		if (!config.qdrantUrl) {
			throw new Error(t("embeddings:serviceFactory.qdrantUrlMissing"))
		}

		// Assuming constructor is updated: new QdrantVectorStore(workspacePath, url, vectorSize, apiKey?)
		return new QdrantVectorStore(this.workspacePath, config.qdrantUrl, vectorSize, config.qdrantApiKey)
	}

	/**
	 * Creates a directory scanner instance with its required dependencies.
	 */
	public createDirectoryScanner(
		embedder: IEmbedder,
		vectorStore: IVectorStore,
		parser: ICodeParser,
		ignoreInstance: Ignore,
	): DirectoryScanner {
		// Get the configurable batch size from VSCode settings
		let batchSize: number
		try {
			batchSize = vscode.workspace
				.getConfiguration(Package.name)
				.get<number>("codeIndex.embeddingBatchSize", BATCH_SEGMENT_THRESHOLD)
		} catch {
			// In test environment, vscode.workspace might not be available
			batchSize = BATCH_SEGMENT_THRESHOLD
		}
		return new DirectoryScanner(embedder, vectorStore, parser, this.cacheManager, ignoreInstance, batchSize)
	}

	/**
	 * Creates a file watcher instance with its required dependencies.
	 */
	public createFileWatcher(
		context: vscode.ExtensionContext,
		embedder: IEmbedder,
		vectorStore: IVectorStore,
		cacheManager: CacheManager,
		ignoreInstance: Ignore,
		rooIgnoreController?: RooIgnoreController,
	): IFileWatcher {
		// Get the configurable batch size from VSCode settings
		let batchSize: number
		try {
			batchSize = vscode.workspace
				.getConfiguration(Package.name)
				.get<number>("codeIndex.embeddingBatchSize", BATCH_SEGMENT_THRESHOLD)
		} catch {
			// In test environment, vscode.workspace might not be available
			batchSize = BATCH_SEGMENT_THRESHOLD
		}
		return new FileWatcher(
			this.workspacePath,
			context,
			cacheManager,
			embedder,
			vectorStore,
			ignoreInstance,
			rooIgnoreController,
			batchSize,
		)
	}

	/**
	 * Creates all required service dependencies if the service is properly configured.
	 * @throws Error if the service is not properly configured
	 */
	public createServices(
		context: vscode.ExtensionContext,
		cacheManager: CacheManager,
		ignoreInstance: Ignore,
		rooIgnoreController?: RooIgnoreController,
	): {
		embedder: IEmbedder
		vectorStore: IVectorStore
		parser: ICodeParser
		scanner: DirectoryScanner
		fileWatcher: IFileWatcher
	} {
		if (!this.configManager.isFeatureConfigured) {
			throw new Error(t("embeddings:serviceFactory.codeIndexingNotConfigured"))
		}

		const embedder = this.createEmbedder()
		const vectorStore = this.createVectorStore()
		const parser = codeParser
		const scanner = this.createDirectoryScanner(embedder, vectorStore, parser, ignoreInstance)
		const fileWatcher = this.createFileWatcher(
			context,
			embedder,
			vectorStore,
			cacheManager,
			ignoreInstance,
			rooIgnoreController,
		)

		return {
			embedder,
			vectorStore,
			parser,
			scanner,
			fileWatcher,
		}
	}
}
