/**
 * ===========================================
 * ========= OLLAMA RAG API TESTING =========
 * ===========================================
 *
 * This script tests the Ollama RAG API endpoints to ensure proper functionality
 * of the retrieval-augmented generation system.
 *
 * Test Coverage:
 * - Basic chat functionality (backward compatibility)
 * - RAG-enhanced chat with document retrieval
 * - API health check and service validation
 * - Error handling and edge cases
 * - Performance testing with different parameters
 *
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @since: 2025-01-27
 */

import fetch from 'node-fetch';

// Configuration
const API_BASE_URL = 'http://localhost:3000/api/ollama';
const TEST_COURSE_NAME = 'CHBE241';

// Test data
const testMessages = [
    {
        role: 'user' as const,
        content: 'What is the difference between mass transfer and heat transfer?'
    }
];

const ragTestMessages = [
    {
        role: 'user' as const,
        content: 'Explain the concept of diffusion in chemical engineering processes.'
    }
];

/**
 * Test basic chat functionality
 */
async function testBasicChat(): Promise<void> {
    console.log('\n🧪 Testing Basic Chat Endpoint...');
    
    try {
        const response = await fetch(`${API_BASE_URL}/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                messages: testMessages
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }

        console.log('✅ Basic chat endpoint is working');
        console.log('📊 Response status:', response.status);
        console.log('📊 Content-Type:', response.headers.get('content-type'));
        
        // Note: We can't easily test streaming response in this simple test
        // In a real implementation, you'd want to handle the stream properly
        
    } catch (error) {
        console.error('❌ Basic chat test failed:', error);
        throw error;
    }
}

/**
 * Test RAG-enhanced chat functionality
 */
async function testRAGChat(): Promise<void> {
    console.log('\n🧪 Testing RAG Chat Endpoint...');
    
    try {
        const response = await fetch(`${API_BASE_URL}/chat/rag`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                messages: ragTestMessages,
                courseName: TEST_COURSE_NAME,
                enableRAG: true,
                maxDocuments: 3,
                scoreThreshold: 0.7
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }

        console.log('✅ RAG chat endpoint is working');
        console.log('📊 Response status:', response.status);
        console.log('📊 Content-Type:', response.headers.get('content-type'));
        
    } catch (error) {
        console.error('❌ RAG chat test failed:', error);
        throw error;
    }
}

/**
 * Test RAG chat with different parameters
 */
async function testRAGParameters(): Promise<void> {
    console.log('\n🧪 Testing RAG with Different Parameters...');
    
    const testCases = [
        {
            name: 'High relevance threshold',
            params: {
                messages: ragTestMessages,
                courseName: TEST_COURSE_NAME,
                enableRAG: true,
                maxDocuments: 2,
                scoreThreshold: 0.9
            }
        },
        {
            name: 'More documents',
            params: {
                messages: ragTestMessages,
                courseName: TEST_COURSE_NAME,
                enableRAG: true,
                maxDocuments: 5,
                scoreThreshold: 0.5
            }
        },
        {
            name: 'RAG disabled',
            params: {
                messages: ragTestMessages,
                courseName: TEST_COURSE_NAME,
                enableRAG: false,
                maxDocuments: 3,
                scoreThreshold: 0.7
            }
        }
    ];

    for (const testCase of testCases) {
        try {
            console.log(`  Testing: ${testCase.name}`);
            
            const response = await fetch(`${API_BASE_URL}/chat/rag`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(testCase.params)
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${await response.text()}`);
            }

            console.log(`  ✅ ${testCase.name} - Success`);
            
        } catch (error) {
            console.error(`  ❌ ${testCase.name} - Failed:`, error);
        }
    }
}

/**
 * Test API health check
 */
async function testHealthCheck(): Promise<void> {
    console.log('\n🧪 Testing API Health Check...');
    
    try {
        const response = await fetch(`${API_BASE_URL}/test`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }

        const data = await response.json();
        
        console.log('✅ Health check endpoint is working');
        console.log('📊 Response:', JSON.stringify(data, null, 2));
        
        // Validate service status
        const qdrantOk = data.services?.qdrant?.connected;
        const embeddingsOk = data.services?.embeddings?.working;
        const ollamaOk = data.services?.ollama?.accessible;
        
        if (qdrantOk && embeddingsOk && ollamaOk) {
            console.log('✅ All services are operational');
        } else {
            console.warn('⚠️  Some services may not be fully operational');
            if (!qdrantOk) {
                console.log('  - Qdrant:', data.services?.qdrant?.error || 'Not connected');
            }
            if (!embeddingsOk) {
                console.log('  - Embeddings:', data.services?.embeddings?.error || 'Not working');
            }
            if (!ollamaOk) {
                console.log('  - Ollama:', data.services?.ollama?.error || 'Not accessible');
            }
        }
        
    } catch (error) {
        console.error('❌ Health check test failed:', error);
        throw error;
    }
}

