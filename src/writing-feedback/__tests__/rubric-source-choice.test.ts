/**
 * Rubric source choice tests — where the graded grid comes from, and when replacing it asks
 *
 * Pins the state the rubric page's source choice is built from: the current source, the
 * imported Canvas rubric's size, and when replacing the grid needs staff to confirm (an
 * approved version exists, or staff edited the draft grid).
 *
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @description: Coverage for reading and switching the graded grid's source.
 */

import { buildDefaultWritingAssignment } from '../default-rubric-profile';
import { approveRubricDraft } from '../rubric-schema';
import type { ImportedRubricShape, WritingAssignment } from '../contracts';
import {
    RUBRIC_SOURCE_ERRORS,
    gradedGridState,
    gridMatchesSeed,
    isSourceChange,
    parseRubricSourceChoice,
    gridSourceKind,
    seedGrid
} from '../rubric-source-choice';

const canvasShape: ImportedRubricShape = {
    criteria: [
        { id: 'thesis', label: 'Thesis', description: 'Thesis description', points: 10, cells: {} },
        { id: 'evidence', label: 'Evidence', description: 'Evidence description', points: 15, cells: {} }
    ],
    levels: [
        { id: 'poor', label: 'Poor', description: 'Poor work', rank: 1 },
        { id: 'good', label: 'Good', description: 'Good work', rank: 2 }
    ]
};

function assignment(over: Partial<WritingAssignment> = {}): WritingAssignment {
    return { ...buildDefaultWritingAssignment('course-1', 'assignment-1', 'Essay'), ...over };
}

describe('parseRubricSourceChoice', () => {
    it('reads keep, canvas, and default, with absent meaning keep', () => {
        expect(parseRubricSourceChoice(undefined)).toBe('keep');
        expect(parseRubricSourceChoice('canvas')).toBe('canvas');
        expect(parseRubricSourceChoice('default')).toBe('default');
    });

    it('refuses anything else', () => {
        expect(() => parseRubricSourceChoice('upload')).toThrow(RUBRIC_SOURCE_ERRORS.invalid);
    });
});

describe('gradedGridState', () => {
    it('reports a default grid that nobody has edited as replaceable without asking', () => {
        expect(gradedGridState(assignment())).toEqual({
            lens: 'linguistic', current: 'builtin', replaceNeedsConfirmation: false
        });
    });

    it('reports the imported Canvas rubric\'s size', () => {
        const state = gradedGridState(assignment({
            canvasRubricImport: { shape: canvasShape, ids: {}, importedAt: new Date() }
        }));

        expect(state.canvas).toEqual({ criteria: 2, points: 25 });
    });

    it('asks before replacing a grid staff have edited', () => {
        const edited = assignment();
        edited.rubric = { ...edited.rubric, criteria: edited.rubric.criteria.map((c, i) => (i === 0 ? { ...c, points: 99 } : c)) };

        expect(gradedGridState(edited).replaceNeedsConfirmation).toBe(true);
    });

    it('asks before replacing a grid that has an approved version', () => {
        const approved = assignment();
        approved.rubric = approveRubricDraft(approved.rubric, 'staff-1');

        expect(gradedGridState(approved).replaceNeedsConfirmation).toBe(true);
    });

    it('describes the technical grid on a lab report', () => {
        expect(gradedGridState(assignment({ isLabReport: true, technicalRubricSource: 'canvas' })))
            .toMatchObject({ lens: 'technical', current: 'canvas' });
    });
});

describe('seedGrid and gridMatchesSeed', () => {
    it('seeds the Canvas grid, which then matches its own seed', () => {
        const fromCanvas = assignment({
            rubricSource: 'canvas',
            canvasRubricImport: { shape: canvasShape, ids: {}, importedAt: new Date() }
        });
        const grid = seedGrid(fromCanvas, 'linguistic', 'canvas');

        expect(grid.criteria.map((criterion) => criterion.id)).toEqual(['thesis', 'evidence']);
        expect(gridMatchesSeed({ ...fromCanvas.rubric, ...grid }, fromCanvas, 'linguistic')).toBe(true);
    });

    it('refuses to seed from Canvas when no rubric was imported', () => {
        expect(() => seedGrid(assignment(), 'linguistic', 'canvas')).toThrow(RUBRIC_SOURCE_ERRORS.noCanvas);
    });

    it('never treats an uploaded grid as unedited', () => {
        const uploaded = assignment({ rubricSource: 'uploaded' });

        expect(gridMatchesSeed(uploaded.rubric, uploaded, 'linguistic')).toBe(false);
    });
});

describe('isSourceChange and gridSourceKind', () => {
    it('counts only a choice naming a different source as a change', () => {
        expect(isSourceChange('keep', 'canvas')).toBe(false);
        expect(isSourceChange('canvas', 'canvas')).toBe(false);
        expect(isSourceChange('default', 'builtin')).toBe(false);
        expect(isSourceChange('default', 'canvas')).toBe(true);
        expect(isSourceChange('canvas', 'uploaded')).toBe(true);
    });

    it('records each choice as the source kind a rubric version keeps', () => {
        expect(gridSourceKind('default')).toBe('builtin');
        expect(gridSourceKind('canvas')).toBe('canvas');
        expect(gridSourceKind({ sourceId: 'material-1' })).toBe('uploaded');
    });

    it('always counts building from material as a change, even from material', () => {
        expect(isSourceChange({ sourceId: 'material-1' }, 'uploaded')).toBe(true);
    });
});
