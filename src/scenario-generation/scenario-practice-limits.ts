/**
 * Scenario Practice Limits — daily attempt budget and cooldown gates
 *
 * Pure helpers for practice-mode check-answer abuse mitigation. Counts only
 * today's practice responses (America/Vancouver calendar day by default).
 *
 * @author: @gatahcha
 * @date: 2026-07-15
 * @version: 1.0.0
 * @description: Daily attempt cap, cooldown, and feedback tier resolution for practice mode.
 */

import type { ScenarioStudentResponse, ScenarioSubQuestion } from '../types/shared';

export const PRACTICE_SOCRATIC_MAX_ATTEMPT = 2;
export const PRACTICE_DAILY_MAX_ATTEMPTS = 1;
export const PRACTICE_COOLDOWN_MS = 30_000;
export const PRACTICE_DAY_TIMEZONE = 'America/Vancouver';

export type PracticeFeedbackTier = 'socratic' | 'descriptive' | 'blocked';
export type PracticeBlockReason = 'cooldown' | 'daily_limit';

export interface PracticeSubmissionGateInput {
    todayPriorCount: number;
    lastSubmittedAtToday: Date | null;
    now: Date;
    timezone?: string;
}

export interface PracticeSubmissionGateResult {
    allowed: boolean;
    blockReason: PracticeBlockReason | null;
    tier: PracticeFeedbackTier | null;
    retryAfterMs: number | null;
    resetsAt: Date | null;
}

/** Calendar day key in the given IANA timezone (YYYY-MM-DD). */
export function getPracticeDayKey(date: Date, timezone: string = PRACTICE_DAY_TIMEZONE): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(date);
}

/** Next midnight in the practice timezone — when today's attempt budget resets. */
export function getNextPracticeDayResetAt(now: Date, timezone: string = PRACTICE_DAY_TIMEZONE): Date {
    const currentDay = getPracticeDayKey(now, timezone);
    let probe = now.getTime() + 60_000;
    const maxProbe = now.getTime() + 48 * 60 * 60 * 1000;
    while (probe < maxProbe && getPracticeDayKey(new Date(probe), timezone) === currentDay) {
        probe += 60_000;
    }
    let lo = now.getTime();
    let hi = probe;
    while (hi - lo > 1000) {
        const mid = Math.floor((lo + hi) / 2);
        if (getPracticeDayKey(new Date(mid), timezone) === currentDay) {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    return new Date(hi);
}

export function filterPracticeResponses(
    subQuestion: ScenarioSubQuestion,
    studentUserId: string
): ScenarioStudentResponse[] {
    return (subQuestion.studentResponses ?? []).filter(
        (r) => r.studentUserId === studentUserId && r.mode === 'practice'
    );
}

export function filterPracticeResponsesForDay(
    responses: ScenarioStudentResponse[],
    dayKey: string,
    timezone: string = PRACTICE_DAY_TIMEZONE
): ScenarioStudentResponse[] {
    return responses.filter((r) => getPracticeDayKey(new Date(r.submittedAt), timezone) === dayKey);
}

export function countPracticeAttemptsToday(
    subQuestion: ScenarioSubQuestion,
    studentUserId: string,
    now: Date,
    timezone: string = PRACTICE_DAY_TIMEZONE
): number {
    const dayKey = getPracticeDayKey(now, timezone);
    return filterPracticeResponsesForDay(filterPracticeResponses(subQuestion, studentUserId), dayKey, timezone)
        .length;
}

export function getLastPracticeAttemptAtToday(
    subQuestion: ScenarioSubQuestion,
    studentUserId: string,
    now: Date,
    timezone: string = PRACTICE_DAY_TIMEZONE
): Date | null {
    const dayKey = getPracticeDayKey(now, timezone);
    const today = filterPracticeResponsesForDay(
        filterPracticeResponses(subQuestion, studentUserId),
        dayKey,
        timezone
    );
    if (!today.length) return null;
    return today.reduce(
        (latest, r) => (new Date(r.submittedAt).getTime() > latest.getTime() ? new Date(r.submittedAt) : latest),
        new Date(today[0].submittedAt)
    );
}

export function resolvePracticeFeedbackTier(todayNextAttemptNumber: number): PracticeFeedbackTier {
    if (todayNextAttemptNumber <= PRACTICE_SOCRATIC_MAX_ATTEMPT) return 'socratic';
    if (todayNextAttemptNumber <= PRACTICE_DAILY_MAX_ATTEMPTS) return 'descriptive';
    return 'blocked';
}

export function checkPracticeSubmissionGate(input: PracticeSubmissionGateInput): PracticeSubmissionGateResult {
    const timezone = input.timezone ?? PRACTICE_DAY_TIMEZONE;
    const { todayPriorCount, lastSubmittedAtToday, now } = input;

    if (todayPriorCount >= PRACTICE_DAILY_MAX_ATTEMPTS) {
        return {
            allowed: false,
            blockReason: 'daily_limit',
            tier: null,
            retryAfterMs: null,
            resetsAt: getNextPracticeDayResetAt(now, timezone),
        };
    }

    if (lastSubmittedAtToday) {
        const elapsed = now.getTime() - lastSubmittedAtToday.getTime();
        if (elapsed < PRACTICE_COOLDOWN_MS) {
            return {
                allowed: false,
                blockReason: 'cooldown',
                tier: null,
                retryAfterMs: PRACTICE_COOLDOWN_MS - elapsed,
                resetsAt: null,
            };
        }
    }

    const todayNextAttemptNumber = todayPriorCount + 1;
    const tier = resolvePracticeFeedbackTier(todayNextAttemptNumber);
    if (tier === 'blocked') {
        return {
            allowed: false,
            blockReason: 'daily_limit',
            tier: null,
            retryAfterMs: null,
            resetsAt: getNextPracticeDayResetAt(now, timezone),
        };
    }

    return {
        allowed: true,
        blockReason: null,
        tier,
        retryAfterMs: null,
        resetsAt: null,
    };
}
