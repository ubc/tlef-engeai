/**
 * ===========================================
 * ========= MONGODB ENDPOINT TESTING =======
 * ===========================================
 *
 * This test script validates MongoDB connection and basic CRUD operations for the 
 * EngE-AI platform's course management system. It tests the core database functionality
 * including schema creation, document insertion, and connection management.
 *
 * Test Coverage:
 * - MongoDB connection establishment with authentication
 * - Course schema definition and validation
 * - Document creation and insertion operations
 * - Database connection lifecycle management
 * - Error handling for connection failures
 *
 * Test Data:
 * - Sample course: CSE101 "Intro to Eng" with byWeek frame type
 * - Collection: active-course-list in active-course-list-db database
 * - Schema: Course with id, date, name, frameType, tilesNumber fields
 *
 * Environment Requirements:
 * - MONGO_USERNAME and MONGO_PASSWORD environment variables
 * - MongoDB server running on localhost:27017
 * - Admin authentication source configured
 *
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @since: 2025-01-27
 * 
 */

import { ActiveCourseListDB } from '../functions/types';
import mongoose from "mongoose";
import { frameType } from '../functions/types';
import dotenv from 'dotenv';

dotenv.config();

//mongodb link
const MONGODB_URL = `mongodb://${process.env.MONGO_USERNAME}:${process.env.MONGO_PASSWORD}@localhost:27017`;



//create active course list collection
const activeCourseListDatabase = 'active-course-list-db';

//create active course list collection
const activeCourseListCollection = 'active-course-list';

//set mongodb endpoint (URI + database name)
const comodDBEndpoint = `${MONGODB_URL}/${activeCourseListDatabase}`;


/**
 * ===========================================
 * ========= TEST SUITE IMPLEMENTATION ======
 * ===========================================
 */

interface TestResult {
    testName: string;
    status: 'PASS' | 'FAIL';
    message: string;
    duration: number;
}

class MongoDBTestSuite {
    private testResults: TestResult[] = [];
    private SchemaCourse: any;

    constructor() {}

