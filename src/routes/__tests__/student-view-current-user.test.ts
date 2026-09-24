/**
 * student-view-current-user.test.ts
 *
 * Pins what the browser is told about Student View: whether it is on and which course,
 * and nothing that would let student-facing code name the test student.
 */

import { buildStudentViewState } from '../route-user-management';

describe('buildStudentViewState', () => {
    it('is inactive with no session entry', () => {
        expect(buildStudentViewState(undefined)).toEqual({ active: false, courseId: null });
    });

    it('is active and names the course being previewed', () => {
        expect(
            buildStudentViewState({ courseId: 'course-1', testStudentUserId: 'ts-user-1' })
        ).toEqual({ active: true, courseId: 'course-1' });
    });

    it('never reports the test student id to the browser', () => {
        const state = buildStudentViewState({
            courseId: 'course-1',
            testStudentUserId: 'ts-user-1'
        });

        expect(JSON.stringify(state)).not.toContain('ts-user-1');
    });
});
