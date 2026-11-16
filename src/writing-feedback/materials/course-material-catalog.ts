/**
 * Course material catalog — the published readings staff may name to a student
 *
 * Reads the course's embedded topic/week graph and returns one title per published,
 * undeleted material. Staff pick from this list when a passage should send a student back
 * to a specific lecture and retrieval resolved no mention of its own.
 *
 * @author: @rdschrs
 * @date: 2026-09-12
 * @version: 1.0.0
 * @description: Resolves staff-pickable course-material titles for Writing Feedback.
 */

import type { activeCourse } from '../../types/shared';
import { COURSE_SYLLABUS_TITLE } from '../../types/shared';

/** One pickable course material: a stable id and the title a student would read. */
export interface CourseMaterialTitle {
    id: string;
    label: string;
}

/**
 * listPublishedCourseMaterialTitles - published material titles in course order.
 *
 * The label is composed the way `mentionFromChunk` composes a retrieved material's label,
 * so a staff-picked title and a model-cited one read identically in the annotation and in
 * the student PDF's reading list.
 *
 * Only published topics contribute. The title is printed to a student, so an unreleased
 * document must not be offered — the same boundary retrieval enforces when it decides what
 * is citable. Course Syllabus documents (#674) have no publish state and are citable as
 * soon as they are uploaded, so they come first.
 *
 * @param course - Course record carrying the embedded topic/week graph, if loaded
 * @returns Pickable titles, deduplicated by label, in topic then item then material order
 */
export function listPublishedCourseMaterialTitles(course: activeCourse | undefined | null): CourseMaterialTitle[] {
    const titles: CourseMaterialTitle[] = [];
    const seen = new Set<string>();
    // Same label `mentionFromChunk` builds from a syllabus chunk ("Course Syllabus · <name>")
    for (const material of course?.syllabusMaterials ?? []) {
        if (!material || material.deleted === true) continue;
        const name = typeof material.name === 'string' ? material.name.trim() : '';
        const label = name && name !== COURSE_SYLLABUS_TITLE ? `${COURSE_SYLLABUS_TITLE} · ${name}` : COURSE_SYLLABUS_TITLE;
        if (seen.has(label)) continue;
        seen.add(label);
        titles.push({ id: material.id, label });
    }
    for (const topic of course?.topicOrWeekInstances ?? []) {
        if (topic?.published !== true) continue;
        for (const item of topic.items ?? []) {
            for (const material of item?.additionalMaterials ?? []) {
                if (!material || material.deleted === true) continue;
                const parts = [topic.title, item.title, material.name]
                    .map((part) => (typeof part === 'string' ? part.trim() : ''))
                    .filter((part, index, all) => Boolean(part) && all.indexOf(part) === index);
                const label = parts.join(' · ');
                if (!label || seen.has(label)) continue;
                seen.add(label);
                titles.push({ id: material.id, label });
            }
        }
    }
    return titles;
}
