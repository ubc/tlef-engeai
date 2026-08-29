jest.mock('../global-user-mongo', () => ({
    addCourseToGlobalUser: jest.fn(),
    findGlobalUserByUserId: jest.fn(),
    removeCourseFromGlobalUser: jest.fn()
}));
jest.mock('../course-user-mongo', () => ({
    createStudent: jest.fn(),
    findStudentByUserId: jest.fn()
}));
jest.mock('../course-mongo', () => ({
    getActiveCourse: jest.fn(),
    updateActiveCourse: jest.fn()
}));
jest.mock('../../../utils/logger', () => ({
    appLogger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));

import {
    enrollFacultyInstructorViaCourseCode,
    enrollInstructorsOnCourse,
    removeInstructorsFromCourse
} from '../course-enrollment-mongo';
import { findGlobalUserByUserId, removeCourseFromGlobalUser } from '../global-user-mongo';
import { createStudent, findStudentByUserId } from '../course-user-mongo';
import { getActiveCourse, updateActiveCourse } from '../course-mongo';
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

describe('enrollFacultyInstructorViaCourseCode', () => {
    const ctx = {} as MongoDalContext;
    const course = {
        id: 'course-1',
        courseName: 'TestCourse',
        instructors: [{ userId: 'fac-1', name: 'Lead Instructor' }]
    } as unknown as activeCourse;

    const newFaculty = {
        userId: 'fac-2',
        name: 'Co Instructor',
        puid: 'puid-fac-2',
        affiliation: 'faculty',
        isAdmin: false,
        coursesEnrolled: []
    } as unknown as GlobalUser;

    const listedFaculty = {
        userId: 'fac-1',
        name: 'Lead Instructor',
        puid: 'puid-fac-1',
        affiliation: 'faculty',
        isAdmin: false,
        coursesEnrolled: ['course-1']
    } as unknown as GlobalUser;

    const studentUser = {
        userId: 'student-1',
        name: 'Student One',
        puid: 'puid-student',
        affiliation: 'student',
        isAdmin: false,
        coursesEnrolled: []
    } as unknown as GlobalUser;

    beforeEach(() => {
        jest.clearAllMocks();
        (getActiveCourse as jest.Mock).mockResolvedValue(course);
        (findStudentByUserId as jest.Mock).mockResolvedValue(null);
    });

    it('adds a faculty user to instructors and persists the catalog row', async () => {
        (findGlobalUserByUserId as jest.Mock).mockResolvedValue(newFaculty);
        (updateActiveCourse as jest.Mock).mockResolvedValue({
            ...course,
            instructors: [
                { userId: 'fac-1', name: 'Lead Instructor' },
                { userId: 'fac-2', name: 'Co Instructor' }
            ]
        });

        const result = await enrollFacultyInstructorViaCourseCode(ctx, course, newFaculty);

        expect(updateActiveCourse).toHaveBeenCalledWith(ctx, 'course-1', {
            instructors: expect.arrayContaining([
                { userId: 'fac-1', name: 'Lead Instructor' },
                { userId: 'fac-2', name: 'Co Instructor' }
            ])
        });
        expect(createStudent).toHaveBeenCalled();
        expect(result.instructors).toEqual(
            expect.arrayContaining([expect.objectContaining({ userId: 'fac-2' })])
        );
    });

    it('is idempotent when the faculty user is already course staff', async () => {
        const result = await enrollFacultyInstructorViaCourseCode(ctx, course, listedFaculty);

        expect(result).toBe(course);
        expect(updateActiveCourse).not.toHaveBeenCalled();
        expect(findGlobalUserByUserId).not.toHaveBeenCalled();
    });

    it('rejects non-faculty callers', async () => {
        await expect(
            enrollFacultyInstructorViaCourseCode(ctx, course, studentUser)
        ).rejects.toThrow('Only faculty may join as instructor via course code');
        expect(updateActiveCourse).not.toHaveBeenCalled();
    });
});

describe('removeInstructorsFromCourse', () => {
    const ctx = {} as MongoDalContext;
    const course = {
        id: 'course-1',
        courseName: 'TestCourse',
        instructors: [
            { userId: 'fac-1', name: 'Amira' },
            { userId: 'admin-1', name: 'Admin One' }
        ]
    } as unknown as activeCourse;

    const facultyUser = {
        userId: 'fac-1',
        name: 'Amira',
        puid: 'puid-fac-1',
        affiliation: 'faculty',
        isAdmin: false,
        coursesEnrolled: ['course-1']
    } as unknown as GlobalUser;

    const adminUser = {
        userId: 'admin-1',
        name: 'Admin One',
        puid: 'puid-admin',
        affiliation: 'staff',
        isAdmin: true,
        coursesEnrolled: ['course-1']
    } as unknown as GlobalUser;

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('removes faculty from instructors and pulls coursesEnrolled', async () => {
        (findGlobalUserByUserId as jest.Mock).mockResolvedValue(facultyUser);

        const result = await removeInstructorsFromCourse(ctx, course, ['fac-1']);

        expect(result).toEqual([{ userId: 'admin-1', name: 'Admin One' }]);
        expect(removeCourseFromGlobalUser).toHaveBeenCalledWith(ctx, 'puid-fac-1', 'course-1');
    });

    it('rejects removal of platform admin', async () => {
        (findGlobalUserByUserId as jest.Mock).mockResolvedValue(adminUser);

        await expect(removeInstructorsFromCourse(ctx, course, ['admin-1'])).rejects.toThrow(
            'Platform admins cannot be removed'
        );
        expect(removeCourseFromGlobalUser).not.toHaveBeenCalled();
    });

    it('rejects self-removal by caller', async () => {
        await expect(
            removeInstructorsFromCourse(ctx, course, ['fac-1'], { callerUserId: 'fac-1' })
        ).rejects.toThrow('Cannot remove yourself');
    });
});
