/**
 * Master Test Runner for Embedding Tests
 * 
 * This script runs all embedding-related tests in sequence.
 */

import { testEmbeddingGeneration } from './test-embedding-generation';
import { testQdrantEmptyUpload } from './test-qdrant-empty-upload';
import { runIntegratedTest } from './test-integrated-embedding-qdrant';

async function runAllTests() {
    console.log('🚀 Starting All Embedding Tests\n');
    console.log('=' .repeat(50));
    console.log('');

    const tests = [
        { name: 'Embedding Generation Test', fn: testEmbeddingGeneration },
        { name: 'Qdrant Empty Vector Upload Test', fn: testQdrantEmptyUpload },
        { name: 'Integrated Embedding + Qdrant Test', fn: runIntegratedTest }
    ];

    let passedTests = 0;
    let totalTests = tests.length;

    for (let i = 0; i < tests.length; i++) {
        const test = tests[i];
        console.log(`\n🧪 Running Test ${i + 1}/${totalTests}: ${test.name}`);
        console.log('-'.repeat(50));
        
        try {
            await test.fn();
            console.log(`✅ Test ${i + 1} passed: ${test.name}`);
            passedTests++;
        } catch (error) {
            console.error(`❌ Test ${i + 1} failed: ${test.name}`);
            console.error('Error:', error);
        }
        
        console.log('-'.repeat(50));
    }

    console.log('\n📊 Test Summary:');
    console.log(`   Total Tests: ${totalTests}`);
    console.log(`   Passed: ${passedTests}`);
    console.log(`   Failed: ${totalTests - passedTests}`);
    console.log(`   Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);

    if (passedTests === totalTests) {
        console.log('\n🎉 All tests passed successfully!');
        process.exit(0);
    } else {
        console.log('\n⚠️  Some tests failed. Please check the output above.');
        process.exit(1);
    }
}

// Run all tests
if (require.main === module) {
    runAllTests().catch(console.error);
}

export { runAllTests };
