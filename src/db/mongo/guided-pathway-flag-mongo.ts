/**
 * Guided Pathway flag Mongo delegate
 *
 * Owns the single global `guided-pathway-flags` collection, including atomic
 * trigger deduplication, instructor decisions, platform review, and audited
 * identity reveal. Public reads always use an allowlisted anonymous projection.
 *
 * @author: EngE-AI Team
 * @date: 2026-08-08
 * @version: 1.0.0
 * @description: Privacy-bounded persistence for Guided Pathway trigger alerts.
 */

import { createHash, randomUUID } from 'crypto';
import type { Collection, Filter } from 'mongodb';
import type {
    GuidedPathwayFlagDecision,
    GuidedPathwayFlagFacets,
    GuidedPathwayFlagListPage,
    GuidedPathwayFlagReviewState,
    GuidedPathwayFlagStatus,
    GuidedPathwayFlagView
} from '../../types/shared';
import { getCourseUsersMongoCollection } from './course-user-mongo';
import { guidedPathwayFlagsCollection } from './mongo-collections';
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

/** Filters shared by course and global administrator queues. */
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

/** Raised when an alert id is absent from the required scope. */
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

const indexPromises = new WeakMap<object, Promise<void>>();

function flags(ctx: MongoDalContext): Collection<GuidedPathwayFlagDocument> {
    return guidedPathwayFlagsCollection(ctx.db) as unknown as Collection<GuidedPathwayFlagDocument>;
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

function statusPriority(status: GuidedPathwayFlagStatus): number {
    if (status === 'escalated') return 0;
    if (status === 'pending') return 1;
    return 2;
}

async function findSafeFlag(
    ctx: MongoDalContext,
    filter: Filter<GuidedPathwayFlagDocument>
): Promise<GuidedPathwayFlagView | null> {
    const doc = await flags(ctx).findOne(filter, { projection: SAFE_FLAG_PROJECTION });
    return doc ? toSafeView(doc) : null;
}

/**
 * ensureGuidedPathwayFlagIndexes - Installs global dedupe, queue, and review indexes.
 *
 * A per-database shared promise prevents concurrent first-use callers from racing
 * index installation. Failed attempts are removed so a later call can retry.
 *
 * @param ctx - Connected Mongo data-layer context
 * @returns When all collection indexes are available
 */
export async function ensureGuidedPathwayFlagIndexes(ctx: MongoDalContext): Promise<void> {
    const key = ctx.db as object;
    let pending = indexPromises.get(key);
    if (!pending) {
        const collection = flags(ctx);
        pending = Promise.all([
            collection.createIndex({ id: 1 }, { unique: true, name: 'guided_pathway_flag_id_unique' }),
            collection.createIndex({ dedupeKey: 1 }, { unique: true, name: 'guided_pathway_flag_dedupe_unique' }),
            collection.createIndex(
                { courseId: 1, status: 1, triggeredAt: -1 },
                { name: 'guided_pathway_flag_course_status_time' }
            ),
            collection.createIndex(
                { status: 1, adminReviewedAt: 1, adminSortPriority: 1, triggeredAt: -1 },
                { name: 'guided_pathway_flag_admin_review_queue' }
            ),
            collection.createIndex(
                { courseId: 1, pathwayId: 1, status: 1, triggeredAt: -1 },
                { name: 'guided_pathway_flag_course_pathway_status_time' }
            ),
            collection.createIndex(
                { adminSortPriority: 1, triggeredAt: -1 },
                { name: 'guided_pathway_flag_admin_order' }
            )
        ]).then(() => undefined);
        indexPromises.set(key, pending);
    }

    try {
        await pending;
    } catch (error) {
        indexPromises.delete(key);
        throw error;
    }
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
    await ensureGuidedPathwayFlagIndexes(ctx);
    if (!input.clientMessageId || !input.chatId) {
        throw new Error('chatId and clientMessageId are required for Guided Pathway alert deduplication');
    }

    const now = input.triggeredAt ?? new Date();
    const doc: GuidedPathwayFlagDocument = {
        id: randomUUID(),
        courseId: input.courseId,
        courseName: input.courseName,
        pathwayId: input.pathwayId,
        pathwayTitle: input.pathwayTitle,
        messageText: input.messageText,
        studentUserId: input.studentUserId,
        dedupeKey: dedupeKeyFor(input),
        status: 'pending',
        adminSortPriority: statusPriority('pending'),
        triggeredAt: now,
        identityRevealEvents: [],
        createdAt: now,
        updatedAt: now
    };

    try {
        await flags(ctx).insertOne(doc);
        return { created: true, flag: toSafeView(doc) };
    } catch (error) {
        if (!isDuplicateKeyError(error)) throw error;
        const existing = await findSafeFlag(ctx, { dedupeKey: doc.dedupeKey });
        if (!existing) throw error;
        return { created: false, flag: existing };
    }
}

function buildListFilter(
    filters: GuidedPathwayFlagListFilters,
    omitOwnFacet?: 'pathwayId' | 'reviewer'
): Filter<GuidedPathwayFlagDocument> {
    const query: Filter<GuidedPathwayFlagDocument> = {};

    if (filters.courseId) {
        if (filters.courseIds && !filters.courseIds.includes(filters.courseId)) {
            query.courseId = { $in: [] };
        } else {
            query.courseId = filters.courseId;
        }
    } else if (filters.courseIds) {
        query.courseId = { $in: filters.courseIds };
    }

    if (filters.status) query.status = filters.status;
    if (filters.pathwayId && omitOwnFacet !== 'pathwayId') query.pathwayId = filters.pathwayId;

    if (filters.reviewState === 'needs-review') {
        query.status = filters.status && filters.status !== 'escalated'
            ? { $in: [] }
            : 'escalated';
        query.adminReviewedAt = { $exists: false };
    } else if (filters.reviewState === 'reviewed') {
        query.status = filters.status && filters.status !== 'escalated'
            ? { $in: [] }
            : 'escalated';
        query.adminReviewedAt = { $exists: true };
    }

    if (filters.reviewer && omitOwnFacet !== 'reviewer') {
        query.$or = [
            { decidedByName: filters.reviewer },
            { adminReviewedByName: filters.reviewer }
        ];
    }

    if (filters.dateFrom || filters.dateTo) {
        query.triggeredAt = {};
        if (filters.dateFrom) query.triggeredAt.$gte = filters.dateFrom;
        if (filters.dateTo) query.triggeredAt.$lte = filters.dateTo;
    }

    return query;
}

async function loadSafeFacets(
    ctx: MongoDalContext,
    filters: GuidedPathwayFlagListFilters
): Promise<GuidedPathwayFlagFacets> {
    const collection = flags(ctx);
    const pathwayFilter = buildListFilter(filters, 'pathwayId');
    const reviewerFilter = buildListFilter(filters, 'reviewer');

    // Fetch only the non-student fields needed to build full-queue filter choices.
    const pathwayCursor = collection.find(pathwayFilter, {
        projection: { _id: 0, pathwayId: 1, pathwayTitle: 1, triggeredAt: 1 }
    });
    pathwayCursor.sort({ triggeredAt: -1 });
    const reviewerCursor = collection.find(reviewerFilter, {
        projection: { _id: 0, decidedByName: 1, adminReviewedByName: 1 }
    });
    const [pathwayDocs, reviewerDocs] = await Promise.all([
        pathwayCursor.toArray(),
        reviewerCursor.toArray()
    ]);

    // Keep the newest title snapshot for each stable pathway id.
    const pathwayById = new Map<string, string>();
    for (const doc of pathwayDocs) {
        if (
            typeof doc.pathwayId === 'string' && doc.pathwayId &&
            typeof doc.pathwayTitle === 'string' && doc.pathwayTitle &&
            !pathwayById.has(doc.pathwayId)
        ) {
            pathwayById.set(doc.pathwayId, doc.pathwayTitle);
        }
    }

    const reviewers = new Set<string>();
    for (const doc of reviewerDocs) {
        if (typeof doc.decidedByName === 'string' && doc.decidedByName.trim()) {
            reviewers.add(doc.decidedByName);
        }
        if (typeof doc.adminReviewedByName === 'string' && doc.adminReviewedByName.trim()) {
            reviewers.add(doc.adminReviewedByName);
        }
    }

    return {
        pathways: [...pathwayById.entries()]
            .map(([pathwayId, pathwayTitle]) => ({ pathwayId, pathwayTitle }))
            .sort((a, b) => a.pathwayTitle.localeCompare(b.pathwayTitle) || a.pathwayId.localeCompare(b.pathwayId)),
        reviewers: [...reviewers].sort((a, b) => a.localeCompare(b))
    };
}

/**
 * listGuidedPathwayFlags - Returns one paginated anonymous queue page.
 *
 * The Mongo projection is inclusion-only and the mapper repeats the allowlist,
 * preventing identity fields from leaking if the stored schema grows later.
 *
 * @param ctx - Connected Mongo data-layer context
 * @param filters - Course/admin filters and pagination
 * @returns Safe page with total matching count
 */
export async function listGuidedPathwayFlags(
    ctx: MongoDalContext,
    filters: GuidedPathwayFlagListFilters
): Promise<GuidedPathwayFlagListPage> {
    await ensureGuidedPathwayFlagIndexes(ctx);
    const page = Math.max(1, Math.floor(filters.page ?? 1));
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(filters.pageSize ?? DEFAULT_PAGE_SIZE)));
    const query = buildListFilter(filters);
    const collection = flags(ctx);
    const cursor = collection.find(query, { projection: SAFE_FLAG_PROJECTION });
    if (filters.escalatedFirst) {
        cursor.sort({ adminSortPriority: 1, triggeredAt: -1 });
    } else {
        cursor.sort({ triggeredAt: -1 });
    }

    const [docs, total, facets] = await Promise.all([
        cursor
            .skip((page - 1) * pageSize)
            .limit(pageSize)
            .toArray(),
        collection.countDocuments(query),
        filters.includeFacets ? loadSafeFacets(ctx, filters) : Promise.resolve(undefined)
    ]);

    const result: GuidedPathwayFlagListPage = {
        items: docs.map((doc) => toSafeView(doc)),
        page,
        pageSize,
        total
    };
    if (facets) result.facets = facets;
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
    await ensureGuidedPathwayFlagIndexes(ctx);
    const nextStatus: GuidedPathwayFlagStatus = decision === 'escalate' ? 'escalated' : 'dismissed';
    const now = new Date();
    const updated = await flags(ctx).findOneAndUpdate(
        { id: flagId, courseId, status: 'pending' },
        {
            $set: {
                status: nextStatus,
                adminSortPriority: statusPriority(nextStatus),
                decidedAt: now,
                decidedByUserId: actor.userId,
                decidedByName: actor.name,
                updatedAt: now
            }
        },
        { returnDocument: 'after', projection: SAFE_FLAG_PROJECTION }
    );
    if (updated) return toSafeView(updated);

    const existing = await findSafeFlag(ctx, { id: flagId, courseId });
    if (!existing) throw new GuidedPathwayFlagNotFoundError();
    if (existing.status === nextStatus) return existing;
    throw new GuidedPathwayFlagConflictError('Guided Pathway alert already has a different decision');
}

