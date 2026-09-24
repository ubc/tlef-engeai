/**
 * Guided Pathway flag collection ownership
 *
 * Resolves the server-owned collection registered on `active-course-list`,
 * provisions missing legacy-course storage lazily, and runs GPF-002. GPF-002
 * moves rows from the former global and hashed namespaces into readable,
 * course-registered collections without deleting an unverified source row.
 *
 * @author: EngE-AI Team
 * @date: 2026-08-12
 * @version: 2.0.0
 * @description: Registered course collection resolution and GPF-002 migration.
 */

import { createHash, randomUUID } from 'crypto';
import type { AnyBulkWriteOperation, Collection, Document } from 'mongodb';
import type { activeCourse } from '../../types/shared';
import { appLogger } from '../../utils/logger';
import {
    activeCourseListCollection,
    applicationMigrationsCollection,
    guidedPathwayFlagsCollection
} from './mongo-collections';
import {
    ACADEMIC_PERIODS_COLLECTION,
    ACTIVE_COURSE_LIST_COLLECTION,
    ACTIVE_USERS_COLLECTION,
    APPLICATION_MIGRATIONS_COLLECTION,
    GUIDED_PATHWAY_FLAGS_COLLECTION,
    INSTRUCTOR_PERIOD_ALLOWANCES_COLLECTION
} from './mongo-constants';
import type { MongoDalContext } from './mongo-context';

const LEGACY_HASHED_COLLECTION_PREFIX = 'guided-pathway-flags-course-';
const LEGACY_HASHED_COLLECTION_PATTERN = /^guided-pathway-flags-course-[a-f0-9]{24}$/;
const REGISTERED_COLLECTION_SUFFIX = '_guided-pathway-flags';
const MIGRATION_BATCH_SIZE = 200;
const MIGRATION_KEY = 'GPF-002';
const MIGRATION_LEASE_MS = 5 * 60 * 1000;
const MIGRATION_POLL_MS = 250;
const REGISTRY_INDEX_NAME = 'guided_pathway_flag_collection_unique';
const RESERVED_COLLECTION_NAMES = new Set([
    ACTIVE_COURSE_LIST_COLLECTION,
    ACTIVE_USERS_COLLECTION,
    ACADEMIC_PERIODS_COLLECTION,
    INSTRUCTOR_PERIOD_ALLOWANCES_COLLECTION,
    APPLICATION_MIGRATIONS_COLLECTION,
    GUIDED_PATHWAY_FLAGS_COLLECTION
]);

/** Canonical Mongo ownership information for one active course alert collection. */
export interface GuidedPathwayFlagCourseScope {
    courseId: string;
    courseName: string;
    collectionName: string;
}

/** Aggregate result from the idempotent GPF-002 registered-collection migration. */
export interface GuidedPathwayFlagMigrationResult {
    registeredCourseCollections: number;
    migratedRows: number;
    migratedGlobalRows: number;
    migratedHashedRows: number;
    droppedHashedCollections: number;
    retainedLegacyRows: number;
    retainedHashedCollections: number;
    /** Compatibility metric: retained hash namespaces without an active catalog owner. */
    orphanCourseCollections: number;
}

interface GuidedPathwayFlagMigrationLease {
    _id: typeof MIGRATION_KEY;
    state: 'running' | 'complete' | 'failed';
    ownerId?: string;
    leaseUntil?: Date;
    result?: GuidedPathwayFlagMigrationResult;
    updatedAt: Date;
    completedAt?: Date;
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
const registryIndexPromises = new WeakMap<object, Promise<void>>();

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

function duplicateKey(error: unknown): boolean {
    return Boolean(error && typeof error === 'object' && (error as { code?: number }).code === 11000);
}

function waitForMigrationPoll(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, MIGRATION_POLL_MS));
}

