/**
 * Guided Pathway flag collection ownership
 *
 * Resolves one deterministic physical alert collection per course, provisions
 * its indexes, and migrates rows out of the legacy shared collection. The
 * migration deletes a source batch only after every Mongo `_id` is verified in
 * its destination, making retries idempotent after a partial process failure.
 *
 * @author: EngE-AI Team
 * @date: 2026-08-12
 * @version: 1.0.0
 * @description: Course collection resolution and GPF-001 storage migration.
 */

import { createHash } from 'crypto';
import type { AnyBulkWriteOperation, Collection, Document } from 'mongodb';
import type { activeCourse } from '../../types/shared';
import { appLogger } from '../../utils/logger';
import { activeCourseListCollection, guidedPathwayFlagsCollection } from './mongo-collections';
import type { MongoDalContext } from './mongo-context';

const COLLECTION_PREFIX = 'guided-pathway-flags-course-';
const MIGRATION_BATCH_SIZE = 200;

/** Canonical Mongo ownership information for one active course alert collection. */
export interface GuidedPathwayFlagCourseScope {
    courseId: string;
    courseName: string;
    collectionName: string;
}

/** Aggregate result from the idempotent GPF-001 shared-to-course migration. */
export interface GuidedPathwayFlagMigrationResult {
    registeredCourseCollections: number;
    migratedRows: number;
    orphanCourseCollections: number;
    retainedLegacyRows: number;
}

/** Raised when an operation targets a course that is absent from the active catalog. */
export class GuidedPathwayFlagCourseNotFoundError extends Error {
    constructor() {
        super('Course not found for Guided Pathway alert storage');
        this.name = 'GuidedPathwayFlagCourseNotFoundError';
    }
}

const indexPromises = new WeakMap<object, Map<string, Promise<void>>>();
const migrationPromises = new WeakMap<object, Promise<GuidedPathwayFlagMigrationResult>>();

function namespaceAlreadyExists(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const mongoError = error as { code?: number; codeName?: string };
    return mongoError.code === 48 || mongoError.codeName === 'NamespaceExists';
}

function namespaceNotFound(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const mongoError = error as { code?: number; codeName?: string };
    return mongoError.code === 26 || mongoError.codeName === 'NamespaceNotFound';
}

/**
 * guidedPathwayFlagCollectionNameForCourse - Derives a Mongo-safe name from a stable course id.
 *
 * The display name is deliberately excluded so a course rename cannot change
 * ownership or strand its existing alerts.
 *
 * @param courseId - Stable course catalog id
 * @returns Deterministic physical collection name with a 96-bit hash suffix
 */
export function guidedPathwayFlagCollectionNameForCourse(courseId: string): string {
    const suffix = createHash('sha256').update(courseId).digest('hex').slice(0, 24);
    return `${COLLECTION_PREFIX}${suffix}`;
}

async function createCollectionIfMissing(ctx: MongoDalContext, collectionName: string): Promise<void> {
    try {
        await ctx.db.createCollection(collectionName);
    } catch (error) {
        if (!namespaceAlreadyExists(error)) throw error;
    }
}

async function persistCanonicalCollectionName(
    ctx: MongoDalContext,
    course: activeCourse
): Promise<GuidedPathwayFlagCourseScope> {
    const collectionName = guidedPathwayFlagCollectionNameForCourse(course.id);

    // The derived value is authoritative; never trust a catalog value as an arbitrary namespace.
    if (course.collections?.guidedPathwayFlags !== collectionName) {
        await activeCourseListCollection(ctx.db).updateOne(
            { id: course.id },
            { $set: { 'collections.guidedPathwayFlags': collectionName } }
        );
        ctx.collectionNamesCache.delete(course.courseName);
    }

    return { courseId: course.id, courseName: course.courseName, collectionName };
}

/**
 * ensureGuidedPathwayFlagCollectionIndexes - Creates indexes for one course-owned alert collection.
 *
 * Promise memoization is keyed by both database and physical collection. A
 * failed attempt is removed so the next request can retry safely.
 *
 * @param ctx - Connected Mongo data-layer context
 * @param collectionName - Canonical physical course collection
 * @returns When dedupe, lifecycle, filtering, and review indexes are ready
 */
