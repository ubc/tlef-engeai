/** Regression tests for server-owned active-course collection registrations. */

import type { activeCourse } from '../../../types/shared';
import type { MongoDalContext } from '../mongo-context';

jest.mock('../active-course-queries-mongo', () => ({
    fetchActiveCourseDocByCourseName: jest.fn(),
    fetchActiveCourseDocById: jest.fn()
}));

jest.mock('../academic-period-mongo', () => ({
    lazyMigrateCourseAcademicPeriod: jest.fn()
}));

jest.mock('../flag-mongo', () => ({
    createFlagIndexes: jest.fn()
}));

jest.mock('../guided-pathway-flag-collection-mongo', () => ({
    assertGuidedPathwayFlagCollectionAvailable: jest.fn(),
    ensureGuidedPathwayFlagCollectionIndexes: jest.fn(),
    guidedPathwayFlagCollectionNameForCourse: jest.fn(),
    invalidateGuidedPathwayFlagCollectionIndexes: jest.fn()
}));

jest.mock('../mongo-collections', () => ({
    activeCourseListCollection: jest.fn(),
    activeUsersMongoCollection: jest.fn()
}));

jest.mock('../pathways-mongo', () => ({
    seedPathwaysForNewCourse: jest.fn()
}));

jest.mock('../../../utils/logger', () => ({
    appLogger: {
        error: jest.fn(),
        log: jest.fn(),
        warn: jest.fn()
    }
}));

import { activeCourseListCollection } from '../mongo-collections';
import { updateActiveCourse } from '../course-mongo';

function context(): MongoDalContext {
    return {
        db: {} as MongoDalContext['db'],
        idGenerator: {} as MongoDalContext['idGenerator'],
        collectionNamesCache: new Map(),
        scheduledTasksIndexesEnsured: new Set()
    };
}

describe('updateActiveCourse collection registration ownership', () => {
    beforeEach(() => jest.clearAllMocks());

    it('strips untrusted identifiers and stale collections without changing the target course', async () => {
        const catalogDocument = {
            id: 'course-1',
            courseName: 'Current Course Name',
            collections: {
                users: 'Current Course_users',
                flags: 'Current Course_flags',
                memoryAgent: 'Current Course_memory-agent',
                guidedPathwayFlags: 'current-guided-pathway-flags'
            }
        } as activeCourse;
        const findOneAndUpdate = jest.fn(async (_filter, update) => {
            Object.assign(catalogDocument, update.$set);
            return catalogDocument;
        });
        (activeCourseListCollection as jest.Mock).mockReturnValue({ findOneAndUpdate });

        const result = await updateActiveCourse(context(), 'course-1', {
            id: 'attacker-selected-course',
            _id: 'attacker-selected-mongo-document',
            courseName: 'Updated Course Name',
            collections: {
                users: 'Stale Course_users',
                flags: 'Stale Course_flags',
                memoryAgent: 'Stale Course_memory-agent',
                guidedPathwayFlags: 'stale-guided-pathway-flags'
            },
            'collections.guidedPathwayFlags': 'dotted-stale-guided-pathway-flags'
        } as Partial<activeCourse>);

        expect(findOneAndUpdate).toHaveBeenCalledWith(
            { id: 'course-1' },
            {
                $set: {
                    courseName: 'Updated Course Name',
                    updatedAt: expect.any(String)
                }
            },
            { returnDocument: 'after' }
        );
        expect(findOneAndUpdate.mock.calls[0][1].$set)
            .not.toHaveProperty(['collections.guidedPathwayFlags']);
        expect(findOneAndUpdate.mock.calls[0][1].$set).not.toHaveProperty('id');
        expect(findOneAndUpdate.mock.calls[0][1].$set).not.toHaveProperty('_id');
        expect(result?.id).toBe('course-1');
        expect(result?.collections?.guidedPathwayFlags).toBe('current-guided-pathway-flags');
        expect(result?.collections?.users).toBe('Current Course_users');
    });
});
