/**
 * Writing Feedback eval fixtures — synthetic first-year lab reports for the technical lens
 *
 * Every text here was written by the team for evaluation. None is student writing, so
 * the eval may print and store them freely.
 *
 * @author: @rdschrs
 * @date: 2026-10-03
 * @version: 1.0.0
 * @description: Fixed inputs for measuring technical-lens feedback with the live eval.
 */

import type { WritingAssignment } from '../../../contracts';
import { buildDefaultWritingAssignment } from '../../../default-rubric-profile';
import { buildLabReportRubric } from '../../../lab-report-profile';
import { approveRubricDraft } from '../../../rubric-schema';
import type { EvalFixture } from './eval-fixtures';

const APPROVED_AT = new Date('2026-10-03T00:00:00.000Z');

/**
 * buildLabEvalAssignment - an approved thermal-expansion lab report with both rubrics.
 *
 * @returns Lab-report assignment whose writing profile carries known course terms
 */
export function buildLabEvalAssignment(): WritingAssignment {
    const instructions = 'Write a lab report on the thermal expansion of a metal rod: introduction, method, results, discussion and conclusion.';
    const assignment = buildDefaultWritingAssignment('eval-course', 'eval-lab1', 'Lab 1: Thermal Expansion', instructions);
    assignment.isLabReport = true;
    assignment.rubric = approveRubricDraft({
        ...assignment.rubric,
        task: instructions,
        purpose: 'Report what was measured, what was found, and what it means.',
        audience: 'A technical reader who did not perform the experiment.',
        sflContext: {
            ...assignment.rubric.sflContext!,
            genreLabel: 'Lab report',
            genreState: 'staff_confirmed',
            task: instructions,
            purpose: 'Report what was measured, what was found, and what it means.',
            audience: 'A technical reader who did not perform the experiment.',
            field: 'Thermal expansion of metals.',
            tenor: 'Student writer reporting to a technical reader; objective.',
            mode: 'Written report, typed.',
            actualEvaluator: 'Course instructor and TA.',
            productionConditions: 'Individual report after a group experiment.',
            stages: [
                { id: 'introduction', label: 'Introduction', purpose: 'State the aim and the theory.', required: true, order: 1 },
                { id: 'method', label: 'Method', purpose: 'Describe what was done.', required: true, order: 2 },
                { id: 'results', label: 'Results', purpose: 'Report the measurements and calculations.', required: true, order: 3 },
                { id: 'discussion', label: 'Discussion', purpose: 'Interpret results and explain deviations.', required: true, order: 4 },
                { id: 'conclusion', label: 'Conclusion', purpose: 'State what the results show.', required: true, order: 5 }
            ],
            embeddedGenres: ['data commentary'],
            taskRequirements: ['SI units', 'One sample calculation'],
            learningOutcomes: ['Compare measured results against reported values.'],
            approvedGlossaryTerms: ['thermal expansion coefficient']
        }
    }, 'eval-instructor', APPROVED_AT);
    assignment.technicalRubric = approveRubricDraft({
        ...buildLabReportRubric('eval-instructor', APPROVED_AT),
        labContext: 'Students heated an aluminium rod from 20 °C to 80 °C and measured its change in length with a dial gauge.'
    }, 'eval-instructor', APPROVED_AT);
    return assignment;
}

/** Synthetic lab-report excerpts; expectations are the generic checks plus plain language. */
export const LAB_EVAL_FIXTURES: EvalFixture[] = [
    {
        id: 'lab-deviation-explained',
        materials: 'none',
        text: 'Results. The rod length increased by 1.31 ± 0.05 mm over a 60 °C temperature change. The measured thermal expansion coefficient was 2.6 × 10^-5 1/°C, which is 13% higher than the literature value of 2.3 × 10^-5 1/°C. Discussion. The higher value is likely caused by the clamp warming along with the rod, which added about 0.1 mm to the reading. This systematic error is larger than the uncertainty of the dial gauge, so it explains most of the difference. Conclusion. The rod expands linearly with temperature, and the coefficient agrees with the literature value once the clamp error is considered.',
        expect: {}
    },
    {
        id: 'lab-overclaim',
        materials: 'none',
        text: 'Results. The rod got longer by 1.4 mm when we heated it. Our coefficient was 2.8e-5, which proves the theory is correct. Discussion. The results were a bit off from the textbook because of human error. The experiment was very accurate overall. Conclusion. This experiment proves that all metals expand when heated.',
        expect: {}
    },
    {
        id: 'lab-missing-uncertainty',
        materials: 'none',
        text: 'Results. The change in length was 1.2 mm at 80 degrees. The coefficient was calculated as 2.0 × 10^-5. A graph of length against temperature is shown in Figure 1. Discussion. The value is lower than expected. Conclusion. Thermal expansion was observed, so the aim was met.',
        expect: {}
    }
];
