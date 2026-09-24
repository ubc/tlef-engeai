/**
 * catalog-map — CourseCatalogMap built from active-course-list
 *
 * @author: EngE-AI Team
 * @date: 2026-08-12
 * @version: 1.0.0
 * @description: Sorted course index used by all migrate ops.
 */

export interface CourseCollectionNames {
    users: string;
    flags: string;
    memoryAgent: string;
    scheduledTasks: string;
    scenarioQuestions: string;
    scenarioProgress: string;
    pathways: string;
}

export interface CourseCatalogEntry {
    courseId: string;
    courseName: string;
    collections: CourseCollectionNames;
}

export interface CourseCatalogMap {
    byId: Map<string, CourseCatalogEntry>;
    byName: Map<string, string>;
    ordered: CourseCatalogEntry[];
}

/**
 * resolveCollections - per-course collection names from the course doc, with `{courseName}_*` fallbacks.
 */
function resolveCollections(
    courseName: string,
    collections: Record<string, unknown> | undefined
): CourseCollectionNames {
    const c = collections ?? {};
    const str = (key: string, fallback: string): string =>
        typeof c[key] === 'string' && (c[key] as string).trim() ? (c[key] as string) : fallback;
    return {
        users: str('users', `${courseName}_users`),
        flags: str('flags', `${courseName}_flags`),
        memoryAgent: str('memoryAgent', `${courseName}_memory-agent`),
        scheduledTasks: str('scheduledTasks', `${courseName}_scheduled_tasks`),
        scenarioQuestions: str('scenarioQuestions', `${courseName}_scenario_questions`),
        scenarioProgress: str('scenarioProgress', `${courseName}_scenario_progress`),
        pathways: str('pathways', `${courseName}_pathways`),
    };
}

/**
 * buildCourseCatalogMap - sort walked course docs and fill id/name indexes.
 *
 * @param courses - Walked active-course-list documents
 * @returns Catalog map in courseName then id order
 */
export function buildCourseCatalogMap(courses: Record<string, unknown>[]): {
    map: CourseCatalogMap;
    skipped: { reason: string }[];
    duplicateNames: string[];
} {
    const skipped: { reason: string }[] = [];
    const eligible: CourseCatalogEntry[] = [];
    for (const doc of courses) {
        const courseId = typeof doc.id === 'string' ? doc.id.trim() : '';
        const courseName = typeof doc.courseName === 'string' ? doc.courseName.trim() : '';
        if (!courseId || !courseName) {
            skipped.push({ reason: 'missing id or courseName' });
            continue;
        }
        eligible.push({
            courseId,
            courseName,
            collections: resolveCollections(
                courseName,
                doc.collections && typeof doc.collections === 'object'
                    ? (doc.collections as Record<string, unknown>)
                    : undefined
            ),
        });
    }

    eligible.sort((a, b) => {
        const byName = a.courseName.localeCompare(b.courseName, undefined, { sensitivity: 'base' });
        return byName !== 0 ? byName : a.courseId.localeCompare(b.courseId);
    });

    // Index after sort so `ordered` is the display order used by later ops.

    const byId = new Map<string, CourseCatalogEntry>();
    const byName = new Map<string, string>();
    const duplicateNames: string[] = [];
    for (const entry of eligible) {
        byId.set(entry.courseId, entry);
        if (byName.has(entry.courseName)) {
            duplicateNames.push(entry.courseName);
            continue;
        }
        byName.set(entry.courseName, entry.courseId);
    }

    return { map: { byId, byName, ordered: eligible }, skipped, duplicateNames };
}

/**
 * printCatalogMap - courseId / courseName / per-course collection names, sorted.
 */
export function printCatalogMap(map: CourseCatalogMap, log: (line: string) => void): void {
    log(`== CourseCatalogMap (${map.ordered.length})  sorted by courseName ==`);
    map.ordered.forEach((entry, index) => {
        log(`  ${index + 1}. courseId=${entry.courseId}  courseName="${entry.courseName}"`);
        log(`       users=${entry.collections.users}`);
        log(`       flags=${entry.collections.flags}`);
        log(`       memoryAgent=${entry.collections.memoryAgent}`);
        log(`       scheduledTasks=${entry.collections.scheduledTasks}`);
        log(`       scenarioQuestions=${entry.collections.scenarioQuestions}`);
        log(`       scenarioProgress=${entry.collections.scenarioProgress}`);
        log(`       pathways=${entry.collections.pathways}`);
    });
}
