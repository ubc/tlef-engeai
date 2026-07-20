// collection-registry-mongo.ts
/**
 * collection-registry-mongo.ts
 * @author @gatahcha (refactor)
 * @description Resolves **physical** Mongo collection names for a course (users, flags, memory agent, scheduled tasks).
 *
 * Prefer reading names from the persisted `activeCourse.collections`; fall back to deterministic `{courseName}_*` strings for older data.
 */

import type { activeCourse } from '../../types/shared';
import { fetchActiveCourseDocByCourseName } from './active-course-queries-mongo';
import type { MongoDalContext } from './mongo-context';
import { appLogger } from '../../utils/logger';

/**
 * getCollectionNames
 *
 * Returns the four per-course collection identifiers and **memoizes** them on `ctx.collectionNamesCache`.
 *
 * @param ctx - MongoDalContext — provides `db`, `collectionNamesCache`, and related singleton state
 * @param courseName - string — logical course name (matches `activeCourse.courseName` and namespace prefix)
 *
 * @returns Promise<{ users, flags, memoryAgent, scheduledTasks }>
 *
 */
export async function getCollectionNames(
    ctx: MongoDalContext,
    courseName: string
): Promise<{ users: string; flags: string; memoryAgent: string; scheduledTasks: string; scenarioQuestions: string }> {
    if (ctx.collectionNamesCache.has(courseName)) {
        return ctx.collectionNamesCache.get(courseName)!;
    }

    try {
        const course = await fetchActiveCourseDocByCourseName(ctx.db, courseName);
        const c = course as activeCourse | null;
        if (
            c &&
            c.collections &&
            c.collections.users &&
            c.collections.flags &&
            c.collections.memoryAgent
        ) {
            const scheduledTasks = c.collections.scheduledTasks ?? `${courseName}_scheduled_tasks`;
            // SQ-001: computed fallback until ensureScenarioQuestionsCollection lazily provisions + persists the name.
            const scenarioQuestions = c.collections.scenarioQuestions ?? `${courseName}_scenario_questions`;
            const collectionNames = {
                users: c.collections.users,
                flags: c.collections.flags,
                memoryAgent: c.collections.memoryAgent,
                scheduledTasks,
                scenarioQuestions
            };
            ctx.collectionNamesCache.set(courseName, collectionNames);
            return collectionNames;
        }
    } catch (error) {
        appLogger.warn(
            `[MONGODB] Warning: Could not fetch course document for ${courseName}, using computed collection names:`,
            error
        );
    }

    const computedNames = {
        users: `${courseName}_users`,
        flags: `${courseName}_flags`,
        memoryAgent: `${courseName}_memory-agent`,
        scheduledTasks: `${courseName}_scheduled_tasks`,
        scenarioQuestions: `${courseName}_scenario_questions`
    };
    ctx.collectionNamesCache.set(courseName, computedNames);
    return computedNames;
}
