/**
 * Instructor Allowed Courses Initialization
 *
 * Seeds the instructor-allowed-courses collection with PUID-based instructor-to-course mappings
 * on server startup. Drops and re-seeds the collection to ensure PUID schema.
 * Also ensures Charisma and Rich are in all initiated courses.
 *
 * @author: EngE-AI Team
 * @since: 2026-02-18
 */

import { EngEAI_MongoDB } from './EngEAI_MongoDB';
import { addCharismaAndRichToCourse } from './instructor-helpers';
import { activeCourse } from './types';

const COLLECTION_NAME = 'instructor-allowed-courses';

/** Builds SEED_DATA from env vars - only includes entries where PUID is set */
function buildSeedData(): { puid: string; allowed_courses: string[] }[] {
    const data: { puid: string; allowed_courses: string[] }[] = [];

    const charismaPuid = process.env.CHARISMA_RUSDIYANTO_PUID?.trim();
    if (charismaPuid) {
        data.push({ puid: charismaPuid, allowed_courses: ['Test 1', 'Test 2', 'Test 3', 'CHARISMA101'] });
    } else {
        console.warn('[INIT] CHARISMA_RUSDIYANTO_PUID not set, skipping Charisma in instructor-allowed-courses');
    }

    const alirezaPuid = process.env.ALIREZA_BAGHERZADEH_PUID?.trim();
    if (alirezaPuid) {
        data.push({
            puid: alirezaPuid,
            allowed_courses: [
                'CHBE 241 : Material and Energy Balances',
                'APSC_V 183: Matter and Energy II',
                'Test CHBE Course 1'
            ]
        });
    } else {
        console.warn('[INIT] ALIREZA_BAGHERZADEH_PUID not set, skipping Alireza in instructor-allowed-courses');
    }

    const amirPuid = process.env.AMIR_DEHKHODA_PUID?.trim();
    if (amirPuid) {
        data.push({
            puid: amirPuid,
            allowed_courses: [
                'MTRL_V 251 : Thermodynamics of Materials II',
                'Test MTRL Course 1',
                'Test MTRL Course 1'
            ]
        });
    } else {
        console.warn('[INIT] AMIR_DEHKHODA_PUID not set, skipping Amir in instructor-allowed-courses');
    }

    const richardPuid = process.env.RICHARD_TAPE_PUID?.trim();
    if (richardPuid) {
        data.push({ puid: richardPuid, allowed_courses: ['Test_1', 'Test_2', 'Test_3'] });
    } else {
        console.warn('[INIT] RICHARD_TAPE_PUID not set, skipping Richard in instructor-allowed-courses');
    }

    return data;
}

/**
 * Ensures Charisma and Rich are instructors in all courses in active-course-list.
 * Creates GlobalUser for them if needed, adds to instructors, CourseUser, and coursesEnrolled.
 */
async function ensureCharismaAndRichInAllCourses(instance: EngEAI_MongoDB): Promise<void> {
    const charismaPuid = process.env.CHARISMA_RUSDIYANTO_PUID?.trim();
    const richardPuid = process.env.RICHARD_TAPE_PUID?.trim();
    if (!charismaPuid && !richardPuid) {
        console.log('[INIT] CHARISMA_RUSDIYANTO_PUID and RICHARD_TAPE_PUID not set, skipping ensureCharismaAndRichInAllCourses');
        return;
    }

    const courses = await instance.getAllActiveCourses();
    if (courses.length === 0) {
        console.log('[INIT] No courses in active-course-list, nothing to sync');
        return;
    }

    let updatedCount = 0;
    for (const course of courses) {
        const courseData = course as unknown as activeCourse;
        const courseId = courseData.id;
        const courseName = courseData.courseName;
        const existingInstructors = courseData.instructors || [];

        const updatedInstructors = await addCharismaAndRichToCourse(
            instance,
            courseId,
            courseName,
            existingInstructors
        );

        if (updatedInstructors.length !== existingInstructors.length) {
            await instance.updateActiveCourse(courseId, { instructors: updatedInstructors });
            updatedCount++;
        }
    }

    if (updatedCount > 0) {
        console.log(`[INIT] Added Charisma and Rich to ${updatedCount} course(s)`);
    } else {
        console.log('[INIT] All courses already have Charisma and Rich, no updates needed');
    }
}

/**
 * Drops instructor-allowed-courses, re-seeds with PUID schema, and ensures Charisma/Rich in all courses.
 */
export async function initInstructorAllowedCourses(): Promise<void> {
    try {
        const instance = await EngEAI_MongoDB.getInstance();

        // Drop and re-seed instructor-allowed-courses
        await instance.dropCollection(COLLECTION_NAME);

        const seedData = buildSeedData();
        if (seedData.length === 0) {
            console.warn('[INIT] No PUID env vars set, instructor-allowed-courses will be empty');
        } else {
            const coll = instance.db.collection(COLLECTION_NAME);
            await coll.insertMany(seedData);
            console.log(`[INIT] Created ${COLLECTION_NAME} collection with ${seedData.length} instructor mappings (PUID-based)`);
        }

        // Ensure Charisma and Rich are in all initiated courses
        await ensureCharismaAndRichInAllCourses(instance);
    } catch (error) {
        console.error(`[INIT] Failed to initialize ${COLLECTION_NAME}:`, error);
        throw error;
    }
}
