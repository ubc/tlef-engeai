/**
 * Scenario Practice Canned Responses — gate messages when limits block LLM feedback
 *
 * @author: @gatahcha
 * @date: 2026-07-15
 * @version: 1.0.0
 * @description: Fixed copy for practice cooldown and daily attempt cap.
 */

/** Message when requests arrive too soon after the last persisted attempt (server gate). */
export function getPracticeCooldownMessage(_retryAfterSeconds: number): string {
    return 'You may want to reconsider your answer before asking for feedback again.';
}

/** Message when the daily attempt cap is reached (server gate). */
export function getPracticeDailyLimitMessage(_resetsAt: Date): string {
    return 'You have been requesting feedback on this part quite frequently today. Consider continuing in a full conversation with EngE-AI.';
}
