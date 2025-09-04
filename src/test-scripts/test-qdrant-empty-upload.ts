/**
 * Test 2: Mock Content Upload with Empty Vector
 * 
 * This test uploads mock content to Qdrant with an empty vector to test
 * the upload functionality without requiring actual embedding generation.
 */

import * as dotenv from 'dotenv';
import { QdrantClient } from '@qdrant/js-client-rest';
import type { AdditionalMaterial } from '../functions/types';

// Load environment variables
dotenv.config();

async function testQdrantEmptyUpload() {
    console.log('🧪 Starting Qdrant Empty Vector Upload Test...\n');

    try {
        // Initialize Qdrant client
        const qdrantClient = new QdrantClient({
            url: process.env.QDRANT_URL || 'http://localhost:6333',
            apiKey: process.env.QDRANT_API_KEY,
        });

        console.log('📋 Qdrant Configuration:');
        console.log(`   URL: ${process.env.QDRANT_URL || 'http://localhost:6333'}`);
        console.log(`   API Key: ${process.env.QDRANT_API_KEY ? 'Set' : 'Not set'}\n`);

        // Test collection name
        const collectionName = 'tlef_documents';
        const vectorSize = 768; // Standard embedding size

        // Check if collection exists, create if not
        console.log('🔍 Checking collection existence...');
        try {
            const collections = await qdrantClient.getCollections();
            const collectionExists = collections.collections.some(c => c.name === collectionName);
            
            if (!collectionExists) {
                console.log(`📦 Creating collection '${collectionName}'...`);
                await qdrantClient.createCollection(collectionName, {
                    vectors: {
                        size: vectorSize,
                        distance: 'Cosine',
                    },
                });
                console.log(`✅ Collection '${collectionName}' created successfully\n`);
            } else {
                console.log(`ℹ️  Collection '${collectionName}' already exists\n`);
            }
        } catch (error) {
            console.error('❌ Error checking/creating collection:', error);
            throw error;
        }

        // Create mock content data with integer IDs for Qdrant
        const mockContents = [
            {
                id: 1,
                date: new Date(),
                name: 'First Law of Thermodynamics',
                courseName: 'CHBE241',
                divisionTitle: 'Thermodynamics',
                itemTitle: 'First Law of Thermodynamics',
                sourceType: 'text',
                text: 'The first law of thermodynamics states that energy cannot be created or destroyed, only transferred or converted from one form to another.',
                uploaded: true,
                chunkNumber: 1,
                createdAt: new Date(),
                updatedAt: new Date()
            },
            {
                id: 2,
                date: new Date(),
                name: 'Second Law of Thermodynamics',
                courseName: 'CHBE241',
                divisionTitle: 'Thermodynamics',
                itemTitle: 'Second Law of Thermodynamics',
                sourceType: 'text',
                text: 'The second law of thermodynamics states that the entropy of an isolated system not in equilibrium will tend to increase over time.',
                uploaded: true,
                chunkNumber: 1,
                createdAt: new Date(),
                updatedAt: new Date()
            },
            {
                id: 3,
                date: new Date(),
                name: 'BCC Structure',
                courseName: 'MTRL251',
                divisionTitle: 'Crystal Structure',
                itemTitle: 'BCC Structure',
                sourceType: 'text',
                text: 'Body-centered cubic (BCC) is a crystal structure where atoms are located at the corners and center of a cube.',
                uploaded: true,
                chunkNumber: 1,
                createdAt: new Date(),
                updatedAt: new Date()
            }
        ];

        console.log('📝 Uploading mock content with empty vectors...\n');

        // Upload each mock content with empty vector
        for (let i = 0; i < mockContents.length; i++) {
            const content = mockContents[i];
            console.log(`📤 Uploading content ${i + 1}/${mockContents.length}:`);
            console.log(`   ID: ${content.id}`);
            console.log(`   Course: ${content.courseName}`);
            console.log(`   Division: ${content.divisionTitle}`);
            console.log(`   Item: ${content.itemTitle}`);
            console.log(`   Text: "${content.text?.substring(0, 50) || 'No text'}..."`);

            try {
                // Create empty vector (all zeros)
                const emptyVector = new Array(vectorSize).fill(0);
                
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
                const result = await qdrantClient.upsert(collectionName, {
                    points: [
                        {
                            id: content.id,
                            payload: payload,
                            vector: emptyVector,
                        }
                    ]
                });

                console.log(`   ✅ Upload successful`);
                console.log(`   📊 Operation ID: ${result.operation_id}`);
                console.log(`   ⏱️  Status: ${result.status}\n`);

            } catch (error) {
                console.error(`   ❌ Upload failed:`, error);
                console.log('');
            }
        }

        // Verify uploads by retrieving data
        console.log('🔍 Verifying uploads by retrieving data...\n');

        try {
            // Get all documents for CHBE241
            const chbeDocs = await qdrantClient.scroll(collectionName, {
                filter: {
                    must: [
                        {
                            key: 'courseName',
                            match: {
                                value: 'CHBE241'
                            }
                        }
                    ]
                },
                limit: 10
            });

            console.log(`📚 Retrieved ${chbeDocs.points.length} documents for CHBE241:`);
            chbeDocs.points.forEach((point, index) => {
                console.log(`   ${index + 1}. ID: ${point.id}`);
                console.log(`      Course: ${point.payload?.courseName || 'N/A'}`);
                console.log(`      Division: ${point.payload?.contentTitle || 'N/A'}`);
                console.log(`      Item: ${point.payload?.subcontentTitle || 'N/A'}`);
                console.log(`      Vector size: ${(point.vector as number[])?.length || 0}`);
                console.log(`      Vector sum: ${(point.vector as number[])?.reduce((a: number, b: number) => a + b, 0) || 0} (should be 0 for empty vector)`);
                console.log('');
            });

            // Get all documents for MTRL251
            const mtrlDocs = await qdrantClient.scroll(collectionName, {
                filter: {
                    must: [
                        {
                            key: 'courseName',
                            match: {
                                value: 'MTRL251'
                            }
                        }
                    ]
                },
                limit: 10
            });

            console.log(`📚 Retrieved ${mtrlDocs.points.length} documents for MTRL251:`);
            mtrlDocs.points.forEach((point, index) => {
                console.log(`   ${index + 1}. ID: ${point.id}`);
                console.log(`      Course: ${point.payload?.courseName || 'N/A'}`);
                console.log(`      Division: ${point.payload?.contentTitle || 'N/A'}`);
                console.log(`      Item: ${point.payload?.subcontentTitle || 'N/A'}`);
                console.log(`      Vector size: ${(point.vector as number[])?.length || 0}`);
                console.log(`      Vector sum: ${(point.vector as number[])?.reduce((a: number, b: number) => a + b, 0) || 0} (should be 0 for empty vector)`);
                console.log('');
            });

        } catch (error) {
            console.error('❌ Error retrieving data:', error);
        }

        console.log('🎉 Qdrant empty vector upload test completed successfully!');

    } catch (error) {
        console.error('❌ Test failed:', error);
        process.exit(1);
    }
}

// Run the test
if (require.main === module) {
    testQdrantEmptyUpload().catch(console.error);
}

export { testQdrantEmptyUpload };
