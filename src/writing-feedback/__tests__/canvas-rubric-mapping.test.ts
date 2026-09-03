/**
 * Canvas rubric mapping tests — the grid a Canvas rubric becomes, and when it refuses
 *
 * The mapping carries the only real judgment in Canvas rubric import: Canvas defines ratings
 * per criterion while the grid has shared columns, and the two do not line up on their own.
 * These cover the alignment rule, the schema limits that make a rubric unseedable, and the
 * text substitutions that keep a mapped rubric valid.
 *
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @description: Regression coverage for Canvas-rubric-to-grid mapping.
 */

import { CANVAS_IMPORT_PLACEHOLDERS, canvasRubricToSeedShape, mapCanvasRubric } from '../canvas-rubric-mapping';
import { writingRubricDraftInputSchema } from '../rubric-schema';
import { buildDefaultWritingRubric } from '../default-rubric-profile';
import { seedRubricForLens } from '../rubric-seed';
import type { CanvasImportedRubric, CanvasRubricRow } from '../contracts';

function rubric(rows: CanvasRubricRow[]): CanvasImportedRubric {
    return { title: 'Essay Rubric', rows, importedAt: new Date('2026-08-24T00:00:00Z') };
}

function row(label: string, ratings: Array<[string, number]>, points?: number): CanvasRubricRow {
    return {
        canvasCriterionId: `_${label.toLowerCase()}`,
        label,
        description: `${label} description`,
        ...(points !== undefined ? { points } : {}),
        // Canvas returns ratings best-first; the mapper must not depend on that order.
        ratings: ratings.map(([ratingLabel, ratingPoints]) => ({
            canvasRatingId: `r_${ratingLabel}`,
            label: ratingLabel,
            description: `${ratingLabel} descriptor`,
            points: ratingPoints
        }))
    };
}

const FULL_SCALE: Array<[string, number]> = [['Excellent', 4], ['Good', 3], ['Fair', 2], ['Poor', 1]];

