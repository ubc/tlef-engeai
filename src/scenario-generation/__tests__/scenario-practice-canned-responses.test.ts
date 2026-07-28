/**
 * Canned practice gate messages.
 */

import { getPracticeCooldownMessage, getPracticeDailyLimitMessage } from '../scenario-practice-canned-responses';

describe('scenario-practice-canned-responses', () => {
    it('cooldown message encourages revising the answer', () => {
        expect(getPracticeCooldownMessage(20)).toMatch(/reconsider your answer/i);
    });

    it('daily limit message suggests conversation', () => {
        const msg = getPracticeDailyLimitMessage(new Date('2026-07-16T07:00:00Z'));
        expect(msg.toLowerCase()).toMatch(/conversation|frequently/);
    });
});
