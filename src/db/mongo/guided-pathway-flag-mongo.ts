/**
 * Guided Pathway flag Mongo delegate
 *
 * Owns anonymous alert CRUD inside course-specific collections. Course reads
 * address exactly one collection; platform-admin reads build a server-owned
 * `$unionWith` pipeline over canonical active-course namespaces. Every public
 * projection excludes student identity, dedupe material, and reveal audit data.
 *
 * @author: EngE-AI Team
 * @date: 2026-08-08
 * @version: 2.0.0
 * @description: Privacy-bounded persistence for course-isolated Guided Pathway alerts.
 */

import { createHash, randomUUID } from 'crypto';
import type { Collection, Document, Filter } from 'mongodb';
import type {
    GuidedPathwayFlagDecision,
    GuidedPathwayFlagFacets,
    GuidedPathwayFlagListPage,
    GuidedPathwayFlagReviewState,
    GuidedPathwayFlagStatus,
    GuidedPathwayFlagView
} from '../../types/shared';
import { getCourseUsersMongoCollection } from './course-user-mongo';
import {
    GuidedPathwayFlagCourseNotFoundError,
    getGuidedPathwayFlagCourseScope,
    guidedPathwayFlagCourseCollection,
    listGuidedPathwayFlagCourseScopes,
    migrateGuidedPathwayFlagsToCourseCollections,
    type GuidedPathwayFlagCourseScope
} from './guided-pathway-flag-collection-mongo';
import type { MongoDalContext } from './mongo-context';

/** Server-owned actor snapshot used for decisions, review, and reveal audit. */
export interface GuidedPathwayFlagActor {
    userId: string;
    name: string;
}

/** Input from the chat trigger path. Chat/request identifiers are hashed, never stored verbatim. */
export interface CreateGuidedPathwayFlagInput {
    courseId: string;
    courseName: string;
    pathwayId: string;
    pathwayTitle: string;
    messageText: string;
    studentUserId: string;
    chatId: string;
    clientMessageId: string;
    triggeredAt?: Date;
}

/** Filters supported by the platform-wide administrator queue. */
export interface GuidedPathwayFlagListFilters {
    page?: number;
    pageSize?: number;
    status?: GuidedPathwayFlagStatus;
    reviewState?: GuidedPathwayFlagReviewState;
    courseId?: string;
    courseIds?: string[];
    pathwayId?: string;
    reviewer?: string;
    dateFrom?: Date;
    dateTo?: Date;
    escalatedFirst?: boolean;
    includeFacets?: boolean;
}

/** Result of an idempotent trigger insert. */
export interface CreateGuidedPathwayFlagResult {
    created: boolean;
    flag: GuidedPathwayFlagView;
}

interface GuidedPathwayIdentityRevealEvent {
    adminUserId: string;
    revealedAt: Date;
}

interface GuidedPathwayFlagDocument {
    id: string;
    courseId: string;
    courseName: string;
    pathwayId: string;
    pathwayTitle: string;
    messageText: string;
    studentUserId: string;
    dedupeKey: string;
    status: GuidedPathwayFlagStatus;
    adminSortPriority: number;
    triggeredAt: Date;
    decidedAt?: Date;
    decidedByUserId?: string;
    decidedByName?: string;
    adminReviewedAt?: Date;
    adminReviewedByUserId?: string;
    adminReviewedByName?: string;
    identityRevealEvents: GuidedPathwayIdentityRevealEvent[];
    createdAt: Date;
    updatedAt: Date;
}

interface AdminAggregationResult {
    items: Partial<GuidedPathwayFlagDocument>[];
    totals: Array<{ value: number }>;
    pathways?: Array<{ pathwayId: string; pathwayTitle: string }>;
    reviewers?: Array<{ name: string }>;
}

/** Raised when an alert id is absent from the required course scope. */
export class GuidedPathwayFlagNotFoundError extends Error {
    constructor(message = 'Guided Pathway alert not found') {
        super(message);
        this.name = 'GuidedPathwayFlagNotFoundError';
    }
}

/** Raised when an action conflicts with the alert's completed lifecycle state. */
export class GuidedPathwayFlagConflictError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'GuidedPathwayFlagConflictError';
    }
}

