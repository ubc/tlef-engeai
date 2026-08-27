import type { GlobalUser, activeCourse } from '../../types/shared';
import { resolveGuidedPathwayFlagTriggerActor } from '../guided-pathway-flag-policy';

const course = {
    id: 'course-1',
    courseName: 'Course One',
    instructors: [{ userId: 'instructor-1', name: 'Instructor' }],
    teachingAssistants: [{ userId: 'ta-1', name: 'TA' }],
} as activeCourse;

function user(overrides: Partial<GlobalUser>): GlobalUser {
    return {
        name: 'Test User',
        puid: 'test-puid',
        userId: 'user-1',
        coursesEnrolled: [],
        affiliation: 'student',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    };
}

describe('resolveGuidedPathwayFlagTriggerActor', () => {
    it('classifies a listed faculty instructor as a staff test before enrollment', () => {
        const actor = resolveGuidedPathwayFlagTriggerActor(course, user({
            userId: 'instructor-1',
            affiliation: 'faculty',
            coursesEnrolled: ['course-1'],
        }));

        expect(actor).toEqual({ origin: 'instructor-test', userId: 'instructor-1' });
    });

    it('keeps an admin who is also an explicitly listed faculty instructor eligible as a test', () => {
        const actor = resolveGuidedPathwayFlagTriggerActor(course, user({
            userId: 'instructor-1',
            affiliation: 'faculty',
            coursesEnrolled: ['course-1'],
            isAdmin: true,
        }));

        expect(actor).toEqual({ origin: 'instructor-test', userId: 'instructor-1' });
    });

    it('classifies an enrolled TA as a staff test', () => {
        const actor = resolveGuidedPathwayFlagTriggerActor(course, user({
            userId: 'ta-1',
            affiliation: 'staff',
            coursesEnrolled: ['course-1'],
        }));

        expect(actor).toEqual({ origin: 'instructor-test', userId: 'ta-1' });
    });

    it('classifies a platform admin not on the course roster as a staff test', () => {
        const actor = resolveGuidedPathwayFlagTriggerActor(course, user({
            userId: 'admin-1',
            affiliation: 'staff',
            coursesEnrolled: ['course-1'],
            isAdmin: true,
        }));

        expect(actor).toEqual({ origin: 'instructor-test', userId: 'admin-1' });
    });

    it('classifies an enrolled non-staff user as a production student', () => {
        const actor = resolveGuidedPathwayFlagTriggerActor(course, user({
            userId: 'student-1',
            coursesEnrolled: ['course-1'],
        }));

        expect(actor).toEqual({ origin: 'student', userId: 'student-1' });
    });

    it('skips an unenrolled outsider', () => {
        expect(resolveGuidedPathwayFlagTriggerActor(course, user({ userId: 'outsider-1' }))).toBeNull();
    });

    it('safely skips a legacy user whose enrollment array is missing', () => {
        const malformedUser = {
            ...user({ userId: 'legacy-user' }),
            coursesEnrolled: undefined,
        } as unknown as GlobalUser;

        expect(resolveGuidedPathwayFlagTriggerActor(course, malformedUser)).toBeNull();
    });

    it('skips when course or user context is missing', () => {
        expect(resolveGuidedPathwayFlagTriggerActor(null, user({}))).toBeNull();
        expect(resolveGuidedPathwayFlagTriggerActor(course, null)).toBeNull();
    });
});
