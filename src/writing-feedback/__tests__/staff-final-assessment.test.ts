import { buildDefaultWritingAssignment } from '../default-rubric-profile';
import {
    buildStaffAssessmentDraft,
    buildStaffFinalAssessment,
    gradedLensFor,
    rubricSupportsStaffAssessment
} from '../staff-final-assessment';
import type { WritingAssignment } from '../contracts';

const assignment = buildDefaultWritingAssignment('course-1', 'assignment-1', 'Writing assignment');
const rubric = assignment.rubric;

function complete(points = 1) {
    return {
        rubricVersion: rubric.version,
        criteria: rubric.criteria.map((criterion) => ({ criterionId: criterion.id, points }))
    };
}

describe('staff-final rubric assessment', () => {
    it('computes authoritative totals from one bounded score per criterion', () => {
        expect(rubricSupportsStaffAssessment(rubric)).toBe(true);
        const assessment = buildStaffFinalAssessment(complete(1), rubric);
        expect(assessment.totalPoints).toBe(rubric.criteria.length);
        expect(assessment.maxPoints).toBe(rubric.criteria.reduce((sum, criterion) => sum + (criterion.points ?? 0), 0));
    });

    it('refuses incomplete, duplicate, stale, or over-maximum grading', () => {
        expect(() => buildStaffFinalAssessment({ ...complete(), rubricVersion: rubric.version + 1 }, rubric))
            .toThrow('outdated rubric');
        expect(() => buildStaffFinalAssessment({ ...complete(), criteria: complete().criteria.slice(1) }, rubric))
            .toThrow('every rubric criterion');
        expect(() => buildStaffFinalAssessment({
            ...complete(),
            criteria: [...complete().criteria, complete().criteria[0]]
        }, rubric)).toThrow('duplicate rubric criterion');
        expect(() => buildStaffFinalAssessment({
            ...complete(),
            criteria: complete().criteria.map((entry, index) => index === 0
                ? { ...entry, points: (rubric.criteria[0].points ?? 0) + 1 }
                : entry)
        }, rubric)).toThrow('exceeds');
    });
});

describe('partial grades saved as a draft', () => {
    it('keeps the criteria graded so far, in rubric order, without totals', () => {
        const [first, second] = rubric.criteria;
        const draft = buildStaffAssessmentDraft({
            rubricVersion: rubric.version,
            criteria: [{ criterionId: second.id, points: 1.004 }, { criterionId: first.id, points: 1 }]
        }, rubric, 'technical');
        expect(draft).toEqual({
            lens: 'technical',
            rubricVersion: rubric.version,
            criteria: [{ criterionId: first.id, points: 1 }, { criterionId: second.id, points: 1 }]
        });
        expect(draft).not.toHaveProperty('totalPoints');
    });

    it('holds each score to the final-grade rules', () => {
        const first = rubric.criteria[0];
        expect(() => buildStaffAssessmentDraft({ rubricVersion: rubric.version + 1, criteria: [{ criterionId: first.id, points: 1 }] }, rubric))
            .toThrow('outdated rubric');
        expect(() => buildStaffAssessmentDraft({ rubricVersion: rubric.version, criteria: [{ criterionId: 'not_in_rubric', points: 1 }] }, rubric))
            .toThrow('outside the approved rubric');
        expect(() => buildStaffAssessmentDraft({ rubricVersion: rubric.version, criteria: [{ criterionId: first.id, points: (first.points ?? 0) + 1 }] }, rubric))
            .toThrow('exceeds');
    });
});

describe('gradedLensFor', () => {
    it('grades a lab report on its technical rubric', () => {
        expect(gradedLensFor({ isLabReport: true } as WritingAssignment)).toBe('technical');
    });

    it('grades every other assignment on its writing rubric', () => {
        expect(gradedLensFor({ isLabReport: false } as WritingAssignment)).toBe('linguistic');
        expect(gradedLensFor({} as WritingAssignment)).toBe('linguistic');
    });
});

describe('the graded lens is recorded on the assessment', () => {
    it('stamps the lens it was built against', () => {
        const built = buildStaffFinalAssessment(
            complete(1),
            rubric,
            'technical'
        );
        expect(built.lens).toBe('technical');
        expect(built.totalPoints).toBe(rubric.criteria.length);
    });

    it('defaults to the writing lens so existing callers are unchanged', () => {
        const built = buildStaffFinalAssessment(
            complete(1),
            rubric
        );
        expect(built.lens).toBe('linguistic');
    });
});
