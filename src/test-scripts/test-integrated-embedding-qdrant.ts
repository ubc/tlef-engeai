/**
 * Test 3: Integrated Testing
 * 
 * This test combines embedding generation with Qdrant upload to test the complete
 * pipeline from text input to vector storage and retrieval.
 */

import * as dotenv from 'dotenv';
import { QdrantClient } from '@qdrant/js-client-rest';
import { EmbeddingsModule, EmbeddingsConfig, EmbeddingProviderType } from 'ubc-genai-toolkit-embeddings';
import { ConsoleLogger } from 'ubc-genai-toolkit-core';
import { LLMConfig, ProviderType } from 'ubc-genai-toolkit-llm';
import type { AdditionalMaterial } from '../functions/types';

// Load environment variables
dotenv.config();

class IntegratedEmbeddingQdrantTest {
    private qdrantClient: QdrantClient;
    private embeddingsModule: EmbeddingsModule | undefined;
    private collectionName = 'tlef_documents';
    private vectorSize = 768;

    constructor() {
        this.qdrantClient = new QdrantClient({
            url: process.env.QDRANT_URL || 'http://localhost:6333',
            apiKey: process.env.QDRANT_API_KEY,
        });
    }

    async initializeEmbeddings() {
        console.log('🔄 Initializing embeddings module...');
        
        const logger = new ConsoleLogger('integrated-test');
        const llmConfig: Partial<LLMConfig> = {
            provider: (process.env.LLM_PROVIDER as ProviderType) || 'openai',
            apiKey: process.env.LLM_API_KEY,
            endpoint: process.env.LLM_ENDPOINT,
            defaultModel: process.env.LLM_DEFAULT_MODEL || 'text-embedding-3-small',
            embeddingModel: process.env.LLM_EMBEDDING_MODEL || 'text-embedding-3-small',
        };

        const config: Partial<EmbeddingsConfig> = {
            providerType: (process.env.EMBEDDING_PROVIDER as EmbeddingProviderType) || 'ubc-genai-toolkit-llm',
            logger: logger,
            llmConfig: llmConfig,
        };

        this.embeddingsModule = await EmbeddingsModule.create(config);
        console.log('✅ Embeddings module initialized successfully\n');
    }

    async setupQdrant() {
        console.log('🔍 Setting up Qdrant collection...');
        
        try {
            const collections = await this.qdrantClient.getCollections();
            const collectionExists = collections.collections.some(c => c.name === this.collectionName);
            
            if (!collectionExists) {
                await this.qdrantClient.createCollection(this.collectionName, {
                    vectors: {
                        size: this.vectorSize,
                        distance: 'Cosine',
                    },
                });
                console.log(`✅ Collection '${this.collectionName}' created successfully\n`);
            } else {
                console.log(`ℹ️  Collection '${this.collectionName}' already exists\n`);
            }
        } catch (error) {
            console.error('❌ Error setting up Qdrant:', error);
            throw error;
        }
    }

    async uploadWithEmbeddings(content: any) {
        if (!this.embeddingsModule) {
            throw new Error('Embeddings module not initialized');
        }

        console.log(`📝 Processing: "${content.text?.substring(0, 50) || 'No text'}..."`);

        // Generate embedding
        const startTime = Date.now();
        const embeddings = await this.embeddingsModule.embed(content.text || '');
        const embedding = embeddings[0];
        const endTime = Date.now();

        console.log(`   ✅ Embedding generated (${endTime - startTime}ms)`);
        console.log(`   📊 Vector dimensions: ${embedding.length}`);

        // Create payload
        const payload = {
            id: content.id,
            date: content.date.toISOString(),
            courseName: content.courseName,
            contentTitle: content.divisionTitle,
            subcontentTitle: content.itemTitle,
            chunkNumber: content.chunkNumber,
            text: content.text,
        };

        // Upload to Qdrant
        const result = await this.qdrantClient.upsert(this.collectionName, {
            points: [
                {
                    id: content.id,
                    payload: payload,
                    vector: embedding,
                }
            ]
        });

        console.log(`   ✅ Uploaded to Qdrant (Operation ID: ${result.operation_id})\n`);
        return result;
    }