/** Raised after a successful reveal audit when the current roster name no longer exists. */
export class GuidedPathwayFlagIdentityUnavailableError extends Error {
    constructor() {
        super('Student identity is unavailable in the current course roster');
        this.name = 'GuidedPathwayFlagIdentityUnavailableError';
    }
}

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;
const STATUS_PRIORITY: Record<GuidedPathwayFlagStatus, number> = {
    escalated: 0,
    pending: 1,
    dismissed: 2
};

/** Inclusion-only projection used by every queue and backup read. */
const SAFE_FLAG_PROJECTION = {
    _id: 0,
    id: 1,
    courseId: 1,
    courseName: 1,
    pathwayId: 1,
    pathwayTitle: 1,
    messageText: 1,
    status: 1,
    triggeredAt: 1,
    decidedAt: 1,
    decidedByName: 1,
    adminReviewedAt: 1,
    adminReviewedByName: 1
} as const;

function collectionFor(
    ctx: MongoDalContext,
    scope: GuidedPathwayFlagCourseScope
): Collection<GuidedPathwayFlagDocument> {
    return guidedPathwayFlagCourseCollection<GuidedPathwayFlagDocument>(ctx, scope);
}

async function requireCourseScope(
    ctx: MongoDalContext,
    courseId: string
): Promise<GuidedPathwayFlagCourseScope> {
    try {
        return await getGuidedPathwayFlagCourseScope(ctx, courseId);
    } catch (error) {
        if (error instanceof GuidedPathwayFlagCourseNotFoundError) {
            throw new GuidedPathwayFlagNotFoundError('Guided Pathway alert course not found');
        }
        throw error;
    }
}

function asIso(value: Date | string): string {
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toSafeView(doc: Partial<GuidedPathwayFlagDocument>): GuidedPathwayFlagView {
    const view: GuidedPathwayFlagView = {
        id: String(doc.id),
        courseId: String(doc.courseId),
        courseName: String(doc.courseName),
        pathwayId: String(doc.pathwayId),
        pathwayTitle: String(doc.pathwayTitle),
        messageText: String(doc.messageText),
        status: doc.status as GuidedPathwayFlagStatus,
        triggeredAt: asIso(doc.triggeredAt as Date)
    };
    if (doc.decidedAt) view.decidedAt = asIso(doc.decidedAt);
    if (doc.decidedByName) view.decidedByName = doc.decidedByName;
    if (doc.adminReviewedAt) view.adminReviewedAt = asIso(doc.adminReviewedAt);
    if (doc.adminReviewedByName) view.adminReviewedByName = doc.adminReviewedByName;
    return view;
}

function dedupeKeyFor(input: CreateGuidedPathwayFlagInput): string {
    return createHash('sha256')
        .update(JSON.stringify([
            input.courseId,
            input.studentUserId,
            input.chatId,
            input.clientMessageId,
            input.messageText
        ]))
        .digest('hex');
}

function isDuplicateKeyError(error: unknown): boolean {
    return Boolean(error && typeof error === 'object' && (error as { code?: number }).code === 11000);
}

function normalizedPagination(filters: GuidedPathwayFlagListFilters): { page: number; pageSize: number } {
    return {
        page: Math.max(1, Math.floor(filters.page ?? 1)),
        pageSize: Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(filters.pageSize ?? DEFAULT_PAGE_SIZE)))
    };
}

async function findSafeFlag(
    collection: Collection<GuidedPathwayFlagDocument>,
    filter: Filter<GuidedPathwayFlagDocument>
): Promise<GuidedPathwayFlagView | null> {
    const doc = await collection.findOne(filter, { projection: SAFE_FLAG_PROJECTION });
    return doc ? toSafeView(doc) : null;
}

function applyReviewState(
    query: Filter<GuidedPathwayFlagDocument>,
    filters: GuidedPathwayFlagListFilters
): void {
    if (!filters.reviewState || filters.reviewState === 'all') return;

    // Review state only exists on escalations; incompatible status pairs intentionally match nothing.
    query.status = filters.status && filters.status !== 'escalated' ? { $in: [] } : 'escalated';
    query.adminReviewedAt = { $exists: filters.reviewState === 'reviewed' };
}

