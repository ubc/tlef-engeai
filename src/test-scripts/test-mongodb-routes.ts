/**
 * ===========================================
 * ========= MONGODB ROUTES TESTING =========
 * ===========================================
 *
 * This test suite provides integration testing for the MongoDB Express.js routes.
 * It tests the RESTful API endpoints, request/response handling, and middleware
 * functionality for the EngE-AI platform's course management system.
 *
 * Test Categories:
 * - Route Integration Tests: Full HTTP request/response cycle testing
 * - Middleware Tests: Validation and error handling middleware
 * - API Contract Tests: Request/response format validation
 * - End-to-End Tests: Complete workflow testing through HTTP endpoints
 *
 * Test Coverage:
 * - HTTP method handling (GET, POST, PUT, DELETE)
 * - Request parameter validation
 * - Response format consistency
 * - Error handling and status codes
 * - Database integration through routes
 * - Authentication and authorization (if implemented)
 *
 * Environment Requirements:
 * - Express.js server running
 * - MongoDB server running on localhost:27017
 * - MONGO_USERNAME and MONGO_PASSWORD environment variables
 *
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @since: 2025-01-27
 * 
 */

import request from 'supertest';
import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { ActiveCourseListDB, frameType } from '../functions/types';
import mongodbRoutes from '../routes/mongodb';

dotenv.config();

/**
 * ===========================================
 * ========= TEST INTERFACES ================
 * ===========================================
 */

interface RouteTestResult {
    testName: string;
    method: string;
    endpoint: string;
    status: 'PASS' | 'FAIL';
    message: string;
    duration: number;
    responseTime?: number;
    statusCode?: number;
}

/**
 * ===========================================
 * ========= MONGODB ROUTES TEST SUITE ======
 * ===========================================
 */

class MongoDBRoutesTestSuite {
    private testResults: RouteTestResult[] = [];
    private app: express.Application;
    private testData: {
        validCourse: ActiveCourseListDB;
        invalidCourse: Partial<ActiveCourseListDB>;
    };

