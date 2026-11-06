/**
 * course-permissions.test.ts
 *
 * Pins who the frontend treats as course staff, which decides who is offered Student View.
 * It has to agree with the backend `isCourseStaff` that authorizes the request.
 */

import { isCourseStaff } from '../utils/course-permissions';
import type { activeCourse, AuthUser } from '../types';

const course = {
    instructors: [{ userId: 'prof-1' }],
    teachingAssistants: [{ userId: 'ta-1' }, 'ta-legacy']
} as unknown as activeCourse;

function user(userId: string, affiliation: string, isAdmin = false): AuthUser {
    return { userId, affiliation, isAdmin } as unknown as AuthUser;
}

describe('isCourseStaff', () => {
    it('includes faculty instructors of the course', () => {
        expect(isCourseStaff(course, user('prof-1', 'faculty'))).toBe(true);
    });

    it('includes teaching assistants, whatever their affiliation', () => {
        expect(isCourseStaff(course, user('ta-1', 'faculty'))).toBe(true);
        expect(isCourseStaff(course, user('ta-1', 'student'))).toBe(true);
    });

    it('includes teaching assistants stored in the legacy string format', () => {
        expect(isCourseStaff(course, user('ta-legacy', 'student'))).toBe(true);
    });

    it('includes platform admins', () => {
        expect(isCourseStaff(course, user('admin-1', 'staff', true))).toBe(true);
    });

    it('excludes students and faculty from outside the course', () => {
        expect(isCourseStaff(course, user('stu-1', 'student'))).toBe(false);
        expect(isCourseStaff(course, user('prof-2', 'faculty'))).toBe(false);
    });

    it('excludes a missing user', () => {
        expect(isCourseStaff(course, null)).toBe(false);
    });
});
