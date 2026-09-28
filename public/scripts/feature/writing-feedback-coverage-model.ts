/**
 * @fileoverview Pure view model for the rubric page's course-material coverage panel and
 * the one-time notice asking staff to confirm which stages are required.
 */

import type { MaterialCoverage } from './writing-feedback-shared.js';

/**
 * coverageRowViews - rows and an optional banner for the coverage panel.
 *
 * @param coverage - Cached coverage, or null when never computed
 * @param current - Whether it still matches the rubric version and materials
 * @returns Display rows and a recheck banner when stale or missing
 */
export function coverageRowViews(coverage: MaterialCoverage | null, current: boolean): {
    rows: Array<{ label: string; covered: boolean; detail: string }>;
    banner?: string;
} {
    const rows = (coverage?.rows ?? []).map((row) => ({
        label: row.label,
        covered: row.covered,
        detail: row.covered ? row.materialLabels.join('; ') : 'No supporting material found'
    }));
    if (!coverage) return { rows, banner: 'Course materials have not been checked for this rubric yet.' };
    return current ? { rows } : { rows, banner: 'Course materials or the rubric changed since the last check.' };
}

/**
 * shouldShowRequiredNotice - whether to show the one-time required-stages notice.
 *
 * @param rubricId - Assignment/rubric identity
 * @param rubricVersion - Approved rubric version
 * @param storage - Browser storage; may throw in private or blocked contexts
 * @returns True until staff dismiss it for this rubric version
 */
export function shouldShowRequiredNotice(rubricId: string, rubricVersion: number, storage: Pick<Storage, 'getItem'>): boolean {
    try {
        return storage.getItem(`wf-required-notice:${rubricId}:${rubricVersion}`) !== '1';
    } catch {
        return true;
    }
}
