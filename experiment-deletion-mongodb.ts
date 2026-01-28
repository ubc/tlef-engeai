/**
 * Experimental MongoDB deletion script
 * Tests adding and removing struggle words from a MongoDB collection
 *
 * Schema: { struggleWords: string[] }
 * Collection: "experiment"
 * Database: "TLEF-ENGE-DB"
 */

import { MongoClient, Db, Collection } from 'mongodb';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Override the database name for this experiment
const MONGO_DB_NAME = 'TLEF-ENGE-DB';
const EXPERIMENT_COLLECTION = 'experiment';

// Interface for experiment document
interface ExperimentDocument {
    _id?: string;
    struggleWords: string[];
}

/**
 * Add a struggle word to the experiment collection
 * Creates a document if it doesn't exist, or updates existing one
 */
async function addStruggleWord(struggleWord: string): Promise<void> {
    const client = new MongoClient(process.env.MONGO_URI ||
        `mongodb://${encodeURIComponent(process.env.MONGO_USERNAME || '')}:${encodeURIComponent(process.env.MONGO_PASSWORD || '')}@${process.env.MONGO_HOST}:${process.env.MONGO_PORT}`);

    try {
        await client.connect();
        const db: Db = client.db(MONGO_DB_NAME);
        const collection: Collection<ExperimentDocument> = db.collection(EXPERIMENT_COLLECTION);

        console.log(`🔄 Adding struggle word: "${struggleWord}"`);

        // Try to find existing document (assuming single document for experiment)
        const existingDoc = await collection.findOne({});

        if (!existingDoc) {
            // Create new document
            const newDoc: ExperimentDocument = {
                struggleWords: [struggleWord]
            };
            const result = await collection.insertOne(newDoc);
            console.log(`✅ Created new document with struggle word. Inserted ID: ${result.insertedId}`);
        } else {
            // Update existing document - add word if not already present
            if (!existingDoc.struggleWords.includes(struggleWord)) {
                const result = await collection.updateOne(
                    { _id: existingDoc._id },
                    { $push: { struggleWords: struggleWord } }
                );
                console.log(`✅ Added struggle word to existing document. Modified count: ${result.modifiedCount}`);
            } else {
                console.log(`⚠️ Struggle word "${struggleWord}" already exists in document`);
            }
        }

        // Show current state
        const currentDoc = await collection.findOne({});
        console.log(`📊 Current struggle words: ${JSON.stringify(currentDoc?.struggleWords || [])}`);

    } catch (error) {
        console.error('❌ Error adding struggle word:', error);
        throw error;
    } finally {
        await client.close();
    }
}

/**
 * Delete a struggle word from the experiment collection
 */
async function deleteStruggleWord(struggleWord: string): Promise<void> {
    const client = new MongoClient(process.env.MONGO_URI ||
        `mongodb://${encodeURIComponent(process.env.MONGO_USERNAME || '')}:${encodeURIComponent(process.env.MONGO_PASSWORD || '')}@${process.env.MONGO_HOST}:${process.env.MONGO_PORT}`);

    try {
        await client.connect();
        const db: Db = client.db(MONGO_DB_NAME);
        const collection: Collection<ExperimentDocument> = db.collection(EXPERIMENT_COLLECTION);

        console.log(`🔄 Deleting struggle word: "${struggleWord}"`);

        // Find the document
        const existingDoc = await collection.findOne({});

        if (!existingDoc) {
            console.log('⚠️ No document found in collection');
            return;
        }

        // Check if word exists in array
        if (!existingDoc.struggleWords.includes(struggleWord)) {
            console.log(`⚠️ Struggle word "${struggleWord}" not found in document`);
            return;
        }

        // Remove the word from the array
        const result = await collection.updateOne(
            { _id: existingDoc._id },
            { $pull: { struggleWords: struggleWord } }
        );

        console.log(`✅ Deleted struggle word. Modified count: ${result.modifiedCount}`);

        // Show current state
        const currentDoc = await collection.findOne({});
        console.log(`📊 Current struggle words: ${JSON.stringify(currentDoc?.struggleWords || [])}`);

    } catch (error) {
        console.error('❌ Error deleting struggle word:', error);
        throw error;
    } finally {
        await client.close();
    }
}

/**
 * Main experimental function
 * Tests adding and deleting struggle words
 */
async function main(): Promise<void> {
    console.log('🚀 Starting MongoDB Deletion Experiment');
    console.log(`📍 Database: ${MONGO_DB_NAME}`);
    console.log(`📁 Collection: ${EXPERIMENT_COLLECTION}`);
    console.log('');

    try {
        // Test word
        const testWord = 'Hello';

        // Add struggle word
        console.log('=== PHASE 1: Adding Struggle Word ===');
        await addStruggleWord(testWord);
        console.log('');

        // Delete struggle word
        console.log('=== PHASE 2: Deleting Struggle Word ===');
        await deleteStruggleWord(testWord);
        console.log('');

        console.log('✅ Experiment completed successfully');

    } catch (error) {
        console.error('❌ Experiment failed:', error);
        process.exit(1);
    }
}

// Run the experiment
if (require.main === module) {
    main().catch(console.error);
}

export { addStruggleWord, deleteStruggleWord, main };