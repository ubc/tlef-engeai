import { deriveAcademicPeriod, formatReportGeneratedAt } from '../report-academic-period';

describe('deriveAcademicPeriod', () => {
    it('maps September to Winter T1 of current academic year', () => {
        const period = deriveAcademicPeriod(new Date('2025-09-15'));
        expect(period.termLabel).toBe('Winter-T1');
        expect(period.academicYear).toBe('2025-2026');
        expect(period.displayLabel).toContain('Winter Term 1');
    });

    it('maps January to Winter T2', () => {
        const period = deriveAcademicPeriod(new Date('2026-02-01'));
        expect(period.termLabel).toBe('Winter-T2');
        expect(period.academicYear).toBe('2025-2026');
        expect(period.displayLabel).toContain('Winter Term 2');
    });

    it('maps June to Summer', () => {
        const period = deriveAcademicPeriod(new Date('2026-06-01'));
        expect(period.termLabel).toBe('Summer');
        expect(period.academicYear).toBe('2025-2026');
        expect(period.displayLabel).toContain('Summer');
    });
});

describe('formatReportGeneratedAt', () => {
    it('returns a non-empty localized string', () => {
        const formatted = formatReportGeneratedAt(new Date('2026-03-01T12:00:00Z'));
        expect(formatted.length).toBeGreaterThan(5);
    });
});