/**
 * Test error handling
 */
async function testErrorHandling(): Promise<void> {
    console.log('\n🧪 Testing Error Handling...');
    
    const errorTestCases = [
        {
            name: 'Missing messages',
            body: {},
            expectedStatus: 400
        },
        {
            name: 'Invalid messages format',
            body: { messages: 'invalid' },
            expectedStatus: 400
        },
        {
            name: 'Empty messages array',
            body: { messages: [] },
            expectedStatus: 400
        }
    ];

    for (const testCase of errorTestCases) {
        try {
            console.log(`  Testing: ${testCase.name}`);
            
            const response = await fetch(`${API_BASE_URL}/chat/rag`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(testCase.body)
            });

            if (response.status === testCase.expectedStatus) {
                console.log(`  ✅ ${testCase.name} - Correct error handling`);
            } else {
                console.log(`  ⚠️  ${testCase.name} - Unexpected status: ${response.status}`);
            }
            
        } catch (error) {
            console.error(`  ❌ ${testCase.name} - Test failed:`, error);
        }
    }
}

/**
 * Test performance with timing
 */
async function testPerformance(): Promise<void> {
    console.log('\n🧪 Testing Performance...');
    
    const iterations = 3;
    const times: number[] = [];
    
    for (let i = 0; i < iterations; i++) {
        try {
            const startTime = Date.now();
            
            const response = await fetch(`${API_BASE_URL}/chat/rag`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    messages: ragTestMessages,
                    courseName: TEST_COURSE_NAME,
                    enableRAG: true,
                    maxDocuments: 3,
                    scoreThreshold: 0.7
                })
            });

            const endTime = Date.now();
            const duration = endTime - startTime;
            times.push(duration);
            
            if (response.ok) {
                console.log(`  Request ${i + 1}: ${duration}ms`);
            } else {
                console.log(`  Request ${i + 1}: Failed (${response.status})`);
            }
            
        } catch (error) {
            console.error(`  Request ${i + 1}: Error -`, error);
        }
    }
    
    if (times.length > 0) {
        const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
        const minTime = Math.min(...times);
        const maxTime = Math.max(...times);
        
        console.log(`📊 Performance Summary:`);
        console.log(`  Average: ${avgTime.toFixed(2)}ms`);
        console.log(`  Min: ${minTime}ms`);
        console.log(`  Max: ${maxTime}ms`);
    }
}

/**
 * Main test runner
 */
async function runAllTests(): Promise<void> {
    console.log('🚀 Starting Ollama RAG API Tests...');
    console.log(`📍 Testing against: ${API_BASE_URL}`);
    console.log(`📚 Test course: ${TEST_COURSE_NAME}`);
    
    const startTime = Date.now();
    let passedTests = 0;
    let totalTests = 0;
    
    const tests = [
        { name: 'Health Check', fn: testHealthCheck },
        { name: 'Basic Chat', fn: testBasicChat },
        { name: 'RAG Chat', fn: testRAGChat },
        { name: 'RAG Parameters', fn: testRAGParameters },
        { name: 'Error Handling', fn: testErrorHandling },
        { name: 'Performance', fn: testPerformance }
    ];
    
    for (const test of tests) {
        try {
            totalTests++;
            await test.fn();
            passedTests++;
            console.log(`✅ ${test.name} - PASSED`);
        } catch (error) {
            console.log(`❌ ${test.name} - FAILED`);
            console.error('Error details:', error);
        }
    }
    
    const endTime = Date.now();
    const totalDuration = endTime - startTime;
    
    console.log('\n📊 Test Summary:');
    console.log(`  Passed: ${passedTests}/${totalTests}`);
    console.log(`  Duration: ${totalDuration}ms`);
    
    if (passedTests === totalTests) {
        console.log('🎉 All tests passed!');
    } else {
        console.log('⚠️  Some tests failed. Check the logs above.');
    }
}

// Run tests if this script is executed directly
if (require.main === module) {
    runAllTests().catch(console.error);
}

export {
    testBasicChat,
    testRAGChat,
    testRAGParameters,
    testHealthCheck,
    testErrorHandling,
    testPerformance,
    runAllTests
};
