/** Tests for active-course collection authority and the idempotent GPF-002 migration. */

import { createHash } from 'crypto';
import type { activeCourse } from '../../../types/shared';
import type { MongoDalContext } from '../mongo-context';

jest.mock('../mongo-collections', () => ({
    activeCourseListCollection: jest.fn(),
    applicationMigrationsCollection: jest.fn(),
    guidedPathwayFlagsCollection: jest.fn()
}));

jest.mock('../../../utils/logger', () => ({
    appLogger: { warn: jest.fn() }
}));

import {
    activeCourseListCollection,
    applicationMigrationsCollection,
    guidedPathwayFlagsCollection
} from '../mongo-collections';
import {
    assertGuidedPathwayFlagCollectionAvailable,
    ensureGuidedPathwayFlagCollectionIndexes,
    ensureGuidedPathwayFlagRegistryIndex,
    getExistingGuidedPathwayFlagCourseScope,
    getGuidedPathwayFlagCourseScope,
    guidedPathwayFlagCollectionNameForCourse,
    invalidateGuidedPathwayFlagCollectionIndexes,
    listGuidedPathwayFlagCourseScopes,
    migrateGuidedPathwayFlagsToCourseCollections
} from '../guided-pathway-flag-collection-mongo';

type Row = Record<string, any>;

function legacyHash(courseId: string): string {
    return `guided-pathway-flags-course-${createHash('sha256').update(courseId).digest('hex').slice(0, 24)}`;
}

function matches(row: Row, filter: Row = {}): boolean {
    return Object.entries(filter).every(([key, expected]) => {
        if (key === '$or') return (expected as Row[]).some((part) => matches(row, part));
        const actual = key.split('.').reduce((value: any, part) => value?.[part], row);
        if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
            if ('$gt' in expected && !(actual > expected.$gt)) return false;
            if ('$lte' in expected && !(actual <= expected.$lte)) return false;
            if ('$in' in expected && !expected.$in.includes(actual)) return false;
            if ('$ne' in expected && actual === expected.$ne) return false;
            if ('$exists' in expected && (actual !== undefined) !== expected.$exists) return false;
            if ('$type' in expected && expected.$type === 'string' && typeof actual !== 'string') return false;
            return true;
        }
        return actual === expected;
    });
}

function memoryCollection(name: string, initial: Row[], physical: Set<string>) {
    let rows = initial.map((row) => ({ ...row }));
    const api: any = {
        collectionName: name,
        createIndex: jest.fn().mockResolvedValue('ok'),
        find: jest.fn((filter: Row = {}) => {
            let limit = Number.POSITIVE_INFINITY;
            const cursor: any = {
                sort: jest.fn().mockReturnThis(),
                limit: jest.fn((value: number) => {
                    limit = value;
                    return cursor;
                }),
                toArray: jest.fn(async () => rows.filter((row) => matches(row, filter)).slice(0, limit).map((row) => ({ ...row })))
            };
            return cursor;
        }),
        distinct: jest.fn(async (field: string, filter: Row = {}) => [
            ...new Set(rows.filter((row) => matches(row, filter)).map((row) => row[field]))
        ]),
        findOne: jest.fn(async (filter: Row = {}) => rows.find((row) => matches(row, filter)) ?? null),
        insertOne: jest.fn(async (document: Row) => {
            if (rows.some((row) => row._id === document._id)) throw { code: 11000 };
            physical.add(name);
            rows.push({ ...document });
            return { insertedId: document._id };
        }),
        findOneAndUpdate: jest.fn(async (filter: Row, update: Row) => {
            const row = rows.find((candidate) => matches(candidate, filter));
            if (!row) return null;
            Object.assign(row, update.$set ?? {});
            for (const key of Object.keys(update.$unset ?? {})) delete row[key];
            return { ...row };
        }),
        updateOne: jest.fn(async (filter: Row, update: Row) => {
            const row = rows.find((candidate) => matches(candidate, filter));
            if (!row) return { matchedCount: 0, modifiedCount: 0 };
            Object.assign(row, update.$set ?? {});
            for (const key of Object.keys(update.$unset ?? {})) delete row[key];
            return { matchedCount: 1, modifiedCount: 1 };
        }),
        bulkWrite: jest.fn(async (operations: any[]) => {
            for (const operation of operations) {
                const spec = operation.updateOne;
                const existing = rows.find((row) => row._id === spec.filter._id);
                if (!existing) {
                    rows.push({ _id: spec.filter._id, ...(spec.update.$setOnInsert ?? {}) });
                }
            }
            return {};
        }),
        countDocuments: jest.fn(async (filter: Row = {}) => rows.filter((row) => matches(row, filter)).length),
        deleteMany: jest.fn(async (filter: Row) => {
            const before = rows.length;
            rows = rows.filter((row) => !matches(row, filter));
            return { deletedCount: before - rows.length };
        }),
        drop: jest.fn(async () => {
            physical.delete(name);
            rows = [];
            return true;
        }),
        snapshot: () => rows.map((row) => ({ ...row }))
    };
    return api;
}

