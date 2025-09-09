/**
 * ===========================================
 * ========= REST API MOCK TEST =============
 * ===========================================
 * 
 * Simple test to make a REST API call to the MongoDB POST endpoint
 * to verify the course creation functionality with content generation.
 * 
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @since: 2025-01-27
 */

import request from 'supertest';
import express from 'express';
import dotenv from 'dotenv';
import { frameType } from '../functions/types';
import mongodbRoutes from '../routes/mongodb';

dotenv.config();

/**
 * ===========================================
 * ========= REST API TEST ===================
 * ===========================================
 */

async function testPostCourseAPI() {
    console.log('===========================================');
    console.log('========= REST API POST TEST =============');
    console.log('===========================================\n');

    // Create Express app for testing
    const app = express();
    app.use(express.json());
    app.use('/api/mongodb', mongodbRoutes);

    // Test data - this matches what the frontend would send
    const testCourseData = {
        date: new Date().toISOString(),
        onBoarded: false,
        name: `Mock Test Course - ${new Date().toLocaleString()}`,
        instructors: ["Dr. Mock Instructor", "Prof. Another Instructor"],
        teachingAssistants: ["Mock TA 1", "Mock TA 2"],
        frameType: "byWeek" as frameType,
        tilesNumber: 3 // Will create 3 weeks with 3 lectures each
    };

    try {
        console.log('📤 Making POST request to /api/mongodb/courses...');
        console.log('📝 Request data:');
        console.log(JSON.stringify(testCourseData, null, 2));
        console.log('\n');

        const response = await request(app)
            .post('/api/mongodb/courses')
            .send(testCourseData);

        console.log(`📊 Response Status: ${response.status}`);
        console.log('📋 Response Body:');
        console.log(JSON.stringify(response.body, null, 2));

        if (response.status === 201 && response.body.success) {
            const createdCourse = response.body.data;
            console.log('\n✅ POST request successful!');
            console.log('🎯 Course Details:');
            console.log(`   🆔 Course ID: ${createdCourse.id}`);
            console.log(`   📚 Course Name: ${createdCourse.name}`);
            console.log(`   📅 Frame Type: ${createdCourse.frameType}`);
            console.log(`   🔢 Tiles Number: ${createdCourse.tilesNumber}`);
            console.log(`   📖 Content Divisions: ${createdCourse.content.length}`);

            // Show content structure
            console.log('\n📋 Generated Content Structure:');
            createdCourse.content.forEach((week: any, index: number) => {
                console.log(`   📅 Week ${index + 1}: ${week.title}`);
                console.log(`      📚 Lectures: ${week.content.length}`);
                week.content.forEach((lecture: any, lectureIndex: number) => {
                    console.log(`         - ${lecture.title}`);
                });
            });

            console.log('\n🎯 Next Steps:');
            console.log('1. Open MongoDB Compass');
            console.log('2. Connect to your MongoDB instance');
            console.log('3. Navigate to the "engeai" database');
            console.log('4. Open the "activecourselist" collection');
            console.log(`5. Look for course with ID: ${createdCourse.id}`);
            console.log('6. Examine the document structure and content array');

        } else {
            console.log('\n❌ POST request failed!');
            console.log('Response:', response.body);
        }

    } catch (error) {
        console.error('\n💥 Error occurred:', error);
    }
}

// Execute the test
async function run() {
    try {
        await testPostCourseAPI();
    } catch (error) {
        console.error('Test execution failed:', error);
    } finally {
        // MongoDB connection cleanup is handled by the EngEAI_MongoDB class
        console.log('\nTest completed successfully');
    }
}

run();