export async function ensureGuidedPathwayFlagCollectionIndexes(
    ctx: MongoDalContext,
    collectionName: string
): Promise<void> {
    const databaseKey = ctx.db as object;
    let databasePromises = indexPromises.get(databaseKey);
    if (!databasePromises) {
        databasePromises = new Map();
        indexPromises.set(databaseKey, databasePromises);
    }

    let pending = databasePromises.get(collectionName);
    if (!pending) {
        const collection = ctx.db.collection(collectionName);
        pending = Promise.all([
            collection.createIndex({ id: 1 }, { unique: true, name: 'guided_pathway_flag_id_unique' }),
            collection.createIndex({ dedupeKey: 1 }, { unique: true, name: 'guided_pathway_flag_dedupe_unique' }),
            collection.createIndex(
                { courseId: 1, status: 1, triggeredAt: -1 },
                { name: 'guided_pathway_flag_course_status_time' }
            ),
            collection.createIndex(
                { courseId: 1, pathwayId: 1, status: 1, triggeredAt: -1 },
                { name: 'guided_pathway_flag_course_pathway_status_time' }
            ),
            collection.createIndex(
                { courseId: 1, status: 1, adminReviewedAt: 1, adminSortPriority: 1, triggeredAt: -1 },
                { name: 'guided_pathway_flag_admin_review_queue' }
            )
        ]).then(() => undefined);
        databasePromises.set(collectionName, pending);
    }

    try {
        await pending;
    } catch (error) {
        databasePromises.delete(collectionName);
        throw error;
    }
}

async function migrateLegacyCourseRows(
    ctx: MongoDalContext,
    courseId: string,
    collectionName: string
): Promise<number> {
    const source = guidedPathwayFlagsCollection(ctx.db);
    const destination = ctx.db.collection(collectionName);
    let migratedRows = 0;

    await createCollectionIfMissing(ctx, collectionName);
    await ensureGuidedPathwayFlagCollectionIndexes(ctx, collectionName);

    while (true) {
        const batch = await source
            .find({ courseId })
            .sort({ _id: 1 })
            .limit(MIGRATION_BATCH_SIZE)
            .toArray();
        if (batch.length === 0) break;

        // Upsert by Mongo identity so a retry after copying but before deletion is harmless.
        const operations: AnyBulkWriteOperation<Document>[] = batch.map((document) => ({
            replaceOne: {
                filter: { _id: document._id },
                replacement: document,
                upsert: true
            }
        }));
        await destination.bulkWrite(operations, { ordered: true });

        // Delete only the exact source records proven to exist in the destination.
        const sourceIds = batch.map((document) => document._id);
        const verified = await destination.countDocuments({ _id: { $in: sourceIds } });
        if (verified !== sourceIds.length) {
            throw new Error(`GPF-001 verification failed for course ${courseId}`);
        }
        const deleted = await source.deleteMany({ _id: { $in: sourceIds } });
        if (deleted.deletedCount !== sourceIds.length) {
            // Another app instance may have migrated the same verified batch concurrently.
            const remaining = await source.countDocuments({ _id: { $in: sourceIds } });
            if (remaining !== 0) {
                throw new Error(`GPF-001 source cleanup was incomplete for course ${courseId}`);
            }
        }
        migratedRows += deleted.deletedCount;
    }

    return migratedRows;
}

async function runGuidedPathwayFlagMigration(
    ctx: MongoDalContext
): Promise<GuidedPathwayFlagMigrationResult> {
    const catalog = activeCourseListCollection(ctx.db);
    const courses = await catalog.find({}).toArray() as unknown as activeCourse[];
    const scopes = new Map<string, GuidedPathwayFlagCourseScope>();
    let registeredCourseCollections = 0;

    // Register and provision every active course before any shared rows move.
    for (const course of courses) {
        const expectedName = guidedPathwayFlagCollectionNameForCourse(course.id);
        if (course.collections?.guidedPathwayFlags !== expectedName) {
            registeredCourseCollections += 1;
        }
        const scope = await persistCanonicalCollectionName(ctx, course);
        await ensureGuidedPathwayFlagCollectionIndexes(ctx, scope.collectionName);
        scopes.set(course.id, scope);
    }

    const source = guidedPathwayFlagsCollection(ctx.db);
    const legacyCourseIds = await source.distinct('courseId', { courseId: { $type: 'string' } });
    let migratedRows = 0;
    let orphanCourseCollections = 0;

    // Each legacy course is copied independently, including rows whose catalog entry was already removed.
    for (const value of legacyCourseIds) {
        if (typeof value !== 'string' || !value) continue;
        const activeScope = scopes.get(value);
        const collectionName = activeScope?.collectionName ?? guidedPathwayFlagCollectionNameForCourse(value);
        if (!activeScope) orphanCourseCollections += 1;
        migratedRows += await migrateLegacyCourseRows(ctx, value, collectionName);
    }

    // Malformed legacy records remain untouched for manual recovery; an empty namespace is removed.
    const retainedLegacyRows = await source.countDocuments({});
    if (retainedLegacyRows === 0) {
        try {
            await source.drop();
        } catch (error) {
            if (!namespaceNotFound(error)) throw error;
        }
    } else {
        appLogger.warn('[guided-pathway-flags] GPF-001 retained malformed legacy rows', {
            retainedLegacyRows
        });
    }

    return {
        registeredCourseCollections,
        migratedRows,
        orphanCourseCollections,
        retainedLegacyRows
    };
}

