/** Focused persistence and privacy tests for the global Guided Pathway alert collection. */

import type { MongoDalContext } from '../mongo-context';

jest.mock('../mongo-collections', () => ({
    guidedPathwayFlagsCollection: jest.fn()
}));

jest.mock('../course-user-mongo', () => ({
    getCourseUsersMongoCollection: jest.fn()
}));

import { guidedPathwayFlagsCollection } from '../mongo-collections';
import { getCourseUsersMongoCollection } from '../course-user-mongo';
import {
    countGuidedPathwayFlagsAwaitingAdminReview,
    createGuidedPathwayFlag,
    decideGuidedPathwayFlag,
    deleteGuidedPathwayFlagsForCourse,
    listGuidedPathwayFlags,
    markGuidedPathwayFlagAdminReviewed,
    revealGuidedPathwayFlagIdentity
} from '../guided-pathway-flag-mongo';

function context(): MongoDalContext {
    return {
        db: {} as MongoDalContext['db'],
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
        createIndex: jest.fn().mockResolvedValue('ok'),
        insertOne: jest.fn().mockResolvedValue({ insertedId: 'mongo-id' }),
        findOne: jest.fn().mockResolvedValue(null),
        find: jest.fn().mockReturnValue(cursorFor([])),
        countDocuments: jest.fn().mockResolvedValue(0),
        findOneAndUpdate: jest.fn().mockResolvedValue(null),
        deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 }),
        ...overrides
    } as any;
}

const createInput = {
    courseId: 'course-1',
    courseName: 'Test Course',
    pathwayId: 'pathway-1',
    pathwayTitle: 'Support',
    messageText: 'I need help',
    studentUserId: 'student-1',
    chatId: 'chat-1',
    clientMessageId: 'client-message-1',
    triggeredAt: new Date('2026-08-08T12:00:00.000Z')
};

