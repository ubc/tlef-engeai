/**
 * ===========================================
 * ======= RAG SERVICES DIAGNOSTIC ==========
 * ===========================================
 *
 * This script helps diagnose issues with the RAG services
 * including Qdrant, Ollama, and embeddings generation.
 *
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @since: 2025-01-27
 */

import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { QdrantClient } from '@qdrant/js-client-rest';

// Load environment variables
dotenv.config();

const QDRANT_HOST = process.env.QDRANT_URL || 'http://localhost:6333';
const OLLAMA_HOST = 'http://localhost:11434';

/**
 * Test Qdrant connection
 */
async function testQdrantConnection(): Promise<void> {
    console.log('\n🔍 Testing Qdrant Connection...');
    console.log('=' .repeat(50));
    
    try {
        const qdrantClient = new QdrantClient({
            url: QDRANT_HOST,
            apiKey: process.env.QDRANT_API_KEY,
        });
        
        console.log('Configuration:');
        console.log('  URL:', QDRANT_HOST);
        console.log('  API Key:', process.env.QDRANT_API_KEY ? 'Set' : 'Not set');
        
        const collections = await qdrantClient.getCollections();
        console.log('✅ Qdrant connection successful!');
        console.log('📊 Collections found:', collections.collections.length);
        
        collections.collections.forEach((collection, index) => {
            console.log(`  ${index + 1}. ${collection.name} (${(collection as any).vectors_count || 0} vectors)`);
        });
        
    } catch (error) {
        console.error('❌ Qdrant connection failed:');
        console.error('  Error:', error instanceof Error ? error.message : 'Unknown error');
        
        if (error instanceof Error && error.message.includes('Unauthorized')) {
            console.log('\n💡 Troubleshooting tips:');
            console.log('  1. Check if QDRANT_API_KEY is set in your .env file');
            console.log('  2. Verify the API key is correct');
            console.log('  3. Ensure Qdrant server is running');
            console.log('  4. Check if Qdrant requires authentication');
        }
    }
}

/**
 * Test Ollama connection
 */
async function testOllamaConnection(): Promise<void> {
    console.log('\n🔍 Testing Ollama Connection...');
    console.log('=' .repeat(50));
    
    try {
        console.log('Configuration:');
        console.log('  URL:', OLLAMA_HOST);
        
        // Test basic connection
        const response = await fetch(`${OLLAMA_HOST}/api/tags`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log('✅ Ollama connection successful!');
            console.log('📊 Available models:', data.models?.length || 0);
            
            if (data.models && data.models.length > 0) {
                data.models.forEach((model: any, index: number) => {
                    console.log(`  ${index + 1}. ${model.name} (${model.size} bytes)`);
                });
            }
        } else {
            console.error('❌ Ollama connection failed:');
            console.error('  Status:', response.status);
            console.error('  Status Text:', response.statusText);
            
            const errorText = await response.text();
            console.error('  Response:', errorText);
        }
        
    } catch (error) {
        console.error('❌ Ollama connection failed:');
        console.error('  Error:', error instanceof Error ? error.message : 'Unknown error');
        
        console.log('\n💡 Troubleshooting tips:');
        console.log('  1. Ensure Ollama server is running: ollama serve');
        console.log('  2. Check if Ollama is accessible at http://localhost:11434');
        console.log('  3. Verify no firewall is blocking the connection');
    }
}

/**
 * Test embeddings generation
 */
