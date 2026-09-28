/**
 * course-material-copy-service.ts
 * @description Copies one course's materials into another, replacing whatever the target held.
 *
 * "Materials" is the Documents page: the topic/week layout, each item's learning objectives and
 * struggle topics, and each uploaded document together with its Qdrant chunks. Chunks are copied
 * with their stored embeddings, so nothing is re-parsed or re-embedded.
 *
 * Scenario questions, Guided Pathways, and Writing Feedback are deliberately not copied or
 * touched — replacing a course's topics leaves them exactly as deleting a topic would.
 */

import { randomUUID } from 'crypto';
import type {
    activeCourse,
    AdditionalMaterial,
    CopyCourseMaterialsResult,
    GlobalUser,
    MaterialCopySourceCourse,
    SkippedCopyMaterial,
    TopicOrWeekInstance,
    TopicOrWeekItem
} from '../types/shared';
import type { CourseMaterialReplacement } from '../db/mongo/course-material-copy-mongo';
import type { MaterialChunkForCopy, RAGApp } from '../rag/rag-app';
import { materialChunkIds } from '../migrate/schema-walker';
import { canManageCourseRoster } from '../utils/course-staff';
import { isAdminUser } from '../utils/admin';
import { appLogger } from '../utils/logger';
import type { IDGenerator } from '../utils/unique-id-generator';
import type { EngEAI_MongoDB } from '../db/enge-ai-mongodb';
import { scheduledPublishAudit } from '../jobs/scheduled-publish-audit';

/** Long enough for a large course's chunk upload; short enough that a crashed copy does not lock a course for long. */
export const MATERIAL_COPY_LEASE_MS = 15 * 60 * 1000;

/** The target is already being copied into. */
export class MaterialCopyInProgressError extends Error {
    constructor() {
        super('Materials are already being copied into this course. Try again in a few minutes.');
        this.name = 'MaterialCopyInProgressError';
    }
}

/** The copy lost its lease before it could write — a newer copy took the course over. */
export class MaterialCopyLeaseLostError extends Error {
    constructor() {
        super('The copy took too long and was not saved. Please try again.');
        this.name = 'MaterialCopyLeaseLostError';
    }
}

/** Everything the copy touches, injected so the sequencing can be tested without Mongo or Qdrant. */
export interface CourseMaterialCopyDeps {
    getMaterialChunks(materialId: string, courseName: string): Promise<MaterialChunkForCopy[]>;
    upsertChunks(points: MaterialChunkForCopy[]): Promise<void>;
    deleteChunks(ids: string[]): Promise<void>;
    acquireLease(courseId: string, token: string, expiresAt: Date): Promise<activeCourse | null>;
    replaceUnderLease(courseId: string, token: string, replacement: CourseMaterialReplacement): Promise<activeCourse | null>;
    releaseLease(courseId: string, token: string): Promise<void>;
    removeScheduledPublish(course: activeCourse, instance: TopicOrWeekInstance): Promise<void>;
    addScheduledPublish(course: activeCourse, instance: TopicOrWeekInstance, when: Date): Promise<void>;
    /** 12-hex catalog id, fresh on every call. */
    newCatalogId(): string;
    now(): Date;
    warn(message: string, meta?: Record<string, unknown>): void;
}

/** A material that made it into the copy, with the chunks written for it. */
interface PlannedMaterial {
    material: AdditionalMaterial;
    points: MaterialChunkForCopy[];
}

interface MaterialCopyPlan {
    instances: TopicOrWeekInstance[];
    points: MaterialChunkForCopy[];
    materialsCopied: number;
    skippedMaterials: SkippedCopyMaterial[];
}

/**
 * countCourseMaterials — live (not soft-deleted) documents across every topic/week of a course.
 *
 * @param course - Course whose `topicOrWeekInstances` are counted
 * @returns Number of materials
 */
export function countCourseMaterials(course: Pick<activeCourse, 'topicOrWeekInstances'>): number {
    let count = 0;
    for (const instance of course.topicOrWeekInstances || []) {
        for (const item of instance.items || []) {
            count += (item.additionalMaterials || []).filter((m) => m && m.deleted !== true).length;
        }
    }
    return count;
}

