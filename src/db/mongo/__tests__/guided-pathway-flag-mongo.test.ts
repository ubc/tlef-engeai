/** Focused persistence and privacy tests for course-owned Guided Pathway alert collections. */

import type { MongoDalContext } from '../mongo-context';

jest.mock('../guided-pathway-flag-collection-mongo', () => ({
    GuidedPathwayFlagCourseNotFoundError: class GuidedPathwayFlagCourseNotFoundError extends Error {},
    getExistingGuidedPathwayFlagCourseScope: jest.fn(),
    getGuidedPathwayFlagCourseScope: jest.fn(),
    guidedPathwayFlagCourseCollection: jest.fn(),
    invalidateGuidedPathwayFlagCollectionIndexes: jest.fn(),
    listGuidedPathwayFlagCourseScopes: jest.fn(),
    migrateGuidedPathwayFlagsToCourseCollections: jest.fn()
}));

jest.mock('../course-user-mongo', () => ({
    getCourseUsersMongoCollection: jest.fn()
}));

import { getCourseUsersMongoCollection } from '../course-user-mongo';
import {
    GuidedPathwayFlagCourseNotFoundError,
    getExistingGuidedPathwayFlagCourseScope,
    getGuidedPathwayFlagCourseScope,
    guidedPathwayFlagCourseCollection,
    invalidateGuidedPathwayFlagCollectionIndexes,
    listGuidedPathwayFlagCourseScopes
} from '../guided-pathway-flag-collection-mongo';
import {
    countGuidedPathwayFlagsAwaitingAdminReview,
    createGuidedPathwayFlag,
    decideGuidedPathwayFlag,
    deleteGuidedPathwayFlagsForCourse,
    listGuidedPathwayFlagsForAdmin,
    listGuidedPathwayFlagsForBackup,
    listGuidedPathwayFlagsForCourse,
    markGuidedPathwayFlagAdminReviewed,
    revealGuidedPathwayFlagIdentity
} from '../guided-pathway-flag-mongo';
import { GuidedPathwayFlagNotFoundError } from '../../../flags/guided-pathway-flag-errors';

const courseScope = {
    courseId: 'course-1',
    courseName: 'Test Course',
    collectionName: 'guided-pathway-flags-course-one'
};

function context(dbOverrides: Record<string, unknown> = {}): MongoDalContext {
    return {
        db: { collection: jest.fn(), ...dbOverrides } as unknown as MongoDalContext['db'],
        idGenerator: {} as MongoDalContext['idGenerator'],
        collectionNamesCache: new Map(),
        scheduledTasksIndexesEnsured: new Set()
    };
}

function rawFlag(overrides: Record<string, unknown> = {}) {
    const now = new Date('2026-08-08T12:00:00.000Z');
    return {
        id: 'flag-1',
        courseId: 'course-1',
        courseName: 'Test Course',
        pathwayId: 'pathway-1',
        pathwayTitle: 'Support',
        messageText: 'I need help',
        studentUserId: 'student-1',
        dedupeKey: 'restricted-dedupe',
        status: 'pending',
        adminSortPriority: 1,
        triggeredAt: now,
        identityRevealEvents: [],
        createdAt: now,
        updatedAt: now,
        ...overrides
    };
}

function cursorFor(rows: unknown[]) {
    const cursor: any = {
        sort: jest.fn(),
        skip: jest.fn(),
        limit: jest.fn(),
        toArray: jest.fn().mockResolvedValue(rows)
    };
    cursor.sort.mockReturnValue(cursor);
    cursor.skip.mockReturnValue(cursor);
    cursor.limit.mockReturnValue(cursor);
    return cursor;
}

function collection(overrides: Record<string, unknown> = {}) {
    return {
        insertOne: jest.fn().mockResolvedValue({ insertedId: 'mongo-id' }),
        findOne: jest.fn().mockResolvedValue(null),
        find: jest.fn().mockReturnValue(cursorFor([])),
        countDocuments: jest.fn().mockResolvedValue(0),
        findOneAndUpdate: jest.fn().mockResolvedValue(null),
        drop: jest.fn().mockResolvedValue(true),
        ...overrides
    } as any;
}

