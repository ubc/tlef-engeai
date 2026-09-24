/**
 * flag-student-view-tag.test.ts
 *
 * Flags are the one Student View exception: a flag raised while previewing stays in the
 * instructor's list, tagged, because an instructor needs to see what their own preview
 * produced. Everything else about a test student is excluded.
 */

const batchFindUsersByUserIds = jest.fn(
    async (_ctx: unknown, _courseName: string, _userIds: readonly (string | number)[]) =>
        new Map([
            [
                'ts-user-1',
                {
                    name: 'Test student',
                    affiliation: 'student',
                    userId: 'ts-user-1',
                    isTestStudent: true
                }
            ],
            [
                'stu-1',
                {
                    name: 'Real Student',
                    affiliation: 'student',
                    userId: 'stu-1',
                    isTestStudent: false
                }
            ]
        ])
);

jest.mock('../course-user-mongo', () => ({
    batchFindUsersByUserIds: (...args: unknown[]) => (batchFindUsersByUserIds as any)(...args),
    getCourseUsersMongoCollection: jest.fn()
}));

jest.mock('../collection-registry-mongo', () => ({
    getCollectionNames: async () => ({ flags: 'DemoCourse_flags' })
}));

import { getFlagReportsWithUserNames } from '../flag-mongo';

/** A context whose flags collection holds one test-student flag and one real one. */
function ctxWithFlags(flags: Array<{ id: string; userId: string }>) {
    return {
        db: {
            collection: () => ({
                find: () => ({ toArray: async () => flags })
            })
        }
    } as never;
}

describe('flags from a test student', () => {
    it('stay in the list and are tagged', async () => {
        const ctx = ctxWithFlags([
            { id: 'f1', userId: 'ts-user-1' },
            { id: 'f2', userId: 'stu-1' }
        ]);

        const rows = await getFlagReportsWithUserNames(ctx, 'DemoCourse');

        expect(rows.map((row) => row.id)).toEqual(['f1', 'f2']);
        expect(rows[0].isTestStudent).toBe(true);
        expect(rows[1].isTestStudent).toBe(false);
    });

    it('carry the test student display name staff will recognise', async () => {
        const ctx = ctxWithFlags([{ id: 'f1', userId: 'ts-user-1' }]);

        const rows = await getFlagReportsWithUserNames(ctx, 'DemoCourse');

        expect(rows[0].userName).toBe('Test student');
    });
});
