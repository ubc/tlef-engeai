/** Tests for deterministic course ownership and the idempotent GPF-001 migration. */

import type { MongoDalContext } from '../mongo-context';

jest.mock('../mongo-collections', () => ({
    activeCourseListCollection: jest.fn(),
    guidedPathwayFlagsCollection: jest.fn()
}));

jest.mock('../../../utils/logger', () => ({
    appLogger: { warn: jest.fn() }
}));

import { activeCourseListCollection, guidedPathwayFlagsCollection } from '../mongo-collections';
import {
    guidedPathwayFlagCollectionNameForCourse,
    migrateGuidedPathwayFlagsToCourseCollections
} from '../guided-pathway-flag-collection-mongo';

function context(db: Record<string, unknown>): MongoDalContext {
    return {
        db: db as unknown as MongoDalContext['db'],
        idGenerator: {} as MongoDalContext['idGenerator'],
        collectionNamesCache: new Map([['Existing Course', {} as any]]),
        scheduledTasksIndexesEnsured: new Set()
    };
}

function migrationCursor(rows: unknown[]) {
    let delivered = false;
    const cursor: any = {
        sort: jest.fn(),
        limit: jest.fn(),
        toArray: jest.fn().mockImplementation(async () => {
            if (delivered) return [];
            delivered = true;
            return rows;
        })
    };
    cursor.sort.mockReturnValue(cursor);
    cursor.limit.mockReturnValue(cursor);
    return cursor;
}

function targetCollection() {
    return {
        createIndex: jest.fn().mockResolvedValue('ok'),
        bulkWrite: jest.fn().mockResolvedValue({}),
        countDocuments: jest.fn().mockImplementation(async (filter: any) => filter._id?.$in?.length ?? 0)
    };
}

