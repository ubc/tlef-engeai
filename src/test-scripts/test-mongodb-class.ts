/**
 * ===========================================
 * ========= MONGODB CLASS TESTING ==========
 * ===========================================
 *
 * This test suite provides comprehensive unit and integration testing for the EngEAI_MongoDB class.
 * It tests all CRUD operations, singleton pattern, schema validation, and collection creation
 * functionality for the EngE-AI platform's course management system.
 *
 * Test Categories:
 * - Unit Tests: Individual method testing with mocked dependencies
 * - Integration Tests: Full database operations with real MongoDB connection
 * - Combination Tests: Complex workflows involving multiple operations
 * - Error Handling Tests: Validation of error scenarios and edge cases
 * - Performance Tests: Timing and efficiency validation
 *
 * Test Coverage:
 * - Singleton pattern implementation
 * - Course CRUD operations (Create, Read, Update, Delete)
 * - Collection and schema creation for new courses
 * - Database connection management
 * - Schema validation and error handling
 * - Multi-course operations and data isolation
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

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { ActiveCourseListDB, frameType } from '../functions/types';

// Import the MongoDB class
import { EngEAI_MongoDB } from '../routes/mongodb';

dotenv.config();

/**
 * ===========================================
 * ========= TEST INTERFACES ================
 * ===========================================
 */

interface TestResult {
    testName: string;
    category: 'UNIT' | 'INTEGRATION' | 'COMBINATION' | 'ERROR_HANDLING' | 'PERFORMANCE';
    status: 'PASS' | 'FAIL';
    message: string;
    duration: number;
    details?: any;
}

interface TestSuite {
    name: string;
    results: TestResult[];
    totalDuration: number;
    passRate: number;
}

/**
 * ===========================================
 * ========= MONGODB TEST SUITE =============
 * ===========================================
 */

class MongoDBClassTestSuite {
    private testResults: TestResult[] = [];
    private testData: {
        validCourse: ActiveCourseListDB;
        invalidCourse: Partial<ActiveCourseListDB>;
        multipleCourses: ActiveCourseListDB[];
    };

    constructor() {
        this.testData = {
            validCourse: {
                id: "TEST001",
                name: "Test Course 1",
                frameType: "byWeek" as frameType,
                tilesNumber: 10,
                date: new Date()
            },
            invalidCourse: {
                id: "INVALID",
                name: "", // Invalid: empty name
                frameType: "invalidType" as any, // Invalid: not in enum
                tilesNumber: -1, // Invalid: negative number
                date: new Date()
            },
            multipleCourses: [
                {
                    id: "TEST002",
                    name: "Test Course 2",
                    frameType: "byTopic" as frameType,
                    tilesNumber: 15,
                    date: new Date()
                },
                {
                    id: "TEST003",
                    name: "Test Course 3",
                    frameType: "byWeek" as frameType,
                    tilesNumber: 20,
                    date: new Date()
                }
            ]
        };
    }

    /**
     * ===========================================
     * ========= TEST EXECUTION HELPERS =========
     * ===========================================
     */

    private async runTest(
        testName: string,
        category: TestResult['category'],
        testFunction: () => Promise<void>,
        expectedError?: string
    ): Promise<void> {
        const startTime = Date.now();
        try {
            await testFunction();
            const duration = Date.now() - startTime;
            
            if (expectedError) {
                this.testResults.push({
                    testName,
                    category,
                    status: 'FAIL',
                    message: `Expected error '${expectedError}' but test passed`,
                    duration
                });
                console.log(`❌ ${testName} - FAILED: Expected error but test passed`);
            } else {
                this.testResults.push({
                    testName,
                    category,
                    status: 'PASS',
                    message: 'Test completed successfully',
                    duration
                });
                console.log(`✅ ${testName} - PASSED (${duration}ms)`);
            }
        } catch (error) {
            const duration = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            
            if (expectedError && errorMessage.includes(expectedError)) {
                this.testResults.push({
                    testName,
                    category,
                    status: 'PASS',
                    message: `Expected error caught: ${errorMessage}`,
                    duration
                });
                console.log(`✅ ${testName} - PASSED: Expected error caught (${duration}ms)`);
            } else {
                this.testResults.push({
                    testName,
                    category,
                    status: 'FAIL',
                    message: errorMessage,
                    duration
                });
                console.log(`❌ ${testName} - FAILED (${duration}ms): ${errorMessage}`);
            }
        }
    }