/**
 * migrateGuidedPathwayFlagsToCourseCollections - Runs and memoizes GPF-001 for this database.
 *
 * All alert operations await this promise. If migration fails, the promise is
 * discarded so a later request can retry from the last verified batch.
 *
 * @param ctx - Connected Mongo data-layer context
 * @returns Registration, migration, orphan, and retained-row counts
 */
export async function migrateGuidedPathwayFlagsToCourseCollections(
    ctx: MongoDalContext
): Promise<GuidedPathwayFlagMigrationResult> {
    const key = ctx.db as object;
    let pending = migrationPromises.get(key);
    if (!pending) {
        pending = runGuidedPathwayFlagMigration(ctx);
        migrationPromises.set(key, pending);
    }

    try {
        return await pending;
    } catch (error) {
        migrationPromises.delete(key);
        throw error;
    }
}

/**
 * getGuidedPathwayFlagCourseScope - Resolves and provisions one active course collection.
 *
 * @param ctx - Connected Mongo data-layer context
 * @param courseId - Stable active-course id
 * @returns Canonical course and physical collection metadata
 * @throws Error when the active course no longer exists
 */
export async function getGuidedPathwayFlagCourseScope(
    ctx: MongoDalContext,
    courseId: string
): Promise<GuidedPathwayFlagCourseScope> {
    await migrateGuidedPathwayFlagsToCourseCollections(ctx);
    const course = await activeCourseListCollection(ctx.db).findOne({ id: courseId }) as activeCourse | null;
    if (!course) throw new GuidedPathwayFlagCourseNotFoundError();

    const scope = await persistCanonicalCollectionName(ctx, course);
    await ensureGuidedPathwayFlagCollectionIndexes(ctx, scope.collectionName);
    return scope;
}

/**
 * listGuidedPathwayFlagCourseScopes - Resolves active collections for an admin query.
 *
 * Physical namespaces come only from canonical derivation of catalog ids. The
 * optional filters narrow which course collections participate in aggregation.
 *
 * @param ctx - Connected Mongo data-layer context
 * @param filters - Optional exact course and approved course-id set
 * @returns Canonical active-course scopes ordered by course id
 */
export async function listGuidedPathwayFlagCourseScopes(
    ctx: MongoDalContext,
    filters: { courseId?: string; courseIds?: string[] } = {}
): Promise<GuidedPathwayFlagCourseScope[]> {
    await migrateGuidedPathwayFlagsToCourseCollections(ctx);
    if (filters.courseId && filters.courseIds && !filters.courseIds.includes(filters.courseId)) return [];

    const permittedIds = filters.courseId ? [filters.courseId] : filters.courseIds;
    const query = permittedIds ? { id: { $in: permittedIds } } : {};
    const courses = await activeCourseListCollection(ctx.db)
        .find(query)
        .sort({ id: 1 })
        .toArray() as unknown as activeCourse[];

    const scopes: GuidedPathwayFlagCourseScope[] = [];
    for (const course of courses) {
        const scope = await persistCanonicalCollectionName(ctx, course);
        await ensureGuidedPathwayFlagCollectionIndexes(ctx, scope.collectionName);
        scopes.push(scope);
    }
    return scopes;
}

/** Returns a typed Mongo collection handle for a canonical course scope. */
export function guidedPathwayFlagCourseCollection<T extends Document = Document>(
    ctx: MongoDalContext,
    scope: GuidedPathwayFlagCourseScope
): Collection<T> {
    return ctx.db.collection<T>(scope.collectionName);
}