describe('Guided Pathway course collection ownership', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('derives a stable Mongo-safe namespace from course id rather than display name', () => {
        const first = guidedPathwayFlagCollectionNameForCourse('course-stable-id');
        const afterRename = guidedPathwayFlagCollectionNameForCourse('course-stable-id');
        const otherCourse = guidedPathwayFlagCollectionNameForCourse('another-course-id');

        expect(first).toBe(afterRename);
        expect(first).toMatch(/^guided-pathway-flags-course-[a-f0-9]{24}$/);
        expect(otherCourse).not.toBe(first);
    });

    it('copies active and orphan rows, verifies each batch, then removes the empty legacy collection', async () => {
        const activeCourseId = 'course-1';
        const orphanCourseId = 'deleted-course';
        const activeName = guidedPathwayFlagCollectionNameForCourse(activeCourseId);
        const orphanName = guidedPathwayFlagCollectionNameForCourse(orphanCourseId);
        const activeRows = [{ _id: 'mongo-1', id: 'flag-1', courseId: activeCourseId }];
        const orphanRows = [{ _id: 'mongo-2', id: 'flag-2', courseId: orphanCourseId }];

        const catalog = {
            find: jest.fn().mockReturnValue({
                toArray: jest.fn().mockResolvedValue([{
                    id: activeCourseId,
                    courseName: 'Existing Course',
                    collections: {
                        users: 'users',
                        flags: 'flags',
                        memoryAgent: 'memory'
                    }
                }])
            }),
            updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 })
        };
        const sourceCursors = new Map([
            [activeCourseId, migrationCursor(activeRows)],
            [orphanCourseId, migrationCursor(orphanRows)]
        ]);
        const source = {
            distinct: jest.fn().mockResolvedValue([activeCourseId, orphanCourseId]),
            find: jest.fn().mockImplementation(({ courseId }: { courseId: string }) => sourceCursors.get(courseId)),
            deleteMany: jest.fn().mockImplementation(async (filter: any) => ({
                deletedCount: filter._id.$in.length
            })),
            countDocuments: jest.fn().mockResolvedValue(0),
            drop: jest.fn().mockResolvedValue(true)
        };
        const targets = new Map([
            [activeName, targetCollection()],
            [orphanName, targetCollection()]
        ]);
        const db = {
            createCollection: jest.fn().mockResolvedValue({}),
            collection: jest.fn().mockImplementation((name: string) => targets.get(name))
        };
        (activeCourseListCollection as jest.Mock).mockReturnValue(catalog);
        (guidedPathwayFlagsCollection as jest.Mock).mockReturnValue(source);

        const result = await migrateGuidedPathwayFlagsToCourseCollections(context(db));

        expect(result).toEqual({
            registeredCourseCollections: 1,
            migratedRows: 2,
            orphanCourseCollections: 1,
            retainedLegacyRows: 0
        });
        expect(catalog.updateOne).toHaveBeenCalledWith(
            { id: activeCourseId },
            { $set: { 'collections.guidedPathwayFlags': activeName } }
        );
        expect(targets.get(activeName)?.bulkWrite).toHaveBeenCalledWith([
            {
                replaceOne: {
                    filter: { _id: 'mongo-1' },
                    replacement: activeRows[0],
                    upsert: true
                }
            }
        ], { ordered: true });
        expect(targets.get(orphanName)?.bulkWrite).toHaveBeenCalledTimes(1);
        expect(targets.get(activeName)?.countDocuments.mock.invocationCallOrder[0]).toBeLessThan(
            source.deleteMany.mock.invocationCallOrder[0]
        );
        expect(source.drop).toHaveBeenCalledTimes(1);
    });

    it('keeps the source batch when destination verification fails', async () => {
        const courseId = 'course-verification';
        const collectionName = guidedPathwayFlagCollectionNameForCourse(courseId);
        const row = { _id: 'mongo-unverified', id: 'flag-unverified', courseId };
        const catalog = {
            find: jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue([]) }),
            updateOne: jest.fn()
        };
        const source = {
            distinct: jest.fn().mockResolvedValue([courseId]),
            find: jest.fn().mockReturnValue(migrationCursor([row])),
            deleteMany: jest.fn(),
            countDocuments: jest.fn(),
            drop: jest.fn()
        };
        const target = {
            ...targetCollection(),
            countDocuments: jest.fn().mockResolvedValue(0)
        };
        const db = {
            createCollection: jest.fn().mockResolvedValue({}),
            collection: jest.fn().mockImplementation((name: string) => name === collectionName ? target : undefined)
        };
        (activeCourseListCollection as jest.Mock).mockReturnValue(catalog);
        (guidedPathwayFlagsCollection as jest.Mock).mockReturnValue(source);

        await expect(migrateGuidedPathwayFlagsToCourseCollections(context(db))).rejects.toThrow(
            'GPF-001 verification failed'
        );
        expect(source.deleteMany).not.toHaveBeenCalled();
        expect(source.drop).not.toHaveBeenCalled();
    });

    it('accepts a verified source batch already deleted by a concurrent migrator', async () => {
        const courseId = 'course-concurrent';
        const collectionName = guidedPathwayFlagCollectionNameForCourse(courseId);
        const row = { _id: 'mongo-concurrent', id: 'flag-concurrent', courseId };
        const catalog = {
            find: jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue([]) }),
            updateOne: jest.fn()
        };
        const source = {
            distinct: jest.fn().mockResolvedValue([courseId]),
            find: jest.fn().mockReturnValue(migrationCursor([row])),
            deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 }),
            countDocuments: jest.fn().mockResolvedValue(0),
            drop: jest.fn().mockResolvedValue(true)
        };
        const target = targetCollection();
        const db = {
            createCollection: jest.fn().mockResolvedValue({}),
            collection: jest.fn().mockImplementation((name: string) => name === collectionName ? target : undefined)
        };
        (activeCourseListCollection as jest.Mock).mockReturnValue(catalog);
        (guidedPathwayFlagsCollection as jest.Mock).mockReturnValue(source);

        await expect(migrateGuidedPathwayFlagsToCourseCollections(context(db))).resolves.toEqual({
            registeredCourseCollections: 0,
            migratedRows: 0,
            orphanCourseCollections: 1,
            retainedLegacyRows: 0
        });
        expect(source.countDocuments).toHaveBeenCalledWith({ _id: { $in: ['mongo-concurrent'] } });
        expect(source.drop).toHaveBeenCalledTimes(1);
    });
});
