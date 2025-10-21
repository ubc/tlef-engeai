#!/usr/bin/env npx ts-node

/**
 * @fileoverview Nuclear option script to completely delete the RAG database collection
 * 
 * This script uses the UBC GenAI Toolkit RAG module to completely delete
 * the entire Qdrant collection. This is the "nuclear option" that removes
 * everything including the collection itself.
 * 
 * Usage: npx ts-node src/functions/nuclear-clear-rag.ts
 * 
 * WARNING: This will permanently delete the ENTIRE COLLECTION from Qdrant!
 * 
 * @author: AI Assistant
 * @version: 1.0.0
 * @since: 2025-01-27
 */

import { RAGModule } from "ubc-genai-toolkit-rag";
import { ConsoleLogger } from "ubc-genai-toolkit-core";
import { EmbeddingsConfig, EmbeddingProviderType } from "ubc-genai-toolkit-embeddings";
import { RAGConfig, QdrantDistanceMetric } from "ubc-genai-toolkit-rag";
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/**
 * Configuration for the RAG module
 */
function createRAGConfig(): RAGConfig {
    const debug = process.env.DEBUG === 'true';
    const logger = new ConsoleLogger('nuclear-clear-rag');
    
    if (debug) {
        logger.debug('Loading configuration from environment variables...');
    }

    // Validate required environment variables
    const qdrantUrl = process.env.QDRANT_URL;
    if (!qdrantUrl) {
        throw new Error('QDRANT_URL environment variable is required.');
    }
    
    const qdrantCollectionName = process.env.QDRANT_COLLECTION_NAME;
    if (!qdrantCollectionName) {
        throw new Error('QDRANT_COLLECTION_NAME environment variable is required.');
    }
    
    const qdrantVectorSizeStr = process.env.QDRANT_VECTOR_SIZE;
    if (!qdrantVectorSizeStr || isNaN(parseInt(qdrantVectorSizeStr, 10))) {
        throw new Error('QDRANT_VECTOR_SIZE environment variable must be a valid number.');
    }
    const qdrantVectorSize = parseInt(qdrantVectorSizeStr, 10);

    const qdrantDistanceMetric = (process.env.QDRANT_DISTANCE_METRIC || 'Cosine') as QdrantDistanceMetric;
    if (!['Cosine', 'Euclid', 'Dot'].includes(qdrantDistanceMetric)) {
        throw new Error(`Invalid QDRANT_DISTANCE_METRIC: ${qdrantDistanceMetric}. Must be 'Cosine', 'Euclid', or 'Dot'.`);
    }

	// Embeddings configuration
	const embeddingsProvider = process.env.EMBEDDING_PROVIDER as EmbeddingProviderType;
	if (!embeddingsProvider) {
		throw new Error('EMBEDDING_PROVIDER environment variable is required for RAG.');
	}

    let specificEmbeddingsConfig: Partial<EmbeddingsConfig> = {};
    if (embeddingsProvider === 'ubc-genai-toolkit-llm') {
        const internalLlmProvider = (process.env.LLM_PROVIDER || 'ollama') as any;
			specificEmbeddingsConfig.llmConfig = {
				provider: internalLlmProvider,
				apiKey: process.env.LLM_API_KEY,
				endpoint: process.env.EMBEDDINGS_ENDPOINT,
				embeddingModel: process.env.EMBEDDINGS_MODEL,
				defaultModel: process.env.LLM_DEFAULT_MODEL,
				logger: logger,
				debug: debug,
			};
    } else if (embeddingsProvider === 'fastembed') {
        specificEmbeddingsConfig.fastembedConfig = {
            model: process.env.EMBEDDINGS_MODEL as any,
            cacheDir: process.env.EMBEDDINGS_CACHE_DIR,
        };
    } else {
		throw new Error(`Unsupported EMBEDDING_PROVIDER: ${embeddingsProvider}`);
    }

    const embeddingsConfig: EmbeddingsConfig = {
        providerType: embeddingsProvider,
        ...specificEmbeddingsConfig,
        logger: logger,
        debug: debug,
    };

    const qdrantConfig = {
        url: qdrantUrl,
        apiKey: process.env.QDRANT_API_KEY,
        collectionName: qdrantCollectionName,
        vectorSize: qdrantVectorSize,
        distanceMetric: qdrantDistanceMetric,
    };

    const ragConfig: RAGConfig = {
        provider: 'qdrant',
        qdrantConfig: qdrantConfig,
        embeddingsConfig: embeddingsConfig,
        logger: logger,
        debug: debug,
        defaultRetrievalLimit: 5,
        defaultScoreThreshold: 0.7,
    };

    if (debug) {
        logger.debug('RAG Config created successfully');
        logger.debug('Qdrant URL:', { url: qdrantUrl });
        logger.debug('Collection Name:', { collectionName: qdrantCollectionName });
        logger.debug('Vector Size:', { vectorSize: qdrantVectorSize });
        logger.debug('Distance Metric:', { distanceMetric: qdrantDistanceMetric });
    }

    return ragConfig;
}

