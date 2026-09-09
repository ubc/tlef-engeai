/**
 * Rubric provenance tests — which grid a lens starts from, and what auto-fill may do to it
 *
 * Provenance is per lens. A lab report's Canvas rubric is its technical marking scheme, while
 * its writing lens always keeps the three metafunctions: a lab handout describes an experiment,
 * not linguistic expectations. These pin that split, because a single assignment-wide
 * `rubricSource` silently disabled the writing lens's auto-fill whenever Canvas seeded anything.
 *
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @description: Coverage for per-lens grid provenance and the merge rules it selects.
 */

import { autofillMergeRules, gridSourceFor } from '../rubric-autofill';
import { routeRubricsForLabReport } from '../rubric-seed';
import { buildDefaultWritingRubric } from '../default-rubric-profile';
import { buildLabReportRubric } from '../lab-report-profile';
import type { WritingAssignment } from '../contracts';

const assignment = (over: Partial<WritingAssignment>): WritingAssignment =>
    ({ isLabReport: false, rubricSource: 'internal_profile', ...over } as WritingAssignment);

describe('gridSourceFor', () => {
    it('reports canvas for a Canvas-seeded technical rubric', () => {
        expect(gridSourceFor(
            assignment({ isLabReport: true, technicalRubricSource: 'canvas' }), 'technical'
        )).toBe('canvas');
    });

    it('reports apsc182 for a built-in technical rubric', () => {
        expect(gridSourceFor(
            assignment({ isLabReport: true, technicalRubricSource: 'builtin' }), 'technical'
        )).toBe('apsc182');
    });

    it('treats an unset technical source as the department form', () => {
        expect(gridSourceFor(assignment({ isLabReport: true }), 'technical')).toBe('apsc182');
    });

    it('keeps a lab report writing lens on the metafunctions even when Canvas seeded the technical rubric', () => {
        expect(gridSourceFor(
            assignment({ isLabReport: true, technicalRubricSource: 'canvas', rubricSource: 'canvas' }), 'linguistic'
        )).toBe('metafunctions');
    });

    it('reports metafunctions for a manually created writing assignment', () => {
        expect(gridSourceFor(assignment({}), 'linguistic')).toBe('metafunctions');
    });

    it('reports canvas for a plain assignment carrying a Canvas rubric', () => {
        expect(gridSourceFor(assignment({ rubricSource: 'canvas' }), 'linguistic')).toBe('canvas');
    });
});

describe('autofillMergeRules', () => {
    it('locks the three metafunctions but lets auto-fill write their meaning', () => {
        expect(autofillMergeRules('metafunctions'))
            .toEqual({ mayAddRows: false, mayWriteRow: true, mayWriteCells: true });
    });

    it('never revises an instructor rubric', () => {
        expect(autofillMergeRules('canvas'))
            .toEqual({ mayAddRows: false, mayWriteRow: false, mayWriteCells: false });
    });

    it('lets the department form keep its rows while its cells are written for this lab', () => {
        expect(autofillMergeRules('apsc182'))
            .toEqual({ mayAddRows: false, mayWriteRow: false, mayWriteCells: true });
    });
});

describe('routeRubricsForLabReport', () => {
    const imported = {
        shape: {
            criteria: [{ id: 'analysis', label: 'Analysis', description: 'Quality of analysis', points: 20, cells: {} }],
            levels: [
                { id: 'weak', label: 'Weak', description: 'Little analysis', rank: 1 },
                { id: 'strong', label: 'Strong', description: 'Full analysis', rank: 2 }
            ]
        }
    };

    it('seeds the technical lens from the imported Canvas grid', () => {
        const routed = routeRubricsForLabReport({ canvasRubricImport: imported, actorUserId: 'u1' });
        expect(routed.technicalRubricSource).toBe('canvas');
        expect(routed.technicalDraft.criteria.map((c) => c.id)).toEqual(['analysis']);
        expect(routed.technicalDraft.status).toBe('draft');
    });

    it('restores the metafunctions on the writing lens', () => {
        const routed = routeRubricsForLabReport({ canvasRubricImport: imported, actorUserId: 'u1' });
        expect(routed.writingRubricSource).toBe('internal_profile');
        expect(routed.writingDraft.criteria.map((c) => c.id))
            .toEqual(buildDefaultWritingRubric('u1').criteria.map((c) => c.id));
    });

    it('falls back to the department form when nothing was imported', () => {
        const routed = routeRubricsForLabReport({ actorUserId: 'u1' });
        expect(routed.technicalRubricSource).toBe('builtin');
        expect(routed.technicalDraft.criteria.map((c) => c.id))
            .toEqual(buildLabReportRubric('u1').criteria.map((c) => c.id));
    });

    it('never returns an approved rubric, so approval stays the gate', () => {
        const routed = routeRubricsForLabReport({ canvasRubricImport: imported, actorUserId: 'u1' });
        expect(routed.technicalDraft.status).toBe('draft');
        expect(routed.writingDraft.status).toBe('draft');
    });
});
