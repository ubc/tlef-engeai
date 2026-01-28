#!/usr/bin/env npx ts-node

/**
 * @fileoverview Test script to find maximum similarity between academic subjects and a student prompt using OpenAI embeddings
 *
 * This script demonstrates how to:
 * 1. Set up OpenAI embeddings using UBC GenAI Toolkit
 * 2. Generate embeddings for academic subjects and a student prompt
 * 3. Calculate cosine similarities using Qdrant algorithm
 * 4. Find which academic subject is most similar to the student prompt
 *
 * Test subjects: "Thermodynamics", "fluid mechanics", "boolean algebra"
 * Student prompt: Question about thermodynamics concepts
 *
 * Usage: npx ts-node testresemblence.ts
 *
 * Requires: OpenAI API key, embeddings model environment variables
 *
 * @author: AI Assistant
 * @version: 1.0.0
 * @since: 2025-01-21
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import { EmbeddingsModule } from "ubc-genai-toolkit-embeddings";
import { ConsoleLogger } from "ubc-genai-toolkit-core";
import * as dotenv from 'dotenv';
import * as path from 'path';
import { randomUUID } from 'crypto';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '.env') });

/**
 * Calculate cosine similarity between two vectors using Qdrant
 * @param vectorA - First vector (will be stored as a point)
 * @param vectorB - Second vector (will be used as query)
 * @returns Cosine similarity score between -1 and 1
 */
async function calculateCosineSimilarityUsingQdrant(vectorA: number[], vectorB: number[]): Promise<number> {
    if (vectorA.length !== vectorB.length) {
        throw new Error('Vectors must have the same length');
    }

    const qdrantClient = new QdrantClient({
        url: process.env.QDRANT_URL || 'http://localhost:6333',
        apiKey: process.env.QDRANT_API_KEY,
    });

    const tempCollectionName = `temp_similarity_test_${randomUUID().slice(0, 8)}`;

    try {
        // Create temporary collection (OpenAI embeddings are 1536 dimensions)
        await qdrantClient.createCollection(tempCollectionName, {
            vectors: {
                size: 1536,
                distance: 'Cosine',
            },
        });

        // Insert first vector as a point
        await qdrantClient.upsert(tempCollectionName, {
            wait: true,
            points: [{
                id: randomUUID(),
                vector: vectorA,
                payload: { type: 'reference' }
            }]
        });

        // Search using second vector to get similarity score
        const searchResults = await qdrantClient.search(tempCollectionName, {
            vector: vectorB,
            limit: 1,
            with_payload: false,
            with_vector: false,
        });

        // Qdrant returns distance (lower = more similar), convert to similarity (higher = more similar)
        // Cosine distance = 1 - cosine similarity, so similarity = 1 - distance
        const distance = searchResults[0]?.score || 1;
        const similarity = 1 - distance;

        return similarity;

    } finally {
        // Clean up temporary collection
        try {
            await qdrantClient.deleteCollection(tempCollectionName);
        } catch (error) {
            console.warn('Failed to clean up temporary collection:', error);
        }
    }
}

/**
 * Main test function
 */
