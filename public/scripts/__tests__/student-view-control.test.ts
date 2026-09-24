/**
 * student-view-control.test.ts
 *
 * The sidebar item is hidden from exactly the people the endpoint refuses, targets the
 * course-scoped route, and its confirmation tells the instructor real students are safe.
 *
 * Jest here is node with no jsdom, so the decisions are tested and the DOM wiring is left
 * to the browser pass.
 */

import {
    STUDENT_VIEW_CONFIRM_ACTION,
    STUDENT_VIEW_CONFIRM_COPY,
    shouldShowStudentViewControl,
    studentViewEnterPath
} from '../instructor/student-view-control';

describe('student view sidebar control', () => {
    it('is hidden from anyone who cannot manage the course, which is who the endpoint refuses', () => {
        expect(shouldShowStudentViewControl(false)).toBe(false);
    });

    it('is shown to a faculty instructor or platform admin', () => {
        expect(shouldShowStudentViewControl(true)).toBe(true);
    });

    it('targets the course-scoped enter endpoint', () => {
        expect(studentViewEnterPath('course-1')).toBe('/api/course/course-1/student-view/enter');
    });

    it('tells the instructor that real students are unaffected', () => {
        expect(STUDENT_VIEW_CONFIRM_COPY.body).toContain('affects real students');
    });

    it('matches the confirm action against the slug the modal actually resolves', () => {
        const slug = STUDENT_VIEW_CONFIRM_COPY.confirmText.toLowerCase().replace(/\s+/g, '-');
        expect(STUDENT_VIEW_CONFIRM_ACTION).toBe(slug);
    });
});
