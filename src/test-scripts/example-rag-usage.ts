/**
 * ===========================================
 * ======= RAG USAGE EXAMPLE ================
 * ===========================================
 *
 * This script demonstrates how to use the RAG-enhanced Ollama API
 * for different types of queries and scenarios.
 *
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @since: 2025-01-27
 */

import fetch from 'node-fetch';

const API_BASE_URL = 'http://localhost:3000/api/ollama';

/**
 * Example 1: Basic RAG query
 */
async function basicRAGExample() {
    console.log('\n📚 Example 1: Basic RAG Query');
    console.log('=' .repeat(50));
    console.log('This example shows how the AI tutor will reference course materials naturally.');
    console.log('Expected response style: "In the module, it is discussed that..."');
    
    const response = await fetch(`${API_BASE_URL}/chat/rag`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            messages: [
                { role: 'user', content: 'What is the difference between mass transfer and heat transfer?' }
            ],
            courseName: 'CHBE241',
            enableRAG: true,
            maxDocuments: 3,
            scoreThreshold: 0.7
        })
    });
    
    console.log('Status:', response.status);
    console.log('Response will be streamed...');
    console.log('Look for phrases like "In the module..." or "According to the course materials..."');
}

/**
 * Example 2: Course-specific query
 */
async function courseSpecificExample() {
    console.log('\n🎓 Example 2: Course-Specific Query');
    console.log('=' .repeat(50));
    
    const response = await fetch(`${API_BASE_URL}/chat/rag`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            messages: [
                { role: 'user', content: 'Explain the concept of diffusion in chemical processes' }
            ],
            courseName: 'CHBE241',
            enableRAG: true,
            maxDocuments: 5,
            scoreThreshold: 0.6
        })
    });
    
    console.log('Status:', response.status);
    console.log('Response will be streamed...');
}

/**
 * Example 3: High precision query
 */
async function highPrecisionExample() {
    console.log('\n🎯 Example 3: High Precision Query');
    console.log('=' .repeat(50));
    
    const response = await fetch(`${API_BASE_URL}/chat/rag`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            messages: [
                { role: 'user', content: 'What are the equations for Fick\'s law of diffusion?' }
            ],
            courseName: 'CHBE241',
            enableRAG: true,
            maxDocuments: 2,
            scoreThreshold: 0.9
        })
    });
    
    console.log('Status:', response.status);
    console.log('Response will be streamed...');
}

/**
 * Example 4: RAG disabled (fallback to regular chat)
 */
async function noRAGExample() {
    console.log('\n🚫 Example 4: RAG Disabled');
    console.log('=' .repeat(50));
    
    const response = await fetch(`${API_BASE_URL}/chat/rag`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            messages: [
                { role: 'user', content: 'What is chemical engineering?' }
            ],
            courseName: 'CHBE241',
            enableRAG: false
        })
    });
    
    console.log('Status:', response.status);
    console.log('Response will be streamed...');
}

/**
 * Example 5: Multi-turn conversation with RAG
 */
async function multiTurnExample() {
    console.log('\n💬 Example 5: Multi-Turn Conversation');
    console.log('=' .repeat(50));
    
    const response = await fetch(`${API_BASE_URL}/chat/rag`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            messages: [
                { role: 'user', content: 'What is mass transfer?' },
                { role: 'assistant', content: 'Mass transfer is the net movement of a component from one location to another...' },
                { role: 'user', content: 'Can you give me a specific example from our course materials?' }
            ],
            courseName: 'CHBE241',
            enableRAG: true,
            maxDocuments: 3,
            scoreThreshold: 0.7
        })
    });
    
    console.log('Status:', response.status);
    console.log('Response will be streamed...');
}

/**
 * Example 6: Error handling
 */
async function errorHandlingExample() {
    console.log('\n⚠️  Example 6: Error Handling');
    console.log('=' .repeat(50));
    
    try {
        // Invalid request - missing messages
        const response = await fetch(`${API_BASE_URL}/chat/rag`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                courseName: 'CHBE241',
                enableRAG: true
            })
        });
        
        console.log('Status:', response.status);
        const errorData = await response.json();
        console.log('Error response:', errorData);
        
    } catch (error) {
        console.error('Request failed:', error);
    }
}

/**
 * Example 7: Health check
 */
async function healthCheckExample() {
    console.log('\n🏥 Example 7: Health Check');
    console.log('=' .repeat(50));
    
    try {
        const response = await fetch(`${API_BASE_URL}/test`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });
        
        console.log('Status:', response.status);
        const data = await response.json();
        console.log('Health check result:', JSON.stringify(data, null, 2));
        
    } catch (error) {
        console.error('Health check failed:', error);
    }
}

/**
 * Run all examples
 */
async function runAllExamples() {
    console.log('🚀 RAG Usage Examples');
    console.log('=' .repeat(60));
    
    const examples = [
        { name: 'Basic RAG Query', fn: basicRAGExample },
        { name: 'Course-Specific Query', fn: courseSpecificExample },
        { name: 'High Precision Query', fn: highPrecisionExample },
        { name: 'RAG Disabled', fn: noRAGExample },
        { name: 'Multi-Turn Conversation', fn: multiTurnExample },
        { name: 'Error Handling', fn: errorHandlingExample },
        { name: 'Health Check', fn: healthCheckExample }
    ];
    
    for (const example of examples) {
        try {
            await example.fn();
            console.log(`✅ ${example.name} - Completed`);
        } catch (error) {
            console.error(`❌ ${example.name} - Failed:`, error);
        }
        
        // Add delay between examples
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('\n🎉 All examples completed!');
}

// Run examples if this script is executed directly
if (require.main === module) {
    runAllExamples().catch(console.error);
}

export {
    basicRAGExample,
    courseSpecificExample,
    highPrecisionExample,
    noRAGExample,
    multiTurnExample,
    errorHandlingExample,
    healthCheckExample,
    runAllExamples
};
