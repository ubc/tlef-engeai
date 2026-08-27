import { parseGuidedPathwayFlagDateQuery } from '../mongo/admin-guided-pathway-flag-routes';

describe('Guided Pathway administrator date filters', () => {
    it('covers the full Vancouver summer day instead of ending at UTC midnight', () => {
        expect(parseGuidedPathwayFlagDateQuery('2026-08-08', false)?.toISOString()).toBe(
            '2026-08-08T07:00:00.000Z'
        );
        expect(parseGuidedPathwayFlagDateQuery('2026-08-08', true)?.toISOString()).toBe(
            '2026-08-09T06:59:59.999Z'
        );
    });

    it('uses the winter UTC offset for Vancouver date boundaries', () => {
        expect(parseGuidedPathwayFlagDateQuery('2026-01-08', false)?.toISOString()).toBe(
            '2026-01-08T08:00:00.000Z'
        );
        expect(parseGuidedPathwayFlagDateQuery('2026-01-08', true)?.toISOString()).toBe(
            '2026-01-09T07:59:59.999Z'
        );
    });

    it('handles a daylight-saving transition day without losing its evening', () => {
        expect(parseGuidedPathwayFlagDateQuery('2026-03-08', false)?.toISOString()).toBe(
            '2026-03-08T08:00:00.000Z'
        );
        expect(parseGuidedPathwayFlagDateQuery('2026-03-08', true)?.toISOString()).toBe(
            '2026-03-09T06:59:59.999Z'
        );
    });

    it('rejects impossible date-only values', () => {
        expect(parseGuidedPathwayFlagDateQuery('2026-02-30', true)).toBeNull();
    });
});