async function testSimilarity(): Promise<void> {
    try {
        console.log('🚀 Starting similarity test...');

        // Set up logger
        const logger = new ConsoleLogger('test-resemblance');

        // Test strings - academic subjects and a student prompt about thermodynamics
        const academicSubjects = [
            'Thermodynamics',
            'fluid mechanics',
            'boolean algebra'
        ];
        const studentPrompt = 'Can you help me understand the basic concepts of thermodynamics, especially the laws and how they apply to engineering problems?';

        console.log('\n🔧 Initializing embeddings module with OpenAI...');
        const llmConfig = {
            provider: (process.env.LLM_PROVIDER || 'openai') as any,
            apiKey: process.env.LLM_API_KEY,
            endpoint: process.env.EMBEDDINGS_ENDPOINT,
            embeddingModel: process.env.EMBEDDINGS_MODEL,
            defaultModel: process.env.LLM_DEFAULT_MODEL,
        };

        const config = {
            providerType: process.env.EMBEDDING_PROVIDER || 'ubc-genai-toolkit-llm',
            logger: logger,
            llmConfig: llmConfig,
        };

        const embeddingsModule = await EmbeddingsModule.create(config);
        console.log('✅ Embeddings module initialized successfully.');

        // Generate embeddings for all strings
        const allStrings = [...academicSubjects, studentPrompt];
        console.log('\n📝 Test Strings:');
        allStrings.forEach((str, i) => {
            console.log(`${i + 1}. "${str}"`);
        });

        console.log('\n🧮 Generating embeddings...');
        const embeddings = await embeddingsModule.embed(allStrings);

        console.log(`📊 Generated ${embeddings.length} embeddings`);
        console.log(`📊 Each embedding has ${embeddings[0].length} dimensions`);

        // Verify vector size
        if (embeddings[0].length !== 1536) {
            console.warn(`⚠️ Warning: Expected 1536 dimensions, got ${embeddings[0].length}`);
        }

        // Calculate similarities between student prompt and each academic subject
        console.log('\n🔍 Calculating similarities using Qdrant algorithm...');

        const studentPromptEmbedding = embeddings[embeddings.length - 1]; // Last embedding is the student prompt
        const similarities: { subject: string; similarity: number; percentage: number }[] = [];

        for (let i = 0; i < academicSubjects.length; i++) {
            const subjectEmbedding = embeddings[i];
            const subject = academicSubjects[i];

            let similarity: number;

            try {
                similarity = await calculateCosineSimilarityUsingQdrant(subjectEmbedding, studentPromptEmbedding);
                console.log(`✅ Used Qdrant for ${subject} similarity calculation`);
            } catch (error) {
                console.log(`⚠️ Qdrant not available for ${subject}, falling back to manual calculation`);
                // Fallback to manual calculation if Qdrant is not available
                const manualSimilarity = (vecA: number[], vecB: number[]): number => {
                    let dotProduct = 0;
                    let normA = 0;
                    let normB = 0;

                    for (let j = 0; j < vecA.length; j++) {
                        dotProduct += vecA[j] * vecB[j];
                        normA += vecA[j] * vecA[j];
                        normB += vecB[j] * vecB[j];
                    }

                    normA = Math.sqrt(normA);
                    normB = Math.sqrt(normB);

                    return normA === 0 || normB === 0 ? 0 : dotProduct / (normA * normB);
                };

                similarity = manualSimilarity(subjectEmbedding, studentPromptEmbedding);
            }

            const percentage = similarity * 100;
            similarities.push({ subject, similarity, percentage });
        }

        // Find the subject with maximum similarity to the student prompt
        const maxSimilarity = similarities.reduce((max, current) =>
            current.similarity > max.similarity ? current : max
        );

        console.log('\n🎯 Similarity Results (Student Prompt vs Academic Subjects):');
        similarities.forEach(({ subject, similarity, percentage }) => {
            const isMax = subject === maxSimilarity.subject;
            const marker = isMax ? '👑' : '  ';
            console.log(`${marker} ${subject}: ${similarity.toFixed(4)} (${percentage.toFixed(2)}%)`);
        });

        console.log('\n🏆 Maximum Similarity:');
        console.log(`Subject: "${maxSimilarity.subject}"`);
        console.log(`Similarity: ${maxSimilarity.similarity.toFixed(4)}`);
        console.log(`Percentage: ${maxSimilarity.percentage.toFixed(2)}%`);

        // Interpret the maximum similarity
        if (maxSimilarity.similarity > 0.8) {
            console.log('✨ Very high similarity - strongly related concepts');
        } else if (maxSimilarity.similarity > 0.6) {
            console.log('📈 Moderate similarity - somewhat related concepts');
        } else if (maxSimilarity.similarity > 0.3) {
            console.log('📉 Low similarity - loosely related concepts');
        } else {
            console.log('❌ Very low similarity - unrelated concepts');
        }

        console.log('\n✅ Test completed successfully!');

    } catch (error) {
        console.error('❌ Error during similarity test:', error);
        process.exit(1);
    }
}

// Run the test
testSimilarity().catch((error) => {
    console.error('💥 Unhandled error:', error);
    process.exit(1);
});