function buildListFilter(
    filters: GuidedPathwayFlagListFilters,
    omitOwnFacet?: 'pathwayId' | 'reviewer'
): Filter<GuidedPathwayFlagDocument> {
    const query: Filter<GuidedPathwayFlagDocument> = {};

    if (filters.courseId) {
        query.courseId = filters.courseIds && !filters.courseIds.includes(filters.courseId)
            ? { $in: [] }
            : filters.courseId;
    } else if (filters.courseIds) {
        query.courseId = { $in: filters.courseIds };
    }

    if (filters.status) query.status = filters.status;
    if (filters.pathwayId && omitOwnFacet !== 'pathwayId') query.pathwayId = filters.pathwayId;
    applyReviewState(query, filters);

    if (filters.reviewer && omitOwnFacet !== 'reviewer') {
        query.$or = [
            { decidedByName: filters.reviewer },
            { adminReviewedByName: filters.reviewer }
        ];
    }

    if (filters.dateFrom || filters.dateTo) {
        const triggeredAt: { $gte?: Date; $lte?: Date } = {};
        if (filters.dateFrom) triggeredAt.$gte = filters.dateFrom;
        if (filters.dateTo) triggeredAt.$lte = filters.dateTo;
        query.triggeredAt = triggeredAt;
    }

    return query;
}

function unionCourseCollections(scopes: GuidedPathwayFlagCourseScope[]): Document[] {
    const [first, ...remaining] = scopes;
    const pipeline: Document[] = [{ $match: { courseId: first.courseId } }];
    for (const scope of remaining) {
        pipeline.push({
            $unionWith: {
                coll: scope.collectionName,
                pipeline: [{ $match: { courseId: scope.courseId } }]
            }
        });
    }
    return pipeline;
}

function adminFacetPipeline(
    filters: GuidedPathwayFlagListFilters,
    page: number,
    pageSize: number
): Document {
    const sort = filters.escalatedFirst
        ? { adminSortPriority: 1, triggeredAt: -1 }
        : { triggeredAt: -1 };
    const facet: Record<string, Document[]> = {
        items: [
            { $match: buildListFilter(filters) },
            { $sort: sort },
            { $skip: (page - 1) * pageSize },
            { $limit: pageSize },
            { $project: SAFE_FLAG_PROJECTION }
        ],
        totals: [
            { $match: buildListFilter(filters) },
            { $count: 'value' }
        ]
    };

    if (filters.includeFacets) {
        facet.pathways = [
            { $match: buildListFilter(filters, 'pathwayId') },
            { $sort: { triggeredAt: -1 } },
            {
                $group: {
                    _id: '$pathwayId',
                    pathwayTitle: { $first: '$pathwayTitle' }
                }
            },
            { $match: { _id: { $type: 'string', $ne: '' }, pathwayTitle: { $type: 'string', $ne: '' } } },
            { $project: { _id: 0, pathwayId: '$_id', pathwayTitle: 1 } },
            { $sort: { pathwayTitle: 1, pathwayId: 1 } }
        ];
        facet.reviewers = [
            { $match: buildListFilter(filters, 'reviewer') },
            { $project: { names: ['$decidedByName', '$adminReviewedByName'] } },
            { $unwind: '$names' },
            { $match: { names: { $type: 'string', $regex: /\S/ } } },
            { $group: { _id: '$names' } },
            { $sort: { _id: 1 } },
            { $project: { _id: 0, name: '$_id' } }
        ];
    }

    return { $facet: facet };
}

/**
 * createGuidedPathwayFlag - Atomically creates one alert per processed client message.
 *
 * The opaque unique dedupe key includes course, student, chat, and client message
 * identity. A duplicate insert returns the already stored anonymous alert.
 *
 * @param ctx - Connected Mongo data-layer context
 * @param input - Trigger context from the chat pipeline
 * @returns Whether this call inserted the alert and its safe anonymous view
 */