function harness(courses: activeCourse[], sourceRows: Row[] = [], hashed: Record<string, Row[]> = {}) {
    const physical = new Set<string>(['guided-pathway-flags', ...Object.keys(hashed)]);
    const collections = new Map<string, ReturnType<typeof memoryCollection>>();
    const global = memoryCollection('guided-pathway-flags', sourceRows, physical);
    collections.set('guided-pathway-flags', global);
    for (const [name, rows] of Object.entries(hashed)) collections.set(name, memoryCollection(name, rows, physical));

    const catalog = {
        createIndex: jest.fn().mockResolvedValue('guided_pathway_flag_collection_unique'),
        find: jest.fn(() => {
            const cursor: any = {
                sort: jest.fn().mockReturnThis(),
                toArray: jest.fn(async () => courses)
            };
            return cursor;
        }),
        findOne: jest.fn(async (filter: Row) => courses.find((candidate) => matches(candidate as Row, filter)) ?? null),
        updateOne: jest.fn(async (filter: Row, update: Row) => {
            const course = courses.find((candidate) => candidate.id === filter.id && matches(candidate as any, filter));
            if (!course) return { matchedCount: 0, modifiedCount: 0 };
            course.collections = {
                users: course.collections?.users ?? `${course.courseName}_users`,
                flags: course.collections?.flags ?? `${course.courseName}_flags`,
                memoryAgent: course.collections?.memoryAgent ?? `${course.courseName}_memory-agent`,
                ...course.collections,
                guidedPathwayFlags: update.$set['collections.guidedPathwayFlags']
            };
            return { matchedCount: 1, modifiedCount: 1 };
        })
    };
    const migrationState = memoryCollection('application-migrations', [], physical);
    const db: any = {
        listCollections: jest.fn(() => ({
            toArray: jest.fn(async () => [...physical].map((name) => ({ name })))
        })),
        createCollection: jest.fn(async (name: string) => {
            if (physical.has(name)) throw { codeName: 'NamespaceExists' };
            physical.add(name);
            if (!collections.has(name)) collections.set(name, memoryCollection(name, [], physical));
            return collections.get(name);
        }),
        collection: jest.fn((name: string) => {
            if (!collections.has(name)) collections.set(name, memoryCollection(name, [], physical));
            return collections.get(name);
        })
    };
    const ctx: MongoDalContext = {
        db,
        idGenerator: {} as MongoDalContext['idGenerator'],
        collectionNamesCache: new Map([['Test Course', {} as any]]),
        scheduledTasksIndexesEnsured: new Set()
    };
    (activeCourseListCollection as jest.Mock).mockReturnValue(catalog);
    (applicationMigrationsCollection as jest.Mock).mockReturnValue(migrationState);
    (guidedPathwayFlagsCollection as jest.Mock).mockReturnValue(global);
    return { ctx, catalog, db, global, migrationState, collections, physical };
}

function course(overrides: Partial<activeCourse> = {}): activeCourse {
    return {
        id: 'course-1',
        date: new Date(),
        courseName: 'Test Course',
        courseSetup: true,
        contentSetup: true,
        flagSetup: true,
        monitorSetup: true,
        instructors: [],
        teachingAssistants: [],
        frameType: 'byTopic',
        tilesNumber: 0,
        topicOrWeekInstances: [],
        collections: {
            users: 'Test Course_users',
            flags: 'Test Course_flags',
            memoryAgent: 'Test Course_memory-agent'
        },
        ...overrides
    };
}

