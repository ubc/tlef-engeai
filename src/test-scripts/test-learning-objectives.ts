/**
 * ===========================================
 * ========= LEARNING OBJECTIVES TEST =======
 * ===========================================
 * 
 * Comprehensive test suite for learning objectives CRUD operations
 * Tests the complete flow from frontend to backend to database
 * 
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @since: 2025-01-27
 */

import request from 'supertest';
import express from 'express';
import dotenv from 'dotenv';
import { LearningObjective } from '../functions/types';
import mongodbRoutes from '../routes/mongodb';

dotenv.config();

/**
 * ===========================================
 * ========= TEST SETUP ======================
 * ===========================================
 */

const app = express();
app.use(express.json());
app.use('/api/mongodb', mongodbRoutes);

// Test data
const testCourseId = '16a6990f961d';
const testDivisionId = '40f2da9e01e4';
const testContentId = '65c61fc5aded';

const testLearningObjective: LearningObjective = {
    id: `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    content: 'Test learning objective description',
    courseName: 'CHBE 241',
    divisionTitle: 'Topic 1',
    itemTitle: 'Topic 1',
    subcontentTitle: 'Test Learning Objective',
    createdAt: new Date(),
    updatedAt: new Date()
};

/**
 * ===========================================
 * ========= TEST FUNCTIONS ==================
 * ===========================================
 */

async function testAddLearningObjective() {
    console.log('\n===========================================');
    console.log('========= ADD LEARNING OBJECTIVE TEST ====');
    console.log('===========================================');

    try {
        const response = await request(app)
            .post('/api/mongodb/learning-objectives')
            .send({
                courseId: testCourseId,
                divisionId: testDivisionId,
                contentId: testContentId,
                learningObjective: testLearningObjective
            });

        console.log('Status:', response.status);
        console.log('Response:', JSON.stringify(response.body, null, 2));

        if (response.status === 200 && response.body.success) {
            console.log('✅ ADD LEARNING OBJECTIVE TEST PASSED');
            return true;
        } else {
            console.log('❌ ADD LEARNING OBJECTIVE TEST FAILED');
            return false;
        }
    } catch (error) {
        console.error('❌ ADD LEARNING OBJECTIVE TEST ERROR:', error);
        return false;
    }
}

async function testUpdateLearningObjective() {
    console.log('\n===========================================');
    console.log('========= UPDATE LEARNING OBJECTIVE TEST =');
    console.log('===========================================');

    try {
        const updateData = {
            subcontentTitle: 'Updated Test Learning Objective',
            content: 'Updated test learning objective description'
        };

        const response = await request(app)
            .put('/api/mongodb/learning-objectives')
            .send({
                courseId: testCourseId,
                divisionId: testDivisionId,
                contentId: testContentId,
                objectiveId: testLearningObjective.id,
                updateData: updateData
            });

        console.log('Status:', response.status);
        console.log('Response:', JSON.stringify(response.body, null, 2));

        if (response.status === 200 && response.body.success) {
            console.log('✅ UPDATE LEARNING OBJECTIVE TEST PASSED');
            return true;
        } else {
            console.log('❌ UPDATE LEARNING OBJECTIVE TEST FAILED');
            return false;
        }
    } catch (error) {
        console.error('❌ UPDATE LEARNING OBJECTIVE TEST ERROR:', error);
        return false;
    }
}

async function testDeleteLearningObjective() {
    console.log('\n===========================================');
    console.log('========= DELETE LEARNING OBJECTIVE TEST =');
    console.log('===========================================');

    try {
        const response = await request(app)
            .delete('/api/mongodb/learning-objectives')
            .send({
                courseId: testCourseId,
                divisionId: testDivisionId,
                contentId: testContentId,
                objectiveId: testLearningObjective.id
            });

        console.log('Status:', response.status);
        console.log('Response:', JSON.stringify(response.body, null, 2));

        if (response.status === 200 && response.body.success) {
            console.log('✅ DELETE LEARNING OBJECTIVE TEST PASSED');
            return true;
        } else {
            console.log('❌ DELETE LEARNING OBJECTIVE TEST FAILED');
            return false;
        }
    } catch (error) {
        console.error('❌ DELETE LEARNING OBJECTIVE TEST ERROR:', error);
        return false;
    }
}

async function testGetCourseWithObjectives() {
    console.log('\n===========================================');
    console.log('========= GET COURSE WITH OBJECTIVES TEST =');
    console.log('===========================================');

    try {
        const response = await request(app)
            .get(`/api/mongodb/courses/name/CHBE241`);

        console.log('Status:', response.status);
        console.log('Response:', JSON.stringify(response.body, null, 2));

        if (response.status === 200 && response.body.success) {
            const course = response.body.data;
            console.log('Course found:', course.courseName);
            console.log('Divisions count:', course.divisions?.length || 0);
            
            if (course.divisions && course.divisions.length > 0) {
                const division = course.divisions[0];
                console.log('Division title:', division.title);
                console.log('Items count:', division.items?.length || 0);
                
                if (division.items && division.items.length > 0) {
                    const item = division.items[0];
                    console.log('Item title:', item.title);
                    console.log('Learning objectives count:', item.learningObjectives?.length || 0);
                    
                    if (item.learningObjectives && item.learningObjectives.length > 0) {
                        console.log('Learning objectives:');
                        item.learningObjectives.forEach((obj: any, index: number) => {
                            console.log(`  ${index + 1}. ${obj.subcontentTitle}: ${obj.content}`);
                        });
                    }
                }
            }
            
            console.log('✅ GET COURSE WITH OBJECTIVES TEST PASSED');
            return true;
        } else {
            console.log('❌ GET COURSE WITH OBJECTIVES TEST FAILED');
            return false;
        }
    } catch (error) {
        console.error('❌ GET COURSE WITH OBJECTIVES TEST ERROR:', error);
        return false;
    }
}

async function testErrorHandling() {
    console.log('\n===========================================');
    console.log('========= ERROR HANDLING TEST ============');
    console.log('===========================================');

    try {
        // Test missing required fields
        const response = await request(app)
            .post('/api/mongodb/learning-objectives')
            .send({
                courseId: testCourseId,
                // Missing divisionId, contentId, learningObjective
            });

        console.log('Status:', response.status);
        console.log('Response:', JSON.stringify(response.body, null, 2));

        if (response.status === 400 && !response.body.success) {
            console.log('✅ ERROR HANDLING TEST PASSED - Missing fields detected');
            return true;
        } else {
            console.log('❌ ERROR HANDLING TEST FAILED - Should have returned 400');
            return false;
        }
    } catch (error) {
        console.error('❌ ERROR HANDLING TEST ERROR:', error);
        return false;
    }
}

/**
 * ===========================================
 * ========= MAIN TEST RUNNER ================
 * ===========================================
 */

async function runAllTests() {
    console.log('===========================================');
    console.log('========= LEARNING OBJECTIVES TEST SUITE =');
    console.log('===========================================');
    console.log('Testing learning objectives CRUD operations...');
    console.log('Test Course ID:', testCourseId);
    console.log('Test Division ID:', testDivisionId);
    console.log('Test Content ID:', testContentId);
    console.log('Test Objective ID:', testLearningObjective.id);

    const results = {
        add: false,
        update: false,
        delete: false,
        get: false,
        errorHandling: false
    };

    // Run tests in sequence
    results.get = await testGetCourseWithObjectives();
    results.add = await testAddLearningObjective();
    results.update = await testUpdateLearningObjective();
    results.delete = await testDeleteLearningObjective();
    results.errorHandling = await testErrorHandling();

    // Summary
    console.log('\n===========================================');
    console.log('========= TEST RESULTS SUMMARY ===========');
    console.log('===========================================');
    console.log(`Get Course with Objectives: ${results.get ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Add Learning Objective:     ${results.add ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Update Learning Objective:  ${results.update ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Delete Learning Objective:  ${results.delete ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Error Handling:             ${results.errorHandling ? '✅ PASS' : '❌ FAIL'}`);

    const passedTests = Object.values(results).filter(Boolean).length;
    const totalTests = Object.keys(results).length;
    
    console.log(`\nOverall Result: ${passedTests}/${totalTests} tests passed`);
    
    if (passedTests === totalTests) {
        console.log('🎉 ALL TESTS PASSED! Learning objectives implementation is working correctly.');
    } else {
        console.log('⚠️  Some tests failed. Please check the implementation.');
    }

    return results;
}

// Run the tests
if (require.main === module) {
    runAllTests().catch(console.error);
}

export { runAllTests, testAddLearningObjective, testUpdateLearningObjective, testDeleteLearningObjective, testGetCourseWithObjectives, testErrorHandling };
