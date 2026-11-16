/**
 * @fileoverview Source guard for the retired assignment type: assignments are no longer typed,
 * so no page asks whether one is a writing assignment or a lab report, and staff choose the
 * feedback approach on the rubric page instead.
 */

import fs from 'fs';
import path from 'path';

const feature = (name: string) => fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'public', 'scripts', 'feature', name),
    'utf8'
);

describe('retired assignment type', () => {
    it('is never asked from the assignment list or the rubric page', () => {
        const landing = feature('writing-feedback.ts');
        const rubric = feature('writing-feedback-rubric.ts');
        [landing, rubric].forEach((source) => {
            expect(source).not.toContain('ensureAssignmentTypeChosen');
            expect(source).not.toContain('oldestPendingAssignment');
            expect(source).not.toContain('/type`');
        });
        expect(landing).not.toContain('wf-lab-toggle');
    });

    it('offers the feedback approach on the rubric page instead', () => {
        const rubric = feature('writing-feedback-rubric.ts');
        expect(rubric).toContain("createText('legend', 'Feedback approach')");
        expect(rubric).toContain('/analysis-mode`');
        // A legacy lab report keeps its technical rubric, which can still be re-seeded.
        expect(rubric).toContain('/technical-rubric/seed');
    });
});
