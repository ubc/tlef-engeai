/**
 * report-academic-period.ts
 * @description Derives UBC-style academic year and term from activeCourse.date.
 */

import type { AcademicPeriod } from './types';

/**
 * Maps a course start date to academic year + term buckets:
 * Sep–Dec → Winter T1, Jan–Apr → Winter T2, May–Aug → Summer.
 */
export function deriveAcademicPeriod(courseDate: Date | string): AcademicPeriod {
    const date = courseDate instanceof Date ? courseDate : new Date(courseDate);
    const month = date.getMonth() + 1; // 1–12
    const year = date.getFullYear();

    let academicYear: string;
    let termLabel: string;
    let displayLabel: string;

    if (month >= 9) {
        academicYear = `${year}-${year + 1}`;
        termLabel = 'Winter-T1';
        displayLabel = `Winter Term 1, ${year}–${year + 1}`;
    } else if (month >= 5) {
        academicYear = `${year - 1}-${year}`;
        termLabel = 'Summer';
        displayLabel = `Summer, ${year - 1}–${year}`;
    } else {
        academicYear = `${year - 1}-${year}`;
        termLabel = 'Winter-T2';
        displayLabel = `Winter Term 2, ${year - 1}–${year}`;
    }

    return { academicYear, termLabel, displayLabel };
}

/** ISO-style local date/time for title page footer. */
export function formatReportGeneratedAt(generatedAt: Date): string {
    return generatedAt.toLocaleString('en-CA', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short'
    });
}