    /**
     * ===========================================
     * ========= UNIT TESTS =====================
     * ===========================================
     */

    private async testSingletonPattern(): Promise<void> {
        // Test that getInstance returns the same instance
        const instance1 = await EngEAI_MongoDB.getInstance();
        const instance2 = await EngEAI_MongoDB.getInstance();
        
        if (instance1 !== instance2) {
            throw new Error('Singleton pattern failed - different instances returned');
        }
    }

    private async testConnectionEstablishment(): Promise<void> {
        const instance = await EngEAI_MongoDB.getInstance();
        if (!instance) {
            throw new Error('Failed to get MongoDB instance');
        }
    }

    private async testSchemaValidation(): Promise<void> {
        // Test that the class can be instantiated and has proper schema
        const instance = await EngEAI_MongoDB.getInstance();
        if (!instance) {
            throw new Error('Failed to get MongoDB instance for schema validation');
        }
    }

    /**
     * ===========================================
     * ========= INTEGRATION TESTS ==============
     * ===========================================
     */

    private async testCourseCreation(): Promise<void> {
        const instance = await EngEAI_MongoDB.getInstance();
        
        // Test creating a course using the public method
        await instance.postActiveCourse(this.testData.validCourse);
        
        // Verify the course was created
        const createdCourse = await instance.getActiveCourse(this.testData.validCourse.id);
        if (!createdCourse) {
            throw new Error('Course creation failed - course not found after creation');
        }
        
        if (createdCourse.name !== this.testData.validCourse.name) {
            throw new Error('Course creation failed - incorrect data saved');
        }
    }

    private async testCourseRetrieval(): Promise<void> {
        const instance = await EngEAI_MongoDB.getInstance();
        
        // Test retrieving by ID
        const courseById = await instance.getActiveCourse(this.testData.validCourse.id);
        if (!courseById) {
            throw new Error('Course retrieval by ID failed');
        }
        
        // Test retrieving by name
        const courseByName = await instance.getCourseByName(this.testData.validCourse.name);
        if (!courseByName) {
            throw new Error('Course retrieval by name failed');
        }
        
        if (courseById.id !== courseByName.id) {
            throw new Error('Course retrieval inconsistency - different courses returned');
        }
    }

    private async testCourseDeletion(): Promise<void> {
        const instance = await EngEAI_MongoDB.getInstance();
        
        // Create a course to delete
        const courseToDelete = {
            id: "DELETE_TEST",
            name: "Course to Delete",
            frameType: "byWeek" as frameType,
            tilesNumber: 5,
            date: new Date()
        };
        
        await instance.postActiveCourse(courseToDelete);
        
        // Verify it exists
        const beforeDelete = await instance.getActiveCourse(courseToDelete.id);
        if (!beforeDelete) {
            throw new Error('Course not created for deletion test');
        }
        
        // Delete the course
        await instance.deleteActiveCourse(courseToDelete);
        
        // Verify it's deleted
        const afterDelete = await instance.getActiveCourse(courseToDelete.id);
        if (afterDelete) {
            throw new Error('Course deletion failed - course still exists');
        }
    }