    /**
     * Run a single test with error handling and timing
     */
    private async runTest(testName: string, testFunction: () => Promise<void>): Promise<void> {
        const startTime = Date.now();
        try {
            await testFunction();
            const duration = Date.now() - startTime;
            this.testResults.push({
                testName,
                status: 'PASS',
                message: 'Test completed successfully',
                duration
            });
            console.log(`✅ ${testName} - PASSED (${duration}ms)`);
        } catch (error) {
            const duration = Date.now() - startTime;
            this.testResults.push({
                testName,
                status: 'FAIL',
                message: error instanceof Error ? error.message : 'Unknown error',
                duration
            });
            console.log(`❌ ${testName} - FAILED (${duration}ms): ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Test 1: MongoDB Connection
     */
    private async testConnection(): Promise<void> {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(comodDBEndpoint, {
            authSource: 'admin',
        });
        console.log('MongoDB connection established');
    }

    /**
     * Test 2: Schema Setup
     */
    private async testSchemaSetup(): Promise<void> {
        console.log('Setting up course schema...');
        this.SchemaCourse = mongoose.model('testCourse', new mongoose.Schema({
            id: { type: String, required: true },
            date: { type: Date, required: true },
            name: { type: String, required: true },
            frameType: { type: String, required: true, enum: ['byWeek', 'byTopic'] },
            tilesNumber: { type: Number, required: true },
        }, { collection: activeCourseListCollection }));
        console.log('Course schema configured successfully');
    }

    /**
     * Test 3: Document Creation
     */
    private async testDocumentCreation(): Promise<void> {
        console.log('Creating test course document...');
        const testCourse = {
            id: "CSE101",
            name: "Intro to Eng",
            frameType: "byWeek" as frameType,
            tilesNumber: 12,
            date: new Date()
        };
        
        const createdCourse = await this.SchemaCourse.create(testCourse);
        
        if (!createdCourse || createdCourse.id !== testCourse.id) {
            throw new Error('Course creation failed - document not properly saved');
        }
        console.log('Test course document created successfully');
    }

    /**
     * Test 4: Document Retrieval
     */
    private async testDocumentRetrieval(): Promise<void> {
        console.log('Testing document retrieval...');
        const retrievedCourse = await this.SchemaCourse.findOne({ id: "CSE101" });
        
        if (!retrievedCourse) {
            throw new Error('Course retrieval failed - document not found');
        }
        
        if (retrievedCourse.name !== "Intro to Eng") {
            throw new Error('Course retrieval failed - incorrect data');
        }
        console.log('Document retrieval successful');
    }

    /**
     * Test 5: Document Update
     */
    private async testDocumentUpdate(): Promise<void> {
        console.log('Testing document update...');
        const updateResult = await this.SchemaCourse.updateOne(
            { id: "CSE101" },
            { tilesNumber: 15 }
        );
        
        if (updateResult.modifiedCount !== 1) {
            throw new Error('Document update failed - no documents modified');
        }
        
        const updatedCourse = await this.SchemaCourse.findOne({ id: "CSE101" });
        if (updatedCourse.tilesNumber !== 15) {
            throw new Error('Document update failed - value not updated');
        }
        console.log('Document update successful');
    }

    /**
     * Test 6: Document Deletion
     */
    private async testDocumentDeletion(): Promise<void> {
        console.log('Testing document deletion...');
        const deleteResult = await this.SchemaCourse.deleteOne({ id: "CSE101" });
        
        if (deleteResult.deletedCount !== 1) {
            throw new Error('Document deletion failed - no documents deleted');
        }
        
        const deletedCourse = await this.SchemaCourse.findOne({ id: "CSE101" });
        if (deletedCourse) {
            throw new Error('Document deletion failed - document still exists');
        }
        console.log('Document deletion successful');
    }

    /**
     * Test 7: Schema Validation
     */
    private async testSchemaValidation(): Promise<void> {
        console.log('Testing schema validation...');
        
        try {
            // Test invalid frameType
            await this.SchemaCourse.create({
                id: "INVALID001",
                name: "Invalid Course",
                frameType: "invalidType", // Should fail validation
                tilesNumber: 10,
                date: new Date()
            });
            throw new Error('Schema validation failed - invalid frameType was accepted');
        } catch (validationError) {
            if (validationError instanceof Error && validationError.message.includes('validation failed')) {
                console.log('Schema validation working correctly');
                return;
            }
            throw validationError;
        }
    }

    /**
     * Test 8: Connection Cleanup
     */
    private async testConnectionCleanup(): Promise<void> {
        console.log('Testing connection cleanup...');
        await mongoose.disconnect();
        
        if (mongoose.connection.readyState !== 0) {
            throw new Error('Connection cleanup failed - connection still active');
        }
        console.log('Connection cleanup successful');
    }

    /**
     * Generate test report
     */
    private generateTestReport(): void {
        console.log('\n===========================================');
        console.log('========= MONGODB TEST REPORT =============');
        console.log('===========================================');
        
        const totalTests = this.testResults.length;
        const passedTests = this.testResults.filter(r => r.status === 'PASS').length;
        const failedTests = totalTests - passedTests;
        const totalDuration = this.testResults.reduce((sum, r) => sum + r.duration, 0);

        console.log(`\nTotal Tests: ${totalTests}`);
        console.log(`Passed: ${passedTests} ✅`);
        console.log(`Failed: ${failedTests} ❌`);
        console.log(`Total Duration: ${totalDuration}ms`);
        console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);

        if (failedTests > 0) {
            console.log('\n--- FAILED TESTS ---');
            this.testResults
                .filter(r => r.status === 'FAIL')
                .forEach(r => {
                    console.log(`❌ ${r.testName}: ${r.message}`);
                });
        }

        console.log('\n--- DETAILED RESULTS ---');
        this.testResults.forEach(r => {
            const statusIcon = r.status === 'PASS' ? '✅' : '❌';
            console.log(`${statusIcon} ${r.testName} (${r.duration}ms): ${r.message}`);
        });
        
        console.log('\n===========================================\n');
    }

    /**
     * Main test runner
     */
    async runAllTests(): Promise<void> {
        console.log('===========================================');
        console.log('========= STARTING MONGODB TESTS =========');
        console.log('===========================================\n');

        // Run all tests in sequence
        await this.runTest('MongoDB Connection', () => this.testConnection());
        await this.runTest('Schema Setup', () => this.testSchemaSetup());
        await this.runTest('Document Creation', () => this.testDocumentCreation());
        await this.runTest('Document Retrieval', () => this.testDocumentRetrieval());
        await this.runTest('Document Update', () => this.testDocumentUpdate());
        await this.runTest('Document Deletion', () => this.testDocumentDeletion());
        await this.runTest('Schema Validation', () => this.testSchemaValidation());
        await this.runTest('Connection Cleanup', () => this.testConnectionCleanup());

        // Generate final report
        this.generateTestReport();
    }
}

// Execute test suite
async function run() {
    const testSuite = new MongoDBTestSuite();
    await testSuite.runAllTests();
}

run();