function storedCollectionName(course: activeCourse): string | undefined {
    const value = course.collections?.guidedPathwayFlags;
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function isLegacyHashedCollectionName(value: string | undefined): value is string {
    return Boolean(value && LEGACY_HASHED_COLLECTION_PATTERN.test(value));
}

/**
 * guidedPathwayFlagCollectionNameForCourse - Builds the initial readable course namespace.
 *
 * This helper is used only when registering a collection for the first time.
 * Subsequent reads use `activeCourse.collections.guidedPathwayFlags`, so a
 * course rename does not move or strand existing data.
 *
 * @param courseName - Course display name used by inherited per-course namespaces
 * @returns Readable default physical collection name
 */
export function guidedPathwayFlagCollectionNameForCourse(courseName: string): string {
    return `${courseName}${REGISTERED_COLLECTION_SUFFIX}`;
}

function legacyHashedCollectionNameForCourseId(courseId: string): string {
    const suffix = createHash('sha256').update(courseId).digest('hex').slice(0, 24);
    return `${LEGACY_HASHED_COLLECTION_PREFIX}${suffix}`;
}

function targetCollectionName(course: activeCourse): string {
    const registered = storedCollectionName(course);
    return registered && !isLegacyHashedCollectionName(registered)
        ? registered
        : guidedPathwayFlagCollectionNameForCourse(course.courseName);
}

function assertSafeRegisteredCollectionName(course: activeCourse, collectionName: string): void {
    if (
        !collectionName
        || collectionName.trim() !== collectionName
        || collectionName.includes('\0')
        || collectionName.startsWith('system.')
    ) {
        throw new Error(`Invalid Guided Pathway alert collection registration for course ${course.id}`);
    }
    if (RESERVED_COLLECTION_NAMES.has(collectionName)) {
        throw new Error(`Guided Pathway alert collection for course ${course.id} uses a reserved namespace`);
    }
    const otherOwnedNames = Object.entries(course.collections ?? {})
        .filter(([key]) => key !== 'guidedPathwayFlags')
        .map(([, value]) => value)
        .filter((value): value is string => typeof value === 'string');
    if (otherOwnedNames.includes(collectionName)) {
        throw new Error(`Guided Pathway alert collection for course ${course.id} collides with another course collection`);
    }
}

function assertUniqueMigrationTargets(courses: activeCourse[]): void {
    const owners = new Map<string, string>();
    const otherOwnedNames = new Map<string, string>();
    for (const course of courses) {
        for (const [key, value] of Object.entries(course.collections ?? {})) {
            if (key !== 'guidedPathwayFlags' && typeof value === 'string') otherOwnedNames.set(value, course.id);
        }
    }
    for (const course of courses) {
        const target = targetCollectionName(course);
        assertSafeRegisteredCollectionName(course, target);
        const existingOwner = owners.get(target);
        if (existingOwner && existingOwner !== course.id) {
            throw new Error(`Guided Pathway alert collection ${target} is registered to multiple courses`);
        }
        if (otherOwnedNames.has(target)) {
            throw new Error(`Guided Pathway alert collection ${target} collides with a registered course namespace`);
        }
        owners.set(target, course.id);
    }
}

async function physicalCollectionNames(ctx: MongoDalContext): Promise<Set<string>> {
    const infos = await ctx.db.listCollections({}, { nameOnly: true }).toArray();
    return new Set(infos.map(({ name }) => name));
}

/**
 * invalidateGuidedPathwayFlagCollectionIndexes - Forgets one namespace's process-local index promise.
 *
 * A Mongo collection drop also drops its indexes. Lifecycle and migration code
 * must invalidate this memo before the same physical name can be provisioned again.
 *
 * @param ctx - Connected Mongo data-layer context
 * @param collectionName - Physical namespace that disappeared or was freshly recreated
 * @returns Nothing
 */
export function invalidateGuidedPathwayFlagCollectionIndexes(
    ctx: MongoDalContext,
    collectionName: string
): void {
    indexPromises.get(ctx.db as object)?.delete(collectionName);
}

async function createCollectionIfMissing(ctx: MongoDalContext, collectionName: string): Promise<boolean> {
    try {
        await ctx.db.createCollection(collectionName);
        invalidateGuidedPathwayFlagCollectionIndexes(ctx, collectionName);
        return true;
    } catch (error) {
        if (!namespaceAlreadyExists(error)) throw error;
        return false;
    }
}

async function assertPhysicalTargetOwnership(
    ctx: MongoDalContext,
    courseId: string,
    collectionName: string,
    existingNames: Set<string>
): Promise<void> {
    if (!existingNames.has(collectionName)) return;
    const conflicting = await ctx.db.collection(collectionName).findOne(
        { courseId: { $ne: courseId } },
        { projection: { _id: 1 } }
    );
    if (conflicting) {
        throw new Error(`Guided Pathway alert target ${collectionName} contains rows owned by another course`);
    }
}

/**
 * ensureGuidedPathwayFlagRegistryIndex - Enforces one catalog owner per physical alert namespace.
 *
 * The partial unique index ignores missing/empty legacy registrations while
 * protecting every non-empty string registration across processes.
 *
 * @param ctx - Connected Mongo data-layer context
 * @returns When the catalog uniqueness index is ready
 * @throws Mongo errors, including pre-existing duplicate registrations
 */
export async function ensureGuidedPathwayFlagRegistryIndex(ctx: MongoDalContext): Promise<void> {
    const key = ctx.db as object;
    let pending = registryIndexPromises.get(key);
    if (!pending) {
        pending = activeCourseListCollection(ctx.db).createIndex(
            { 'collections.guidedPathwayFlags': 1 },
            {
                unique: true,
                name: REGISTRY_INDEX_NAME,
                partialFilterExpression: {
                    'collections.guidedPathwayFlags': { $type: 'string', $gt: '' }
                }
            }
        ).then(() => undefined);
        registryIndexPromises.set(key, pending);
    }
    try {
        await pending;
    } catch (error) {
        registryIndexPromises.delete(key);
        throw error;
    }
}

/**
 * assertGuidedPathwayFlagCollectionAvailable - Preflights a new course registration.
 *
 * The check rejects catalog ownership by any course collection and physical
 * rows owned by another course. The unique registry index closes concurrent
 * same-name creation races after this human-readable preflight.
 *
 * @param ctx - Connected Mongo data-layer context
 * @param courseId - New course attempting to reserve the namespace
 * @param collectionName - Proposed readable Guided Pathway collection
 * @returns When the name is safe to register
 * @throws Error when another course or foreign physical data owns the name
 */
export async function assertGuidedPathwayFlagCollectionAvailable(
    ctx: MongoDalContext,
    courseId: string,
    collectionName: string
): Promise<void> {
    await ensureGuidedPathwayFlagRegistryIndex(ctx);
    const owner = await activeCourseListCollection(ctx.db).findOne({
        id: { $ne: courseId },
        $or: [
            { 'collections.users': collectionName },
            { 'collections.flags': collectionName },
            { 'collections.memoryAgent': collectionName },
            { 'collections.scheduledTasks': collectionName },
            { 'collections.scenarioQuestions': collectionName },
            { 'collections.scenarioProgress': collectionName },
            { 'collections.pathways': collectionName },
            { 'collections.guidedPathwayFlags': collectionName }
        ]
    });
    if (owner) {
        throw new Error(`Guided Pathway alert collection ${collectionName} is already registered to another course`);
    }
    const existingNames = await physicalCollectionNames(ctx);
    await assertPhysicalTargetOwnership(ctx, courseId, collectionName, existingNames);
}

async function registerCollectionName(
    ctx: MongoDalContext,
    course: activeCourse,
    collectionName: string
): Promise<boolean> {
    const current = storedCollectionName(course);
    if (current === collectionName) return false;
    const filter: Record<string, unknown> = { id: course.id };
    if (current) {
        filter['collections.guidedPathwayFlags'] = current;
    } else {
        filter.$or = [
            { 'collections.guidedPathwayFlags': { $exists: false } },
            { 'collections.guidedPathwayFlags': null },
            { 'collections.guidedPathwayFlags': '' }
        ];
    }
    const catalog = activeCourseListCollection(ctx.db);
    const result = await catalog.updateOne(filter, {
        $set: { 'collections.guidedPathwayFlags': collectionName }
    });
    if (result.matchedCount === 0) {
        const latest = await catalog.findOne({ id: course.id }) as activeCourse | null;
        if (!latest || storedCollectionName(latest) !== collectionName) {
            throw new Error(`Guided Pathway alert collection registration changed concurrently for course ${course.id}`);
        }
    }
    ctx.collectionNamesCache.delete(course.courseName);
    return true;
}

async function assertCatalogOwnsCollection(
    ctx: MongoDalContext,
    courseId: string,
    collectionName: string
): Promise<void> {
    const owner = await activeCourseListCollection(ctx.db).findOne({
        id: courseId,
        'collections.guidedPathwayFlags': collectionName
    });
    if (!owner) {
        throw new Error(`Guided Pathway alert collection registration changed for course ${courseId}`);
    }
}

/** Creates the unique and queue indexes for one registered alert collection. */
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
            collection.createIndex({ courseId: 1, status: 1, triggeredAt: -1 }, { name: 'guided_pathway_flag_course_status_time' }),
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

async function copyCourseRows(
    ctx: MongoDalContext,
    source: Collection<Document>,
    courseId: string,
    targetName: string,
    renewLease: () => Promise<void>
): Promise<number> {
    const destination = ctx.db.collection(targetName);
    let copied = 0;
    let lastId: unknown;
    let targetReady = false;
    while (true) {
        await renewLease();
        const filter: Record<string, unknown> = { courseId };
        if (lastId !== undefined) filter._id = { $gt: lastId };
        const batch = await source.find(filter).sort({ _id: 1 }).limit(MIGRATION_BATCH_SIZE).toArray();
        if (batch.length === 0) break;
        if (!targetReady) {
            await createCollectionIfMissing(ctx, targetName);
            await ensureGuidedPathwayFlagCollectionIndexes(ctx, targetName);
            targetReady = true;
        }
        // Existing destination rows may contain newer decisions/reveal audits from another process.
        // Insert legacy snapshots only when the Mongo identity is still absent.
        const operations: AnyBulkWriteOperation<Document>[] = batch.map((document) => {
            const { _id, ...insertFields } = document;
            return {
                updateOne: {
                    filter: { _id },
                    update: { $setOnInsert: insertFields },
                    upsert: true
                }
            };
        });
        await destination.bulkWrite(operations, { ordered: true });
        const sourceIds = batch.map((document) => document._id);
        const verified = await destination.countDocuments({ courseId, _id: { $in: sourceIds } });
        if (verified !== sourceIds.length) throw new Error(`GPF-002 verification failed for course ${courseId}`);
        copied += batch.length;
        lastId = batch[batch.length - 1]._id;
    }
    return copied;
}

async function deleteVerifiedCourseRows(
    ctx: MongoDalContext,
    source: Collection<Document>,
    courseId: string,
    targetName: string,
    renewLease: () => Promise<void>
): Promise<void> {
    const destination = ctx.db.collection(targetName);
    while (true) {
        await renewLease();
        const batch = await source.find({ courseId }).sort({ _id: 1 }).limit(MIGRATION_BATCH_SIZE).toArray();
        if (batch.length === 0) return;
        const sourceIds = batch.map((document) => document._id);
        const verified = await destination.countDocuments({ courseId, _id: { $in: sourceIds } });
        if (verified !== sourceIds.length) throw new Error(`GPF-002 cleanup verification failed for course ${courseId}`);
        const deleted = await source.deleteMany({ courseId, _id: { $in: sourceIds } });
        if (deleted.deletedCount !== sourceIds.length) {
            const remaining = await source.countDocuments({ courseId, _id: { $in: sourceIds } });
            if (remaining !== 0) throw new Error(`GPF-002 source cleanup was incomplete for course ${courseId}`);
        }
    }
}

async function dropEmptyCollection(
    ctx: MongoDalContext,
    collection: Collection<Document>
): Promise<boolean> {
    if (await collection.countDocuments({}) !== 0) return false;
    try {
        await collection.drop();
        invalidateGuidedPathwayFlagCollectionIndexes(ctx, collection.collectionName);
        return true;
    } catch (error) {
        if (namespaceNotFound(error)) {
            invalidateGuidedPathwayFlagCollectionIndexes(ctx, collection.collectionName);
            return false;
        }
        throw error;
    }
}

async function runGuidedPathwayFlagMigration(
    ctx: MongoDalContext,
    renewLease: () => Promise<void>
): Promise<GuidedPathwayFlagMigrationResult> {
    await renewLease();
    const catalog = activeCourseListCollection(ctx.db);
    const courses = await catalog.find({}).toArray() as unknown as activeCourse[];
    assertUniqueMigrationTargets(courses);
    const initialPhysicalNames = await physicalCollectionNames(ctx);
    for (const course of courses) {
        await assertPhysicalTargetOwnership(ctx, course.id, targetCollectionName(course), initialPhysicalNames);
    }
    await ensureGuidedPathwayFlagRegistryIndex(ctx);
    const globalSource = guidedPathwayFlagsCollection(ctx.db) as Collection<Document>;
    const globalCourseIds = new Set(
        (await globalSource.distinct('courseId', { courseId: { $type: 'string' } }))
            .filter((value): value is string => typeof value === 'string' && Boolean(value))
    );
    const activeCourseIds = new Set(courses.map(({ id }) => id));
    let registeredCourseCollections = 0;
    let migratedGlobalRows = 0;
    let migratedHashedRows = 0;
    let droppedHashedCollections = 0;

    for (const course of courses) {
        await renewLease();
        const current = storedCollectionName(course);
        const targetName = targetCollectionName(course);
        // The per-course hash was the most recent legacy write target, so let it
        // win over an older shared-row snapshot when both contain the same `_id`.
        // A row already present in the readable target remains authoritative over both.
        const hashedSources = new Set<string>();
        if (isLegacyHashedCollectionName(current)) hashedSources.add(current);
        hashedSources.add(legacyHashedCollectionNameForCourseId(course.id));
        const hasHashNamespace = [...hashedSources].some((name) => initialPhysicalNames.has(name));
        const hasReadableNamespace = initialPhysicalNames.has(targetName);
        const hasGlobalRows = globalCourseIds.has(course.id);

        // Do not create empty collections for untouched legacy courses.
        if (!current && !hasHashNamespace && !hasReadableNamespace && !hasGlobalRows) continue;
        for (const sourceName of hashedSources) {
            if (!initialPhysicalNames.has(sourceName) || sourceName === targetName) continue;
            migratedHashedRows += await copyCourseRows(
                ctx,
                ctx.db.collection(sourceName) as Collection<Document>,
                course.id,
                targetName,
                renewLease
            );
        }
        if (hasGlobalRows) {
            migratedGlobalRows += await copyCourseRows(ctx, globalSource, course.id, targetName, renewLease);
        }

        if ((!current || isLegacyHashedCollectionName(current)) && await registerCollectionName(ctx, course, targetName)) {
            registeredCourseCollections += 1;
        }
        await renewLease();
        await assertCatalogOwnsCollection(ctx, course.id, targetName);
        if (hasGlobalRows) {
            await deleteVerifiedCourseRows(ctx, globalSource, course.id, targetName, renewLease);
        }
        for (const sourceName of hashedSources) {
            if (!initialPhysicalNames.has(sourceName) || sourceName === targetName) continue;
            const source = ctx.db.collection(sourceName) as Collection<Document>;
            await deleteVerifiedCourseRows(ctx, source, course.id, targetName, renewLease);
            if (await dropEmptyCollection(ctx, source)) droppedHashedCollections += 1;
        }
    }

    await renewLease();
    const retainedLegacyRows = await globalSource.countDocuments({});
    if (retainedLegacyRows === 0) {
        try {
            await globalSource.drop();
            invalidateGuidedPathwayFlagCollectionIndexes(ctx, globalSource.collectionName);
        } catch (error) {
            if (!namespaceNotFound(error)) throw error;
            invalidateGuidedPathwayFlagCollectionIndexes(ctx, globalSource.collectionName);
        }
    } else {
        appLogger.warn('[guided-pathway-flags] GPF-002 retained global rows for manual recovery', { retainedLegacyRows });
    }

    const remainingPhysicalNames = await physicalCollectionNames(ctx);
    const remainingHashedNames = [...remainingPhysicalNames].filter((name) => isLegacyHashedCollectionName(name));
    let orphanCourseCollections = 0;
    for (const name of remainingHashedNames) {
        const owners = await (ctx.db.collection(name) as Collection<Document>).distinct('courseId', {
            courseId: { $type: 'string' }
        });
        if (!owners.some((value) => typeof value === 'string' && activeCourseIds.has(value))) {
            orphanCourseCollections += 1;
        }
    }
    if (remainingHashedNames.length > 0) {
        appLogger.warn('[guided-pathway-flags] GPF-002 retained hashed collections for manual recovery', {
            retainedHashedCollections: remainingHashedNames.length,
            orphanCourseCollections
        });
    }
    return {
        registeredCourseCollections,
        migratedRows: migratedGlobalRows + migratedHashedRows,
        migratedGlobalRows,
        migratedHashedRows,
        droppedHashedCollections,
        retainedLegacyRows,
        retainedHashedCollections: remainingHashedNames.length,
        orphanCourseCollections
    };
}

async function acquireMigrationLease(
    ctx: MongoDalContext
): Promise<{ ownerId: string } | { completed: GuidedPathwayFlagMigrationResult }> {
    const collection = applicationMigrationsCollection<GuidedPathwayFlagMigrationLease>(ctx.db);
    const ownerId = randomUUID();

    while (true) {
        const current = await collection.findOne({ _id: MIGRATION_KEY });
        if (current?.state === 'complete') {
            if (!current.result) throw new Error('GPF-002 completion record is missing its result');
            return { completed: current.result };
        }

        const now = new Date();
        const leaseUntil = new Date(now.getTime() + MIGRATION_LEASE_MS);
        if (!current) {
            try {
                await collection.insertOne({
                    _id: MIGRATION_KEY,
                    state: 'running',
                    ownerId,
                    leaseUntil,
                    updatedAt: now
                });
                return { ownerId };
            } catch (error) {
                if (!duplicateKey(error)) throw error;
            }
        } else {
            const claimed = await collection.findOneAndUpdate(
                {
                    _id: MIGRATION_KEY,
                    $or: [
                        { state: 'failed' },
                        { state: 'running', leaseUntil: { $lte: now } },
                        { state: 'running', leaseUntil: { $exists: false } }
                    ]
                },
                {
                    $set: { state: 'running', ownerId, leaseUntil, updatedAt: now },
                    $unset: { result: '', completedAt: '' }
                },
                { returnDocument: 'after' }
            );
            if (claimed?.ownerId === ownerId) return { ownerId };
        }

        await waitForMigrationPoll();
    }
}

async function renewMigrationLease(ctx: MongoDalContext, ownerId: string): Promise<void> {
    const now = new Date();
    const result = await applicationMigrationsCollection<GuidedPathwayFlagMigrationLease>(ctx.db).updateOne(
        { _id: MIGRATION_KEY, state: 'running', ownerId },
        { $set: { leaseUntil: new Date(now.getTime() + MIGRATION_LEASE_MS), updatedAt: now } }
    );
    if (result.matchedCount !== 1) {
        throw new Error('GPF-002 migration lease was lost');
    }
}

async function completeMigrationLease(
    ctx: MongoDalContext,
    ownerId: string,
    result: GuidedPathwayFlagMigrationResult
): Promise<void> {
    const now = new Date();
    const update = await applicationMigrationsCollection<GuidedPathwayFlagMigrationLease>(ctx.db).updateOne(
        { _id: MIGRATION_KEY, state: 'running', ownerId },
        {
            $set: { state: 'complete', result, completedAt: now, updatedAt: now },
            $unset: { ownerId: '', leaseUntil: '' }
        }
    );
    if (update.matchedCount !== 1) {
        throw new Error('GPF-002 migration lease was lost before completion');
    }
}

async function releaseFailedMigrationLease(ctx: MongoDalContext, ownerId: string): Promise<void> {
    const now = new Date();
    await applicationMigrationsCollection<GuidedPathwayFlagMigrationLease>(ctx.db).updateOne(
        { _id: MIGRATION_KEY, state: 'running', ownerId },
        {
            $set: { state: 'failed', updatedAt: now },
            $unset: { ownerId: '', leaseUntil: '', result: '', completedAt: '' }
        }
    );
}

async function runGuidedPathwayFlagMigrationWithLease(
    ctx: MongoDalContext
): Promise<GuidedPathwayFlagMigrationResult> {
    const lease = await acquireMigrationLease(ctx);
    if ('completed' in lease) {
        await ensureGuidedPathwayFlagRegistryIndex(ctx);
        return lease.completed;
    }

    const renewLease = () => renewMigrationLease(ctx, lease.ownerId);
    try {
        const result = await runGuidedPathwayFlagMigration(ctx, renewLease);
        await completeMigrationLease(ctx, lease.ownerId, result);
        return result;
    } catch (error) {
        try {
            await releaseFailedMigrationLease(ctx, lease.ownerId);
        } catch (releaseError) {
            appLogger.warn('[guided-pathway-flags] GPF-002 failed lease could not be released', {
                errorName: releaseError instanceof Error ? releaseError.name : typeof releaseError
            });
        }
        throw error;
    }
}

/**
 * migrateGuidedPathwayFlagsToCourseCollections - Runs GPF-002 once per database.
 *
 * A Mongo-backed lease serializes application instances; a process-local promise
 * coalesces callers inside one instance. Failed attempts release the lease for a
 * later retry, while a persisted completion result makes restarts a no-op.
 *
 * @param ctx - Connected Mongo data-layer context
 * @returns Registration, migration, cleanup, and retained-data counts
 * @throws Mongo or validation failures; no unverified source row is deleted
 */
export async function migrateGuidedPathwayFlagsToCourseCollections(
    ctx: MongoDalContext
): Promise<GuidedPathwayFlagMigrationResult> {
    const key = ctx.db as object;
    let pending = migrationPromises.get(key);
    if (!pending) {
        pending = runGuidedPathwayFlagMigrationWithLease(ctx);
        migrationPromises.set(key, pending);
    }
    try {
        return await pending;
    } catch (error) {
        migrationPromises.delete(key);
        throw error;
    }
}

/** Resolves and lazily provisions one active course's registered alert collection. */
export async function getGuidedPathwayFlagCourseScope(
    ctx: MongoDalContext,
    courseId: string
): Promise<GuidedPathwayFlagCourseScope> {
    await migrateGuidedPathwayFlagsToCourseCollections(ctx);
    const catalog = activeCourseListCollection(ctx.db);
    const course = await catalog.findOne({ id: courseId }) as activeCourse | null;
    if (!course) throw new GuidedPathwayFlagCourseNotFoundError();
    const collectionName = targetCollectionName(course);
    assertSafeRegisteredCollectionName(course, collectionName);
    const duplicate = await catalog.findOne({
        id: { $ne: course.id },
        'collections.guidedPathwayFlags': collectionName
    });
    if (duplicate) throw new Error(`Guided Pathway alert collection ${collectionName} is registered to multiple courses`);
    await registerCollectionName(ctx, course, collectionName);
    await createCollectionIfMissing(ctx, collectionName);
    await ensureGuidedPathwayFlagCollectionIndexes(ctx, collectionName);
    return { courseId: course.id, courseName: course.courseName, collectionName };
}

/**
 * getExistingGuidedPathwayFlagCourseScope - Resolves existing storage without provisioning it.
 *
 * Read-only list/count/backup paths use this variant so viewing an empty legacy
 * course does not register a name, create a namespace, or build indexes.
 *
 * @param ctx - Connected Mongo data-layer context
 * @param courseId - Stable active-course id
 * @returns Existing registered scope, or `null` when no physical collection exists
 * @throws Error when the course is absent or the stored registration is unsafe
 */
export async function getExistingGuidedPathwayFlagCourseScope(
    ctx: MongoDalContext,
    courseId: string
): Promise<GuidedPathwayFlagCourseScope | null> {
    await migrateGuidedPathwayFlagsToCourseCollections(ctx);
    const catalog = activeCourseListCollection(ctx.db);
    const course = await catalog.findOne({ id: courseId }) as activeCourse | null;
    if (!course) throw new GuidedPathwayFlagCourseNotFoundError();
    const collectionName = storedCollectionName(course);
    if (!collectionName || isLegacyHashedCollectionName(collectionName)) return null;
    assertSafeRegisteredCollectionName(course, collectionName);
    const duplicate = await catalog.findOne({
        id: { $ne: course.id },
        'collections.guidedPathwayFlags': collectionName
    });
    if (duplicate) throw new Error(`Guided Pathway alert collection ${collectionName} is registered to multiple courses`);
    const existingNames = await physicalCollectionNames(ctx);
    if (!existingNames.has(collectionName)) return null;
    return { courseId: course.id, courseName: course.courseName, collectionName };
}

/** Lists existing registered collections for cross-course administrator aggregation. */
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
    const existingNames = await physicalCollectionNames(ctx);
    const owners = new Map<string, string>();
    const scopes: GuidedPathwayFlagCourseScope[] = [];
    for (const course of courses) {
        const collectionName = storedCollectionName(course);
        if (!collectionName || isLegacyHashedCollectionName(collectionName) || !existingNames.has(collectionName)) continue;
        assertSafeRegisteredCollectionName(course, collectionName);
        const existingOwner = owners.get(collectionName);
        if (existingOwner && existingOwner !== course.id) {
            throw new Error(`Guided Pathway alert collection ${collectionName} is registered to multiple courses`);
        }
        owners.set(collectionName, course.id);
        scopes.push({ courseId: course.id, courseName: course.courseName, collectionName });
    }
    return scopes;
}

/** Returns a typed Mongo collection handle for a validated registered course scope. */
export function guidedPathwayFlagCourseCollection<T extends Document = Document>(
    ctx: MongoDalContext,
    scope: GuidedPathwayFlagCourseScope
): Collection<T> {
    return ctx.db.collection<T>(scope.collectionName);
}