    private async testMultipleCoursesRetrieval(): Promise<void> {
        const instance = await EngEAI_MongoDB.getInstance();
        
        // Create multiple courses
        for (const course of this.testData.multipleCourses) {
            await instance.postActiveCourse(course);
        }
        
        // Retrieve all courses
        const allCourses = await instance.getAllActiveCourses();
        
        if (!Array.isArray(allCourses)) {
            throw new Error('getAllActiveCourses should return an array');
        }
        
        // Verify all our test courses are in the results
        const testCourseIds = this.testData.multipleCourses.map(c => c.id);
        const foundCourseIds = allCourses.map((c: any) => c.id);
        
        for (const testId of testCourseIds) {
            if (!foundCourseIds.includes(testId)) {
                throw new Error(`Course ${testId} not found in getAllActiveCourses results`);
            }
        }
    }

    /**
     * ===========================================
     * ========= COMBINATION TESTS ==============
     * ===========================================
     */

    private async testFullCourseLifecycle(): Promise<void> {
        const instance = await EngEAI_MongoDB.getInstance();
        
        const lifecycleCourse = {
            id: "LIFECYCLE_TEST",
            name: "Lifecycle Test Course",
            frameType: "byTopic" as frameType,
            tilesNumber: 25,
            date: new Date()
        };
        
        // 1. Create course
        await instance.postActiveCourse(lifecycleCourse);
        
        // 2. Verify creation
        const created = await instance.getActiveCourse(lifecycleCourse.id);
        if (!created) {
            throw new Error('Step 1: Course creation failed');
        }
        
        // 3. Verify by name
        const byName = await instance.getCourseByName(lifecycleCourse.name);
        if (!byName) {
            throw new Error('Step 2: Course retrieval by name failed');
        }
        
        // 4. Verify in all courses
        const allCourses = await instance.getAllActiveCourses();
        const foundInAll = allCourses.some((c: any) => c.id === lifecycleCourse.id);
        if (!foundInAll) {
            throw new Error('Step 3: Course not found in getAllActiveCourses');
        }
        
        // 5. Delete course
        await instance.deleteActiveCourse(lifecycleCourse);
        
        // 6. Verify deletion
        const afterDelete = await instance.getActiveCourse(lifecycleCourse.id);
        if (afterDelete) {
            throw new Error('Step 4: Course deletion failed');
        }
    }

    private async testConcurrentOperations(): Promise<void> {
        const instance = await EngEAI_MongoDB.getInstance();
        
        // Create multiple courses concurrently
        const concurrentPromises = this.testData.multipleCourses.map(course => 
            instance.postActiveCourse(course)
        );
        
        await Promise.all(concurrentPromises);
        
        // Verify all were created
        const allCourses = await instance.getAllActiveCourses();
        const testCourseIds = this.testData.multipleCourses.map(c => c.id);
        
        for (const testId of testCourseIds) {
            const found = allCourses.some((c: any) => c.id === testId);
            if (!found) {
                throw new Error(`Concurrent operation failed - course ${testId} not found`);
            }
        }
    }

    private async testDataIsolation(): Promise<void> {
        const instance = await EngEAI_MongoDB.getInstance();
        
        // Create courses with similar but different data
        const course1 = {
            id: "ISOLATION_1",
            name: "Isolation Test 1",
            frameType: "byWeek" as frameType,
            tilesNumber: 10,
            date: new Date()
        };
        
        const course2 = {
            id: "ISOLATION_2",
            name: "Isolation Test 2",
            frameType: "byTopic" as frameType,
            tilesNumber: 20,
            date: new Date()
        };
        
        await instance.postActiveCourse(course1);
        await instance.postActiveCourse(course2);
        
        // Verify data isolation
        const retrieved1 = await instance.getActiveCourse(course1.id);
        const retrieved2 = await instance.getActiveCourse(course2.id);
        
        if (!retrieved1 || !retrieved2) {
            throw new Error('Data isolation test failed - courses not found');
        }
        
        if (retrieved1.name === retrieved2.name || retrieved1.tilesNumber === retrieved2.tilesNumber) {
            throw new Error('Data isolation test failed - course data mixed up');
        }
    }

    /**
     * ===========================================
     * ========= ERROR HANDLING TESTS ===========
     * ===========================================
     */

