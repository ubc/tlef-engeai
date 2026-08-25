/**
 * Imported Canvas rubric persistence — re-import behaviour and row locking
 *
 * Guards the two behaviours a staff member would notice only after losing work: what a
 * re-import does to the stored copy, and the row structure being immune to whatever the
 * browser sends.
 *
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @description: Regression coverage for Canvas rubric storage and cell editing.
 */

import { saveCanvasAssignmentContext, updateCanvasRubricCells } from '../writing-feedback-mongo';
import type { MongoDalContext } from '../mongo-context';
import type { CanvasImportedRubric, CanvasRubricRow } from '../../../writing-feedback/contracts';

function row(id: string, label: string, ratings: Array<[string, string]>): CanvasRubricRow {
    return {
        canvasCriterionId: id,
        label,
        description: '',
        ratings: ratings.map(([ratingId, ratingLabel]) => ({
            canvasRatingId: ratingId,
            label: ratingLabel,
            description: ''
        }))
    };
}

function contextFor(stored: unknown) {
    const findOne = jest.fn().mockResolvedValue(stored);
    const findOneAndUpdate = jest.fn().mockImplementation(async (_f, update) => update);
    const ctx = {
        db: { collection: () => ({ findOne, findOneAndUpdate }) },
        idGenerator: { uniqueIDGenerator: (s: string) => s }
    } as unknown as MongoDalContext;
    return { ctx, findOne, findOneAndUpdate };
}

const IMPORTED: CanvasImportedRubric = {
    title: 'Essay Rubric',
    rows: [row('_1', 'Thesis', [['r1', 'Full']]), row('_2', 'Evidence', [['r2', 'Strong']])],
    importedAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-08-01T00:00:00Z')
};

describe('saveCanvasAssignmentContext', () => {
    it('replaces the stored rubric with what Canvas currently holds', async () => {
        // The local copy mirrors Canvas, so Canvas is authoritative and a re-import refreshes
        // everything — including any local cell edits, which are superseded by design.
        const stored = {
            id: 'a1',
            courseId: 'c1',
            canvasRubric: { ...IMPORTED, rows: [{ ...row('_1', 'Locally renamed', [['r1', 'Edited']]) }] }
        };
        const { ctx, findOneAndUpdate } = contextFor(stored);

        await saveCanvasAssignmentContext(ctx, 'c1', 'a1', {
            rubric: { ...IMPORTED, title: 'Essay Rubric v2' },
            details: { importedAt: new Date() }
        });

        const written = findOneAndUpdate.mock.calls[0][1].$set.canvasRubric as CanvasImportedRubric;
        expect(written.title).toBe('Essay Rubric v2');
        expect(written.rows.map((r) => r.label)).toEqual(['Thesis', 'Evidence']);
        // The mirror carries no EngE-AI-only fields; a row is exactly what Canvas returned.
        expect(Object.keys(written.rows[0]).sort()).toEqual(
            ['canvasCriterionId', 'description', 'label', 'ratings']
        );
    });

    it('keeps the original import timestamp while advancing updatedAt', async () => {
        const stored = { id: 'a1', courseId: 'c1', canvasRubric: IMPORTED };
        const { ctx, findOneAndUpdate } = contextFor(stored);

        await saveCanvasAssignmentContext(ctx, 'c1', 'a1', {
            rubric: { ...IMPORTED, importedAt: new Date('2026-09-01T00:00:00Z') },
            details: { importedAt: new Date() }
        });

        const written = findOneAndUpdate.mock.calls[0][1].$set.canvasRubric as CanvasImportedRubric;
        expect(written.importedAt).toEqual(new Date('2026-08-01T00:00:00Z'));
        expect(written.updatedAt.getTime()).toBeGreaterThan(written.importedAt.getTime());
    });

    it('stores details but no rubric when Canvas has none', async () => {
        const { ctx, findOneAndUpdate } = contextFor({ id: 'a1', courseId: 'c1' });

        await saveCanvasAssignmentContext(ctx, 'c1', 'a1', {
            rubric: null,
            details: { descriptionText: 'Describe a device.', importedAt: new Date() }
        });

        const written = findOneAndUpdate.mock.calls[0][1].$set;
        expect(written.canvasRubric).toBeUndefined();
        expect(written.canvasDetails.descriptionText).toBe('Describe a device.');
    });
});

describe('updateCanvasRubricCells', () => {
    const stored = { id: 'a1', courseId: 'c1', canvasRubric: IMPORTED };

    it('saves cell text', async () => {
        const { ctx, findOneAndUpdate } = contextFor(stored);

        await updateCanvasRubricCells(ctx, 'c1', 'a1', [
            { ...row('_1', 'Claim', [['r1', 'Excellent']]), description: 'States a clear claim.' }
        ], 'user-9');

        const written = findOneAndUpdate.mock.calls[0][1].$set['canvasRubric.rows'] as CanvasRubricRow[];
        expect(written[0]).toMatchObject({ label: 'Claim', description: 'States a clear claim.' });
        expect(written[0].ratings[0].label).toBe('Excellent');
        // Rows absent from the request are left exactly as stored.
        expect(written[1]).toMatchObject({ canvasCriterionId: '_2', label: 'Evidence' });
        expect(findOneAndUpdate.mock.calls[0][1].$set['canvasRubric.updatedBy']).toBe('user-9');
    });

    it('refuses a row the stored rubric does not have', async () => {
        const { ctx } = contextFor(stored);
        await expect(
            updateCanvasRubricCells(ctx, 'c1', 'a1', [row('_invented', 'Smuggled row', [])], 'user-9')
        ).rejects.toThrow('Canvas rubric rows cannot be added or removed');
    });

    it('cannot drop a row by omitting it from the request', async () => {
        // Structure is rebuilt from storage, so a short payload edits rather than deletes.
        const { ctx, findOneAndUpdate } = contextFor(stored);
        await updateCanvasRubricCells(ctx, 'c1', 'a1', [row('_1', 'Thesis', [['r1', 'Full']])], 'user-9');

        const written = findOneAndUpdate.mock.calls[0][1].$set['canvasRubric.rows'] as CanvasRubricRow[];
        expect(written).toHaveLength(2);
    });

    it('returns null when the assignment has no imported rubric', async () => {
        const { ctx } = contextFor({ id: 'a1', courseId: 'c1' });
        await expect(updateCanvasRubricCells(ctx, 'c1', 'a1', [], 'user-9')).resolves.toBeNull();
    });
});