describe('canvasRubricToSeedShape', () => {
    it('maps a uniform Canvas rubric to a full grid with no empty cells', () => {
        const shape = canvasRubricToSeedShape(rubric([
            row('Thesis', FULL_SCALE, 10),
            row('Evidence', FULL_SCALE, 8)
        ]))!;

        expect(shape.criteria.map((c) => c.id)).toEqual(['thesis', 'evidence']);
        expect(shape.criteria.map((c) => c.points)).toEqual([10, 8]);
        // Ranks run worst to best regardless of the order Canvas listed the ratings in.
        expect(shape.levels.map((l) => [l.label, l.rank])).toEqual([
            ['Poor', 1], ['Fair', 2], ['Good', 3], ['Excellent', 4]
        ]);
        for (const criterion of shape.criteria) {
            expect(Object.keys(criterion.cells ?? {})).toHaveLength(4);
        }
    });

    it('produces a rubric the draft schema accepts', () => {
        // The mapper's output is fed straight into a draft, so it has to validate as one.
        const shape = canvasRubricToSeedShape(rubric([row('Thesis', FULL_SCALE, 10)]))!;
        const draft = { ...buildDefaultWritingRubric('user-1'), ...shape };
        const parsed = writingRubricDraftInputSchema.safeParse(draft);
        expect(parsed.success).toBe(true);
    });

    it('leaves the strongest columns empty for a row carrying fewer ratings', () => {
        const shape = canvasRubricToSeedShape(rubric([
            row('Thesis', FULL_SCALE),
            row('Mechanics', [['Fair', 2], ['Poor', 1]])
        ]))!;

        const mechanics = shape.criteria.find((c) => c.id === 'mechanics')!;
        // Aligned from the weakest end: rank 1 and 2 filled, 3 and 4 left for staff.
        expect(Object.keys(mechanics.cells ?? {}).sort()).toEqual(['fair', 'poor']);
        expect(shape.levels).toHaveLength(4);
    });

    it('carries the rating points into a single-value band', () => {
        const shape = canvasRubricToSeedShape(rubric([row('Thesis', FULL_SCALE)]))!;
        const cells = shape.criteria[0].cells!;
        // A Canvas rating is one value, not a range, so the band has no width.
        expect(cells.poor).toMatchObject({ min: 1, max: 1 });
        expect(cells.excellent).toMatchObject({ min: 4, max: 4, descriptor: 'Excellent descriptor' });
    });

    it('never repeats a name as its own description', () => {
        // Canvas usually omits long_description. Echoing the name would print the same words
        // twice in the editor, which reads as a bug rather than as something to fill in.
        const blank = row('Thesis', FULL_SCALE);
        blank.description = '';
        blank.ratings.forEach((rating) => { rating.description = ''; });
        const shape = canvasRubricToSeedShape(rubric([blank]))!;

        expect(shape.criteria[0].description).toBe(CANVAS_IMPORT_PLACEHOLDERS.criterionDescription);
        expect(shape.criteria[0].description).not.toBe(shape.criteria[0].label);
        for (const level of shape.levels) {
            expect(level.description).toBe(CANVAS_IMPORT_PLACEHOLDERS.levelDescription);
            expect(level.description).not.toBe(level.label);
        }
    });

    it('leaves a cell descriptor unset when Canvas supplied none', () => {
        // `descriptor` is optional and the grid already prompts for it, so an absent descriptor
        // is the honest state — repeating the rating name would echo the column header.
        const blank = row('Thesis', FULL_SCALE);
        blank.ratings.forEach((rating) => { rating.description = ''; });
        const shape = canvasRubricToSeedShape(rubric([blank]))!;

        const cells = shape.criteria[0].cells!;
        expect(Object.keys(cells)).toHaveLength(4);
        expect(Object.values(cells).every((cell) => cell.descriptor === undefined)).toBe(true);
        // The band still carries the points Canvas did supply.
        expect(cells.excellent).toMatchObject({ min: 4, max: 4 });
    });

    it('still keeps a descriptor Canvas did supply', () => {
        const shape = canvasRubricToSeedShape(rubric([row('Thesis', FULL_SCALE)]))!;
        expect(shape.criteria[0].cells!.excellent.descriptor).toBe('Excellent descriptor');
    });

    it('derives unique slugs when two rows share a name', () => {
        const shape = canvasRubricToSeedShape(rubric([
            row('Analysis', FULL_SCALE),
            { ...row('Analysis', FULL_SCALE), canvasCriterionId: '_analysis_2' }
        ]))!;
        expect(shape.criteria.map((c) => c.id)).toEqual(['analysis', 'analysis_2']);
    });

    it('falls back to a generated slug when a name cannot produce one', () => {
        const shape = canvasRubricToSeedShape(rubric([row('1.', FULL_SCALE)]))!;
        expect(shape.criteria[0].id).toMatch(/^[a-z][a-z0-9_]*$/);
        expect(shape.criteria[0].label).toBe('1.');
    });

    describe('refuses a rubric the grid contract cannot hold', () => {
        it('returns null past ten criteria', () => {
            const rows = Array.from({ length: 11 }, (_, i) => row(`Criterion ${i + 1}`, FULL_SCALE));
            expect(canvasRubricToSeedShape(rubric(rows))).toBeNull();
        });

        it('returns null past eight levels', () => {
            const nine: Array<[string, number]> = Array.from({ length: 9 }, (_, i) => [`L${i}`, i]);
            expect(canvasRubricToSeedShape(rubric([row('Thesis', nine)]))).toBeNull();
        });

        it('returns null when no criterion offers two ratings', () => {
            expect(canvasRubricToSeedShape(rubric([row('Complete', [['Done', 1]])]))).toBeNull();
        });

        it('returns null for an absent or empty rubric', () => {
            expect(canvasRubricToSeedShape(null)).toBeNull();
            expect(canvasRubricToSeedShape(undefined)).toBeNull();
            expect(canvasRubricToSeedShape(rubric([]))).toBeNull();
        });
    });
});

describe('seeding a draft from a Canvas rubric', () => {
    it('replaces the built-in grid but keeps the profile’s surrounding fields', () => {
        const shape = canvasRubricToSeedShape(rubric([row('Thesis', FULL_SCALE, 10)]))!;
        const seeded = seedRubricForLens({ lens: 'linguistic', actorUserId: 'user-1', canvasRubric: shape });
        const base = buildDefaultWritingRubric('user-1');

        expect(seeded.criteria.map((c) => c.id)).toEqual(['thesis']);
        // Task, audience, and purpose have no Canvas equivalent and come from the profile.
        expect(seeded.task).toBe(base.task);
        expect(seeded.audience).toBe(base.audience);
    });

    it('never arrives approved', () => {
        // Approval is the gate that lets a rubric reach the model; import must not open it.
        const shape = canvasRubricToSeedShape(rubric([row('Thesis', FULL_SCALE)]))!;
        const seeded = seedRubricForLens({ lens: 'linguistic', actorUserId: 'user-1', canvasRubric: shape });
        expect(seeded.status).toBe('draft');
        expect(seeded.approvedAt).toBeUndefined();
    });
});

