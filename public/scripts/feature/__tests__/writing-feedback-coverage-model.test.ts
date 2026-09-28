/**
 * @fileoverview Coverage panel model and the one-time required-stages notice.
 */

import { coverageRowViews, shouldShowRequiredNotice } from '../writing-feedback-coverage-model';

describe('coverageRowViews', () => {
    it('shows each row with its material or a gap message', () => {
        const view = coverageRowViews({
            rubricVersion: 1, materialFingerprint: 'f', computedAt: '2026-09-28T00:00:00.000Z',
            rows: [
                { needId: 'stage:classify', kind: 'stage', label: 'Classification', covered: true, materialLabels: ['Week 3 · Lecture · Descriptive reports'] },
                { needId: 'function:theme', kind: 'language_function', label: 'Theme', covered: false, materialLabels: [] }
            ]
        }, true);
        expect(view.rows).toEqual([
            { label: 'Classification', covered: true, detail: 'Week 3 · Lecture · Descriptive reports' },
            { label: 'Theme', covered: false, detail: 'No supporting material found' }
        ]);
        expect(view.banner).toBeUndefined();
    });

    it('asks for a recheck when coverage is stale or missing', () => {
        expect(coverageRowViews(null, false).banner).toBe('Course materials have not been checked for this rubric yet.');
        expect(coverageRowViews({ rubricVersion: 1, materialFingerprint: 'f', computedAt: 'x', rows: [] }, false).banner)
            .toBe('Course materials or the rubric changed since the last check.');
    });
});

describe('shouldShowRequiredNotice', () => {
    it('shows once per rubric version', () => {
        const seen = new Map<string, string>();
        const storage = { getItem: (key: string) => seen.get(key) ?? null };
        expect(shouldShowRequiredNotice('r1', 2, storage)).toBe(true);
        seen.set('wf-required-notice:r1:2', '1');
        expect(shouldShowRequiredNotice('r1', 2, storage)).toBe(false);
    });

    it('survives storage that throws', () => {
        expect(shouldShowRequiredNotice('r1', 2, { getItem: () => { throw new Error('blocked'); } })).toBe(true);
    });
});