    async searchSimilarDocuments(query: string, courseName?: string, limit: number = 5) {
        if (!this.embeddingsModule) {
            throw new Error('Embeddings module not initialized');
        }

        console.log(`🔍 Searching for: "${query}"`);
        if (courseName) {
            console.log(`   Course filter: ${courseName}`);
        }

        // Generate query embedding
        const queryEmbeddings = await this.embeddingsModule.embed(query);
        const queryVector = queryEmbeddings[0];

        // Build filter
        const filter: any = {};
        if (courseName) {
            filter.must = [
                {
                    key: 'courseName',
                    match: {
                        value: courseName
                    }
                }
            ];
        }

        // Search
        const results = await this.qdrantClient.search(this.collectionName, {
            vector: queryVector,
            filter: Object.keys(filter).length > 0 ? filter : undefined,
            limit: limit,
            score_threshold: 0.1, // Lower threshold for testing
        });

        console.log(`   📊 Found ${results.length} similar documents:`);
        results.forEach((result, index) => {
            console.log(`   ${index + 1}. Score: ${result.score.toFixed(4)}`);
            console.log(`      ID: ${result.id}`);
            console.log(`      Course: ${result.payload?.courseName || 'N/A'}`);
            console.log(`      Division: ${result.payload?.contentTitle || 'N/A'}`);
            console.log(`      Item: ${result.payload?.subcontentTitle || 'N/A'}`);
            console.log(`      Text: "${(result.payload?.text as string)?.substring(0, 80) || 'No text'}..."`);
            console.log('');
        });

        return results;
    }

    async runIntegratedTest() {
        console.log('🧪 Starting Integrated Embedding + Qdrant Test...\n');

        try {
            // Initialize components
            await this.initializeEmbeddings();
            await this.setupQdrant();

            // Test data with integer IDs for Qdrant
            const testContents = [
                {
                    id: 10,
                    date: new Date(),
                    name: 'Heat Transfer',
                    courseName: 'CHBE241',
                    divisionTitle: 'Thermodynamics',
                    itemTitle: 'Heat Transfer',
                    sourceType: 'text',
                    text: 'Heat transfer is the movement of thermal energy from one object to another due to temperature differences. There are three modes of heat transfer: conduction, convection, and radiation.',
                    uploaded: true,
                    chunkNumber: 1,
                    createdAt: new Date(),
                    updatedAt: new Date()
                },
                {
                    id: 11,
                    date: new Date(),
                    name: 'Energy Balance',
                    courseName: 'CHBE241',
                    divisionTitle: 'Thermodynamics',
                    itemTitle: 'Energy Balance',
                    sourceType: 'text',
                    text: 'The energy balance equation states that the rate of energy accumulation equals the rate of energy input minus the rate of energy output plus the rate of energy generation.',
                    uploaded: true,
                    chunkNumber: 1,
                    createdAt: new Date(),
                    updatedAt: new Date()
                },
                {
                    id: 12,
                    date: new Date(),
                    name: 'FCC Structure',
                    courseName: 'MTRL251',
                    divisionTitle: 'Crystal Structure',
                    itemTitle: 'FCC Structure',
                    sourceType: 'text',
                    text: 'Face-centered cubic (FCC) is a crystal structure where atoms are located at the corners and face centers of a cube. It has a coordination number of 12.',
                    uploaded: true,
                    chunkNumber: 1,
                    createdAt: new Date(),
                    updatedAt: new Date()
                },
                {
                    id: 13,
                    date: new Date(),
                    name: 'Stress and Strain',
                    courseName: 'MTRL251',
                    divisionTitle: 'Mechanical Properties',
                    itemTitle: 'Stress and Strain',
                    sourceType: 'text',
                    text: 'Stress is the force per unit area applied to a material, while strain is the deformation per unit length. The relationship between stress and strain is described by Hooke\'s law for elastic materials.',
                    uploaded: true,
                    chunkNumber: 1,
                    createdAt: new Date(),
                    updatedAt: new Date()
                }
            ];

            // Upload all test content
            console.log('📤 Uploading test content with embeddings...\n');
            for (const content of testContents) {
                await this.uploadWithEmbeddings(content);
            }

            // Test similarity search
            console.log('🔍 Testing similarity search...\n');
            
            const searchQueries = [
                { query: 'heat transfer mechanisms', courseName: 'CHBE241' },
                { query: 'crystal structure types', courseName: 'MTRL251' },
                { query: 'energy conservation principles', courseName: undefined },
                { query: 'mechanical properties of materials', courseName: undefined }
            ];

            for (const searchQuery of searchQueries) {
                await this.searchSimilarDocuments(
                    searchQuery.query,
                    searchQuery.courseName,
                    3
                );
            }

            // Test cross-course search
            console.log('🌐 Testing cross-course similarity search...\n');
            await this.searchSimilarDocuments('temperature and energy', undefined, 5);

            console.log('🎉 Integrated test completed successfully!');

        } catch (error) {
            console.error('❌ Integrated test failed:', error);
            process.exit(1);
        }
    }
}

async function runIntegratedTest() {
    const test = new IntegratedEmbeddingQdrantTest();
    await test.runIntegratedTest();
}

// Run the test
if (require.main === module) {
    runIntegratedTest().catch(console.error);
}

export { runIntegratedTest, IntegratedEmbeddingQdrantTest };