/**
 * listMaterialCopySources — courses the user may copy materials from into `targetCourseId`.
 *
 * Only courses the user could manage themselves (instructor or admin, the same rule that gates
 * the copy) and that have at least one topic/week; the target itself is left out.
 *
 * @param courses - Candidate catalog rows
 * @param globalUser - Caller
 * @param targetCourseId - Course being copied into
 * @returns Source summaries in the order given
 */
export function listMaterialCopySources(
    courses: activeCourse[],
    globalUser: GlobalUser,
    targetCourseId: string
): MaterialCopySourceCourse[] {
    return courses
        .filter((course) => course.id !== targetCourseId)
        .filter((course) => canManageCourseRoster(course, globalUser))
        .filter((course) => (course.topicOrWeekInstances || []).length > 0)
        .map((course) => ({
            id: course.id,
            courseName: course.courseName,
            frameType: course.frameType,
            topicOrWeekCount: (course.topicOrWeekInstances || []).length,
            materialCount: countCourseMaterials(course)
        }));
}

/**
 * instructorFilterFor — how to narrow the catalog before {@link listMaterialCopySources}.
 *
 * @param globalUser - Caller
 * @returns `null` for platform admins (every course), otherwise the caller's user id
 */
export function instructorFilterFor(globalUser: GlobalUser): string | null {
    return isAdminUser(globalUser) ? null : globalUser.userId;
}

/**
 * Rewrites one chunk for the target: fresh point id, and every payload field that ties it to a
 * course or catalog entry pointed at the copy. Text, embedding, titles and chunk metadata are kept.
 */
function rewriteChunk(
    chunk: MaterialChunkForCopy,
    target: activeCourse,
    ids: { materialId: string; topicOrWeekId: string; itemId: string }
): MaterialChunkForCopy {
    const owner = {
        id: ids.materialId,
        courseName: target.courseName,
        courseId: target.id,
        topicOrWeekId: ids.topicOrWeekId,
        itemId: ids.itemId
    };
    const payload: Record<string, unknown> = { ...chunk.payload, ...owner };

    // The chunker nests a second copy of the upload metadata; nothing reads it today, but it
    // must not keep naming the source course.
    const chunkMetadata = chunk.payload.chunkMetadata as Record<string, unknown> | undefined;
    const nested = chunkMetadata?.sourceDocumentMetadata;
    if (nested && typeof nested === 'object') {
        payload.chunkMetadata = { ...chunkMetadata, sourceDocumentMetadata: { ...nested, ...owner } };
    }

    return { id: randomUUID(), vector: chunk.vector, payload };
}

async function copyMaterial(
    deps: CourseMaterialCopyDeps,
    source: activeCourse,
    target: activeCourse,
    material: AdditionalMaterial,
    ids: { topicOrWeekId: string; itemId: string }
): Promise<PlannedMaterial | null> {
    // A material without stored chunks never finished uploading; without chunks the copy would
    // list a document the assistant cannot read.
    if (materialChunkIds(material).length === 0) return null;
    const chunks = await deps.getMaterialChunks(material.id, source.courseName);
    if (chunks.length === 0) return null;

    const materialId = deps.newCatalogId();
    const points = chunks.map((chunk) => rewriteChunk(chunk, target, { materialId, ...ids }));
    const copied: AdditionalMaterial = {
        ...material,
        id: materialId,
        courseName: target.courseName,
        courseId: target.id,
        topicOrWeekId: ids.topicOrWeekId,
        itemId: ids.itemId,
        qdrantChunkIds: points.map((p) => p.id),
        chunksGenerated: points.length
    };
    // Legacy single-chunk pointer; `qdrantChunkIds` replaces it.
    delete (copied as { qdrantId?: unknown }).qdrantId;
    return { material: copied, points };
}

/**
 * Builds the target's new topics/weeks from the source's and collects the chunks to write.
 * Every id is fresh, so nothing in the copy can be mistaken for — or delete — the source's data.
 */
