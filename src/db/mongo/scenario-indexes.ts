/**
 * Scenario Questions Indexes
 *
 * Discoverable index definitions and provisioning for `{courseName}_scenario_questions`.
 * Called from collection ensure / SQ-001 lazy migration.
 *
 * @author: @gatahcha
 * @date: 2026-07-14
 * @version: 1.0.0
 * @description: Scenario Questions MongoDB index list and createIndex helpers.
 */

import type { Collection } from 'mongodb';
import { appLogger } from '../../utils/logger';

/** Complete initial index list for the scenario questions collection. */
export const SCENARIO_QUESTION_INDEXES = [
    { keys: { id: 1 }, options: { name: 'id_unique', unique: true, background: true } },
    {
        keys: { topicOrWeekId: 1, status: 1, sortOrder: 1 },
        options: { name: 'chapter_status_sort', background: true },
    },
    { keys: { status: 1 }, options: { name: 'status', background: true } },
] as const;

/**
 * createScenarioQuestionIndexes — best-effort index creation; failures are logged, never thrown.
 */
export async function createScenarioQuestionIndexes(
    collection: Collection,
    courseName: string
): Promise<void> {
    try {
        for (const index of SCENARIO_QUESTION_INDEXES) {
            await collection.createIndex(index.keys as Record<string, 1>, index.options as any);
        }
    } catch (error) {
        appLogger.warn(`[scenario-questions] Index creation warning for ${courseName}:`, error);
    }
}
