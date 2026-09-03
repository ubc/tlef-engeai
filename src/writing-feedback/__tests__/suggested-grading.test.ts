/**
 * @fileoverview Pins the staff-only suggested grading. It is derived from a run and
 * the rubric version that produced it, never stored, and never released.
 */

import { deriveSuggestedGrading } from '../suggested-grading';
import type { WritingFeedbackRun, WritingRubricDefinition } from '../contracts';

const levels = [
    { id: 'weak', label: 'Weak', description: 'd', rank: 1 },
    { id: 'developing', label: 'Developing', description: 'd', rank: 2 },
    { id: 'proficient', label: 'Proficient', description: 'd', rank: 3 },
    { id: 'exemplary', label: 'Exemplary', description: 'd', rank: 4 }
];

const rubric = {
    version: 1, status: 'approved', title: 'T', task: 't', audience: 'a', purpose: 'p',
    constraints: ['c'], learningOutcomes: ['o'], gradingIntent: 'g',
    criteria: [
        { id: 'organization', label: 'Organization', description: 'd', points: 30,
          cells: { weak: { min: 0, max: 9 }, developing: { min: 10, max: 17 },
                   proficient: { min: 18, max: 25 }, exemplary: { min: 26, max: 30 } } },
        { id: 'content', label: 'Content', description: 'd', points: 40,
          cells: { weak: { min: 0, max: 11 }, developing: { min: 12, max: 23 },
                   proficient: { min: 24, max: 33 }, exemplary: { min: 34, max: 40 } } }
    ],
    levels, updatedAt: new Date(), updatedBy: 'u'
} as unknown as WritingRubricDefinition;

const run = {
    id: 'r1', courseId: 'c', assignmentId: 'a', submissionId: 's',
    profileVersion: 'p', rubricVersion: 1,
    result: {
        criteria: [
            { criterion: 'organization', suggestedLevel: 'proficient', evidence: [],
              explanation: 'Sections follow a usable order.', confidence: 0.8 },
            { criterion: 'content', suggestedLevel: 'exemplary', evidence: [],
              explanation: 'Every detail earns its place.', confidence: 0.9 }
        ],
        strengths: [], revisionGoals: [], internalFlags: []
    },
    createdAt: new Date(), modelMetadata: { engine: 'e', promptVersion: 'v' }
} as unknown as WritingFeedbackRun;

describe('deriveSuggestedGrading', () => {
    it('reports the band of the level the model chose', () => {
        const grading = deriveSuggestedGrading(run, rubric);
        expect(grading.criteria[0]).toEqual({
            criterionId: 'organization', label: 'Organization', levelLabel: 'Proficient',
            min: 18, max: 25, reason: 'Sections follow a usable order.'
        });
    });

    it('totals the bands as a range', () => {
        const grading = deriveSuggestedGrading(run, rubric);
        expect(grading.totalMin).toBe(52);
        expect(grading.totalMax).toBe(65);
    });

    it('derives the band from the weight when the rubric authored none', () => {
        // A cell awards an inclusive range, so a derived band is the level's contiguous
        // slice of the weight and the suggested total reports as a span, not a figure.
        const ordinal = {
            ...rubric,
            criteria: [{ id: 'organization', label: 'Organization', description: 'd', points: 30 }]
        } as unknown as WritingRubricDefinition;
        const grading = deriveSuggestedGrading(run, ordinal);
        expect(grading.criteria[0].min).toBe(16);
        expect(grading.criteria[0].max).toBe(22);
        expect(grading.totalMin).toBeLessThan(grading.totalMax);
    });

    it('omits a criterion the rubric no longer has, without failing', () => {
        const trimmed = { ...rubric, criteria: [rubric.criteria[0]] } as WritingRubricDefinition;
        const grading = deriveSuggestedGrading(run, trimmed);
        expect(grading.criteria.map((c) => c.criterionId)).toEqual(['organization']);
        expect(grading.totalMax).toBe(25);
    });

    it('returns no points for an ordinal-only rubric', () => {
        const ordinal = {
            ...rubric,
            criteria: [{ id: 'organization', label: 'Organization', description: 'd' }]
        } as unknown as WritingRubricDefinition;
        const grading = deriveSuggestedGrading(run, ordinal);
        expect(grading.criteria).toHaveLength(0);
        expect(grading.totalMax).toBe(0);
    });

    it('never exposes the model confidence', () => {
        const grading = deriveSuggestedGrading(run, rubric);
        expect(JSON.stringify(grading)).not.toContain('confidence');
    });
});
