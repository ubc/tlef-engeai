import { buildDefaultWritingAssignment } from '../default-rubric-profile';
import { buildStaffFinalAssessment, rubricSupportsStaffAssessment } from '../staff-final-assessment';

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
