/**
 * @fileoverview Pins which rubric seeds a new draft. A rubric imported from Canvas
 * always wins; otherwise the built-in profile for the lens is used.
 */

import { seedRubricForLens } from '../rubric-seed';
import type { WritingRubricDefinition } from '../contracts';

describe('seedRubricForLens', () => {
    it('seeds the three metafunctions for the writing rubric, lab report or not', () => {
        const seeded = seedRubricForLens({ lens: 'linguistic', actorUserId: 'u' });
        expect(seeded.criteria.map((c) => c.id))
            .toEqual(['organization', 'content', 'interpersonal_positioning']);
        expect(seeded.status).toBe('draft');
    });

    it('seeds the APSC 182 form for the technical rubric', () => {
        const seeded = seedRubricForLens({ lens: 'technical', actorUserId: 'u' });
        expect(seeded.criteria).toHaveLength(7);
        expect(seeded.criteria.map((c) => c.points)).toEqual([15, 5, 10, 45, 5, 5, 15]);
    });

    it('prefers an imported Canvas rubric over the profile', () => {
        const canvasRubric = {
            criteria: [{ id: 'imported', label: 'Imported', description: 'd', points: 20 }],
            levels: [
                { id: 'no_marks', label: 'No Marks', description: 'd', rank: 1 },
                { id: 'full_marks', label: 'Full Marks', description: 'd', rank: 2 }
            ]
        };
        const seeded = seedRubricForLens({
            lens: 'linguistic', actorUserId: 'u', canvasRubric
        });
        expect(seeded.criteria.map((c) => c.id)).toEqual(['imported']);
        expect(seeded.levels.map((l) => l.id)).toEqual(['no_marks', 'full_marks']);
        expect(seeded.status).toBe('draft');
    });

    it('falls back to the profile when the Canvas rubric has no criteria', () => {
        const seeded = seedRubricForLens({
            lens: 'linguistic', actorUserId: 'u',
            canvasRubric: { criteria: [], levels: [] }
        });
        expect(seeded.criteria).toHaveLength(3);
    });

    it('never seeds an approved rubric', () => {
        const seeded: WritingRubricDefinition = seedRubricForLens({
            lens: 'technical', actorUserId: 'u'
        });
        expect(seeded.status).toBe('draft');
        expect(seeded.approvedAt).toBeUndefined();
    });
});
