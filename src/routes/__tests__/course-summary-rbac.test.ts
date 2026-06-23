import {
    canAccessPostPeriodAnalytics,
    canViewCourseSummary,
    shouldAutoDisplayCourseSummaryModal
} from '../../helpers/academic-period-access';
import type { AcademicPeriodDocument, activeCourse, GlobalUser } from '../../types/shared';

describe('course-summary period gating', () => {
    const futurePeriod = {
        endDate: new Date('2099-04-30')
    } as AcademicPeriodDocument;

    const pastPeriod = {
        endDate: new Date('2020-04-30')
    } as AcademicPeriodDocument;

    const course = { id: 'c1', instructors: [{ userId: 'fac-1', name: 'F' }] } as activeCourse;

    const instructor = {
        userId: 'fac-1',
        affiliation: 'faculty',
        coursesEnrolled: ['c1']
    } as GlobalUser;

  const admin = { ...instructor, isAdmin: true } as GlobalUser;

    it('includes struggleTopics only when post-period analytics allowed', () => {
        const instructorSummary = buildSummaryPayload(instructor, futurePeriod, { stackedBar: {} } as never);
        expect(instructorSummary).not.toHaveProperty('struggleTopics');
        expect(instructorSummary.downloadConversationAvailable).toBe(false);

        const instructorAfter = buildSummaryPayload(instructor, pastPeriod, { stackedBar: {} } as never);
        expect(instructorAfter.struggleTopics).toEqual({ stackedBar: {} });
        expect(instructorAfter.downloadConversationAvailable).toBe(true);

        const adminSummary = buildSummaryPayload(admin, futurePeriod, { stackedBar: {} } as never);
        expect(adminSummary.struggleTopics).toEqual({ stackedBar: {} });
        expect(adminSummary.downloadConversationAvailable).toBe(true);
    });

    it('auto modal only after period; admin can view summary early', () => {
        expect(shouldAutoDisplayCourseSummaryModal(course, admin, futurePeriod)).toBe(false);
        expect(canViewCourseSummary(course, admin, futurePeriod)).toBe(true);
        expect(shouldAutoDisplayCourseSummaryModal(course, instructor, pastPeriod)).toBe(true);
    });
});

function buildSummaryPayload(
    globalUser: GlobalUser,
    period: AcademicPeriodDocument,
    struggleTopics: { stackedBar: Record<string, never> }
): {
    struggleTopics?: { stackedBar: Record<string, never> };
    downloadConversationAvailable: boolean;
} {
    const course = { id: 'c1', instructors: [{ userId: 'fac-1', name: 'F' }] } as activeCourse;
    const canAccess = canAccessPostPeriodAnalytics(course, globalUser, period);
    const resolvedStruggle = canAccess ? struggleTopics : undefined;

    return {
        ...(resolvedStruggle !== undefined ? { struggleTopics: resolvedStruggle } : {}),
        downloadConversationAvailable: canAccess
    };
}
