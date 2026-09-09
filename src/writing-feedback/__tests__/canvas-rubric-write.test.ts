/**
 * Canvas rubric write tests — addressing the instructor's own rubric, or refusing
 *
 * A student sees a grade fill into the Canvas rubric criterion by criterion, which is only
 * possible because import kept Canvas's own ids. Everything here is about what happens when
 * that mapping no longer holds: a criterion staff added in EngE-AI, or a rubric the instructor
 * rebuilt in Canvas after import. A partial rubric assessment is worse than none — it looks
 * complete to a student — so any gap refuses the whole write.
 *
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @description: Coverage for rubric_assessment payload construction and its refusals.
 */

import { planRubricWrite } from '../canvas-rubric-write';
import type {
    CanvasRubricIdMap,
    StaffFinalAssessment,
    WritingRubricDefinition
} from '../contracts';

const levels = [
    { id: 'weak', label: 'Weak', description: 'd', rank: 1 },
    { id: 'strong', label: 'Strong', description: 'd', rank: 2 }
];

function rubric(criteria: Array<{ id: string; points: number; cells?: Record<string, { min: number; max: number }> }>): WritingRubricDefinition {
    return {
        version: 1, status: 'approved', title: 'r',
        task: 't', audience: 'a', purpose: 'p',
        constraints: [], learningOutcomes: [], gradingIntent: 'g',
        updatedAt: new Date(), updatedBy: 'u1',
        levels,
        criteria: criteria.map((criterion) => ({
            id: criterion.id, label: criterion.id, description: 'd',
            points: criterion.points,
            ...(criterion.cells ? { cells: criterion.cells } : {})
        }))
    } as WritingRubricDefinition;
}

const analysisRubric = rubric([{ id: 'analysis', points: 20, cells: { weak: { min: 0, max: 9 }, strong: { min: 10, max: 20 } } }]);
const ids: CanvasRubricIdMap = { analysis: { criterionId: '_1234', ratingIds: { weak: 'r_lo', strong: 'r_hi' } } };

function assessment(criteria: Array<{ criterionId: string; points: number }>): StaffFinalAssessment {
    return { lens: 'technical', rubricVersion: 1, criteria, totalPoints: 0, maxPoints: 20 };
}

describe('planRubricWrite', () => {
    it('addresses each criterion by its canvas id and names the earned rating', () => {
        const plan = planRubricWrite({
            assessment: assessment([{ criterionId: 'analysis', points: 18 }]),
            rubric: analysisRubric,
            ids,
            liveCanvasCriterionIds: ['_1234']
        });

        expect(plan.refusal).toBeUndefined();
        expect(plan.payload).toEqual({ _1234: { points: 18, rating_id: 'r_hi' } });
    });

    it('picks the rating whose band contains the award', () => {
        const plan = planRubricWrite({
            assessment: assessment([{ criterionId: 'analysis', points: 3 }]),
            rubric: analysisRubric,
            ids,
            liveCanvasCriterionIds: ['_1234']
        });

        expect(plan.payload!._1234.rating_id).toBe('r_lo');
    });

    it('omits rating_id when the award falls in no band, rather than guessing a cell', () => {
        // An imported Canvas rubric can leave gaps between ratings; the points still stand.
        const gapped = rubric([{ id: 'analysis', points: 20, cells: { weak: { min: 0, max: 4 }, strong: { min: 15, max: 20 } } }]);
        const plan = planRubricWrite({
            assessment: assessment([{ criterionId: 'analysis', points: 9 }]),
            rubric: gapped,
            ids,
            liveCanvasCriterionIds: ['_1234']
        });

        expect(plan.payload!._1234).toEqual({ points: 9 });
    });

    it('refuses when a graded criterion has no canvas id', () => {
        const twoCriteria = rubric([
            { id: 'analysis', points: 20, cells: { weak: { min: 0, max: 9 }, strong: { min: 10, max: 20 } } },
            { id: 'extra', points: 5 }
        ]);
        const plan = planRubricWrite({
            assessment: assessment([
                { criterionId: 'analysis', points: 18 },
                { criterionId: 'extra', points: 2 }
            ]),
            rubric: twoCriteria,
            ids,
            liveCanvasCriterionIds: ['_1234']
        });

        expect(plan.refusal).toBe('unmapped_criterion');
        expect(plan.payload).toBeUndefined();
    });

    it('refuses when the live canvas rubric no longer holds a mapped criterion', () => {
        const plan = planRubricWrite({
            assessment: assessment([{ criterionId: 'analysis', points: 18 }]),
            rubric: analysisRubric,
            ids,
            liveCanvasCriterionIds: ['_9999']
        });

        expect(plan.refusal).toBe('stale_canvas_rubric');
        expect(plan.payload).toBeUndefined();
    });

    it('refuses outright when the assignment carries no id map', () => {
        const plan = planRubricWrite({
            assessment: assessment([{ criterionId: 'analysis', points: 18 }]),
            rubric: analysisRubric,
            liveCanvasCriterionIds: ['_1234']
        });

        expect(plan.refusal).toBe('no_id_map');
        expect(plan.payload).toBeUndefined();
    });
});