async function planMaterialCopy(
    deps: CourseMaterialCopyDeps,
    source: activeCourse,
    target: activeCourse
): Promise<MaterialCopyPlan> {
    const now = deps.now();
    const points: MaterialChunkForCopy[] = [];
    const skippedMaterials: SkippedCopyMaterial[] = [];
    let materialsCopied = 0;
    const instances: TopicOrWeekInstance[] = [];

    for (const sourceInstance of source.topicOrWeekInstances || []) {
        const topicOrWeekId = deps.newCatalogId();
        const items: TopicOrWeekItem[] = [];

        for (const sourceItem of sourceInstance.items || []) {
            const itemId = deps.newCatalogId();
            const materials: AdditionalMaterial[] = [];

            for (const material of sourceItem.additionalMaterials || []) {
                if (!material || material.deleted === true) continue;
                const planned = await copyMaterial(deps, source, target, material, { topicOrWeekId, itemId });
                if (!planned) {
                    skippedMaterials.push({
                        name: material.name,
                        topicOrWeekTitle: sourceInstance.title,
                        itemTitle: sourceItem.itemTitle || sourceItem.title
                    });
                    continue;
                }
                materials.push(planned.material);
                points.push(...planned.points);
                materialsCopied += 1;
            }

            items.push({
                ...sourceItem,
                id: itemId,
                courseName: target.courseName,
                learningObjectives: (sourceItem.learningObjectives || []).map((lo) => ({ ...lo, id: deps.newCatalogId() })),
                ...(sourceItem.instructorStruggleTopics
                    ? { instructorStruggleTopics: sourceItem.instructorStruggleTopics.map((t) => ({ ...t, id: deps.newCatalogId() })) }
                    : {}),
                additionalMaterials: materials,
                createdAt: now,
                updatedAt: now
            });
        }

        instances.push({
            ...sourceInstance,
            id: topicOrWeekId,
            courseName: target.courseName,
            items,
            createdAt: now,
            updatedAt: now
        });
    }

    return { instances, points, materialsCopied, skippedMaterials };
}

function scheduledPublishDate(instance: TopicOrWeekInstance): Date | null {
    if (instance.published || !instance.scheduledPublishAt) return null;
    const when = new Date(instance.scheduledPublishAt);
    return Number.isNaN(when.getTime()) ? null : when;
}

function allChunkIds(course: activeCourse): string[] {
    const ids: string[] = [];
    for (const instance of course.topicOrWeekInstances || []) {
        for (const item of instance.items || []) {
            for (const material of item.additionalMaterials || []) {
                ids.push(...materialChunkIds(material));
            }
        }
    }
    return ids;
}

/**
 * copyCourseMaterials — replaces the target course's materials with a copy of the source's.
 *
 * Steps:
 * 1. Claim the target with a lease so two copies cannot interleave.
 * 2. Read the source's chunks and write copies under fresh ids.
 * 3. Swap the target's topics/weeks in one Mongo write. If writing chunks or the swap fails, the
 *    new chunks are deleted and the target is left exactly as it was.
 * 4. Clean up what the swap replaced: the old chunks and old scheduled publishes. Failures here
 *    are logged, not thrown — the copy itself has succeeded.
 * 5. Schedule publishes for copied topics/weeks that were scheduled in the source.
 *
 * @param deps - Storage operations
 * @param source - Course to copy from (caller has checked permission)
 * @param targetCourseId - Course to copy into (caller has checked permission)
 * @returns Counts for the confirmation message, and materials that could not be copied
 * @throws MaterialCopyInProgressError when another copy holds the target
 * @throws MaterialCopyLeaseLostError when the lease lapsed before the swap
 */
