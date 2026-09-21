/**
 * student-view-isolation.test.ts
 *
 * Pins the two existing behaviours Student View relies on for isolation: a test student
 * fails every staff predicate, which is what makes the staff APIs return 403 for it, and it
 * is enrolled in exactly one course, which is what makes every other course unreachable.
 */

import type { activeCourse, GlobalUser } from '../../types/shared';
import { canManageCourseRoster, isCourseStaff } from '../../utils/course-staff';

const course = {
    id: 'course-1',
    instructors: [{ userId: 'prof-1' }],
    teachingAssistants: [{ userId: 'ta-1' }]
} as unknown as activeCourse;

const testStudent = {
    name: 'Test student',
    userId: 'ts-user-1',
    puid: 'test-student:course-1:prof-1',
    affiliation: 'student',
    status: 'active',
    coursesEnrolled: ['course-1'],
    isTestStudent: true,
    testStudentOwnerUserId: 'prof-1'
} as unknown as GlobalUser;

describe('a test student is never staff', () => {
    it('fails every staff predicate, which is what makes staff APIs return 403', () => {
        expect(isCourseStaff(course, testStudent)).toBe(false);
        expect(canManageCourseRoster(course, testStudent)).toBe(false);
    });

    it('does not inherit its owner course staffing', () => {
        const ownedByInstructor = { ...testStudent, testStudentOwnerUserId: 'prof-1' } as GlobalUser;
        expect(isCourseStaff(course, ownedByInstructor)).toBe(false);
    });

    it('is enrolled in exactly one course, which is what blocks every other course', () => {
        expect(testStudent.coursesEnrolled).toEqual(['course-1']);
    });
});
