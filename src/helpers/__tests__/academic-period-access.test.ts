import {
    canAccessPostPeriodAnalytics,
    canViewCourseSummary,
    isAcademicPeriodEnded,
    shouldAutoDisplayCourseSummaryModal
} from '../academic-period-access';
import type { AcademicPeriodDocument, activeCourse, GlobalUser } from '../../types/shared';

const baseCourse = {
    id: 'course-1',
    academicPeriodId: 'period-1'
} as activeCourse;

const futurePeriod = {
    id: 'period-1',
    title: '2025W2',
    startDate: new Date('2026-01-06'),
    endDate: new Date('2099-04-30'),
    courseIds: ['course-1'],
    createdAt: new Date(),
    updatedAt: new Date()
} as AcademicPeriodDocument;

const pastPeriod = {
    ...futurePeriod,
    endDate: new Date('2020-04-30')
} as AcademicPeriodDocument;

const facultyInstructor = {
    userId: 'fac-1',
    affiliation: 'faculty',
    coursesEnrolled: ['course-1']
} as GlobalUser;

const taStudent = {
    userId: 'ta-1',
    affiliation: 'student',
    coursesEnrolled: ['course-1']
} as GlobalUser;

const courseWithInstructor = {
    ...baseCourse,
    instructors: [{ userId: 'fac-1', name: 'Faculty' }]
} as activeCourse;

const courseWithTA = {
    ...baseCourse,
    teachingAssistants: [{ userId: 'ta-1', name: 'TA User' }]
} as activeCourse;

describe('academic-period-access', () => {
    it('detects ended period', () => {
        expect(isAcademicPeriodEnded(pastPeriod)).toBe(true);
        expect(isAcademicPeriodEnded(futurePeriod)).toBe(false);
    });

    it('allows admin post-period analytics during active period', () => {
        const admin = { ...facultyInstructor, isAdmin: true } as GlobalUser;
        expect(canAccessPostPeriodAnalytics(courseWithInstructor, admin, futurePeriod)).toBe(true);
        expect(canViewCourseSummary(courseWithInstructor, admin, futurePeriod)).toBe(true);
        expect(shouldAutoDisplayCourseSummaryModal(courseWithInstructor, admin, futurePeriod)).toBe(false);
    });

    it('blocks instructor analytics until period ends', () => {
        expect(canAccessPostPeriodAnalytics(courseWithInstructor, facultyInstructor, futurePeriod)).toBe(false);
        expect(canAccessPostPeriodAnalytics(courseWithInstructor, facultyInstructor, pastPeriod)).toBe(true);
    });

    it('allows TA staff analytics after period ends', () => {
        expect(canAccessPostPeriodAnalytics(courseWithTA, taStudent, futurePeriod)).toBe(false);
        expect(canAccessPostPeriodAnalytics(courseWithTA, taStudent, pastPeriod)).toBe(true);
    });
});