/** A rubric of the given shape: `rows` criteria, each carrying `cols` ratings. */
function rubricWith(rows: number, cols: number): CanvasImportedRubric {
    const ratings: Array<[string, number]> = Array.from(
        { length: cols },
        (_, index) => [`Rating ${index + 1}`, index + 1] as [string, number]
    );
    return rubric(Array.from({ length: rows }, (_, index) => row(`Criterion ${index + 1}`, ratings, 10)));
}

describe('mapCanvasRubric reports why it refused', () => {
    it('names a rubric whose criteria offer only one rating', () => {
        const result = mapCanvasRubric(rubricWith(2, 1));
        expect(result.shape).toBeNull();
        expect(result.refusal).toBe('too_few_ratings');
    });

    it('names a rubric with more criteria than the grid allows', () => {
        const result = mapCanvasRubric(rubricWith(11, 4));
        expect(result.shape).toBeNull();
        expect(result.refusal).toBe('too_many_criteria');
    });

    it('names a rubric with more ratings than the grid allows', () => {
        const result = mapCanvasRubric(rubricWith(2, 9));
        expect(result.shape).toBeNull();
        expect(result.refusal).toBe('too_many_levels');
    });

    it('names an absent rubric', () => {
        expect(mapCanvasRubric(undefined).refusal).toBe('no_rubric');
    });

    it('reports no refusal when the rubric maps', () => {
        const result = mapCanvasRubric(rubricWith(3, 4));
        expect(result.shape).not.toBeNull();
        expect(result.refusal).toBeUndefined();
    });

    it('leaves canvasRubricToSeedShape behaving exactly as before', () => {
        expect(canvasRubricToSeedShape(rubricWith(2, 1))).toBeNull();
        expect(canvasRubricToSeedShape(rubricWith(3, 4))).not.toBeNull();
    });
});

describe('canvas rubric id map', () => {
    it('maps our criterion and level ids back to Canvas ids', () => {
        const mapped = mapCanvasRubric(rubric([row('Thesis', FULL_SCALE, 10)]));

        expect(mapped.shape).not.toBeNull();
        const criterionId = mapped.shape!.criteria[0].id;
        const levelIds = mapped.shape!.levels.map((level) => level.id);

        expect(mapped.ids![criterionId].criterionId).toBe('_thesis');
        // Levels are ordered weakest-first, matching buildCells.
        expect(mapped.ids![criterionId].ratingIds[levelIds[0]]).toBe('r_Poor');
        expect(mapped.ids![criterionId].ratingIds[levelIds[3]]).toBe('r_Excellent');
    });

    it('maps every criterion, not only the first', () => {
        const mapped = mapCanvasRubric(rubric([
            row('Thesis', FULL_SCALE, 10),
            row('Evidence', FULL_SCALE, 8)
        ]));

        expect(Object.keys(mapped.ids!)).toEqual(['thesis', 'evidence']);
        expect(mapped.ids!.evidence.criterionId).toBe('_evidence');
    });

    it('leaves a ragged row without ids for the columns it does not reach', () => {
        const mapped = mapCanvasRubric(rubric([
            row('Thesis', FULL_SCALE, 10),
            row('Evidence', [['Good', 3], ['Poor', 1]], 8)
        ]));

        const levelIds = mapped.shape!.levels.map((level) => level.id);
        expect(Object.keys(mapped.ids!.evidence.ratingIds)).toHaveLength(2);
        expect(mapped.ids!.evidence.ratingIds[levelIds[0]]).toBe('r_Poor');
        expect(mapped.ids!.evidence.ratingIds[levelIds[3]]).toBeUndefined();
    });

    it('returns no id map when the rubric is refused', () => {
        expect(mapCanvasRubric(null).ids).toBeUndefined();
        expect(mapCanvasRubric(rubric([row('Thesis', [['Only', 1]], 10)])).ids).toBeUndefined();
    });
});