describe('guided-pathway-flag-mongo', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('stores only an opaque message-bound dedupe key and returns an anonymous view', async () => {
        const coll = collection();
        (guidedPathwayFlagsCollection as jest.Mock).mockReturnValue(coll);
        const ctx = context();

        const first = await createGuidedPathwayFlag(ctx, createInput);
        await createGuidedPathwayFlag(ctx, { ...createInput, messageText: 'A different message' });

        expect(first.created).toBe(true);
        expect(first.flag).toMatchObject({
            courseId: 'course-1',
            pathwayTitle: 'Support',
            messageText: 'I need help',
            status: 'pending'
        });
        expect(first.flag).not.toHaveProperty('studentUserId');
        expect(first.flag).not.toHaveProperty('chatId');
        expect(first.flag).not.toHaveProperty('clientMessageId');

        const firstDoc = coll.insertOne.mock.calls[0][0];
        const secondDoc = coll.insertOne.mock.calls[1][0];
        expect(firstDoc.dedupeKey).toMatch(/^[a-f0-9]{64}$/);
        expect(firstDoc.dedupeKey).not.toBe(secondDoc.dedupeKey);
        expect(firstDoc).not.toHaveProperty('chatId');
        expect(firstDoc).not.toHaveProperty('clientMessageId');
    });

    it('returns the existing safe alert after an atomic duplicate-key collision', async () => {
        const coll = collection({
            insertOne: jest.fn().mockRejectedValue({ code: 11000 }),
            findOne: jest.fn().mockResolvedValue(rawFlag())
        });
        (guidedPathwayFlagsCollection as jest.Mock).mockReturnValue(coll);

        const result = await createGuidedPathwayFlag(context(), createInput);

        expect(result.created).toBe(false);
        expect(result.flag.id).toBe('flag-1');
        expect(result.flag).not.toHaveProperty('studentUserId');
        expect(coll.findOne).toHaveBeenCalledWith(
            expect.objectContaining({ dedupeKey: expect.any(String) }),
            expect.objectContaining({ projection: expect.objectContaining({ id: 1, messageText: 1 }) })
        );
    });

    it('double-enforces the safe allowlist when listing rows', async () => {
        const cursor = cursorFor([rawFlag()]);
        const coll = collection({
            find: jest.fn().mockReturnValue(cursor),
            countDocuments: jest.fn().mockResolvedValue(1)
        });
        (guidedPathwayFlagsCollection as jest.Mock).mockReturnValue(coll);

        const page = await listGuidedPathwayFlags(context(), {
            courseId: 'course-1',
            page: 1,
            pageSize: 20
        });

        expect(page.total).toBe(1);
        expect(page.items[0]).not.toHaveProperty('studentUserId');
        expect(page.items[0]).not.toHaveProperty('dedupeKey');
        expect(page.items[0]).not.toHaveProperty('identityRevealEvents');
        expect(coll.find).toHaveBeenCalledWith(
            { courseId: 'course-1' },
            expect.objectContaining({ projection: expect.objectContaining({ id: 1, messageText: 1 }) })
        );
    });

    it('returns full-scope safe admin facets while excluding each facet own active filter', async () => {
        const pageCursor = cursorFor([rawFlag({ pathwayId: 'pathway-1' })]);
        const pathwayCursor = cursorFor([
            rawFlag({ pathwayId: 'pathway-1', pathwayTitle: 'Newest Support' }),
            rawFlag({ pathwayId: 'pathway-1', pathwayTitle: 'Older Support' }),
            rawFlag({ pathwayId: 'pathway-2', pathwayTitle: 'Academic Help' })
        ]);
        const reviewerCursor = cursorFor([
            { decidedByName: 'Instructor B', messageText: 'must not be returned' },
            { decidedByName: 'Instructor A', adminReviewedByName: 'Admin C', studentUserId: 'restricted' },
            { adminReviewedByName: 'Admin C' }
        ]);
        const find = jest.fn()
            .mockReturnValueOnce(pageCursor)
            .mockReturnValueOnce(pathwayCursor)
            .mockReturnValueOnce(reviewerCursor);
        const coll = collection({
            find,
            countDocuments: jest.fn().mockResolvedValue(1)
        });
        (guidedPathwayFlagsCollection as jest.Mock).mockReturnValue(coll);

        const page = await listGuidedPathwayFlags(context(), {
            courseId: 'course-1',
            status: 'escalated',
            pathwayId: 'pathway-1',
            reviewer: 'Instructor A',
            includeFacets: true,
            escalatedFirst: true
        });

        expect(page.facets).toEqual({
            pathways: [
                { pathwayId: 'pathway-2', pathwayTitle: 'Academic Help' },
                { pathwayId: 'pathway-1', pathwayTitle: 'Newest Support' }
            ],
            reviewers: ['Admin C', 'Instructor A', 'Instructor B']
        });

        const pageFilter = find.mock.calls[0][0];
        const pathwayFacetFilter = find.mock.calls[1][0];
        const reviewerFacetFilter = find.mock.calls[2][0];
        expect(pageFilter).toMatchObject({
            courseId: 'course-1',
            status: 'escalated',
            pathwayId: 'pathway-1',
            $or: [{ decidedByName: 'Instructor A' }, { adminReviewedByName: 'Instructor A' }]
        });
        expect(pathwayFacetFilter).not.toHaveProperty('pathwayId');
        expect(pathwayFacetFilter.$or).toBeDefined();
        expect(reviewerFacetFilter.pathwayId).toBe('pathway-1');
        expect(reviewerFacetFilter).not.toHaveProperty('$or');

        const pathwayProjection = find.mock.calls[1][1].projection;
        const reviewerProjection = find.mock.calls[2][1].projection;
        expect(pathwayProjection).toEqual({
            _id: 0,
            pathwayId: 1,
            pathwayTitle: 1,
            triggeredAt: 1
        });
        expect(reviewerProjection).toEqual({
            _id: 0,
            decidedByName: 1,
            adminReviewedByName: 1
        });
        expect(pathwayProjection).not.toHaveProperty('messageText');
        expect(reviewerProjection).not.toHaveProperty('studentUserId');
    });

    it('atomically records an instructor escalation and returns a safe view', async () => {
        const coll = collection({
            findOneAndUpdate: jest.fn().mockResolvedValue(rawFlag({
                status: 'escalated',
                decidedAt: new Date('2026-08-08T12:05:00.000Z'),
                decidedByName: 'Instructor'
            }))
        });
        (guidedPathwayFlagsCollection as jest.Mock).mockReturnValue(coll);

        const result = await decideGuidedPathwayFlag(
            context(),
            'course-1',
            'flag-1',
            'escalate',
            { userId: 'instructor-1', name: 'Instructor' }
        );

        expect(coll.findOneAndUpdate).toHaveBeenCalledWith(
            { id: 'flag-1', courseId: 'course-1', status: 'pending' },
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

    it('rejects a competing decision after another reviewer completed the pending transition', async () => {
        const coll = collection({
            findOneAndUpdate: jest.fn().mockResolvedValue(null),
            findOne: jest.fn().mockResolvedValue(rawFlag({ status: 'dismissed' }))
        });
        (guidedPathwayFlagsCollection as jest.Mock).mockReturnValue(coll);

        await expect(decideGuidedPathwayFlag(
            context(),
            'course-1',
            'flag-1',
            'escalate',
            { userId: 'instructor-1', name: 'Instructor' }
        )).rejects.toMatchObject({
            name: 'GuidedPathwayFlagConflictError'
        });
        expect(coll.findOneAndUpdate.mock.calls[0][0]).toEqual({
            id: 'flag-1',
            courseId: 'course-1',
            status: 'pending'
        });
    });

    it('records platform review once using an atomic escalated-only filter', async () => {
        const coll = collection({
            findOneAndUpdate: jest.fn().mockResolvedValue(rawFlag({
                status: 'escalated',
                adminReviewedAt: new Date('2026-08-08T12:10:00.000Z'),
                adminReviewedByName: 'Admin'
            }))
        });
        (guidedPathwayFlagsCollection as jest.Mock).mockReturnValue(coll);

        const result = await markGuidedPathwayFlagAdminReviewed(
            context(),
            'flag-1',
            { userId: 'admin-1', name: 'Admin' }
        );

        expect(coll.findOneAndUpdate.mock.calls[0][0]).toEqual({
            id: 'flag-1',
            status: 'escalated',
            adminReviewedAt: { $exists: false }
        });
        expect(result.adminReviewedByName).toBe('Admin');
        expect(result).not.toHaveProperty('adminReviewedByUserId');
    });

    it('appends the reveal audit before returning only the current roster display name', async () => {
        const coll = collection({
            findOneAndUpdate: jest.fn().mockResolvedValue({
                courseName: 'Test Course',
                studentUserId: 'student-1'
            })
        });
        const roster = {
            findOne: jest.fn().mockResolvedValue({ name: 'Current Roster Name' })
        };
        (guidedPathwayFlagsCollection as jest.Mock).mockReturnValue(coll);
        (getCourseUsersMongoCollection as jest.Mock).mockResolvedValue(roster);

        const result = await revealGuidedPathwayFlagIdentity(
            context(),
            'flag-1',
            { userId: 'admin-1', name: 'Admin' }
        );

        expect(result).toEqual({ studentName: 'Current Roster Name' });
        expect(coll.findOneAndUpdate.mock.calls[0][1]).toEqual(expect.objectContaining({
            $push: {
                identityRevealEvents: expect.objectContaining({ adminUserId: 'admin-1' })
            }
        }));
        expect(coll.findOneAndUpdate.mock.invocationCallOrder[0]).toBeLessThan(
            roster.findOne.mock.invocationCallOrder[0]
        );
        expect(roster.findOne).toHaveBeenCalledWith(
            { userId: 'student-1' },
            { projection: { _id: 0, name: 1 } }
        );
    });

    it('fails closed without reading the roster when the reveal audit write fails', async () => {
        const coll = collection({
            findOneAndUpdate: jest.fn().mockRejectedValue(new Error('audit write failed'))
        });
        const roster = { findOne: jest.fn() };
        (guidedPathwayFlagsCollection as jest.Mock).mockReturnValue(coll);
        (getCourseUsersMongoCollection as jest.Mock).mockResolvedValue(roster);

        await expect(revealGuidedPathwayFlagIdentity(
            context(),
            'flag-1',
            { userId: 'admin-1', name: 'Admin' }
        )).rejects.toThrow('audit write failed');
        expect(getCourseUsersMongoCollection).not.toHaveBeenCalled();
        expect(roster.findOne).not.toHaveBeenCalled();
    });

    it('counts awaiting admin reviews and cleans global rows by course id', async () => {
        const coll = collection({
            countDocuments: jest.fn().mockResolvedValue(3),
            deleteMany: jest.fn().mockResolvedValue({ deletedCount: 2 })
        });
        (guidedPathwayFlagsCollection as jest.Mock).mockReturnValue(coll);
        const ctx = context();

        await expect(countGuidedPathwayFlagsAwaitingAdminReview(ctx)).resolves.toBe(3);
        await expect(deleteGuidedPathwayFlagsForCourse(ctx, 'course-1')).resolves.toBe(2);
        expect(coll.countDocuments).toHaveBeenCalledWith({
            status: 'escalated',
            adminReviewedAt: { $exists: false }
        });
        expect(coll.deleteMany).toHaveBeenCalledWith({ courseId: 'course-1' });
    });
});
