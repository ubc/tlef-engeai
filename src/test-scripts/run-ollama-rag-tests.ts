/**
 * ===========================================
 * ======= OLLAMA RAG TEST RUNNER ===========
 * ===========================================
 *
 * Simple test runner for Ollama RAG API testing.
 * This script provides an easy way to run all RAG tests.
 *
 * Usage:
 *   npm run test:ollama-rag
 *   or
 *   npx ts-node src/test-scripts/run-ollama-rag-tests.ts
 *
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @since: 2025-01-27
 */

import { runAllTests } from './test-ollama-rag';

// Add some styling to the console output
console.log('='.repeat(60));
console.log('🚀 OLLAMA RAG API TEST SUITE');
console.log('='.repeat(60));

// Run all tests
runAllTests()
    .then(() => {
        console.log('\n' + '='.repeat(60));
        console.log('✨ Test execution completed!');
        console.log('='.repeat(60));
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n' + '='.repeat(60));
        console.error('💥 Test execution failed!');
        console.error('Error:', error);
        console.error('='.repeat(60));
        process.exit(1);
    });
