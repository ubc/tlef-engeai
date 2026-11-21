/**
 * Scenario Practice Canned Responses — gate messages when limits block LLM feedback
 *
 * @author: @gatahcha
 * @date: 2026-07-15
 * @version: 1.0.0
 * @description: Fixed copy for practice cooldown and daily attempt cap.
 */

import { PRACTICE_DAILY_MAX_ATTEMPTS } from './scenario-practice-limits';

/** Message when requests arrive too soon after the last persisted attempt (server gate). */
export function getPracticeCooldownMessage(_retryAfterSeconds: number): string {
    return 'You may want to reconsider your answer before asking for feedback again.';
}

/** Message when the daily attempt cap is reached (server gate). */
export function getPracticeDailyLimitMessage(_resetsAt: Date): string {
    return `You've used all ${PRACTICE_DAILY_MAX_ATTEMPTS} AI feedback requests for this part today. You can ask again after midnight (Pacific time), or keep working through it in a conversation with EngE-AI.`;
}
