/**
 * @fileoverview Coverage: a row is covered only by a published, supporting excerpt;
 * contrast and finding needs are not coverage rows; the fingerprint tracks material changes.
 */

import type { GroundingExcerpt, RetrievalNeed } from '../course-material-mentions';
import { buildCoverageRows, COVERAGE_NEEDS_VERSION, courseMaterialFingerprint, isCoverageCurrent } from '../material-coverage';

const needs: RetrievalNeed[] = [
    { id: 'stage:classify', kind: 'stage', label: 'Classification', query: 'q', stageId: 'classify' },
    { id: 'function:theme', kind: 'language_function', label: 'Theme', query: 'q' },
    { id: 'contrast:explanation', kind: 'contrast', label: 'explanation', query: 'q' }
];
const mention = { id: 'm1', label: 'Week 3 · Lecture · Descriptive reports' };
const excerpts: GroundingExcerpt[] = [
    { id: 'g1', text: 't', needIds: ['stage:classify'], score: 1, published: true, mention },
    { id: 'g2', text: 't', needIds: ['function:theme'], score: 1, published: false }
];

describe('buildCoverageRows', () => {
    it('marks a row covered only when a published excerpt supports it', () => {
        const rows = buildCoverageRows(needs, excerpts, new Map([
            ['stage:classify', new Set(['g1'])],
            ['function:theme', new Set(['g2'])]
        ]));
        expect(rows).toEqual([
            { needId: 'stage:classify', kind: 'stage', label: 'Classification', covered: true, materialLabels: [mention.label] },
            { needId: 'function:theme', kind: 'language_function', label: 'Theme', covered: false, materialLabels: [] }
        ]);
    });
});

describe('courseMaterialFingerprint', () => {
    const course = {
        topicOrWeekInstances: [{
            id: 't1',
            published: true,
            items: [{ id: 'i1', updatedAt: new Date('2026-09-01'), additionalMaterials: [{ id: 'a1' }] }]
        }]
    };

    it('changes when material changes and ignores unpublished topics', () => {
        const base = courseMaterialFingerprint(course);
        const edited = courseMaterialFingerprint({
            topicOrWeekInstances: [{ ...course.topicOrWeekInstances[0], items: [{ ...course.topicOrWeekInstances[0].items[0], updatedAt: new Date('2026-09-02') }] }]
        });
        const withDraft = courseMaterialFingerprint({
            topicOrWeekInstances: [...course.topicOrWeekInstances, { id: 't2', published: false, items: [{ id: 'i9', updatedAt: new Date() }] }]
        });
        expect(edited).not.toBe(base);
        expect(withDraft).toBe(base);
    });

    it('is current only for the same rubric version and fingerprint', () => {
        const coverage = { rubricVersion: 2, materialFingerprint: 'abc', needsVersion: COVERAGE_NEEDS_VERSION, computedAt: new Date(), rows: [] };
        expect(isCoverageCurrent(coverage, 2, 'abc')).toBe(true);
        expect(isCoverageCurrent(coverage, 3, 'abc')).toBe(false);
        expect(isCoverageCurrent(coverage, 2, 'xyz')).toBe(false);
        expect(isCoverageCurrent(undefined, 2, 'abc')).toBe(false);
    });
});

describe('coverage needs version (D-154)', () => {
    it('treats coverage cached before the needs version as out of date', () => {
        const old = { rubricVersion: 2, materialFingerprint: 'f', computedAt: new Date(), rows: [] };
        expect(isCoverageCurrent(old, 2, 'f')).toBe(false);
        expect(isCoverageCurrent({ ...old, needsVersion: COVERAGE_NEEDS_VERSION }, 2, 'f')).toBe(true);
    });
});
