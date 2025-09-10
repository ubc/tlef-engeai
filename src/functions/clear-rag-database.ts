#!/usr/bin/env npx ts-node

/**
 * @fileoverview Standalone script to clear all documents from the RAG database
 * 
 * This script uses the UBC GenAI Toolkit RAG module to remove all documents
 * from the Qdrant vector database. It can be run manually using:
 * 
 * npx ts-node src/functions/clear-rag-database.ts
 * 
 * WARNING: This will permanently delete ALL documents from the database!
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
dotenv.config({ path: path.resolve(__dirname, '../.env') });

/**
 * Configuration for the RAG module
 */
function createRAGConfig(): RAGConfig {
    const debug = process.env.DEBUG === 'true';
    const logger = new ConsoleLogger('clear-rag-database');
    
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
    const embeddingsProvider = process.env.EMBEDDINGS_PROVIDER as EmbeddingProviderType;
    if (!embeddingsProvider) {
        throw new Error('EMBEDDINGS_PROVIDER environment variable is required for RAG.');
    }

    let specificEmbeddingsConfig: Partial<EmbeddingsConfig> = {};
    if (embeddingsProvider === 'ubc-genai-toolkit-llm') {
        const internalLlmProvider = (process.env.LLM_PROVIDER || 'ollama') as any;
        specificEmbeddingsConfig.llmConfig = {
            provider: internalLlmProvider,
            apiKey: process.env.EMBEDDINGS_API_KEY,
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
        throw new Error(`Unsupported EMBEDDINGS_PROVIDER: ${embeddingsProvider}`);
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
 * Main function to clear all documents from the RAG database
 */
async function clearRAGDatabase(): Promise<void> {
    const logger = new ConsoleLogger('clear-rag-database');
    
    try {
        logger.info('🚀 Starting RAG database clearing process...');
        logger.info('⚠️  WARNING: This will permanently delete ALL documents from the database!');
        
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
            logger.info(`📈 Found ${documentCount} documents in the database`);
            
            if (documentCount === 0) {
                logger.info('✅ Database is already empty. Nothing to delete.');
                return;
            }
        } catch (error) {
            logger.warn('⚠️  Could not retrieve document count (this is normal if collection is empty)');
        }
        
        // Method 1: Try to delete by metadata (safer approach)
        logger.info('🗑️  Attempting to delete documents by metadata filter...');
        try {
            await ragModule.deleteDocumentsByMetadata({});
            logger.info('✅ Documents deleted by metadata filter');
        } catch (error) {
            logger.warn('⚠️  Metadata deletion failed, trying alternative method...');
            
            // Method 2: Delete entire storage (nuclear option)
            logger.info('💥 Attempting to delete entire storage container...');
            await ragModule.deleteStorage();
            logger.info('✅ Storage container deleted successfully');
        }
        
        // Verify deletion
        logger.info('🔍 Verifying deletion...');
        try {
            const remainingDocuments = await ragModule.getDocumentsByMetadata({});
            const remainingCount = remainingDocuments.length;
            
            if (remainingCount === 0) {
                logger.info('✅ SUCCESS: All documents have been deleted from the database');
            } else {
                logger.warn(`⚠️  WARNING: ${remainingCount} documents still remain in the database`);
            }
        } catch (error) {
            logger.info('✅ SUCCESS: Database appears to be empty (collection may have been deleted)');
        }
        
        logger.info('🎉 RAG database clearing process completed successfully!');
        
    } catch (error) {
        logger.error('❌ Error during RAG database clearing process:');
        logger.error(error as string);
        process.exit(1);
    }
}

/**
 * Display usage information
 */
function displayUsage(): void {
    console.log(`
🗑️  RAG Database Clearing Script
================================

This script will permanently delete ALL documents from the RAG database.

Usage:
  npx ts-node src/functions/clear-rag-database.ts

Required Environment Variables:
  - QDRANT_URL: URL of the Qdrant instance
  - QDRANT_COLLECTION_NAME: Name of the collection to clear
  - QDRANT_VECTOR_SIZE: Vector size for the collection
  - QDRANT_DISTANCE_METRIC: Distance metric (Cosine, Euclid, or Dot)
  - EMBEDDINGS_PROVIDER: Embeddings provider type
  - EMBEDDINGS_API_KEY: API key for embeddings (if required)
  - EMBEDDINGS_ENDPOINT: Endpoint for embeddings (if required)
  - EMBEDDINGS_MODEL: Model name for embeddings

Optional Environment Variables:
  - QDRANT_API_KEY: API key for Qdrant (if required)
  - DEBUG: Set to 'true' for debug logging

WARNING: This operation is irreversible!
    `);
}

// Main execution
if (require.main === module) {
    // Check if help is requested
    if (process.argv.includes('--help') || process.argv.includes('-h')) {
        displayUsage();
        process.exit(0);
    }
    
    // Run the clearing process
    clearRAGDatabase()
        .then(() => {
            console.log('✅ Script completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Script failed:', error);
            process.exit(1);
        });
}

export { clearRAGDatabase, createRAGConfig };
