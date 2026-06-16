import { academicPeriodFromDocument, deriveAcademicPeriod } from '../../report-generation/report-contracts';

describe('academicPeriodFromDocument', () => {
    it('uses period title and dates in displayLabel', () => {
        const period = academicPeriodFromDocument(
            '2025W2',
            new Date('2026-01-06'),
            new Date('2026-04-30')
        );
        expect(period.displayLabel).toContain('2025W2');
        expect(period.displayLabel).toContain('2026');
    });

    it('falls back to deriveAcademicPeriod when no period on course', () => {
        const derived = deriveAcademicPeriod(new Date('2026-02-01'));
        expect(derived.termLabel).toBe('Winter-T2');
    });
});