describe('Guided Pathway registered collection ownership', () => {
    beforeEach(() => jest.clearAllMocks());

    it('uses a readable course name only for initial registration', () => {
        expect(guidedPathwayFlagCollectionNameForCourse('APSC 101')).toBe('APSC 101_guided-pathway-flags');
    });

    it('rejects surrounding whitespace instead of silently changing a stored namespace', async () => {
        const active = course({
            collections: {
                users: 'Test Course_users',
                flags: 'Test Course_flags',
                memoryAgent: 'Test Course_memory-agent',
                guidedPathwayFlags: ' Test Course_guided-pathway-flags '
            }
        });
        const h = harness([active]);

        await expect(migrateGuidedPathwayFlagsToCourseCollections(h.ctx)).rejects.toThrow(
            'Invalid Guided Pathway alert collection registration'
        );
        expect(h.catalog.updateOne).not.toHaveBeenCalled();
        expect(h.db.createCollection).not.toHaveBeenCalled();
    });

    it('moves global and hashed rows before switching the catalog and dropping verified sources', async () => {
        const hashedName = legacyHash('course-1');
        const active = course({
            collections: {
                users: 'Test Course_users',
                flags: 'Test Course_flags',
                memoryAgent: 'Test Course_memory-agent',
                guidedPathwayFlags: hashedName
            }
        });
        const h = harness(
            [active],
            [{ _id: 'global-1', id: 'flag-global', courseId: 'course-1' }],
            { [hashedName]: [{ _id: 'hash-1', id: 'flag-hash', courseId: 'course-1' }] }
        );

        const result = await migrateGuidedPathwayFlagsToCourseCollections(h.ctx);

        expect(result).toEqual({
            registeredCourseCollections: 1,
            migratedRows: 2,
            migratedGlobalRows: 1,
            migratedHashedRows: 1,
            droppedHashedCollections: 1,
            retainedLegacyRows: 0,
            retainedHashedCollections: 0,
            orphanCourseCollections: 0
        });
        expect(active.collections?.guidedPathwayFlags).toBe('Test Course_guided-pathway-flags');
        expect(h.collections.get('Test Course_guided-pathway-flags')?.snapshot()).toHaveLength(2);
        expect(h.physical.has(hashedName)).toBe(false);
        expect(h.ctx.collectionNamesCache.has('Test Course')).toBe(false);
    });

    it('does not overwrite a newer destination row while copying an older legacy snapshot', async () => {
        const target = 'Test Course_guided-pathway-flags';
        const active = course();
        const h = harness(
            [active],
            [{
                _id: 'shared-mongo-id',
                id: 'flag-1',
                courseId: 'course-1',
                status: 'pending',
                updatedAt: new Date('2026-08-01T00:00:00.000Z')
            }],
            {
                [target]: [{
                    _id: 'shared-mongo-id',
                    id: 'flag-1',
                    courseId: 'course-1',
                    status: 'escalated',
                    adminReviewedByName: 'Current Reviewer',
                    updatedAt: new Date('2026-08-17T00:00:00.000Z')
                }]
            }
        );

        await migrateGuidedPathwayFlagsToCourseCollections(h.ctx);

        expect(h.collections.get(target)?.snapshot()).toEqual([expect.objectContaining({
            _id: 'shared-mongo-id',
            status: 'escalated',
            adminReviewedByName: 'Current Reviewer',
            updatedAt: new Date('2026-08-17T00:00:00.000Z')
        })]);
        expect(h.global.snapshot()).toEqual([]);
        expect(h.collections.get(target)?.bulkWrite).toHaveBeenCalledWith(
            [expect.objectContaining({
                updateOne: expect.objectContaining({
                    filter: { _id: 'shared-mongo-id' },
                    update: { $setOnInsert: expect.objectContaining({ status: 'pending' }) },
                    upsert: true
                })
            })],
            { ordered: true }
        );
    });

    it('uses target then hashed then global precedence for duplicate legacy Mongo identities', async () => {
        const hashedName = legacyHash('course-1');
        const target = 'Test Course_guided-pathway-flags';
        const active = course({
            collections: {
                users: 'Test Course_users',
                flags: 'Test Course_flags',
                memoryAgent: 'Test Course_memory-agent',
                guidedPathwayFlags: hashedName
            }
        });
        const globalRow = {
            _id: 'shared-precedence-id',
            id: 'flag-precedence',
            courseId: 'course-1',
            status: 'pending',
            updatedAt: new Date('2026-08-01T00:00:00.000Z')
        };
        const hashedRow = {
            ...globalRow,
            status: 'escalated',
            decidedByName: 'Current Instructor',
            updatedAt: new Date('2026-08-10T00:00:00.000Z')
        };
        const withoutTarget = harness(
            [active],
            [globalRow],
            { [hashedName]: [hashedRow] }
        );

        await migrateGuidedPathwayFlagsToCourseCollections(withoutTarget.ctx);

        expect(withoutTarget.collections.get(target)?.snapshot()).toEqual([
            expect.objectContaining({
                _id: 'shared-precedence-id',
                status: 'escalated',
                decidedByName: 'Current Instructor',
                updatedAt: new Date('2026-08-10T00:00:00.000Z')
            })
        ]);

        const activeWithTarget = course({
            collections: {
                users: 'Test Course_users',
                flags: 'Test Course_flags',
                memoryAgent: 'Test Course_memory-agent',
                guidedPathwayFlags: hashedName
            }
        });
        const authoritativeTargetRow = {
            ...hashedRow,
            status: 'dismissed',
            decidedByName: 'Latest Instructor',
            updatedAt: new Date('2026-08-17T00:00:00.000Z')
        };
        const withTarget = harness(
            [activeWithTarget],
            [globalRow],
            {
                [hashedName]: [hashedRow],
                [target]: [authoritativeTargetRow]
            }
        );

        await migrateGuidedPathwayFlagsToCourseCollections(withTarget.ctx);

        expect(withTarget.collections.get(target)?.snapshot()).toEqual([
            expect.objectContaining({
                _id: 'shared-precedence-id',
                status: 'dismissed',
                decidedByName: 'Latest Instructor',
                updatedAt: new Date('2026-08-17T00:00:00.000Z')
            })
        ]);
    });

    it('does not register or create storage for an untouched empty legacy course', async () => {
        const active = course();
        const h = harness([active]);

        const result = await migrateGuidedPathwayFlagsToCourseCollections(h.ctx);

        expect(result.registeredCourseCollections).toBe(0);
        expect(active.collections?.guidedPathwayFlags).toBeUndefined();
        expect(h.db.createCollection).not.toHaveBeenCalled();
        expect(h.catalog.updateOne).not.toHaveBeenCalled();
    });

    it('honours a stored readable name after a course rename and keeps read-only resolution side-effect free', async () => {
        const active = course({
            courseName: 'Renamed Course',
            collections: {
                users: 'Old Course_users',
                flags: 'Old Course_flags',
                memoryAgent: 'Old Course_memory-agent',
                guidedPathwayFlags: 'Old Course_guided-pathway-flags'
            }
        });
        const h = harness([active], [], { 'Old Course_guided-pathway-flags': [] });

        const existing = await getExistingGuidedPathwayFlagCourseScope(h.ctx, 'course-1');
        const adminScopes = await listGuidedPathwayFlagCourseScopes(h.ctx);

        expect(existing?.collectionName).toBe('Old Course_guided-pathway-flags');
        expect(adminScopes[0]?.collectionName).toBe('Old Course_guided-pathway-flags');
        expect(h.catalog.updateOne).not.toHaveBeenCalled();
        expect(h.db.createCollection).not.toHaveBeenCalled();
        expect(h.collections.get('Old Course_guided-pathway-flags')?.createIndex).not.toHaveBeenCalled();
    });

    it('lazily registers, creates, and indexes storage only on the provisioning resolver', async () => {
        const active = course();
        const h = harness([active]);

        await expect(getExistingGuidedPathwayFlagCourseScope(h.ctx, 'course-1')).resolves.toBeNull();
        const scope = await getGuidedPathwayFlagCourseScope(h.ctx, 'course-1');

        expect(scope.collectionName).toBe('Test Course_guided-pathway-flags');
        expect(active.collections?.guidedPathwayFlags).toBe(scope.collectionName);
        expect(h.db.createCollection).toHaveBeenCalledWith(scope.collectionName);
        expect(h.collections.get(scope.collectionName)?.createIndex).toHaveBeenCalledTimes(5);
    });

    it('builds the unique registry index once for one database context', async () => {
        const h = harness([course()]);

        await ensureGuidedPathwayFlagRegistryIndex(h.ctx);
        await ensureGuidedPathwayFlagRegistryIndex(h.ctx);

        expect(h.catalog.createIndex).toHaveBeenCalledTimes(1);
        expect(h.catalog.createIndex).toHaveBeenCalledWith(
            { 'collections.guidedPathwayFlags': 1 },
            {
                unique: true,
                name: 'guided_pathway_flag_collection_unique',
                partialFilterExpression: {
                    'collections.guidedPathwayFlags': { $type: 'string', $gt: '' }
                }
            }
        );
    });

    it('rebuilds collection indexes after a dropped namespace invalidates the memo', async () => {
        const h = harness([course()]);
        const target = 'Test Course_guided-pathway-flags';
        const targetCollection = h.db.collection(target);

        await ensureGuidedPathwayFlagCollectionIndexes(h.ctx, target);
        await ensureGuidedPathwayFlagCollectionIndexes(h.ctx, target);
        expect(targetCollection.createIndex).toHaveBeenCalledTimes(5);

        invalidateGuidedPathwayFlagCollectionIndexes(h.ctx, target);
        await ensureGuidedPathwayFlagCollectionIndexes(h.ctx, target);

        expect(targetCollection.createIndex).toHaveBeenCalledTimes(10);
    });

    it('retains orphan hashed data rather than assigning it to an active course', async () => {
        const orphan = legacyHash('deleted-course');
        const h = harness([], [], {
            [orphan]: [{ _id: 'orphan-1', id: 'flag-orphan', courseId: 'deleted-course' }]
        });

        const result = await migrateGuidedPathwayFlagsToCourseCollections(h.ctx);

        expect(result.retainedHashedCollections).toBe(1);
        expect(result.orphanCourseCollections).toBe(1);
        expect(h.physical.has(orphan)).toBe(true);
    });

    it('rejects a readable target that already contains another course\'s rows', async () => {
        const active = course();
        const target = 'Test Course_guided-pathway-flags';
        const h = harness([active], [], {
            [target]: [{ _id: 'foreign-1', id: 'foreign-flag', courseId: 'course-2' }]
        });

        await expect(migrateGuidedPathwayFlagsToCourseCollections(h.ctx)).rejects.toThrow(
            'contains rows owned by another course'
        );
        expect(h.catalog.updateOne).not.toHaveBeenCalled();
        expect(active.collections?.guidedPathwayFlags).toBeUndefined();
    });

    it('rejects reuse of a renamed course\'s registered old collection name', async () => {
        const oldTarget = 'Original Course_guided-pathway-flags';
        const renamed = course({
            id: 'course-old',
            courseName: 'Renamed Course',
            collections: {
                users: 'Original Course_users',
                flags: 'Original Course_flags',
                memoryAgent: 'Original Course_memory-agent',
                guidedPathwayFlags: oldTarget
            }
        });
        const replacement = course({
            id: 'course-new',
            courseName: 'Original Course',
            collections: {
                users: 'Replacement_users',
                flags: 'Replacement_flags',
                memoryAgent: 'Replacement_memory-agent'
            }
        });
        const h = harness([renamed, replacement], [], { [oldTarget]: [] });

        await expect(assertGuidedPathwayFlagCollectionAvailable(
            h.ctx,
            replacement.id,
            oldTarget
        )).rejects.toThrow('is already registered to another course');
        expect(h.catalog.createIndex).toHaveBeenCalledTimes(1);
    });

});
