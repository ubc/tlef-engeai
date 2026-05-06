import { EJSON, ObjectId } from 'bson';
import type { activeCourse } from '../../../types/shared';
import type { MongoDalContext } from '../mongo-context';
import { loadCourseMongoBackupPayloads } from '../course-backup-mongo';

jest.mock('../collection-registry-mongo', () => ({
    getCollectionNames: jest.fn().mockResolvedValue({
        users: 'TestCourse_users',
        flags: 'TestCourse_flags',
        memoryAgent: 'TestCourse_memory-agent',
        scheduledTasks: 'TestCourse_scheduled_tasks'
    })
}));

jest.mock('../mongo-collections', () => ({
    activeCourseListCollection: jest.fn(() => ({
        findOne: jest.fn().mockResolvedValue({
            id: 'course-id-1',
            courseName: 'TestCourse',
            _id: new ObjectId()
        })
    }))
}));

import { getCollectionNames } from '../collection-registry-mongo';
import { activeCourseListCollection } from '../mongo-collections';

describe('course-backup-mongo loadCourseMongoBackupPayloads', () => {
    it('queries catalog and four per-course collections; EJSON round-trips ObjectIds', async () => {
        const oid = new ObjectId();
        const rows: Record<string, unknown[]> = {
            TestCourse_users: [{ _id: oid, userId: 'student-1' }],
            TestCourse_flags: [{ id: 'f1' }],
            TestCourse_scheduled_tasks: [],
            'TestCourse_memory-agent': [{ userId: 'student-1', struggleTopics: ['a'] }]
        };

        const mockDb = {
            collection: (name: string) => ({
                find: () => ({
                    toArray: async () => rows[name] ?? []
                })
            })
        };

        const ctx: MongoDalContext = {
            db: mockDb as unknown as MongoDalContext['db'],
            idGenerator: {} as MongoDalContext['idGenerator'],
            collectionNamesCache: new Map(),
            scheduledTasksIndexesEnsured: new Set<string>()
        };

        const course = {
            id: 'course-id-1',
            courseName: 'TestCourse'
        } as activeCourse;

        const payloads = await loadCourseMongoBackupPayloads(ctx, course);

        expect(getCollectionNames).toHaveBeenCalledWith(ctx, 'TestCourse');
        expect(activeCourseListCollection).toHaveBeenCalledWith(ctx.db);

        const users = EJSON.parse(payloads.usersJson, { relaxed: false }) as { _id: ObjectId }[];
        expect(users).toHaveLength(1);
        expect(users[0]._id).toEqual(oid);

        const catalog = EJSON.parse(payloads.activeCourseListJson, { relaxed: false }) as {
            id: string;
        };
        expect(catalog.id).toBe('course-id-1');

        expect(JSON.parse(payloads.flagsJson)).toEqual([{ id: 'f1' }]);
        expect(JSON.parse(payloads.scheduledTasksJson)).toEqual([]);
        const mem = EJSON.parse(payloads.memoryAgentJson, { relaxed: false }) as { userId: string }[];
        expect(mem[0].userId).toBe('student-1');
    });
});
