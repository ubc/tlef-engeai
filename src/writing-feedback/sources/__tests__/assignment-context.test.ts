/**
 * @fileoverview Pins the general analysis's assignment-material block: source order and labels,
 * the empty case, and the cap that cuts rather than fails.
 */

import { buildAssignmentContext } from '../assignment-context';
import type { WritingSourceMaterial } from '../../contracts';

function material(id: string, text: string, fileName = `${id}.pdf`): WritingSourceMaterial {
    return {
        id,
        courseId: 'course-1',
        assignmentId: 'assignment-1',
        kind: 'file',
        fileName,
        text,
        hasTables: false,
        characterCount: text.length,
        addedAt: new Date('2026-10-01T00:00:00.000Z'),
        addedBy: 'instructor-1'
    };
}

describe('buildAssignmentContext', () => {
    it('reports an empty context when the assignment has no material at all', () => {
        expect(buildAssignmentContext({}, [])).toEqual({ block: '', sourceCount: 0, empty: true, truncated: false });
    });

    it('labels instructions first, then each handout', () => {
        const context = buildAssignmentContext(
            { instructions: 'Write a lab report on pipe flow.' },
            [material('m1', 'Report sections: abstract, methods, results.', 'handout.pdf')]
        );
        expect(context.sourceCount).toBe(2);
        expect(context.truncated).toBe(false);
        expect(context.block.indexOf('Assignment instructions')).toBeLessThan(context.block.indexOf('handout.pdf'));
        expect(context.block).toContain('Report sections: abstract, methods, results.');
    });

    it('cuts at the cap and flags it instead of failing', () => {
        const context = buildAssignmentContext(
            { instructions: 'Short instructions.' },
            [material('m1', 'x'.repeat(500)), material('m2', 'never reached')],
            200
        );
        expect(context.truncated).toBe(true);
        expect(context.block.length).toBeLessThanOrEqual(200);
        expect(context.block).not.toContain('never reached');
    });
});
