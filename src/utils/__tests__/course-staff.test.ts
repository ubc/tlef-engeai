import { canManageCourseRoster, isCourseStaff } from '../../utils/course-staff';
import type { activeCourse, GlobalUser } from '../../types/shared';

const course = {
    id: 'c1',
    instructors: [{ userId: 'fac-1', name: 'Faculty' }],
    teachingAssistants: [{ userId: 'ta-1', name: 'TA' }]
} as activeCourse;

describe('course-staff roster manage', () => {
    const faculty = { userId: 'fac-1', affiliation: 'faculty' } as GlobalUser;
    const ta = { userId: 'ta-1', affiliation: 'student' } as GlobalUser;
    const admin = { userId: 'admin-1', affiliation: 'faculty', isAdmin: true } as GlobalUser;

    it('treats TA as course staff but not roster manager', () => {
        expect(isCourseStaff(course, ta)).toBe(true);
        expect(canManageCourseRoster(course, ta)).toBe(false);
    });

    it('allows faculty instructor and admin to manage roster', () => {
        expect(canManageCourseRoster(course, faculty)).toBe(true);
        expect(canManageCourseRoster(course, admin)).toBe(true);
    });
});
