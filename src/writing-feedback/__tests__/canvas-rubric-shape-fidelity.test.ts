/**
 * canvas-rubric-shape-fidelity.test.ts
 *
 * The question this answers: when a course's Canvas rubric is a different shape
 * from the built-in profile — two rows where the default has three, or two
 * columns where it has four — does the imported rubric survive, or does the
 * built-in profile quietly win?
 *
 * The existing mapping tests cover the mapper's rules. These cover the outcome
 * an instructor actually sees, end to end through the seed resolver.
 *
 * @author: @rdschrs
 */

import { canvasRubricToSeedShape } from '../canvas-rubric-mapping';
import { seedRubricForLens } from '../rubric-seed';
import { buildDefaultWritingRubric } from '../default-rubric-profile';
import type { CanvasImportedRubric } from '../contracts';

/** A Canvas rubric with `rows` criteria and `cols` shared ratings. */
function canvasRubric(rows: number, cols: number): CanvasImportedRubric {
    return {
        canvasRubricId: 'rubric-1',
        title: 'Instructor rubric from Canvas',
        importedAt: new Date('2026-09-01T00:00:00.000Z'),
        rows: Array.from({ length: rows }, (_, r) => ({
            canvasCriterionId: `_${r}`,
            label: `Canvas criterion ${r + 1}`,
            description: `What criterion ${r + 1} assesses.`,
            points: 10,
            ratings: Array.from({ length: cols }, (_, c) => ({
                canvasRatingId: `_${r}_${c}`,
                label: `Canvas level ${c + 1}`,
                description: `What level ${c + 1} looks like.`,
                points: c * 5
            }))
        }))
    };
}

function seedFrom(rubric: CanvasImportedRubric) {
    const shape = canvasRubricToSeedShape(rubric);
    return seedRubricForLens({
        lens: 'linguistic',
        actorUserId: 'staff-1',
        canvasRubric: shape ?? undefined
    });
}

describe('an imported Canvas rubric keeps its own shape', () => {
    it('the built-in default is three criteria by four levels, so a match would prove nothing', () => {
        const builtIn = buildDefaultWritingRubric('staff-1', new Date());
        expect(builtIn.criteria).toHaveLength(3);
        expect(builtIn.levels).toHaveLength(4);
    });

    it('two Canvas rows become two criteria, not the default three', () => {
        const seeded = seedFrom(canvasRubric(2, 4));
        expect(seeded.criteria).toHaveLength(2);
        expect(seeded.criteria.map((c) => c.label)).toEqual(['Canvas criterion 1', 'Canvas criterion 2']);
    });

    it('two Canvas ratings become two levels, not the default four', () => {
        const seeded = seedFrom(canvasRubric(3, 2));
        expect(seeded.levels).toHaveLength(2);
        expect(seeded.levels.map((l) => l.label)).toEqual(['Canvas level 1', 'Canvas level 2']);
    });

    it('a 2x2 Canvas rubric arrives as 2x2 with every cell filled', () => {
        const seeded = seedFrom(canvasRubric(2, 2));
        expect(seeded.criteria).toHaveLength(2);
        expect(seeded.levels).toHaveLength(2);
        const cells = seeded.criteria.flatMap((c) => seeded.levels.map((l) => c.cells?.[l.id]?.descriptor));
        expect(cells.every(Boolean)).toBe(true);
    });

    it('carries the Canvas row weight rather than inventing one', () => {
        const seeded = seedFrom(canvasRubric(2, 3));
        expect(seeded.criteria.map((c) => c.points)).toEqual([10, 10]);
    });

    it('the widest shape the contract allows survives intact', () => {
        const seeded = seedFrom(canvasRubric(10, 8));
        expect(seeded.criteria).toHaveLength(10);
        expect(seeded.levels).toHaveLength(8);
    });

    it('arrives as an unapproved draft, whatever its shape', () => {
        expect(seedFrom(canvasRubric(2, 2)).status).toBe('draft');
    });

    /*
     * The failure mode worth knowing about. A Canvas rubric whose richest row has
     * one rating cannot be a grid with columns, so the mapper refuses and the
     * built-in profile seeds instead — silently, from the instructor's side.
     */
    it('falls back to the built-in profile when the rubric has only one rating column', () => {
        const seeded = seedFrom(canvasRubric(2, 1));
        expect(canvasRubricToSeedShape(canvasRubric(2, 1))).toBeNull();
        expect(seeded.criteria).toHaveLength(3);
        expect(seeded.levels).toHaveLength(4);
    });

    it('falls back when the rubric has more than ten rows', () => {
        expect(canvasRubricToSeedShape(canvasRubric(11, 4))).toBeNull();
        expect(seedFrom(canvasRubric(11, 4)).criteria).toHaveLength(3);
    });
});