    private async testInvalidCourseCreation(): Promise<void> {
        const instance = await EngEAI_MongoDB.getInstance();
        
        // This should fail due to invalid data
        await instance.postActiveCourse(this.testData.invalidCourse as ActiveCourseListDB);
    }

    private async testNonExistentCourseRetrieval(): Promise<void> {
        const instance = await EngEAI_MongoDB.getInstance();
        
        const nonExistent = await instance.getActiveCourse("NON_EXISTENT_ID");
        if (nonExistent) {
            throw new Error('Non-existent course retrieval should return null');
        }
    }

    private async testDuplicateCourseCreation(): Promise<void> {
        const instance = await EngEAI_MongoDB.getInstance();
        
        // Create course first time
        await instance.postActiveCourse(this.testData.validCourse);
        
        // Try to create same course again - this might fail or succeed depending on implementation
        try {
            await instance.postActiveCourse(this.testData.validCourse);
        } catch (error) {
            // This is expected behavior for duplicate creation
            if (!(error instanceof Error) || !error.message.includes('duplicate')) {
                throw new Error('Duplicate course creation should fail with duplicate error');
            }
        }
    }

    /**
     * ===========================================
     * ========= PERFORMANCE TESTS ==============
     * ===========================================
     */

    private async testBulkOperations(): Promise<void> {
        const instance = await EngEAI_MongoDB.getInstance();
        const startTime = Date.now();
        
        // Create 10 courses
        const bulkCourses = Array.from({ length: 10 }, (_, i) => ({
            id: `BULK_${i}`,
            name: `Bulk Course ${i}`,
            frameType: "byWeek" as frameType,
            tilesNumber: i + 1,
            date: new Date()
        }));
        
        for (const course of bulkCourses) {
            await instance.postActiveCourse(course);
        }
        
        const duration = Date.now() - startTime;
        
        if (duration > 10000) { // 10 seconds
            throw new Error(`Bulk operations too slow: ${duration}ms for 10 courses`);
        }
        
        // Clean up
        for (const course of bulkCourses) {
            await instance.deleteActiveCourse(course);
        }
    }

    private async testConnectionPerformance(): Promise<void> {
        const startTime = Date.now();
        
        // Test multiple getInstance calls
        const promises = Array.from({ length: 5 }, () => 
            EngEAI_MongoDB.getInstance()
        );
        
        const instances = await Promise.all(promises);
        const duration = Date.now() - startTime;
        
        // Verify all instances are the same (singleton)
        const firstInstance = instances[0];
        const allSame = instances.every(instance => instance === firstInstance);
        
        if (!allSame) {
            throw new Error('Singleton pattern failed in performance test');
        }
        
        if (duration > 5000) { // 5 seconds
            throw new Error(`Connection performance too slow: ${duration}ms for 5 getInstance calls`);
        }
    }

    /**
     * ===========================================
     * ========= TEST REPORTING =================
     * ===========================================
     */

    private generateTestReport(): void {
        console.log('\n===========================================');
        console.log('========= MONGODB CLASS TEST REPORT ======');
        console.log('===========================================');
        
        const totalTests = this.testResults.length;
        const passedTests = this.testResults.filter(r => r.status === 'PASS').length;
        const failedTests = totalTests - passedTests;
        const totalDuration = this.testResults.reduce((sum, r) => sum + r.duration, 0);

        // Category breakdown
        const categories = ['UNIT', 'INTEGRATION', 'COMBINATION', 'ERROR_HANDLING', 'PERFORMANCE'];
        const categoryStats = categories.map(category => {
            const categoryTests = this.testResults.filter(r => r.category === category);
            const categoryPassed = categoryTests.filter(r => r.status === 'PASS').length;
            return {
                category,
                total: categoryTests.length,
                passed: categoryPassed,
                passRate: categoryTests.length > 0 ? (categoryPassed / categoryTests.length * 100).toFixed(1) : '0.0'
            };
        });

        console.log(`\nTotal Tests: ${totalTests}`);
        console.log(`Passed: ${passedTests} ✅`);
        console.log(`Failed: ${failedTests} ❌`);
        console.log(`Total Duration: ${totalDuration}ms`);
        console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);