/**
 * Main function to nuclear clear the RAG database (delete entire collection)
 */
async function nuclearClearRAGDatabase(): Promise<void> {
    const logger = new ConsoleLogger('nuclear-clear-rag');
    
    try {
        logger.info('💥 Starting NUCLEAR RAG database clearing process...');
        logger.info('⚠️  WARNING: This will permanently delete the ENTIRE COLLECTION!');
        logger.info('⚠️  WARNING: This is irreversible and will remove all data!');
        
        // Create RAG configuration
        logger.info('📋 Loading configuration...');
        const ragConfig = createRAGConfig();
        
        // Initialize RAG module
        logger.info('🔧 Initializing RAG module...');
        const ragModule = await RAGModule.create(ragConfig);
        logger.info('✅ RAG module initialized successfully');
        
        // Get current document count before deletion
        logger.info('📊 Checking current document count...');
        try {
            const allDocuments = await ragModule.getDocumentsByMetadata({});
            const documentCount = allDocuments.length;
            logger.info(`📈 Found ${documentCount} documents in the collection`);
            
            if (documentCount === 0) {
                logger.info('✅ Collection is already empty. Proceeding with collection deletion...');
            }
        } catch (error) {
            logger.warn('⚠️  Could not retrieve document count (collection may not exist)');
        }
        
        // Nuclear option: Delete entire storage container (collection)
        logger.info('💥 Executing NUCLEAR OPTION: Deleting entire collection...');
        try {
            await ragModule.deleteStorage();
            logger.info('✅ Collection deleted successfully');
        } catch (error) {
            logger.error('❌ Collection deletion failed:', { error });
            throw error;
        }
        
        // Verify deletion by trying to access the collection
        logger.info('🔍 Verifying collection deletion...');
        try {
            const remainingDocuments = await ragModule.getDocumentsByMetadata({});
            logger.warn(`⚠️  WARNING: ${remainingDocuments.length} documents still remain in the collection`);
        } catch (error) {
            logger.info('✅ SUCCESS: Collection appears to have been deleted (access failed as expected)');
        }
        
        logger.info('🎉 NUCLEAR RAG database clearing process completed successfully!');
        logger.info('💥 The entire collection has been deleted from Qdrant');
        
    } catch (error) {
        logger.error('❌ Error during nuclear RAG database clearing process:');
        logger.error(error as string);
        process.exit(1);
    }
}

/**
 * Display usage information
 */
function displayUsage(): void {
    console.log(`
💥 Nuclear RAG Database Clearing Script
=======================================

This script will permanently delete the ENTIRE COLLECTION from Qdrant.
This is the "nuclear option" that removes everything including the collection itself.

Usage:
  npx ts-node src/functions/nuclear-clear-rag.ts

Required Environment Variables:
  - QDRANT_URL: URL of the Qdrant instance
  - QDRANT_COLLECTION_NAME: Name of the collection to delete
  - QDRANT_VECTOR_SIZE: Vector size for the collection
  - QDRANT_DISTANCE_METRIC: Distance metric (Cosine, Euclid, or Dot)
  - EMBEDDING_PROVIDER: Embeddings provider type
  - LLM_API_KEY: API key for LLM (used for embeddings)
  - EMBEDDINGS_ENDPOINT: Endpoint for embeddings (if required)
  - EMBEDDINGS_MODEL: Model name for embeddings

Optional Environment Variables:
  - QDRANT_API_KEY: API key for Qdrant (if required)
  - DEBUG: Set to 'true' for debug logging

⚠️  WARNING: This operation is irreversible!
⚠️  WARNING: This will delete the ENTIRE COLLECTION!
⚠️  WARNING: Use with extreme caution!
    `);
}

// Main execution
if (require.main === module) {
    // Check if help is requested
    if (process.argv.includes('--help') || process.argv.includes('-h')) {
        displayUsage();
        process.exit(0);
    }
    
    // Run the nuclear clearing process
    nuclearClearRAGDatabase()
        .then(() => {
            console.log('✅ Nuclear script completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Nuclear script failed:', error);
            process.exit(1);
        });
}

export { nuclearClearRAGDatabase, createRAGConfig };
