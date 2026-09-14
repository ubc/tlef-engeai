/**
 * @fileoverview Source guard for the assignment-type modal where no DOM test layer exists.
 */

import fs from 'fs';
import path from 'path';

const feature = (name: string) => fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'public', 'scripts', 'feature', name),
    'utf8'
);

describe('assignment type modal source contract', () => {
    const modal = feature('writing-feedback-assignment-type.ts');

    it('cannot be dismissed without an answer', () => {
        expect(modal).toContain('showCloseButton: false');
        expect(modal).toContain('closeOnOverlayClick: false');
        expect(modal).toContain('closeOnEscape: false');
    });

    it('asks the approved question with the two approved answers', () => {
        expect(modal).toContain('ASSIGNMENT_TYPE_QUESTION');
        expect(modal).toContain('WRITING_ASSIGNMENT_LABEL');
        expect(modal).toContain('LAB_REPORT_ASSIGNMENT_LABEL');
        const state = feature('writing-feedback-assignment-type-state.ts');
        expect(state).toContain("'What kind of assignment is this?'");
        expect(state).toContain("'Writing assignment'");
        expect(state).toContain("'Lab report assignment'");
    });

    it('saves through the one-time type route and fills the writing rubric for a lab report', () => {
        expect(modal).toContain('/type`');
        expect(modal).toContain('/rubric-draft/fill?lens=linguistic');
    });
});

describe('assignment list and rubric page source contract', () => {
    it('removes the Lab report checkbox from the assignment list', () => {
        const landing = feature('writing-feedback.ts');
        expect(landing).not.toContain('wf-lab-toggle');
        expect(landing).toContain('ensureAssignmentTypeChosen');
        expect(landing).toContain('oldestPendingAssignment');
    });

    it('asks for the type before the rubric page and never toggles the flag', () => {
        const rubric = feature('writing-feedback-rubric.ts');
        expect(rubric).toContain('ensureAssignmentTypeChosen');
        expect(rubric).not.toContain('/lab-report');
        expect(rubric).toContain('/technical-rubric/seed');
    });
});
