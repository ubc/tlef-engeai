/**
 * Canvas-imported assignment creation — where the rubric draft comes from
 *
 * Pins the wiring between a Canvas rubric and the assignment it seeds. This is the step that
 * decides whether a staff member opening a freshly imported assignment sees their own rubric
 * or the built-in profile, and nothing else covers it.
 *
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @description: Regression coverage for rubric seeding on Canvas assignment creation.
 */

import type { Db } from 'mongodb';
import { createCanvasWritingAssignment } from '../writing-feedback-mongo';
import type { MongoDalContext } from '../mongo-context';
import type { ImportedRubricShape } from '../../../writing-feedback/rubric-seed';
import type { WritingAssignment } from '../../../writing-feedback/contracts';

function contextFor(): { ctx: MongoDalContext; inserted: () => WritingAssignment } {
    let saved: WritingAssignment | undefined;
    const api = {
        collection: () => ({
            // Index bootstrap runs before the insert; it only needs to not throw here.
            listIndexes: () => ({ toArray: async () => [] }),
            createIndex: async () => undefined,
            dropIndex: async () => undefined,
            insertOne: async (doc: WritingAssignment) => { saved = doc; return { insertedId: doc.id }; },
            findOne: async () => null
        })
    };
    return {
        ctx: { db: api as unknown as Db, idGenerator: { generate: () => 'generated' } } as unknown as MongoDalContext,
        inserted: () => saved!
    };
}

const CANVAS_GRID: ImportedRubricShape = {
    criteria: [
        { id: 'thesis', label: 'Thesis', description: 'States a claim.', points: 10 },
        { id: 'evidence', label: 'Evidence', description: 'Supports the claim.', points: 8 }
    ],
    levels: [
        { id: 'poor', label: 'Poor', description: 'Not yet.', rank: 1, points: 1 },
        { id: 'strong', label: 'Strong', description: 'Fully met.', rank: 2, points: 4 }
    ]
};

describe('createCanvasWritingAssignment rubric seeding', () => {
    it('seeds the draft from the Canvas rubric when one is supplied', async () => {
        const { ctx, inserted } = contextFor();

        await createCanvasWritingAssignment(ctx, 'c1', '101', 'Essay 1', undefined, undefined, CANVAS_GRID);

        const assignment = inserted();
        expect(assignment.rubric.criteria.map((c) => c.id)).toEqual(['thesis', 'evidence']);
        expect(assignment.rubric.levels.map((l) => l.id)).toEqual(['poor', 'strong']);
        expect(assignment.rubricSource).toBe('canvas');
    });

    it('never seeds an approved rubric', async () => {
        // Approval is the gate that lets a rubric reach the model; import must not open it.
        const { ctx, inserted } = contextFor();

        await createCanvasWritingAssignment(ctx, 'c1', '101', 'Essay 1', undefined, undefined, CANVAS_GRID);

        expect(inserted().rubric.status).toBe('draft');
        expect(inserted().rubric.approvedAt).toBeUndefined();
    });

    it('falls back to the built-in profile when Canvas supplied no usable rubric', async () => {
        const { ctx, inserted } = contextFor();

        await createCanvasWritingAssignment(ctx, 'c1', '101', 'Essay 1');

        const assignment = inserted();
        // The default profile's own criteria, not anything Canvas-shaped.
        expect(assignment.rubric.criteria.map((c) => c.id)).toContain('organization');
        expect(assignment.rubricSource).toBe('internal_profile');
    });

    it('keeps the Canvas mapping and title regardless of the rubric', async () => {
        const { ctx, inserted } = contextFor();

        await createCanvasWritingAssignment(ctx, 'c1', '101', 'Essay 1', 'Directions.', undefined, CANVAS_GRID);

        expect(inserted()).toMatchObject({ canvasAssignmentId: '101', title: 'Essay 1', instructions: 'Directions.' });
    });
});