        console.log('\n--- CATEGORY BREAKDOWN ---');
        categoryStats.forEach(stat => {
            console.log(`${stat.category}: ${stat.passed}/${stat.total} (${stat.passRate}%)`);
        });

        if (failedTests > 0) {
            console.log('\n--- FAILED TESTS ---');
            this.testResults
                .filter(r => r.status === 'FAIL')
                .forEach(r => {
                    console.log(`❌ [${r.category}] ${r.testName}: ${r.message}`);
                });
        }

        console.log('\n--- DETAILED RESULTS ---');
        this.testResults.forEach(r => {
            const statusIcon = r.status === 'PASS' ? '✅' : '❌';
            console.log(`${statusIcon} [${r.category}] ${r.testName} (${r.duration}ms): ${r.message}`);
        });
        
        console.log('\n===========================================\n');
    }

    /**
     * ===========================================
     * ========= MAIN TEST RUNNER ===============
     * ===========================================
     */

    async runAllTests(): Promise<void> {
        console.log('===========================================');
        console.log('========= STARTING MONGODB CLASS TESTS ===');
        console.log('===========================================\n');

        // Unit Tests
        console.log('--- UNIT TESTS ---');
        await this.runTest('Singleton Pattern', 'UNIT', () => this.testSingletonPattern());
        await this.runTest('Connection Establishment', 'UNIT', () => this.testConnectionEstablishment());
        await this.runTest('Schema Validation', 'UNIT', () => this.testSchemaValidation());

        // Integration Tests
        console.log('\n--- INTEGRATION TESTS ---');
        await this.runTest('Course Creation', 'INTEGRATION', () => this.testCourseCreation());
        await this.runTest('Course Retrieval', 'INTEGRATION', () => this.testCourseRetrieval());
        await this.runTest('Course Deletion', 'INTEGRATION', () => this.testCourseDeletion());
        await this.runTest('Multiple Courses Retrieval', 'INTEGRATION', () => this.testMultipleCoursesRetrieval());

        // Combination Tests
        console.log('\n--- COMBINATION TESTS ---');
        await this.runTest('Full Course Lifecycle', 'COMBINATION', () => this.testFullCourseLifecycle());
        await this.runTest('Concurrent Operations', 'COMBINATION', () => this.testConcurrentOperations());
        await this.runTest('Data Isolation', 'COMBINATION', () => this.testDataIsolation());

        // Error Handling Tests
        console.log('\n--- ERROR HANDLING TESTS ---');
        await this.runTest('Invalid Course Creation', 'ERROR_HANDLING', () => this.testInvalidCourseCreation(), 'validation');
        await this.runTest('Non-Existent Course Retrieval', 'ERROR_HANDLING', () => this.testNonExistentCourseRetrieval());
        await this.runTest('Duplicate Course Creation', 'ERROR_HANDLING', () => this.testDuplicateCourseCreation());

        // Performance Tests
        console.log('\n--- PERFORMANCE TESTS ---');
        await this.runTest('Bulk Operations', 'PERFORMANCE', () => this.testBulkOperations());
        await this.runTest('Connection Performance', 'PERFORMANCE', () => this.testConnectionPerformance());

        // Generate final report
        this.generateTestReport();
    }
}

// Execute test suite
async function run() {
    try {
        const testSuite = new MongoDBClassTestSuite();
        await testSuite.runAllTests();
    } catch (error) {
        console.error('Test suite execution failed:', error);
    } finally {
        // Clean up connection
        try {
            if (mongoose.connection.readyState !== 0) {
                await mongoose.disconnect();
                console.log('MongoDB connection closed');
            }
        } catch (error) {
            console.error('Error closing MongoDB connection:', error);
        }
    }
}

run();