export async function createGuidedPathwayFlag(
    ctx: MongoDalContext,
    input: CreateGuidedPathwayFlagInput
): Promise<CreateGuidedPathwayFlagResult> {
    if (!input.clientMessageId || !input.chatId) {
        throw new Error('chatId and clientMessageId are required for Guided Pathway alert deduplication');
    }

    const scope = await requireCourseScope(ctx, input.courseId);
    const collection = collectionFor(ctx, scope);
    const now = input.triggeredAt ?? new Date();
    const doc: GuidedPathwayFlagDocument = {
        id: randomUUID(),
        courseId: scope.courseId,
        courseName: scope.courseName,
        pathwayId: input.pathwayId,
        pathwayTitle: input.pathwayTitle,
        messageText: input.messageText,
        studentUserId: input.studentUserId,
        dedupeKey: dedupeKeyFor(input),
        status: 'pending',
        adminSortPriority: STATUS_PRIORITY.pending,
        triggeredAt: now,
        identityRevealEvents: [],
        createdAt: now,
        updatedAt: now
    };

    try {
        await collection.insertOne(doc);
        return { created: true, flag: toSafeView(doc) };
    } catch (error) {
        if (!isDuplicateKeyError(error)) throw error;
        const existing = await findSafeFlag(collection, { dedupeKey: doc.dedupeKey, courseId: scope.courseId });
        if (!existing) throw error;
        return { created: false, flag: existing };
    }
}

/**
 * listGuidedPathwayFlagsForCourse - Returns one course's paginated anonymous queue.
 *
 * @param ctx - Connected Mongo data-layer context
 * @param courseId - Required course ownership boundary
 * @param filters - Status and pagination controls
 * @returns Safe page with total matching count
 */
export async function listGuidedPathwayFlagsForCourse(
    ctx: MongoDalContext,
    courseId: string,
    filters: Pick<GuidedPathwayFlagListFilters, 'page' | 'pageSize' | 'status'>
): Promise<GuidedPathwayFlagListPage> {
    const scope = await requireCourseScope(ctx, courseId);
    const collection = collectionFor(ctx, scope);
    const pagination = normalizedPagination(filters);
    const query = buildListFilter({ ...filters, courseId });
    const cursor = collection.find(query, { projection: SAFE_FLAG_PROJECTION }).sort({ triggeredAt: -1 });

    const [docs, total] = await Promise.all([
        cursor
            .skip((pagination.page - 1) * pagination.pageSize)
            .limit(pagination.pageSize)
            .toArray(),
        collection.countDocuments(query)
    ]);

    return {
        items: docs.map((doc) => toSafeView(doc)),
        page: pagination.page,
        pageSize: pagination.pageSize,
        total
    };
}

/**
 * listGuidedPathwayFlagsForAdmin - Aggregates active course collections into one safe queue.
 *
 * Collection names come from canonical course scopes, never request input.
 * `$facet` computes rows, total, and optional filter choices from one consistent
 * cross-course snapshot while projecting only allowlisted fields to Node.
 *
 * @param ctx - Connected Mongo data-layer context
 * @param filters - Administrator filters and pagination
 * @returns Safe cross-course page and optional facets
 */
export async function listGuidedPathwayFlagsForAdmin(
    ctx: MongoDalContext,
    filters: GuidedPathwayFlagListFilters
): Promise<GuidedPathwayFlagListPage> {
    const pagination = normalizedPagination(filters);
    const scopes = await listGuidedPathwayFlagCourseScopes(ctx, filters);
    if (scopes.length === 0) {
        return {
            items: [],
            page: pagination.page,
            pageSize: pagination.pageSize,
            total: 0,
            ...(filters.includeFacets ? { facets: { pathways: [], reviewers: [] } } : {})
        };
    }

    const pipeline = [
        ...unionCourseCollections(scopes),
        adminFacetPipeline(filters, pagination.page, pagination.pageSize)
    ];
    const [aggregation] = await ctx.db
        .collection<GuidedPathwayFlagDocument>(scopes[0].collectionName)
        .aggregate<AdminAggregationResult>(pipeline, { allowDiskUse: true })
        .toArray();

    const result: GuidedPathwayFlagListPage = {
        items: (aggregation?.items ?? []).map((doc) => toSafeView(doc)),
        page: pagination.page,
        pageSize: pagination.pageSize,
        total: aggregation?.totals?.[0]?.value ?? 0
    };
    if (filters.includeFacets) {
        result.facets = {
            pathways: aggregation?.pathways ?? [],
            reviewers: (aggregation?.reviewers ?? []).map(({ name }) => name)
        };
    }
    return result;
}

