// course-material-copy-mongo.ts
/**
 * course-material-copy-mongo.ts
 * @description Catalog writes for copying one course's materials into another: the per-course
 * copy lease, the single swap that replaces the target's topics/weeks, and the source-course listing.
 *
 * The Qdrant half of a copy lives in `RAGApp`; `course-material-copy-service.ts` sequences the two.
 */

import type { activeCourse, frameType, MaterialCopyLease, TopicOrWeekInstance } from '../../types/shared';
import { activeCourseListCollection } from './mongo-collections';
import type { MongoDalContext } from './mongo-context';

/** Fields a completed copy writes onto the target course. */
export interface CourseMaterialReplacement {
    frameType: frameType;
    tilesNumber: number;
    topicOrWeekInstances: TopicOrWeekInstance[];
}

/**
 * acquireMaterialCopyLease — claims the target course for one copy.
 *
 * Succeeds when no lease is held or the held one has expired (a crashed copy never frees its own).
 *
 * @param ctx - MongoDalContext
 * @param courseId - Target `activeCourse.id`
 * @param lease - Token identifying this copy, and when the claim lapses
 * @returns The target course as it stood when claimed, or `null` when it is missing or already claimed
 */
export async function acquireMaterialCopyLease(
    ctx: MongoDalContext,
    courseId: string,
    lease: MaterialCopyLease
): Promise<activeCourse | null> {
    const result = await activeCourseListCollection(ctx.db).findOneAndUpdate(
        {
            id: courseId,
            $or: [
                { materialCopyLease: { $exists: false } },
                { 'materialCopyLease.expiresAt': { $lt: new Date() } }
            ]
        },
        { $set: { materialCopyLease: lease } },
        { returnDocument: 'after' }
    );
    return (result as activeCourse | null) ?? null;
}

/**
 * replaceCourseMaterialsUnderLease — swaps in the copied topics/weeks and frees the lease, in one write.
 *
 * Also records that the course's content is filed (`contentSetup`), since a copy stands in for
 * Document Setup. Matching on the lease token means a copy whose lease expired and was taken over
 * cannot overwrite the newer copy's result.
 *
 * @param ctx - MongoDalContext
 * @param courseId - Target `activeCourse.id`
 * @param token - Token passed to {@link acquireMaterialCopyLease}
 * @param replacement - Layout and topics/weeks to write
 * @returns The course as it was **before** the swap — its materials are the ones replaced — or
 *   `null` when this copy no longer holds the lease and nothing was written
 */
export async function replaceCourseMaterialsUnderLease(
    ctx: MongoDalContext,
    courseId: string,
    token: string,
    replacement: CourseMaterialReplacement
): Promise<activeCourse | null> {
    const result = await activeCourseListCollection(ctx.db).findOneAndUpdate(
        { id: courseId, 'materialCopyLease.token': token },
        {
            $set: {
                frameType: replacement.frameType,
                tilesNumber: replacement.tilesNumber,
                topicOrWeekInstances: replacement.topicOrWeekInstances,
                contentSetup: true,
                updatedAt: Date.now().toString()
            },
            $unset: { materialCopyLease: '' }
        },
        { returnDocument: 'before' }
    );
    return (result as activeCourse | null) ?? null;
}

/**
 * releaseMaterialCopyLease — frees the lease after a copy that did not complete.
 *
 * Idempotent, and a no-op when another copy has since taken the lease over.
 *
 * @param ctx - MongoDalContext
 * @param courseId - Target `activeCourse.id`
 * @param token - Token passed to {@link acquireMaterialCopyLease}
 */
export async function releaseMaterialCopyLease(
    ctx: MongoDalContext,
    courseId: string,
    token: string
): Promise<void> {
    await activeCourseListCollection(ctx.db).updateOne(
        { id: courseId, 'materialCopyLease.token': token },
        { $unset: { materialCopyLease: '' } }
    );
}

/**
 * listCoursesForMaterialCopy — catalog rows that could be offered as copy sources.
 *
 * Narrows to courses listing the user as an instructor unless `instructorUserId` is `null`
 * (platform admins, who may copy from any course). Callers still apply the full permission check.
 * Pasted material text is left out; the listing only counts materials.
 *
 * @param ctx - MongoDalContext
 * @param instructorUserId - `GlobalUser.userId` to match in `instructors`, or `null` for every course
 * @returns Matching courses with their topics/weeks, sorted by course name
 */
export async function listCoursesForMaterialCopy(
    ctx: MongoDalContext,
    instructorUserId: string | null
): Promise<activeCourse[]> {
    const filter = instructorUserId === null
        ? {}
        : { $or: [{ instructors: instructorUserId }, { 'instructors.userId': instructorUserId }] };
    const rows = await activeCourseListCollection(ctx.db)
        .find(filter, { projection: { 'topicOrWeekInstances.items.additionalMaterials.text': 0 } })
        .sort({ courseName: 1 })
        .toArray();
    return rows as unknown as activeCourse[];
}
