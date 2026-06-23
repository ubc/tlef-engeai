import {
    buildCourseSelectionByPeriod,
    filterAccessibleCourses,
    isCourseAccessible
} from '../course-access';
import type { AcademicPeriodDocument, activeCourse, GlobalUser } from '../../types/shared';

const period2026 = {
    id: 'period-2026',
    title: '2025-26',
    startDate: new Date('2025-09-01'),
    endDate: new Date('2026-04-30')
} as AcademicPeriodDocument;

const period2025 = {
    id: 'period-2025',
    title: '2024-25',
    startDate: new Date('2024-09-01'),
    endDate: new Date('2025-04-30')
} as AcademicPeriodDocument;

const courseA = {
    id: 'course-a',
    courseName: 'ENGR 101',
    academicPeriodId: 'period-2026',
    instructors: [{ userId: 'fac-1', name: 'Dr. Smith' }]
} as activeCourse;

const courseB = {
    id: 'course-b',
    courseName: 'ENGR 202',
    academicPeriodId: 'period-2025',
    instructors: [{ userId: 'fac-2', name: 'Dr. Jones' }]
} as activeCourse;

describe('course-access', () => {
    const studentEnrolled: GlobalUser = {
        userId: 'stu-1',
        puid: 'puid-stu',
        name: 'Student',
        affiliation: 'student',
        status: 'active',
        coursesEnrolled: ['course-a'],
        createdAt: new Date(),
        updatedAt: new Date()
    };

    const facultyStaff: GlobalUser = {
        userId: 'fac-1',
        puid: 'puid-fac',
        name: 'Faculty',
        affiliation: 'faculty',
        status: 'active',
        coursesEnrolled: [],
        createdAt: new Date(),
        updatedAt: new Date()
    };

    it('isCourseAccessible: enrolled student', () => {
        expect(isCourseAccessible(courseA, studentEnrolled)).toBe(true);
        expect(isCourseAccessible(courseB, studentEnrolled)).toBe(false);
    });

    it('isCourseAccessible: faculty in instructors without coursesEnrolled', () => {
        expect(isCourseAccessible(courseA, facultyStaff)).toBe(true);
    });

    it('filterAccessibleCourses uses DB coursesEnrolled not session', () => {
        const staleSessionUser: GlobalUser = {
            ...studentEnrolled,
            coursesEnrolled: []
        };
        const fromDb: GlobalUser = {
            ...studentEnrolled,
            coursesEnrolled: ['course-a']
        };
        expect(filterAccessibleCourses([courseA, courseB], staleSessionUser)).toHaveLength(0);
        expect(filterAccessibleCourses([courseA, courseB], fromDb)).toHaveLength(1);
    });

    it('buildCourseSelectionByPeriod includes all periods and filters courses per user', () => {
        const payload = buildCourseSelectionByPeriod(
            [period2026, period2025],
            [courseA, courseB],
            studentEnrolled,
            'period-2026'
        );
        expect(payload.periods).toHaveLength(2);
        expect(payload.periods[0].courseCount).toBe(1);
        expect(payload.periods[0].courses[0].id).toBe('course-a');
        expect(payload.periods[1].courseCount).toBe(0);
        expect(payload.defaultPeriodId).toBe('period-2026');
    });
});
