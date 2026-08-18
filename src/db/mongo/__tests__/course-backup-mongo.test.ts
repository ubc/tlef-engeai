import { EJSON, ObjectId } from 'bson';
import type { activeCourse } from '../../../types/shared';
import type { MongoDalContext } from '../mongo-context';
import { loadCourseMongoBackupPayloads } from '../course-backup-mongo';

jest.mock('../collection-registry-mongo', () => ({
    getCollectionNames: jest.fn().mockResolvedValue({
        users: 'TestCourse_users',
        flags: 'TestCourse_flags',
        memoryAgent: 'TestCourse_memory-agent',
        scheduledTasks: 'TestCourse_scheduled_tasks',
        scenarioQuestions: 'TestCourse_scenario_questions',
        scenarioProgress: 'TestCourse_scenario_progress',
        pathways: 'TestCourse_pathways',
        guidedPathwayFlags: 'resolved-by-guided-pathway-owner',
    })
}));

jest.mock('../mongo-collections', () => ({
    activeCourseListCollection: jest.fn(() => {
        const course = {
            id: 'course-id-1',
            courseName: 'TestCourse',
            collections: {
                users: 'TestCourse_users',
                flags: 'TestCourse_flags',
                memoryAgent: 'TestCourse_memory-agent',
                guidedPathwayFlags: 'resolved-by-guided-pathway-owner'
            }
        };
        return {
            createIndex: jest.fn().mockResolvedValue('guided_pathway_flag_collection_unique'),
            find: jest.fn(() => ({
                toArray: jest.fn().mockResolvedValue([course])
            })),
            findOne: jest.fn().mockImplementation((filter: any) => {
                if (filter.id && typeof filter.id === 'object' && '$ne' in filter.id) return null;
                return Promise.resolve({
                    ...course,
                    _id: new ObjectId()
                });
            }),
            updateOne: jest.fn().mockResolvedValue({ matchedCount: 1 })
        };
    }),
    applicationMigrationsCollection: jest.fn(() => ({
        findOne: jest.fn().mockResolvedValue({
            _id: 'GPF-002',
            state: 'complete',
            result: {
                registeredCourseCollections: 0,
                migratedRows: 0,
                migratedGlobalRows: 0,
                migratedHashedRows: 0,
                droppedHashedCollections: 0,
                retainedLegacyRows: 0,
                retainedHashedCollections: 0,
                orphanCourseCollections: 0
            }
        })
    })),
    guidedPathwayFlagsCollection: jest.fn((db) => db.collection('guided-pathway-flags'))
}));

import { getCollectionNames } from '../collection-registry-mongo';
import { activeCourseListCollection } from '../mongo-collections';

describe('course-backup-mongo loadCourseMongoBackupPayloads', () => {
    it('queries catalog and course-owned collections; EJSON round-trips ObjectIds', async () => {
        const oid = new ObjectId();
        const guidedPathwayCollection = 'resolved-by-guided-pathway-owner';
        const rows: Record<string, unknown[]> = {
            TestCourse_users: [{ _id: oid, userId: 'student-1' }],
            TestCourse_flags: [{ id: 'f1' }],
            TestCourse_scheduled_tasks: [],
            'TestCourse_memory-agent': [{ userId: 'student-1', struggleTopics: ['a'] }],
            [guidedPathwayCollection]: [{
                id: 'gpf-1',
                courseId: 'course-id-1',
                courseName: 'TestCourse',
                pathwayId: 'pathway-1',
                pathwayTitle: 'Support',
                messageText: 'I need help',
                studentUserId: 'student-1',
                dedupeKey: 'restricted',
                status: 'pending',
                triggeredAt: new Date('2026-08-08T12:00:00.000Z'),
                identityRevealEvents: []
            }]
        };

        const mockDb = {
            listCollections: () => ({
                toArray: async () => Object.keys(rows).map((name) => ({ name }))
            }),
            createCollection: jest.fn().mockRejectedValue({ codeName: 'NamespaceExists' }),
            collection: (name: string) => ({
                createIndex: jest.fn().mockResolvedValue('index-name'),
                distinct: jest.fn().mockResolvedValue([]),
                countDocuments: jest.fn().mockResolvedValue((rows[name] ?? []).length),
                drop: jest.fn().mockResolvedValue(true),
                findOne: jest.fn().mockImplementation((filter: any) => Promise.resolve(
                    (rows[name] ?? []).find((row: any) => row.courseId !== filter.courseId?.$ne) ?? null
                )),
                find: (filter: { courseId?: string } = {}) => {
                    const matching = (rows[name] ?? []).filter((row: any) =>
                        !filter.courseId || row.courseId === filter.courseId
                    );
                    const cursor = {
                        sort: () => cursor,
                        toArray: async () => matching
                    };
                    return cursor;
                }
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

        const pathwayFlags = JSON.parse(payloads.guidedPathwayFlagsJson) as Array<Record<string, unknown>>;
        expect(pathwayFlags).toHaveLength(1);
        expect(pathwayFlags[0]).toMatchObject({
            id: 'gpf-1',
            messageText: 'I need help',
            triggeredAt: '2026-08-08T12:00:00.000Z'
        });
        expect(pathwayFlags[0]).not.toHaveProperty('studentUserId');
        expect(pathwayFlags[0]).not.toHaveProperty('dedupeKey');
        expect(pathwayFlags[0]).not.toHaveProperty('identityRevealEvents');
        expect(mockDb.createCollection).not.toHaveBeenCalled();
    });
});
