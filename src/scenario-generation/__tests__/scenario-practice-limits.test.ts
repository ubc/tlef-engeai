/**
 * Practice mode daily attempt budget and cooldown gates.
 */

import {
    checkPracticeSubmissionGate,
    countPracticeAttemptsToday,
    getPracticeDayKey,
    getNextPracticeDayResetAt,
    PRACTICE_COOLDOWN_MS,
    PRACTICE_DAILY_MAX_ATTEMPTS,
    resolvePracticeFeedbackTier,
} from '../scenario-practice-limits';
import type { ScenarioSubQuestion } from '../../types/shared';

const TZ = 'America/Vancouver';

function makeSubQuestion(responses: ScenarioSubQuestion['studentResponses']): ScenarioSubQuestion {
    return {
        subQuestionId: 'sub-1',
        subQuestionType: 'calculation',
        prompt: 'Calculate x',
        modelAnswer: '42',
        studentResponses: responses,
    };
}

describe('scenario-practice-limits', () => {
    describe('getPracticeDayKey', () => {
        it('returns YYYY-MM-DD in Vancouver timezone', () => {
            const key = getPracticeDayKey(new Date('2026-07-15T18:00:00Z'), TZ);
            expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        });
    });

    describe('resolvePracticeFeedbackTier', () => {
        it('uses socratic for attempts 1–2', () => {
            expect(resolvePracticeFeedbackTier(1)).toBe('socratic');
            expect(resolvePracticeFeedbackTier(2)).toBe('socratic');
        });

        it('uses descriptive for attempts 3–6', () => {
            expect(resolvePracticeFeedbackTier(3)).toBe('descriptive');
            expect(resolvePracticeFeedbackTier(6)).toBe('descriptive');
        });

        it('blocks attempt 7+', () => {
            expect(resolvePracticeFeedbackTier(7)).toBe('blocked');
        });
    });

    describe('checkPracticeSubmissionGate', () => {
        const now = new Date('2026-07-15T20:00:00Z');

        it('allows first attempt of the day', () => {
            const gate = checkPracticeSubmissionGate({
                todayPriorCount: 0,
                lastSubmittedAtToday: null,
                now,
                timezone: TZ,
            });
            expect(gate.allowed).toBe(true);
            expect(gate.tier).toBe('socratic');
        });

        it('uses descriptive on 3rd attempt', () => {
            const gate = checkPracticeSubmissionGate({
                todayPriorCount: 2,
                lastSubmittedAtToday: new Date(now.getTime() - 60_000),
                now,
                timezone: TZ,
            });
            expect(gate.allowed).toBe(true);
            expect(gate.tier).toBe('descriptive');
        });

        it('blocks 7th attempt same day with daily_limit', () => {
            const gate = checkPracticeSubmissionGate({
                todayPriorCount: PRACTICE_DAILY_MAX_ATTEMPTS,
                lastSubmittedAtToday: new Date(now.getTime() - 60_000),
                now,
                timezone: TZ,
            });
            expect(gate.allowed).toBe(false);
            expect(gate.blockReason).toBe('daily_limit');
            expect(gate.resetsAt).toBeInstanceOf(Date);
        });

        it('blocks within cooldown window', () => {
            const gate = checkPracticeSubmissionGate({
                todayPriorCount: 1,
                lastSubmittedAtToday: new Date(now.getTime() - 10_000),
                now,
                timezone: TZ,
            });
            expect(gate.allowed).toBe(false);
            expect(gate.blockReason).toBe('cooldown');
            expect(gate.retryAfterMs).toBeGreaterThan(0);
            expect(gate.retryAfterMs).toBeLessThanOrEqual(PRACTICE_COOLDOWN_MS);
        });

        it('allows after cooldown elapsed', () => {
            const gate = checkPracticeSubmissionGate({
                todayPriorCount: 1,
                lastSubmittedAtToday: new Date(now.getTime() - 35_000),
                now,
                timezone: TZ,
            });
            expect(gate.allowed).toBe(true);
        });
    });

    describe('countPracticeAttemptsToday', () => {
        it('counts only practice responses from today', () => {
            const today = new Date('2026-07-15T20:00:00Z');
            const yesterday = new Date('2026-07-14T20:00:00Z');
            const sub = makeSubQuestion([
                {
                    id: 'r1',
                    studentUserId: 'u1',
                    mode: 'practice',
                    studentAnswer: 'a',
                    feedback: 'f',
                    submittedAt: today,
                },
                {
                    id: 'r2',
                    studentUserId: 'u1',
                    mode: 'practice',
                    studentAnswer: 'b',
                    feedback: 'f',
                    submittedAt: yesterday,
                },
                {
                    id: 'r3',
                    studentUserId: 'u1',
                    mode: 'exam',
                    studentAnswer: 'c',
                    feedback: 'f',
                    grade: 5,
                    submittedAt: today,
                },
            ]);
            expect(countPracticeAttemptsToday(sub, 'u1', today, TZ)).toBe(1);
        });
    });

    describe('getNextPracticeDayResetAt', () => {
        it('returns a future instant', () => {
            const now = new Date('2026-07-15T20:00:00Z');
            const reset = getNextPracticeDayResetAt(now, TZ);
            expect(reset.getTime()).toBeGreaterThan(now.getTime());
        });
    });
});
