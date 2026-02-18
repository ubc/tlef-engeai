/**
 * Instructor Allowed Courses Initialization
 *
 * Seeds the instructor-allowed-courses collection with static instructor-to-course mappings
 * on server startup. Idempotent: skips creation if the collection already exists.
 *
 * @author: EngE-AI Team
 * @since: 2025-02-18
 */

import { EngEAI_MongoDB } from './EngEAI_MongoDB';

const COLLECTION_NAME = 'instructor-allowed-courses';

const SEED_DATA = [
    { instructor: 'Charisma Rusdiyanto', allowed_courses: ['Test 1', 'Test 2', 'Test 3'] },
    {
        instructor: 'Alireza Bagherzadeh',
        allowed_courses: [
            'CHBE 241 : Material and Energy Balances',
            'Test CHBE Course 1',
            'Test CHBE Course 1'
        ]
    },
    {
        instructor: 'Amir Dehkhoda',
        allowed_courses: [
            'MTRL_V 251 : Thermodynamics of Materials II',
            'Test MTRL Course 1',
            'Test MTRL Course 1'
        ]
    },
    { instructor: 'Richard Tape', allowed_courses: ['Test_1', 'Test_2', 'Test_3'] }
];

/**
 * Ensures the instructor-allowed-courses collection exists and is seeded.
 * Does nothing if the collection already exists.
 */
export async function initInstructorAllowedCourses(): Promise<void> {
    try {
        const instance = await EngEAI_MongoDB.getInstance();
        const collections = await instance.db.listCollections({ name: COLLECTION_NAME }).toArray();

        if (collections.length > 0) {
            console.log(`[INIT] ${COLLECTION_NAME} collection already exists, skipping seed`);
            return;
        }

        const coll = instance.db.collection(COLLECTION_NAME);
        await coll.insertMany(SEED_DATA);
        console.log(`[INIT] Created ${COLLECTION_NAME} collection with ${SEED_DATA.length} instructor mappings`);
    } catch (error) {
        console.error(`[INIT] Failed to initialize ${COLLECTION_NAME}:`, error);
        throw error;
    }
}
