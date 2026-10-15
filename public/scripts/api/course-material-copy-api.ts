/**
 * course-material-copy-api.ts
 * @description Client calls for copying another course's materials into the current course.
 */

import type { activeCourse, CopyCourseMaterialsResult, MaterialCopySourceCourse } from '../types.js';

async function readJson(response: Response): Promise<any> {
    try {
        return await response.json();
    } catch {
        return {};
    }
}

/**
 * Lists the courses the signed-in instructor may copy materials from into `courseId`.
 *
 * @throws Error carrying the server's message when the request fails
 */
export async function fetchMaterialCopySources(courseId: string): Promise<MaterialCopySourceCourse[]> {
    const response = await fetch(`/api/courses/${encodeURIComponent(courseId)}/material-copy-sources`, {
        credentials: 'same-origin'
    });
    const body = await readJson(response);
    if (!response.ok || !body.success) {
        throw new Error(body.error || 'Could not load your other courses.');
    }
    return body.data as MaterialCopySourceCourse[];
}

/**
 * Replaces `courseId`'s materials with a copy of `sourceCourseId`'s.
 *
 * @throws Error carrying the server's message when the copy fails; the course is then unchanged
 */
export async function copyCourseMaterials(courseId: string, sourceCourseId: string): Promise<CopyCourseMaterialsResult> {
    const response = await fetch(`/api/courses/${encodeURIComponent(courseId)}/copy-materials`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceCourseId })
    });
    const body = await readJson(response);
    if (!response.ok || !body.success) {
        throw new Error(body.error || 'Copying materials failed. This course\'s materials were not changed.');
    }
    return body.data as CopyCourseMaterialsResult;
}

/**
 * Re-reads a course after its materials changed.
 *
 * @throws Error when the course cannot be loaded
 */
export async function fetchCourse(courseId: string): Promise<activeCourse> {
    const response = await fetch(`/api/courses/${encodeURIComponent(courseId)}`, { credentials: 'same-origin' });
    const body = await readJson(response);
    if (!response.ok || !body.success || !body.data) {
        throw new Error(body.error || 'Could not reload the course.');
    }
    return body.data as activeCourse;
}
