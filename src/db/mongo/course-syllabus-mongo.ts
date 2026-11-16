/**
 * course-syllabus-mongo.ts
 *
 * @description Course Syllabus documents (#674) on `active-course-list` documents
 * (`syllabusMaterials`). The syllabus is course-wide and lives outside the
 * `topicOrWeekInstances` tree, so week/topic numbering, publishing and struggle
 * topics never touch it. Qdrant chunks are managed by `RAGApp`; this module only
 * keeps the Mongo record in step with them.
 */

import type { AdditionalMaterial } from '../../types/shared';
import { activeCourseListCollection } from './mongo-collections';
import type { MongoDalContext } from './mongo-context';

/**
 * addSyllabusMaterial - Appends one uploaded syllabus document to the course.
 *
 * Not idempotent: calling twice with the same material stores it twice, as with
 * week/topic materials. Callers persist only after Qdrant accepted the chunks.
 *
 * @param ctx - Mongo context
 * @param courseId - Active course id
 * @param material - Persistable material (no file buffer, no extracted text)
 * @returns True when the course exists and was updated
 */
export async function addSyllabusMaterial(
    ctx: MongoDalContext,
    courseId: string,
    material: AdditionalMaterial
): Promise<boolean> {
    const result = await activeCourseListCollection(ctx.db).updateOne(
        { id: courseId },
        {
            $push: { syllabusMaterials: material as any },
            $set: { updatedAt: Date.now().toString() }
        }
    );
    return result.matchedCount > 0;
}

/**
 * removeSyllabusMaterial - Removes one syllabus document by material id.
 *
 * Idempotent: removing an id that is not stored leaves the course unchanged.
 *
 * @param ctx - Mongo context
 * @param courseId - Active course id
 * @param materialId - Material id to remove
 * @returns True when the course exists
 */
export async function removeSyllabusMaterial(
    ctx: MongoDalContext,
    courseId: string,
    materialId: string
): Promise<boolean> {
    const result = await activeCourseListCollection(ctx.db).updateOne(
        { id: courseId },
        {
            $pull: { syllabusMaterials: { id: materialId } } as any,
            $set: { updatedAt: Date.now().toString() }
        }
    );
    return result.matchedCount > 0;
}

/**
 * clearSyllabusMaterials - Removes every syllabus document from the course.
 *
 * Idempotent. Used when all course documents are deleted or the RAG store is wiped.
 *
 * @param ctx - Mongo context
 * @param courseId - Active course id
 * @returns True when the course exists
 */
export async function clearSyllabusMaterials(ctx: MongoDalContext, courseId: string): Promise<boolean> {
    const result = await activeCourseListCollection(ctx.db).updateOne(
        { id: courseId },
        {
            $unset: { syllabusMaterials: 1 },
            $set: { updatedAt: Date.now().toString() }
        }
    );
    return result.matchedCount > 0;
}
