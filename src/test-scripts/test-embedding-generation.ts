/**
 * Test 1: Embedding Generation Test
 * 
 * This test generates embeddings for a sample sentence and prints the values to the terminal.
 * It tests the basic functionality of the embeddings module.
 */

import * as dotenv from 'dotenv';
import { EmbeddingsModule, EmbeddingsConfig, EmbeddingProviderType } from 'ubc-genai-toolkit-embeddings';
import { ConsoleLogger } from 'ubc-genai-toolkit-core';
import { LLMConfig, ProviderType } from 'ubc-genai-toolkit-llm';

// Load environment variables
dotenv.config();

async function testEmbeddingGeneration() {
    console.log('🧪 Starting Embedding Generation Test...\n');

    try {
        // Initialize logger
        const logger = new ConsoleLogger('embedding-test');

        // Configure LLM for embeddings
        const llmConfig: Partial<LLMConfig> = {
            provider: (process.env.LLM_PROVIDER as ProviderType) || 'openai',
            apiKey: process.env.LLM_API_KEY,
            endpoint: process.env.LLM_ENDPOINT,
            defaultModel: process.env.LLM_DEFAULT_MODEL || 'text-embedding-3-small',
            embeddingModel: process.env.LLM_EMBEDDING_MODEL || 'text-embedding-3-small',
        };

        // Configure embeddings module
        const config: Partial<EmbeddingsConfig> = {
            providerType: (process.env.EMBEDDING_PROVIDER as EmbeddingProviderType) || 'ubc-genai-toolkit-llm',
            logger: logger,
            llmConfig: llmConfig,
        };

        console.log('📋 Configuration:');
        console.log(`   Provider Type: ${config.providerType}`);
        console.log(`   LLM Provider: ${llmConfig.provider}`);
        console.log(`   Embedding Model: ${llmConfig.embeddingModel}\n`);

        // Initialize embeddings module
        console.log('🔄 Initializing embeddings module...');
        const embeddingsModule = await EmbeddingsModule.create(config);
        console.log('✅ Embeddings module initialized successfully\n');

        // Test sentences
        const testSentences = [
            "The quick brown fox jumps over the lazy dog.",
            "Machine learning is a subset of artificial intelligence.",
            "Vector databases store high-dimensional embeddings for similarity search.",
            "Engineering students at UBC learn about thermodynamics and fluid mechanics."
        ];

        console.log('🔤 Testing embedding generation for multiple sentences:\n');

        for (let i = 0; i < testSentences.length; i++) {
            const sentence = testSentences[i];
            console.log(`📝 Sentence ${i + 1}: "${sentence}"`);
            
            try {
                // Generate embedding
                const startTime = Date.now();
                const embeddings = await embeddingsModule.embed(sentence);
                const endTime = Date.now();
                
                const embedding = embeddings[0];
                
                console.log(`   ✅ Embedding generated successfully`);
                console.log(`   ⏱️  Time taken: ${endTime - startTime}ms`);
                console.log(`   📊 Vector dimensions: ${embedding.length}`);
                console.log(`   🔢 First 10 values: [${embedding.slice(0, 10).map(v => v.toFixed(6)).join(', ')}...]`);
                console.log(`   📈 Vector stats:`);
                console.log(`      - Min value: ${Math.min(...embedding).toFixed(6)}`);
                console.log(`      - Max value: ${Math.max(...embedding).toFixed(6)}`);
                console.log(`      - Mean value: ${(embedding.reduce((a, b) => a + b, 0) / embedding.length).toFixed(6)}`);
                console.log(`      - Magnitude: ${Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0)).toFixed(6)}\n`);
                
            } catch (error) {
                console.error(`   ❌ Error generating embedding for sentence ${i + 1}:`, error);
                console.log('');
            }
        }

        // Test batch embedding
        console.log('🔄 Testing batch embedding...');
        try {
            const startTime = Date.now();
            const batchEmbeddings = await embeddingsModule.embed(testSentences);
            const endTime = Date.now();
            
            console.log(`   ✅ Batch embedding completed successfully`);
            console.log(`   ⏱️  Time taken: ${endTime - startTime}ms`);
            console.log(`   📊 Generated ${batchEmbeddings.length} embeddings`);
            console.log(`   📈 Average time per embedding: ${((endTime - startTime) / batchEmbeddings.length).toFixed(2)}ms\n`);
            
        } catch (error) {
            console.error(`   ❌ Error in batch embedding:`, error);
        }

        console.log('🎉 Embedding generation test completed successfully!');

    } catch (error) {
        console.error('❌ Test failed:', error);
        process.exit(1);
    }
}

// Run the test
if (require.main === module) {
    testEmbeddingGeneration().catch(console.error);
}

export { testEmbeddingGeneration };
