jest.mock('../global-user-mongo', () => ({
    addCourseToGlobalUser: jest.fn(),
    findGlobalUserByUserId: jest.fn()
}));
jest.mock('../course-user-mongo', () => ({
    createStudent: jest.fn(),
    findStudentByUserId: jest.fn()
}));
jest.mock('../course-mongo', () => ({
    getActiveCourse: jest.fn()
}));
jest.mock('../../../utils/logger', () => ({
    appLogger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));

import { enrollInstructorsOnCourse } from '../course-enrollment-mongo';
import { findGlobalUserByUserId } from '../global-user-mongo';
import { createStudent, findStudentByUserId } from '../course-user-mongo';
import { getActiveCourse } from '../course-mongo';
import type { MongoDalContext } from '../mongo-context';
import type { activeCourse, GlobalUser } from '../../../types/shared';

describe('enrollInstructorsOnCourse admin bypass', () => {
    const ctx = {} as MongoDalContext;
    const course = {
        id: 'course-1',
        courseName: 'TestCourse',
        instructors: []
    } as unknown as activeCourse;

    const adminWithStaffAffiliation = {
        userId: 'admin-1',
        name: 'Admin One',
        affiliation: 'staff',
        isAdmin: true,
        coursesEnrolled: []
    } as unknown as GlobalUser;

    const nonAdminStudent = {
        userId: 'student-1',
        name: 'Student One',
        affiliation: 'student',
        isAdmin: false,
        coursesEnrolled: []
    } as unknown as GlobalUser;

    beforeEach(() => {
        jest.clearAllMocks();
        (getActiveCourse as jest.Mock).mockResolvedValue(course);
        (findStudentByUserId as jest.Mock).mockResolvedValue(null);
    });

    it('does not skip a platform admin whose affiliation is not faculty', async () => {
        (findGlobalUserByUserId as jest.Mock).mockResolvedValue(adminWithStaffAffiliation);

        const result = await enrollInstructorsOnCourse(ctx, course, ['admin-1']);

        expect(result).toEqual(
            expect.arrayContaining([{ userId: 'admin-1', name: 'Admin One' }])
        );
        expect(createStudent).toHaveBeenCalled();
    });

    it('still skips a non-admin user whose affiliation is not faculty', async () => {
        (findGlobalUserByUserId as jest.Mock).mockResolvedValue(nonAdminStudent);

        const result = await enrollInstructorsOnCourse(ctx, course, ['student-1']);

        expect(result).not.toEqual(
            expect.arrayContaining([expect.objectContaining({ userId: 'student-1' })])
        );
        expect(createStudent).not.toHaveBeenCalled();
    });
});
