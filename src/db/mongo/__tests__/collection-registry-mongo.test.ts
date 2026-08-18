/** Regression tests for active-course collection-name authority. */

import type { MongoDalContext } from '../mongo-context';

jest.mock('../active-course-queries-mongo', () => ({
    fetchActiveCourseDocByCourseName: jest.fn()
}));

jest.mock('../../../utils/logger', () => ({
    appLogger: { warn: jest.fn() }
}));

import { fetchActiveCourseDocByCourseName } from '../active-course-queries-mongo';
import { getCollectionNames } from '../collection-registry-mongo';

function context(): MongoDalContext {
    return {
        db: {} as MongoDalContext['db'],
        idGenerator: {} as MongoDalContext['idGenerator'],
        collectionNamesCache: new Map(),
        scheduledTasksIndexesEnsured: new Set()
    };
}

function catalogCourse(guidedPathwayFlags?: string) {
    return {
        id: 'course-1',
        courseName: 'Renamed Course',
        collections: {
            users: 'Old Course_users',
            flags: 'Old Course_flags',
            memoryAgent: 'Old Course_memory-agent',
            ...(guidedPathwayFlags ? { guidedPathwayFlags } : {})
        }
    };
}

describe('getCollectionNames Guided Pathway registration', () => {
    beforeEach(() => jest.clearAllMocks());

    it('returns the stored registered value without recomputing it after a course rename', async () => {
        (fetchActiveCourseDocByCourseName as jest.Mock).mockResolvedValue(
            catalogCourse('Old Course_guided-pathway-flags')
        );

        const names = await getCollectionNames(context(), 'Renamed Course');

        expect(names.guidedPathwayFlags).toBe('Old Course_guided-pathway-flags');
    });

    it('uses a readable course-name fallback for an unprovisioned legacy course', async () => {
        (fetchActiveCourseDocByCourseName as jest.Mock).mockResolvedValue(catalogCourse());

        const names = await getCollectionNames(context(), 'Renamed Course');

        expect(names.guidedPathwayFlags).toBe('Renamed Course_guided-pathway-flags');
        expect(names.guidedPathwayFlags).not.toMatch(/^guided-pathway-flags-course-/);
    });
});