    constructor() {
        this.app = express();
        this.app.use(express.json());
        
        // Use the MongoDB routes
        this.app.use('/api/mongodb', mongodbRoutes);
        
        // Add error handling for JSON parsing errors
        this.app.use((error: any, req: any, res: any, next: any) => {
            if (error instanceof SyntaxError && 'body' in error) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid JSON format'
                });
            }
            next(error);
        });
        
        this.testData = {
            validCourse: {
                id: "ROUTE_TEST_001",
                name: "Route Test Course",
                frameType: "byWeek" as frameType,
                tilesNumber: 12,
                date: new Date()
            },
            invalidCourse: {
                id: "INVALID_ROUTE",
                name: "", // Invalid: empty name
                frameType: "invalidType" as any, // Invalid: not in enum
                tilesNumber: -1, // Invalid: negative number
                date: new Date()
            }
        };
    }

    /**
     * ===========================================
     * ========= TEST EXECUTION HELPERS =========
     * ===========================================
     */

    private async runRouteTest(
        testName: string,
        method: 'GET' | 'POST' | 'PUT' | 'DELETE',
        endpoint: string,
        testFunction: () => Promise<void>,
        expectedStatusCode?: number
    ): Promise<void> {
        const startTime = Date.now();
        try {
            await testFunction();
            const duration = Date.now() - startTime;
            
            this.testResults.push({
                testName,
                method,
                endpoint,
                status: 'PASS',
                message: 'Route test completed successfully',
                duration
            });
            console.log(`✅ ${testName} - PASSED (${duration}ms)`);
        } catch (error) {
            const duration = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            
            this.testResults.push({
                testName,
                method,
                endpoint,
                status: 'FAIL',
                message: errorMessage,
                duration
            });
            console.log(`❌ ${testName} - FAILED (${duration}ms): ${errorMessage}`);
        }
    }

    /**
     * ===========================================
     * ========= ROUTE INTEGRATION TESTS ========
     * ===========================================
     */

    private async testCreateCourseRoute(): Promise<void> {
        const response = await request(this.app)
            .post('/api/mongodb/courses')
            .send(this.testData.validCourse)
            .expect(201);
        
        if (!response.body.success) {
            throw new Error('Course creation route failed - success flag not set');
        }
        
        if (response.body.data.id !== this.testData.validCourse.id) {
            throw new Error('Course creation route failed - incorrect data returned');
        }
    }

    private async testGetCourseByIdRoute(): Promise<void> {
        const response = await request(this.app)
            .get(`/api/mongodb/courses/${this.testData.validCourse.id}`)
            .expect(200);
        
        if (!response.body.success) {
            throw new Error('Get course by ID route failed - success flag not set');
        }
        
        if (response.body.data.id !== this.testData.validCourse.id) {
            throw new Error('Get course by ID route failed - incorrect course returned');
        }
    }

    private async testGetCourseByNameRoute(): Promise<void> {
        const response = await request(this.app)
            .get(`/api/mongodb/courses/name/${this.testData.validCourse.name}`)
            .expect(200);
        
        if (!response.body.success) {
            throw new Error('Get course by name route failed - success flag not set');
        }
        
        if (response.body.data.name !== this.testData.validCourse.name) {
            throw new Error('Get course by name route failed - incorrect course returned');
        }
    }

    private async testGetAllCoursesRoute(): Promise<void> {
        const response = await request(this.app)
            .get('/api/mongodb/courses')
            .expect(200);
        
        if (!response.body.success) {
            throw new Error('Get all courses route failed - success flag not set');
        }
        
        if (!Array.isArray(response.body.data)) {
            throw new Error('Get all courses route failed - data is not an array');
        }
        
        const foundCourse = response.body.data.find((course: any) => 
            course.id === this.testData.validCourse.id
        );
        
        if (!foundCourse) {
            throw new Error('Get all courses route failed - test course not found');
        }
    }

    private async testUpdateCourseRoute(): Promise<void> {
        const updateData = {
            tilesNumber: 15
        };
        
        const response = await request(this.app)
            .put(`/api/mongodb/courses/${this.testData.validCourse.id}`)
            .send(updateData)
            .expect(200);
        
        if (!response.body.success) {
            throw new Error('Update course route failed - success flag not set');
        }
        
        if (response.body.data.tilesNumber !== updateData.tilesNumber) {
            throw new Error('Update course route failed - data not updated');
        }
    }

    private async testDeleteCourseRoute(): Promise<void> {
        const response = await request(this.app)
            .delete(`/api/mongodb/courses/${this.testData.validCourse.id}`)
            .expect(200);
        
        if (!response.body.success) {
            throw new Error('Delete course route failed - success flag not set');
        }
        
        // Verify course is actually deleted
        await request(this.app)
            .get(`/api/mongodb/courses/${this.testData.validCourse.id}`)
            .expect(404);
    }

    /**
     * ===========================================
     * ========= MIDDLEWARE TESTS ================
     * ===========================================
     */

    private async testValidationMiddleware(): Promise<void> {
        const response = await request(this.app)
            .post('/api/mongodb/courses')
            .send(this.testData.invalidCourse)
            .expect(400);
        
        if (!response.body.error || typeof response.body.error !== 'string') {
            throw new Error('Validation middleware failed - no error message returned');
        }
    }

    private async testNotFoundMiddleware(): Promise<void> {
        const response = await request(this.app)
            .get('/api/mongodb/courses/NON_EXISTENT_ID')
            .expect(404);
        
        if (!response.body.error) {
            throw new Error('Not found middleware failed - no error message returned');
        }
    }

    private async testErrorHandlingMiddleware(): Promise<void> {
        // Test with malformed JSON - this should be handled by Express JSON parser
        const response = await request(this.app)
            .post('/api/mongodb/courses')
            .set('Content-Type', 'application/json')
            .send('{"invalid": json}')
            .expect(400);
        
        // Express will return a JSON parse error, so we expect some error response
        if (!response.body && !response.text) {
            throw new Error('Error handling middleware failed - no error response returned');
        }
    }

    /**
     * ===========================================
     * ========= API CONTRACT TESTS =============
     * ===========================================
     */

    private async testResponseFormat(): Promise<void> {
        const response = await request(this.app)
            .get('/api/mongodb/courses')
            .expect(200);
        
        // Check response structure
        if (!response.body.hasOwnProperty('success')) {
            throw new Error('Response format invalid - missing success field');
        }
        
        if (!response.body.hasOwnProperty('data')) {
            throw new Error('Response format invalid - missing data field');
        }
        
        if (typeof response.body.success !== 'boolean') {
            throw new Error('Response format invalid - success field is not boolean');
        }
    }

    private async testErrorResponseFormat(): Promise<void> {
        const response = await request(this.app)
            .get('/api/mongodb/courses/NON_EXISTENT')
            .expect(404);
        
        // Check error response structure
        if (!response.body.hasOwnProperty('success')) {
            throw new Error('Error response format invalid - missing success field');
        }
        
        if (!response.body.hasOwnProperty('error')) {
            throw new Error('Error response format invalid - missing error field');
        }
        
        if (response.body.success !== false) {
            throw new Error('Error response format invalid - success should be false');
        }
    }

    /**
     * ===========================================
     * ========= END-TO-END TESTS ===============
     * ===========================================
     */

    private async testCompleteWorkflow(): Promise<void> {
        const workflowCourse = {
            id: "WORKFLOW_TEST",
            name: "Workflow Test Course",
            frameType: "byTopic" as frameType,
            tilesNumber: 20,
            date: new Date()
        };
        
        // 1. Create course
        const createResponse = await request(this.app)
            .post('/api/mongodb/courses')
            .send(workflowCourse)
            .expect(201);
        
        if (!createResponse.body.success) {
            throw new Error('Workflow step 1: Course creation failed');
        }
        
        // 2. Retrieve course
        const getResponse = await request(this.app)
            .get(`/api/mongodb/courses/${workflowCourse.id}`)
            .expect(200);
        
        if (!getResponse.body.success) {
            throw new Error('Workflow step 2: Course retrieval failed');
        }
        
        // 3. Update course
        const updateResponse = await request(this.app)
            .put(`/api/mongodb/courses/${workflowCourse.id}`)
            .send({ tilesNumber: 25 })
            .expect(200);
        
        if (!updateResponse.body.success) {
            throw new Error('Workflow step 3: Course update failed');
        }
        
        // 4. Verify update
        const verifyResponse = await request(this.app)
            .get(`/api/mongodb/courses/${workflowCourse.id}`)
            .expect(200);
        
        if (verifyResponse.body.data.tilesNumber !== 25) {
            throw new Error('Workflow step 4: Course update verification failed');
        }
        
        // 5. Delete course
        const deleteResponse = await request(this.app)
            .delete(`/api/mongodb/courses/${workflowCourse.id}`)
            .expect(200);
        
        if (!deleteResponse.body.success) {
            throw new Error('Workflow step 5: Course deletion failed');
        }
        
        // 6. Verify deletion
        await request(this.app)
            .get(`/api/mongodb/courses/${workflowCourse.id}`)
            .expect(404);
    }

    /**
     * ===========================================
     * ========= TEST REPORTING =================
     * ===========================================
     */

    private generateTestReport(): void {
        console.log('\n===========================================');
        console.log('========= MONGODB ROUTES TEST REPORT ====');
        console.log('===========================================');
        
        const totalTests = this.testResults.length;
        const passedTests = this.testResults.filter(r => r.status === 'PASS').length;
        const failedTests = totalTests - passedTests;
        const totalDuration = this.testResults.reduce((sum, r) => sum + r.duration, 0);

        // Method breakdown
        const methods = ['GET', 'POST', 'PUT', 'DELETE'];
        const methodStats = methods.map(method => {
            const methodTests = this.testResults.filter(r => r.method === method);
            const methodPassed = methodTests.filter(r => r.status === 'PASS').length;
            return {
                method,
                total: methodTests.length,
                passed: methodPassed,
                passRate: methodTests.length > 0 ? (methodPassed / methodTests.length * 100).toFixed(1) : '0.0'
            };
        });

        console.log(`\nTotal Tests: ${totalTests}`);
        console.log(`Passed: ${passedTests} ✅`);
        console.log(`Failed: ${failedTests} ❌`);
        console.log(`Total Duration: ${totalDuration}ms`);
        console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);

        console.log('\n--- METHOD BREAKDOWN ---');
        methodStats.forEach(stat => {
            console.log(`${stat.method}: ${stat.passed}/${stat.total} (${stat.passRate}%)`);
        });

        if (failedTests > 0) {
            console.log('\n--- FAILED TESTS ---');
            this.testResults
                .filter(r => r.status === 'FAIL')
                .forEach(r => {
                    console.log(`❌ [${r.method}] ${r.testName}: ${r.message}`);
                });
        }

        console.log('\n--- DETAILED RESULTS ---');
        this.testResults.forEach(r => {
            const statusIcon = r.status === 'PASS' ? '✅' : '❌';
            console.log(`${statusIcon} [${r.method}] ${r.testName} (${r.duration}ms): ${r.message}`);
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
        console.log('========= STARTING MONGODB ROUTES TESTS =');
        console.log('===========================================\n');

        // Route Integration Tests
        console.log('--- ROUTE INTEGRATION TESTS ---');
        await this.runRouteTest('Create Course Route', 'POST', '/api/mongodb/courses', () => this.testCreateCourseRoute());
        await this.runRouteTest('Get Course by ID Route', 'GET', '/api/mongodb/courses/:id', () => this.testGetCourseByIdRoute());
        await this.runRouteTest('Get Course by Name Route', 'GET', '/api/mongodb/courses/name/:name', () => this.testGetCourseByNameRoute());
        await this.runRouteTest('Get All Courses Route', 'GET', '/api/mongodb/courses', () => this.testGetAllCoursesRoute());
        await this.runRouteTest('Update Course Route', 'PUT', '/api/mongodb/courses/:id', () => this.testUpdateCourseRoute());
        await this.runRouteTest('Delete Course Route', 'DELETE', '/api/mongodb/courses/:id', () => this.testDeleteCourseRoute());

        // Middleware Tests
        console.log('\n--- MIDDLEWARE TESTS ---');
        await this.runRouteTest('Validation Middleware', 'POST', '/api/mongodb/courses', () => this.testValidationMiddleware());
        await this.runRouteTest('Not Found Middleware', 'GET', '/api/mongodb/courses/:id', () => this.testNotFoundMiddleware());
        await this.runRouteTest('Error Handling Middleware', 'POST', '/api/mongodb/courses', () => this.testErrorHandlingMiddleware());

        // API Contract Tests
        console.log('\n--- API CONTRACT TESTS ---');
        await this.runRouteTest('Response Format', 'GET', '/api/mongodb/courses', () => this.testResponseFormat());
        await this.runRouteTest('Error Response Format', 'GET', '/api/mongodb/courses/:id', () => this.testErrorResponseFormat());

        // End-to-End Tests
        console.log('\n--- END-TO-END TESTS ---');
        await this.runRouteTest('Complete Workflow', 'POST', '/api/mongodb/courses', () => this.testCompleteWorkflow());

        // Generate final report
        this.generateTestReport();
    }
}

// Execute test suite
async function run() {
    const testSuite = new MongoDBRoutesTestSuite();
    await testSuite.runAllTests();
    
    // Clean up connection
    try {
        await mongoose.disconnect();
        console.log('MongoDB connection closed');
    } catch (error) {
        console.error('Error closing MongoDB connection:', error);
    }
}

run();