export async function copyCourseMaterials(
    deps: CourseMaterialCopyDeps,
    source: activeCourse,
    targetCourseId: string
): Promise<CopyCourseMaterialsResult> {
    const token = randomUUID();
    const target = await deps.acquireLease(
        targetCourseId,
        token,
        new Date(deps.now().getTime() + MATERIAL_COPY_LEASE_MS)
    );
    if (!target) {
        throw new MaterialCopyInProgressError();
    }

    let writtenPointIds: string[] = [];
    let replaced: activeCourse | null = null;
    let result: CopyCourseMaterialsResult;
    let instances: TopicOrWeekInstance[];
    try {
        const plan = await planMaterialCopy(deps, source, target);
        instances = plan.instances;
        writtenPointIds = plan.points.map((p) => p.id);
        await deps.upsertChunks(plan.points);

        replaced = await deps.replaceUnderLease(targetCourseId, token, {
            frameType: source.frameType,
            tilesNumber: source.tilesNumber,
            topicOrWeekInstances: plan.instances
        });
        if (!replaced) {
            throw new MaterialCopyLeaseLostError();
        }

        result = {
            sourceCourseId: source.id,
            topicsOrWeeksCopied: plan.instances.length,
            materialsCopied: plan.materialsCopied,
            chunksCopied: plan.points.length,
            replacedMaterialCount: countCourseMaterials(replaced),
            skippedMaterials: plan.skippedMaterials
        };
    } catch (error) {
        // Nothing was swapped in, so the chunks written so far belong to no material.
        try {
            await deps.deleteChunks(writtenPointIds);
        } catch (cleanupError) {
            deps.warn('[MATERIAL-COPY] Could not remove chunks from a failed copy', {
                targetCourseId,
                chunkCount: writtenPointIds.length,
                error: String(cleanupError)
            });
        }
        await deps.releaseLease(targetCourseId, token);
        throw error;
    }

    // Read the replaced materials from the swap's own "before" image, not the copy's first read:
    // anything uploaded to the target mid-copy is gone from the catalog too and must not be orphaned.
    const oldChunkIds = allChunkIds(replaced);
    try {
        await deps.deleteChunks(oldChunkIds);
    } catch (error) {
        deps.warn('[MATERIAL-COPY] Could not delete the replaced materials\' chunks', {
            targetCourseId,
            chunkCount: oldChunkIds.length,
            error: String(error)
        });
    }

    for (const oldInstance of replaced.topicOrWeekInstances || []) {
        try {
            await deps.removeScheduledPublish(replaced, oldInstance);
        } catch (error) {
            deps.warn('[MATERIAL-COPY] Could not remove a replaced topic/week\'s scheduled publish', {
                targetCourseId,
                topicOrWeekId: oldInstance.id,
                error: String(error)
            });
        }
    }

    for (const instance of instances) {
        const when = scheduledPublishDate(instance);
        if (!when) continue;
        try {
            await deps.addScheduledPublish(replaced, instance, when);
        } catch (error) {
            deps.warn('[MATERIAL-COPY] Could not schedule a copied topic/week\'s publish', {
                targetCourseId,
                topicOrWeekId: instance.id,
                error: String(error)
            });
        }
    }

    return result;
}

/**
 * buildCourseMaterialCopyDeps — wires {@link copyCourseMaterials} to the live stores.
 *
 * @param mongo - Mongo façade
 * @param rag - RAG app over the shared Qdrant collection
 * @param idGenerator - Catalog id generator; seeded randomly because a copy creates many
 *   same-titled entries in the same millisecond, which the title/date hashes would collide on
 * @returns Production dependencies
 */
export function buildCourseMaterialCopyDeps(
    mongo: EngEAI_MongoDB,
    rag: RAGApp,
    idGenerator: IDGenerator
): CourseMaterialCopyDeps {
    return {
        getMaterialChunks: (materialId, courseName) => rag.getMaterialChunksForCopy(materialId, courseName),
        upsertChunks: (points) => rag.upsertCopiedChunks(points),
        deleteChunks: (ids) => rag.deleteChunksByIds(ids),
        acquireLease: (courseId, token, expiresAt) => mongo.acquireMaterialCopyLease(courseId, { token, expiresAt }),
        replaceUnderLease: (courseId, token, replacement) =>
            mongo.replaceCourseMaterialsUnderLease(courseId, token, replacement),
        releaseLease: (courseId, token) => mongo.releaseMaterialCopyLease(courseId, token),
        removeScheduledPublish: async (course, instance) => {
            await mongo.deleteScheduledTaskByTopicOrWeekId(course.courseName, instance.id);
            if (!scheduledPublishDate(instance)) return;
            await scheduledPublishAudit.taskScheduleRemoved({
                courseId: course.id,
                courseName: course.courseName,
                topicOrWeekId: instance.id,
                reason: 'materials_replaced',
                title: instance.title
            });
        },
        addScheduledPublish: async (course, instance, when) => {
            await mongo.upsertScheduledTopicOrWeekTask(course.courseName, course.id, instance.id, instance.title, when);
            await scheduledPublishAudit.taskScheduled({
                courseId: course.id,
                courseName: course.courseName,
                topicOrWeekId: instance.id,
                scheduledPublishAt: when,
                title: instance.title
            });
        },
        newCatalogId: () => idGenerator.uniqueIDGenerator(randomUUID()),
        now: () => new Date(),
        warn: (message, meta) => appLogger.warn(message, meta)
    };
}