/**
 * decideGuidedPathwayFlag - Records an immutable instructor Escalate or Dismiss decision.
 *
 * Only a pending row can transition. Repeating the same completed decision is
 * idempotent; attempting the opposite decision returns a lifecycle conflict.
 *
 * @param ctx - Connected Mongo data-layer context
 * @param courseId - Required course ownership boundary
 * @param flagId - Alert being reviewed
 * @param decision - Instructor action
 * @param actor - Server-owned staff identity snapshot
 * @returns Updated safe anonymous alert
 */
export async function decideGuidedPathwayFlag(
    ctx: MongoDalContext,
    courseId: string,
    flagId: string,
    decision: GuidedPathwayFlagDecision,
    actor: GuidedPathwayFlagActor
): Promise<GuidedPathwayFlagView> {
    const scope = await requireCourseScope(ctx, courseId);
    const collection = collectionFor(ctx, scope);
    const nextStatus: GuidedPathwayFlagStatus = decision === 'escalate' ? 'escalated' : 'dismissed';
    const now = new Date();

    // The lifecycle predicate and write share one BSON command, preventing competing decisions.
    const updated = await collection.findOneAndUpdate(
        { id: flagId, courseId, status: 'pending' },
        {
            $set: {
                status: nextStatus,
                adminSortPriority: STATUS_PRIORITY[nextStatus],
                decidedAt: now,
                decidedByUserId: actor.userId,
                decidedByName: actor.name,
                updatedAt: now
            }
        },
        { returnDocument: 'after', projection: SAFE_FLAG_PROJECTION }
    );
    if (updated) return toSafeView(updated);

    const existing = await findSafeFlag(collection, { id: flagId, courseId });
    if (!existing) throw new GuidedPathwayFlagNotFoundError();
    if (existing.status === nextStatus) return existing;
    throw new GuidedPathwayFlagConflictError('Guided Pathway alert already has a different decision');
}

/**
 * markGuidedPathwayFlagAdminReviewed - Marks an escalated course alert reviewed once.
 *
 * @param ctx - Connected Mongo data-layer context
 * @param courseId - Required physical ownership boundary
 * @param flagId - Escalated alert id
 * @param actor - Server-owned platform administrator snapshot
 * @returns Updated safe anonymous alert
 */
export async function markGuidedPathwayFlagAdminReviewed(
    ctx: MongoDalContext,
    courseId: string,
    flagId: string,
    actor: GuidedPathwayFlagActor
): Promise<GuidedPathwayFlagView> {
    const scope = await requireCourseScope(ctx, courseId);
    const collection = collectionFor(ctx, scope);
    const now = new Date();
    const updated = await collection.findOneAndUpdate(
        { id: flagId, courseId, status: 'escalated', adminReviewedAt: { $exists: false } },
        {
            $set: {
                adminReviewedAt: now,
                adminReviewedByUserId: actor.userId,
                adminReviewedByName: actor.name,
                updatedAt: now
            }
        },
        { returnDocument: 'after', projection: SAFE_FLAG_PROJECTION }
    );
    if (updated) return toSafeView(updated);

    const existing = await findSafeFlag(collection, { id: flagId, courseId });
    if (!existing) throw new GuidedPathwayFlagNotFoundError();
    if (existing.status !== 'escalated') {
        throw new GuidedPathwayFlagConflictError('Only escalated alerts can be marked reviewed');
    }
    if (existing.adminReviewedAt) return existing;
    throw new GuidedPathwayFlagConflictError('Guided Pathway alert could not be marked reviewed');
}

/**
 * revealGuidedPathwayFlagIdentity - Audits and returns the current course-roster name.
 *
 * The audit append must succeed before the roster is read. The method returns
 * only a display name and never exposes the stored student user id or a PUID.
 *
 * @param ctx - Connected Mongo data-layer context
 * @param courseId - Required physical ownership boundary
 * @param flagId - Escalated alert whose author is being revealed
 * @param actor - Platform administrator performing the reveal
 * @returns Current course-roster display name
 */
