/**
 * course-syllabus.ts
 *
 * @description Pure helpers for Course Syllabus documents (#674). The syllabus is
 * stored on `activeCourse.syllabusMaterials`, outside the week/topic tree. Its Qdrant
 * chunks carry `COURSE_SYLLABUS_TITLE` as both topic and item title, and retrieval
 * reads them through a separate, small search so lecture material is never crowded
 * out and the syllabus is never filtered away by week scope or publish state.
 */

import type { activeCourse, AdditionalMaterial } from '../types/shared';
import { COURSE_SYLLABUS_SCOPE_ID, COURSE_SYLLABUS_TITLE } from '../types/shared';
import { materialChunkIds } from '../migrate/schema-walker';

/** Error shown when a week/topic would take the syllabus's reserved title. */
export const RESERVED_SYLLABUS_TITLE_ERROR = `"${COURSE_SYLLABUS_TITLE}" is reserved for the Course Syllabus section`;

/** Syllabus chunks added to each retrieval, on top of the caller's own limit. */
export const SYLLABUS_RETRIEVE_LIMIT = 2;

/**
 * isCourseSyllabusScope - True when an upload targets the Course Syllabus.
 *
 * The client sends the reserved scope id as `topicOrWeekId`; week/topic ids are
 * numeric or hash strings and never equal it.
 *
 * @param topicOrWeekId - Upload body `topicOrWeekId`
 * @returns Whether the upload belongs to the syllabus
 */
export function isCourseSyllabusScope(topicOrWeekId: unknown): boolean {
    return topicOrWeekId === COURSE_SYLLABUS_SCOPE_ID;
}

/**
 * isReservedSyllabusTitle - True when a week/topic title equals the syllabus title.
 *
 * Week/topic titles are stored on their chunks and used by rename and retrieval filters,
 * so a week named "Course Syllabus" would be read, renamed and filtered as the syllabus.
 *
 * @param title - Proposed week/topic title
 * @returns Whether the title is reserved (case- and whitespace-insensitive)
 */
export function isReservedSyllabusTitle(title: string): boolean {
    return title.trim().replace(/\s+/g, ' ').toLowerCase() === COURSE_SYLLABUS_TITLE.toLowerCase();
}

/**
 * activeSyllabusMaterials - Syllabus documents that have chunks in Qdrant.
 *
 * @param course - Active course (may lack `syllabusMaterials`)
 * @returns Non-deleted materials with at least one chunk id
 */
export function activeSyllabusMaterials(course: Pick<activeCourse, 'syllabusMaterials'>): AdditionalMaterial[] {
    return (course.syllabusMaterials ?? []).filter(
        (material) => !material.deleted && materialChunkIds(material).length > 0
    );
}

/**
 * syllabusChunkIds - Every stored Qdrant chunk id of the course's syllabus documents.
 *
 * @param course - Active course
 * @returns Chunk ids (deleted flags ignored, so cleanup never orphans vectors)
 */
export function syllabusChunkIds(course: Pick<activeCourse, 'syllabusMaterials'>): string[] {
    return (course.syllabusMaterials ?? []).flatMap((material) => materialChunkIds(material));
}

/**
 * syllabusChunkFilter - Qdrant filter matching only this course's syllabus chunks.
 *
 * @param courseName - Course name stored on every chunk
 * @returns Filter for `RAGModule.retrieveContext`
 */
export function syllabusChunkFilter(courseName: string): Record<string, unknown> {
    return {
        must: [
            { key: 'courseName', match: { value: courseName } },
            { key: 'topicOrWeekTitle', match: { value: COURSE_SYLLABUS_TITLE } },
            { key: 'itemTitle', match: { value: COURSE_SYLLABUS_TITLE } },
        ],
    };
}