async function testEmbeddingsGeneration(): Promise<void> {
    console.log('\n🔍 Testing Embeddings Generation...');
    console.log('=' .repeat(50));
    
    try {
        // Test with a simple query to Ollama embeddings
        const response = await fetch(`${OLLAMA_HOST}/api/embeddings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'nomic-embed-text',
                prompt: 'test query for embeddings'
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log('✅ Embeddings generation successful!');
            console.log('📊 Vector size:', data.embedding?.length || 0);
            console.log('📊 Model used:', data.model || 'unknown');
        } else {
            console.error('❌ Embeddings generation failed:');
            console.error('  Status:', response.status);
            console.error('  Status Text:', response.statusText);
            
            const errorText = await response.text();
            console.error('  Response:', errorText);
            
            console.log('\n💡 Troubleshooting tips:');
            console.log('  1. Ensure nomic-embed-text model is installed: ollama pull nomic-embed-text');
            console.log('  2. Check if the model name is correct');
            console.log('  3. Verify Ollama server is running');
        }
        
    } catch (error) {
        console.error('❌ Embeddings generation failed:');
        console.error('  Error:', error instanceof Error ? error.message : 'Unknown error');
    }
}

/**
 * Test RAG API endpoint
 */
async function testRAGAPI(): Promise<void> {
    console.log('\n🔍 Testing RAG API Endpoint...');
    console.log('=' .repeat(50));
    
    try {
        const response = await fetch('http://localhost:3000/api/ollama/test', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log('✅ RAG API endpoint accessible!');
            console.log('📊 Status:', data.status);
            console.log('📊 Message:', data.message);
            
            console.log('\nService Status:');
            console.log('  Qdrant:', data.services?.qdrant?.connected ? '✅ Connected' : '❌ Failed');
            if (data.services?.qdrant?.error) {
                console.log('    Error:', data.services.qdrant.error);
            }
            
            console.log('  Embeddings:', data.services?.embeddings?.working ? '✅ Working' : '❌ Failed');
            if (data.services?.embeddings?.error) {
                console.log('    Error:', data.services.embeddings.error);
            }
            
            console.log('  Ollama:', data.services?.ollama?.accessible ? '✅ Accessible' : '❌ Failed');
            if (data.services?.ollama?.error) {
                console.log('    Error:', data.services.ollama.error);
            }
            
        } else {
            console.error('❌ RAG API endpoint failed:');
            console.error('  Status:', response.status);
            console.error('  Status Text:', response.statusText);
            
            const errorText = await response.text();
            console.error('  Response:', errorText);
            
            console.log('\n💡 Troubleshooting tips:');
            console.log('  1. Ensure the server is running: npm start or npm run dev');
            console.log('  2. Check if the server is accessible at http://localhost:3000');
            console.log('  3. Verify the API route is properly configured');
        }
        
    } catch (error) {
        console.error('❌ RAG API endpoint failed:');
        console.error('  Error:', error instanceof Error ? error.message : 'Unknown error');
        
        console.log('\n💡 Troubleshooting tips:');
        console.log('  1. Start the server first');
        console.log('  2. Check if the port 3000 is available');
        console.log('  3. Verify the API routes are properly set up');
    }
}

/**
 * Run all diagnostic tests
 */
async function runDiagnostics(): Promise<void> {
    console.log('🔧 RAG Services Diagnostic Tool');
    console.log('=' .repeat(60));
    console.log('This tool will help diagnose issues with your RAG setup.');
    console.log('Make sure to run this after starting your services.\n');
    
    const tests = [
        { name: 'Qdrant Connection', fn: testQdrantConnection },
        { name: 'Ollama Connection', fn: testOllamaConnection },
        { name: 'Embeddings Generation', fn: testEmbeddingsGeneration },
        { name: 'RAG API Endpoint', fn: testRAGAPI }
    ];
    
    for (const test of tests) {
        try {
            await test.fn();
        } catch (error) {
            console.error(`❌ ${test.name} test crashed:`, error);
        }
        
        // Add delay between tests
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('\n🎯 Diagnostic Summary');
    console.log('=' .repeat(60));
    console.log('If any tests failed, check the troubleshooting tips above.');
    console.log('Common issues:');
    console.log('  1. Services not running (Ollama, Qdrant, Node.js server)');
    console.log('  2. Missing API keys in .env file');
    console.log('  3. Missing models (nomic-embed-text)');
    console.log('  4. Network connectivity issues');
    console.log('  5. Port conflicts or firewall blocking');
}

// Run diagnostics if this script is executed directly
if (require.main === module) {
    runDiagnostics().catch(console.error);
}

export {
    testQdrantConnection,
    testOllamaConnection,
    testEmbeddingsGeneration,
    testRAGAPI,
    runDiagnostics
};