export async function revealGuidedPathwayFlagIdentity(
    ctx: MongoDalContext,
    courseId: string,
    flagId: string,
    actor: GuidedPathwayFlagActor
): Promise<{ studentName: string }> {
    const scope = await requireCourseScope(ctx, courseId);
    const collection = collectionFor(ctx, scope);
    const revealedAt = new Date();
    const audited = await collection.findOneAndUpdate(
        { id: flagId, courseId, status: 'escalated' },
        {
            $push: {
                identityRevealEvents: {
                    adminUserId: actor.userId,
                    revealedAt
                }
            },
            $set: { updatedAt: revealedAt }
        },
        {
            returnDocument: 'after',
            projection: { _id: 0, studentUserId: 1 }
        }
    ) as Pick<GuidedPathwayFlagDocument, 'studentUserId'> | null;

    if (!audited) {
        const existing = await collection.findOne(
            { id: flagId, courseId },
            { projection: { _id: 0, status: 1 } }
        );
        if (!existing) throw new GuidedPathwayFlagNotFoundError();
        throw new GuidedPathwayFlagConflictError('Identity can be revealed only for escalated alerts');
    }

    // Read the roster only after the append-only audit event has persisted.
    const roster = await getCourseUsersMongoCollection(ctx, scope.courseName);
    const student = await roster.findOne(
        { userId: audited.studentUserId },
        { projection: { _id: 0, name: 1 } }
    );
    if (!student || typeof student.name !== 'string' || !student.name.trim()) {
        throw new GuidedPathwayFlagIdentityUnavailableError();
    }
    return { studentName: student.name };
}

/**
 * countGuidedPathwayFlagsAwaitingAdminReview - Counts unreviewed escalations across active courses.
 *
 * @param ctx - Connected Mongo data-layer context
 * @returns Persistent administrator dashboard count
 */
export async function countGuidedPathwayFlagsAwaitingAdminReview(ctx: MongoDalContext): Promise<number> {
    const scopes = await listGuidedPathwayFlagCourseScopes(ctx);
    if (scopes.length === 0) return 0;

    const pipeline = [
        ...unionCourseCollections(scopes),
        { $match: { status: 'escalated', adminReviewedAt: { $exists: false } } },
        { $count: 'value' }
    ];
    const [result] = await ctx.db
        .collection<GuidedPathwayFlagDocument>(scopes[0].collectionName)
        .aggregate<{ value: number }>(pipeline, { allowDiskUse: true })
        .toArray();
    return result?.value ?? 0;
}

/**
 * listGuidedPathwayFlagsForBackup - Loads an anonymous course-owned backup slice.
 *
 * @param ctx - Connected Mongo data-layer context
 * @param courseId - Course whose alerts are being exported
 * @returns Safe alert snapshots ordered newest first
 */
export async function listGuidedPathwayFlagsForBackup(
    ctx: MongoDalContext,
    courseId: string
): Promise<GuidedPathwayFlagView[]> {
    const scope = await requireCourseScope(ctx, courseId);
    const docs = await collectionFor(ctx, scope)
        .find({ courseId }, { projection: SAFE_FLAG_PROJECTION })
        .sort({ triggeredAt: -1 })
        .toArray();
    return docs.map((doc) => toSafeView(doc));
}

/**
 * deleteGuidedPathwayFlagsForCourse - Drops the collection owned by a deleted/reset course.
 *
 * @param ctx - Connected Mongo data-layer context
 * @param courseId - Course lifecycle boundary
 * @returns Number of alert rows removed with the collection
 */
export async function deleteGuidedPathwayFlagsForCourse(
    ctx: MongoDalContext,
    courseId: string
): Promise<number> {
    const scope = await requireCourseScope(ctx, courseId);
    const collection = collectionFor(ctx, scope);
    const removed = await collection.countDocuments({ courseId });
    await collection.drop();
    return removed;
}

export { migrateGuidedPathwayFlagsToCourseCollections };
