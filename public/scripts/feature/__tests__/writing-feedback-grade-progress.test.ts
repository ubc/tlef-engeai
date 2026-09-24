import { describeApprovalBlocker, gradeProgress, readPoints } from '../writing-feedback-grade-progress';

const criteria = [
    { id: 'organization', label: 'Organization', max: 10 },
    { id: 'evidence', label: 'Use of evidence', max: 25 },
    { id: 'accuracy', label: 'Technical accuracy', max: 10 },
    { id: 'clarity', label: 'Clarity', max: 5 }
];

describe('readPoints', () => {
    it('distinguishes blank, valid and out-of-range entries', () => {
        expect(readPoints('  ', 10)).toBeUndefined();
        expect(readPoints('7.5', 10)).toBe(7.5);
        expect(readPoints('0', 10)).toBe(0);
        expect(readPoints('11', 10)).toBeNull();
        expect(readPoints('-1', 10)).toBeNull();
        expect(readPoints('abc', 10)).toBeNull();
    });
});

describe('gradeProgress', () => {
    it('totals valid points and lists what is left in rubric order', () => {
        const progress = gradeProgress(criteria, { organization: '8', evidence: '17.005', clarity: '9' });
        expect(progress.graded.map((c) => c.id)).toEqual(['organization', 'evidence']);
        expect(progress.missing.map((c) => c.id)).toEqual(['accuracy']);
        expect(progress.invalid.map((c) => c.id)).toEqual(['clarity']);
        expect(progress.points).toBe(25.01);
        expect(progress.maxPoints).toBe(50);
        expect(progress.complete).toBe(false);
    });

    it('is complete only when every criterion has valid points', () => {
        expect(gradeProgress(criteria, { organization: '8', evidence: '17', accuracy: '9.5', clarity: '4' }).complete).toBe(true);
        expect(gradeProgress([], {}).complete).toBe(false);
    });
});

describe('describeApprovalBlocker', () => {
    it('names up to three missing criteria, then counts them', () => {
        expect(describeApprovalBlocker(gradeProgress(criteria, { organization: '8', evidence: '17' })))
            .toBe('Grade Technical accuracy and Clarity in Step 2 to approve.');
        expect(describeApprovalBlocker(gradeProgress(criteria, { organization: '8' })))
            .toBe('Grade Use of evidence, Technical accuracy and Clarity in Step 2 to approve.');
        expect(describeApprovalBlocker(gradeProgress(criteria, {})))
            .toBe('Grade the 4 remaining criteria in Step 2 to approve.');
    });

    it('asks for invalid points to be fixed first, and says nothing once grading is complete', () => {
        expect(describeApprovalBlocker(gradeProgress(criteria, { organization: '80' })))
            .toBe('Fix the points for Organization in Step 2 before approving.');
        expect(describeApprovalBlocker(gradeProgress(criteria, { organization: '8', evidence: '17', accuracy: '9', clarity: '4' })))
            .toBeUndefined();
    });
});