/**
 * markGuidedPathwayFlagAdminReviewed - Marks an escalated alert reviewed once.
 *
 * Repeated review calls return the original completed record without replacing
 * its first-review actor or timestamp.
 *
 * @param ctx - Connected Mongo data-layer context
 * @param flagId - Escalated alert id
 * @param actor - Server-owned platform administrator snapshot
 * @returns Updated safe anonymous alert
 */
export async function markGuidedPathwayFlagAdminReviewed(
    ctx: MongoDalContext,
    flagId: string,
    actor: GuidedPathwayFlagActor
): Promise<GuidedPathwayFlagView> {
    await ensureGuidedPathwayFlagIndexes(ctx);
    const now = new Date();
    const updated = await flags(ctx).findOneAndUpdate(
        { id: flagId, status: 'escalated', adminReviewedAt: { $exists: false } },
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

    const existing = await findSafeFlag(ctx, { id: flagId });
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
 * @param flagId - Escalated alert whose author is being revealed
 * @param actor - Platform administrator performing the reveal
 * @returns Current course-roster display name
 */
export async function revealGuidedPathwayFlagIdentity(
    ctx: MongoDalContext,
    flagId: string,
    actor: GuidedPathwayFlagActor
): Promise<{ studentName: string }> {
    await ensureGuidedPathwayFlagIndexes(ctx);
    const revealedAt = new Date();
    const audited = await flags(ctx).findOneAndUpdate(
        { id: flagId, status: 'escalated' },
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
            projection: { _id: 0, courseName: 1, studentUserId: 1 }
        }
    ) as Pick<GuidedPathwayFlagDocument, 'courseName' | 'studentUserId'> | null;

    if (!audited) {
        const existing = await flags(ctx).findOne(
            { id: flagId },
            { projection: { _id: 0, status: 1 } }
        );
        if (!existing) throw new GuidedPathwayFlagNotFoundError();
        throw new GuidedPathwayFlagConflictError('Identity can be revealed only for escalated alerts');
    }

    // Read only the current display name from the course roster after the audit succeeds.
    const roster = await getCourseUsersMongoCollection(ctx, audited.courseName);
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
 * countGuidedPathwayFlagsAwaitingAdminReview - Counts escalations without platform review.
 *
 * @param ctx - Connected Mongo data-layer context
 * @returns Persistent administrator dashboard count
 */
export async function countGuidedPathwayFlagsAwaitingAdminReview(ctx: MongoDalContext): Promise<number> {
    await ensureGuidedPathwayFlagIndexes(ctx);
    return flags(ctx).countDocuments({ status: 'escalated', adminReviewedAt: { $exists: false } });
}

/**
 * listGuidedPathwayFlagsForBackup - Loads an anonymous course-scoped backup slice.
 *
 * Restricted identity, opaque dedupe material, request identifiers, and reveal
 * audit events are excluded by the same allowlist used for interface reads.
 *
 * @param ctx - Connected Mongo data-layer context
 * @param courseId - Course whose alerts are being exported
 * @returns Safe alert snapshots ordered newest first
 */
export async function listGuidedPathwayFlagsForBackup(
    ctx: MongoDalContext,
    courseId: string
): Promise<GuidedPathwayFlagView[]> {
    const docs = await flags(ctx)
        .find({ courseId }, { projection: SAFE_FLAG_PROJECTION })
        .sort({ triggeredAt: -1 })
        .toArray();
    return docs.map((doc) => toSafeView(doc));
}

/**
 * deleteGuidedPathwayFlagsForCourse - Removes global alert rows for a deleted/reset course.
 *
 * @param ctx - Connected Mongo data-layer context
 * @param courseId - Course lifecycle boundary
 * @returns Number of global alert rows removed
 */
export async function deleteGuidedPathwayFlagsForCourse(
    ctx: MongoDalContext,
    courseId: string
): Promise<number> {
    const result = await flags(ctx).deleteMany({ courseId });
    return result.deletedCount;
}