const createInput = {
    courseId: 'course-1',
    courseName: 'Caller Course Snapshot',
    pathwayId: 'pathway-1',
    pathwayTitle: 'Support',
    messageText: 'I need help',
    actor: { origin: 'student' as const, userId: 'student-1' },
    chatId: 'chat-1',
    clientMessageId: 'client-message-1',
    triggeredAt: new Date('2026-08-08T12:00:00.000Z')
};

describe('guided-pathway-flag-mongo', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (getExistingGuidedPathwayFlagCourseScope as jest.Mock).mockResolvedValue(courseScope);
        (getGuidedPathwayFlagCourseScope as jest.Mock).mockResolvedValue(courseScope);
        (listGuidedPathwayFlagCourseScopes as jest.Mock).mockResolvedValue([courseScope]);
    });

    it('stores only an opaque message-bound dedupe key in the resolved course collection', async () => {
        const coll = collection();
        (guidedPathwayFlagCourseCollection as jest.Mock).mockReturnValue(coll);

        const first = await createGuidedPathwayFlag(context(), createInput);
        await createGuidedPathwayFlag(context(), { ...createInput, messageText: 'A different message' });

        expect(first.created).toBe(true);
        expect(first.flag).toMatchObject({
            courseId: 'course-1',
            courseName: 'Test Course',
            pathwayTitle: 'Support',
            messageText: 'I need help',
            origin: 'student',
            status: 'pending'
        });
        expect(first.flag).not.toHaveProperty('studentUserId');
        expect(first.flag).not.toHaveProperty('chatId');

        const firstDoc = coll.insertOne.mock.calls[0][0];
        const secondDoc = coll.insertOne.mock.calls[1][0];
        expect(firstDoc.dedupeKey).toMatch(/^[a-f0-9]{64}$/);
        expect(firstDoc.dedupeKey).not.toBe(secondDoc.dedupeKey);
        expect(firstDoc.courseName).toBe('Test Course');
        expect(firstDoc.studentUserId).toBe('student-1');
        expect(firstDoc).not.toHaveProperty('clientMessageId');
    });

    it('stores an instructor test without persisting tester or student identity', async () => {
        const coll = collection();
        (guidedPathwayFlagCourseCollection as jest.Mock).mockReturnValue(coll);

        const result = await createGuidedPathwayFlag(context(), {
            ...createInput,
            actor: { origin: 'instructor-test', userId: 'instructor-1' }
        });

        expect(result.flag).toMatchObject({ origin: 'instructor-test', status: 'pending' });
        const stored = coll.insertOne.mock.calls[0][0];
        expect(stored.origin).toBe('instructor-test');
        expect(stored).not.toHaveProperty('studentUserId');
        expect(stored).not.toHaveProperty('testerUserId');
        expect(stored).not.toHaveProperty('actor');
        expect(JSON.stringify(stored)).not.toContain('instructor-1');
    });

    it('includes origin in opaque deduplication material', async () => {
        const coll = collection();
        (guidedPathwayFlagCourseCollection as jest.Mock).mockReturnValue(coll);

        await createGuidedPathwayFlag(context(), createInput);
        await createGuidedPathwayFlag(context(), {
            ...createInput,
            actor: { origin: 'instructor-test', userId: 'student-1' }
        });

        expect(coll.insertOne.mock.calls[0][0].dedupeKey)
            .not.toBe(coll.insertOne.mock.calls[1][0].dedupeKey);
    });

    it('returns the existing safe alert after an atomic duplicate-key collision', async () => {
        const coll = collection({
            insertOne: jest.fn().mockRejectedValue({ code: 11000 }),
            findOne: jest.fn().mockResolvedValue(rawFlag())
        });
        (guidedPathwayFlagCourseCollection as jest.Mock).mockReturnValue(coll);

        const result = await createGuidedPathwayFlag(context(), createInput);

        expect(result.created).toBe(false);
        expect(result.flag.id).toBe('flag-1');
        expect(result.flag).not.toHaveProperty('studentUserId');
        expect(coll.findOne).toHaveBeenCalledWith(
            expect.objectContaining({ courseId: 'course-1', dedupeKey: expect.any(String) }),
            expect.objectContaining({ projection: expect.objectContaining({ id: 1, messageText: 1 }) })
        );
    });

    it('double-enforces the safe allowlist when listing one course', async () => {
        const cursor = cursorFor([rawFlag()]);
        const coll = collection({
            find: jest.fn().mockReturnValue(cursor),
            countDocuments: jest.fn().mockResolvedValue(1)
        });
        (guidedPathwayFlagCourseCollection as jest.Mock).mockReturnValue(coll);

        const page = await listGuidedPathwayFlagsForCourse(context(), 'course-1', {
            page: 1,
            pageSize: 20
        });

        expect(page.total).toBe(1);
        expect(page.items[0].origin).toBe('student');
        expect(page.items[0]).not.toHaveProperty('studentUserId');
        expect(page.items[0]).not.toHaveProperty('dedupeKey');
        expect(page.items[0]).not.toHaveProperty('identityRevealEvents');
        expect(coll.find).toHaveBeenCalledWith(
            { courseId: 'course-1' },
            expect.objectContaining({ projection: expect.objectContaining({ id: 1, messageText: 1 }) })
        );
    });

    it('returns an empty course page without provisioning missing flag storage', async () => {
        (getExistingGuidedPathwayFlagCourseScope as jest.Mock).mockResolvedValue(null);

        await expect(listGuidedPathwayFlagsForCourse(context(), 'course-1', {
            page: 2,
            pageSize: 20
        })).resolves.toEqual({ items: [], page: 2, pageSize: 20, total: 0 });
        expect(getGuidedPathwayFlagCourseScope).not.toHaveBeenCalled();
        expect(guidedPathwayFlagCourseCollection).not.toHaveBeenCalled();
    });

    it('maps a missing active course to the public not-found contract', async () => {
        (getExistingGuidedPathwayFlagCourseScope as jest.Mock).mockRejectedValue(
            new GuidedPathwayFlagCourseNotFoundError()
        );

        await expect(listGuidedPathwayFlagsForCourse(context(), 'missing-course', {
            page: 1,
            pageSize: 20
        })).rejects.toBeInstanceOf(GuidedPathwayFlagNotFoundError);
    });

    it('builds a canonical cross-course union and returns only safe admin facets', async () => {
        const secondScope = {
            courseId: 'course-2',
            courseName: 'Second Course',
            collectionName: 'guided-pathway-flags-course-two'
        };
        (listGuidedPathwayFlagCourseScopes as jest.Mock).mockResolvedValue([courseScope, secondScope]);
        const toArray = jest.fn().mockResolvedValue([{
            items: [rawFlag()],
            totals: [{ value: 1 }],
            pathways: [{ pathwayId: 'pathway-1', pathwayTitle: 'Support' }],
            reviewers: [{ name: 'Instructor A' }, { name: 'Admin B' }]
        }]);
        const aggregate = jest.fn().mockReturnValue({ toArray });
        const dbCollection = jest.fn().mockReturnValue({ aggregate });

        const page = await listGuidedPathwayFlagsForAdmin(context({ collection: dbCollection }), {
            status: 'escalated',
            reviewState: 'needs-review',
            includeFacets: true,
            escalatedFirst: true
        });

        expect(page.total).toBe(1);
        expect(page.facets).toEqual({
            pathways: [{ pathwayId: 'pathway-1', pathwayTitle: 'Support' }],
            reviewers: ['Instructor A', 'Admin B']
        });
        expect(page.items[0]).not.toHaveProperty('studentUserId');
        expect(dbCollection).toHaveBeenCalledWith(courseScope.collectionName);

        const pipeline = aggregate.mock.calls[0][0];
        expect(pipeline[0]).toEqual({ $match: { courseId: 'course-1' } });
        expect(pipeline[1]).toEqual({
            $unionWith: {
                coll: secondScope.collectionName,
                pipeline: [{ $match: { courseId: 'course-2' } }]
            }
        });
        const facet = pipeline[2].$facet;
        const studentOriginFilter = {
            $or: [{ origin: 'student' }, { origin: { $exists: false } }]
        };
        expect(facet.items[0].$match.$and).toContainEqual(studentOriginFilter);
        expect(facet.totals[0].$match.$and).toContainEqual(studentOriginFilter);
        expect(facet.pathways[0].$match.$and).toContainEqual(studentOriginFilter);
        expect(facet.reviewers[0].$match.$and).toContainEqual(studentOriginFilter);
        const itemProjection = facet.items.at(-1).$project;
        expect(itemProjection).toEqual(expect.objectContaining({ id: 1, messageText: 1, origin: 1 }));
        expect(itemProjection).not.toHaveProperty('studentUserId');
        expect(facet.pathways.some((stage: any) => stage.$project?.messageText)).toBe(false);
        expect(facet.reviewers.some((stage: any) => stage.$project?.studentUserId)).toBe(false);
    });

    it('atomically records an instructor escalation within the requested course', async () => {
        const coll = collection({
            findOneAndUpdate: jest.fn().mockResolvedValue(rawFlag({
                status: 'escalated',
                decidedAt: new Date('2026-08-08T12:05:00.000Z'),
                decidedByName: 'Instructor'
            }))
        });
        (guidedPathwayFlagCourseCollection as jest.Mock).mockReturnValue(coll);

        const result = await decideGuidedPathwayFlag(
            context(),
            'course-1',
            'flag-1',
            'escalate',
            { userId: 'instructor-1', name: 'Instructor' }
        );

        expect(coll.findOneAndUpdate).toHaveBeenCalledWith(
            {
                id: 'flag-1',
                courseId: 'course-1',
                status: 'pending',
                $and: [{ $or: [{ origin: 'student' }, { origin: { $exists: false } }] }]
            },
            expect.objectContaining({
                $set: expect.objectContaining({
                    status: 'escalated',
                    decidedByUserId: 'instructor-1',
                    decidedByName: 'Instructor'
                })
            }),
            expect.any(Object)
        );
        expect(result.status).toBe('escalated');
        expect(result).not.toHaveProperty('decidedByUserId');
    });

    it('rejects escalation for an instructor test without changing its lifecycle', async () => {
        const coll = collection({
            findOne: jest.fn().mockResolvedValue(rawFlag({ origin: 'instructor-test' }))
        });
        (guidedPathwayFlagCourseCollection as jest.Mock).mockReturnValue(coll);

        await expect(decideGuidedPathwayFlag(
            context(),
            'course-1',
            'flag-1',
            'escalate',
            { userId: 'instructor-1', name: 'Instructor' }
        )).rejects.toThrow('Instructor test flags cannot be escalated');
        expect(coll.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('allows an instructor test to be dismissed as complete', async () => {
        const coll = collection({
            findOneAndUpdate: jest.fn().mockResolvedValue(rawFlag({
                origin: 'instructor-test',
                status: 'dismissed'
            }))
        });
        (guidedPathwayFlagCourseCollection as jest.Mock).mockReturnValue(coll);

        const result = await decideGuidedPathwayFlag(
            context(),
            'course-1',
            'flag-1',
            'dismiss',
            { userId: 'instructor-1', name: 'Instructor' }
        );

        expect(result).toMatchObject({ origin: 'instructor-test', status: 'dismissed' });
        expect(coll.findOneAndUpdate.mock.calls[0][0]).not.toHaveProperty('$and');
    });

    it('does not merge equal alert ids across two course collections', async () => {
        const secondScope = {
            courseId: 'course-2',
            courseName: 'Second Course',
            collectionName: 'guided-pathway-flags-course-two'
        };
        const firstCollection = collection();
        const secondCollection = collection({
            findOneAndUpdate: jest.fn().mockResolvedValue(rawFlag({
                courseId: 'course-2',
                courseName: 'Second Course',
                status: 'dismissed'
            }))
        });
        (getExistingGuidedPathwayFlagCourseScope as jest.Mock).mockImplementation(
            async (_ctx: MongoDalContext, courseId: string) => courseId === 'course-1' ? courseScope : secondScope
        );
        (guidedPathwayFlagCourseCollection as jest.Mock).mockImplementation(
            (_ctx: MongoDalContext, scope: typeof courseScope) =>
                scope.courseId === 'course-1' ? firstCollection : secondCollection
        );

        const result = await decideGuidedPathwayFlag(
            context(),
            'course-2',
            'flag-1',
            'dismiss',
            { userId: 'instructor-2', name: 'Instructor Two' }
        );

        expect(result.courseId).toBe('course-2');
        expect(secondCollection.findOneAndUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'flag-1', courseId: 'course-2' }),
            expect.any(Object),
            expect.any(Object)
        );
        expect(firstCollection.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('records platform review once using course and lifecycle predicates', async () => {
        const coll = collection({
            findOneAndUpdate: jest.fn().mockResolvedValue(rawFlag({
                status: 'escalated',
                adminReviewedAt: new Date('2026-08-08T12:10:00.000Z'),
                adminReviewedByName: 'Admin'
            }))
        });
        (guidedPathwayFlagCourseCollection as jest.Mock).mockReturnValue(coll);

        const result = await markGuidedPathwayFlagAdminReviewed(
            context(),
            'course-1',
            'flag-1',
            { userId: 'admin-1', name: 'Admin' }
        );

        expect(coll.findOneAndUpdate.mock.calls[0][0]).toEqual({
            id: 'flag-1',
            courseId: 'course-1',
            status: 'escalated',
            adminReviewedAt: { $exists: false },
            $and: [{ $or: [{ origin: 'student' }, { origin: { $exists: false } }] }]
        });
        expect(result.adminReviewedByName).toBe('Admin');
        expect(result).not.toHaveProperty('adminReviewedByUserId');
    });

    it('rejects administrator review for an instructor test', async () => {
        const coll = collection({
            findOne: jest.fn().mockResolvedValue(rawFlag({
                origin: 'instructor-test',
                status: 'escalated'
            }))
        });
        (guidedPathwayFlagCourseCollection as jest.Mock).mockReturnValue(coll);

        await expect(markGuidedPathwayFlagAdminReviewed(
            context(),
            'course-1',
            'flag-1',
            { userId: 'admin-1', name: 'Admin' }
        )).rejects.toThrow('Instructor test flags do not enter administrator review');
        expect(coll.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('appends the reveal audit before returning only the current roster display name', async () => {
        const coll = collection({
            findOneAndUpdate: jest.fn().mockResolvedValue({ studentUserId: 'student-1' })
        });
        const roster = { findOne: jest.fn().mockResolvedValue({ name: 'Current Roster Name' }) };
        (guidedPathwayFlagCourseCollection as jest.Mock).mockReturnValue(coll);
        (getCourseUsersMongoCollection as jest.Mock).mockResolvedValue(roster);

        const result = await revealGuidedPathwayFlagIdentity(
            context(),
            'course-1',
            'flag-1',
            { userId: 'admin-1', name: 'Admin' }
        );

        expect(result).toEqual({ studentName: 'Current Roster Name' });
        expect(coll.findOneAndUpdate.mock.calls[0][0]).toEqual({
            id: 'flag-1',
            courseId: 'course-1',
            status: 'escalated',
            $and: [{ $or: [{ origin: 'student' }, { origin: { $exists: false } }] }]
        });
        expect(coll.findOneAndUpdate.mock.invocationCallOrder[0]).toBeLessThan(
            roster.findOne.mock.invocationCallOrder[0]
        );
        expect(getCourseUsersMongoCollection).toHaveBeenCalledWith(expect.anything(), 'Test Course');
    });

    it('rejects identity reveal for an instructor test before audit or roster access', async () => {
        const coll = collection({
            findOne: jest.fn().mockResolvedValue(rawFlag({
                origin: 'instructor-test',
                status: 'escalated'
            }))
        });
        const roster = { findOne: jest.fn() };
        (guidedPathwayFlagCourseCollection as jest.Mock).mockReturnValue(coll);
        (getCourseUsersMongoCollection as jest.Mock).mockResolvedValue(roster);

        await expect(revealGuidedPathwayFlagIdentity(
            context(),
            'course-1',
            'flag-1',
            { userId: 'admin-1', name: 'Admin' }
        )).rejects.toThrow('Instructor test flags have no student identity to reveal');
        expect(coll.findOneAndUpdate).not.toHaveBeenCalled();
        expect(getCourseUsersMongoCollection).not.toHaveBeenCalled();
        expect(roster.findOne).not.toHaveBeenCalled();
    });

    it('falls back to active-users when the triggering user is not on the course roster', async () => {
        const coll = collection({
            findOneAndUpdate: jest.fn().mockResolvedValue({ studentUserId: 'instructor-1' })
        });
        const roster = { findOne: jest.fn().mockResolvedValue(null) };
        const activeUsers = { findOne: jest.fn().mockResolvedValue({ name: 'Instructor Name' }) };
        (guidedPathwayFlagCourseCollection as jest.Mock).mockReturnValue(coll);
        (getCourseUsersMongoCollection as jest.Mock).mockResolvedValue(roster);

        const ctx = context({
            collection: jest.fn().mockReturnValue(activeUsers)
        });

        const result = await revealGuidedPathwayFlagIdentity(
            ctx,
            'course-1',
            'flag-1',
            { userId: 'admin-1', name: 'Admin' }
        );

        expect(result).toEqual({ studentName: 'Instructor Name' });
        expect(activeUsers.findOne).toHaveBeenCalledWith(
            { userId: 'instructor-1' },
            { projection: { _id: 0, name: 1 } }
        );
    });

    it('fails closed without reading the roster when the reveal audit write fails', async () => {
        const coll = collection({
            findOneAndUpdate: jest.fn().mockRejectedValue(new Error('audit write failed'))
        });
        const roster = { findOne: jest.fn() };
        (guidedPathwayFlagCourseCollection as jest.Mock).mockReturnValue(coll);
        (getCourseUsersMongoCollection as jest.Mock).mockResolvedValue(roster);

        await expect(revealGuidedPathwayFlagIdentity(
            context(),
            'course-1',
            'flag-1',
            { userId: 'admin-1', name: 'Admin' }
        )).rejects.toThrow('audit write failed');
        expect(getCourseUsersMongoCollection).not.toHaveBeenCalled();
        expect(roster.findOne).not.toHaveBeenCalled();
    });

    it('counts active-course escalations and drops one course-owned collection', async () => {
        const aggregate = jest.fn().mockReturnValue({
            toArray: jest.fn().mockResolvedValue([{ value: 3 }])
        });
        const coll = collection({ countDocuments: jest.fn().mockResolvedValue(2) });
        (guidedPathwayFlagCourseCollection as jest.Mock).mockReturnValue(coll);
        const dbCollection = jest.fn().mockReturnValue({ aggregate });
        const ctx = context({ collection: dbCollection });

        await expect(countGuidedPathwayFlagsAwaitingAdminReview(ctx)).resolves.toBe(3);
        await expect(deleteGuidedPathwayFlagsForCourse(ctx, 'course-1')).resolves.toBe(2);

        const pipeline = aggregate.mock.calls[0][0];
        expect(pipeline.at(-2)).toEqual({
            $match: {
                status: 'escalated',
                adminReviewedAt: { $exists: false },
                $and: [{ $or: [{ origin: 'student' }, { origin: { $exists: false } }] }]
            }
        });
        expect(coll.countDocuments).toHaveBeenCalledWith({ courseId: 'course-1' });
        expect(coll.drop).toHaveBeenCalledTimes(1);
        expect(invalidateGuidedPathwayFlagCollectionIndexes).toHaveBeenCalledWith(
            ctx,
            courseScope.collectionName
        );
    });

    it('treats a concurrently missing collection as an idempotent delete', async () => {
        const coll = collection({
            countDocuments: jest.fn().mockResolvedValue(2),
            drop: jest.fn().mockRejectedValue({ code: 26, codeName: 'NamespaceNotFound' })
        });
        (guidedPathwayFlagCourseCollection as jest.Mock).mockReturnValue(coll);
        const ctx = context();

        await expect(deleteGuidedPathwayFlagsForCourse(ctx, 'course-1')).resolves.toBe(2);

        expect(coll.countDocuments).toHaveBeenCalledWith({ courseId: 'course-1' });
        expect(coll.drop).toHaveBeenCalledTimes(1);
        expect(invalidateGuidedPathwayFlagCollectionIndexes).toHaveBeenCalledWith(
            ctx,
            courseScope.collectionName
        );
    });

    it('returns empty backup/delete results without provisioning absent storage', async () => {
        (getExistingGuidedPathwayFlagCourseScope as jest.Mock).mockResolvedValue(null);

        await expect(listGuidedPathwayFlagsForBackup(context(), 'course-1')).resolves.toEqual([]);
        await expect(deleteGuidedPathwayFlagsForCourse(context(), 'course-1')).resolves.toBe(0);
        expect(getGuidedPathwayFlagCourseScope).not.toHaveBeenCalled();
        expect(guidedPathwayFlagCourseCollection).not.toHaveBeenCalled();
    });

    it('returns not-found for a targeted mutation when no collection exists', async () => {
        (getExistingGuidedPathwayFlagCourseScope as jest.Mock).mockResolvedValue(null);

        await expect(decideGuidedPathwayFlag(
            context(),
            'course-1',
            'flag-1',
            'dismiss',
            { userId: 'instructor-1', name: 'Instructor' }
        )).rejects.toBeInstanceOf(GuidedPathwayFlagNotFoundError);
        expect(getGuidedPathwayFlagCourseScope).not.toHaveBeenCalled();
    });
});
