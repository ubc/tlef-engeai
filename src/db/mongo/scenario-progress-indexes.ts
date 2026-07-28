/**
 * Scenario Progress Indexes
 *
 * Index definitions for `{courseName}_scenario_progress` — student draft answers only.
 *
 * @author: @gatahcha
 * @date: 2026-07-21
 * @version: 1.0.0
 * @description: Scenario progress MongoDB index list and createIndex helpers.
 */

import type { Collection } from 'mongodb';
import { appLogger } from '../../utils/logger';

/** Complete initial index list for the scenario progress collection. */
export const SCENARIO_PROGRESS_INDEXES = [
    {
        keys: { userId: 1, questionId: 1, mode: 1 },
        options: { name: 'user_question_mode_unique', unique: true, background: true },
    },
] as const;

/**
 * createScenarioProgressIndexes — best-effort index creation; failures are logged, never thrown.
 */
export async function createScenarioProgressIndexes(
    collection: Collection,
    courseName: string
): Promise<void> {
    try {
        for (const index of SCENARIO_PROGRESS_INDEXES) {
            await collection.createIndex(index.keys as Record<string, 1>, index.options as any);
        }
    } catch (error) {
        appLogger.warn(`[scenario-progress] Index creation warning for ${courseName}:`, error);
    }
}
