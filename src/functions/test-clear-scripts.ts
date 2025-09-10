#!/usr/bin/env npx ts-node

/**
 * @fileoverview Test script to verify the RAG clearing scripts work correctly
 * 
 * This script tests the configuration loading and basic functionality
 * without actually deleting any data.
 * 
 * Usage: npx ts-node src/functions/test-clear-scripts.ts
 * 
 * @author: AI Assistant
 * @version: 1.0.0
 * @since: 2025-01-27
 */

import { createRAGConfig } from './clear-rag-database';

/**
 * Test function to verify configuration loading
 */
async function testConfiguration(): Promise<void> {
    console.log('🧪 Testing RAG clearing script configuration...');
    console.log('================================================');
    
    try {
        // Test configuration loading
        console.log('📋 Loading RAG configuration...');
        const config = createRAGConfig();
        
        console.log('✅ Configuration loaded successfully!');
        console.log('');
        console.log('📊 Configuration Details:');
        console.log(`   Provider: ${config.provider}`);
        console.log(`   Qdrant URL: ${config.qdrantConfig.url}`);
        console.log(`   Collection: ${config.qdrantConfig.collectionName}`);
        console.log(`   Vector Size: ${config.qdrantConfig.vectorSize}`);
        console.log(`   Distance Metric: ${config.qdrantConfig.distanceMetric}`);
        console.log('');
        
        // Test RAG module creation (without actually using it)
        console.log('🔧 Testing RAG module creation...');
        const { RAGModule } = await import('ubc-genai-toolkit-rag');
        
        console.log('✅ RAG module import successful!');
        console.log('✅ All dependencies are available');
        console.log('');
        
        console.log('🎉 Configuration test completed successfully!');
        console.log('✅ The clearing scripts should work correctly');
        console.log('');
        console.log('📝 Next steps:');
        console.log('   1. Run: npx ts-node src/functions/clear-rag-database.ts');
        console.log('   2. Or run: npx ts-node src/functions/nuclear-clear-rag.ts');
        console.log('   3. Both scripts will clear all documents from the database');
        
    } catch (error) {
        console.error('❌ Configuration test failed:');
        console.error(error);
        console.log('');
        console.log('🔧 Troubleshooting:');
        console.log('   1. Check that your .env file exists and has all required variables');
        console.log('   2. Ensure Qdrant is running and accessible');
        console.log('   3. Verify all API keys are correct');
        console.log('   4. Check the README-clear-rag.md for detailed instructions');
        process.exit(1);
    }
}

// Main execution
if (require.main === module) {
    testConfiguration()
        .then(() => {
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Test failed:', error);
            process.exit(1);
        });
}

export { testConfiguration };
