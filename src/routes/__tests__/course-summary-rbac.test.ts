import { isAdminUser } from '../../utils/admin';
import type { GlobalUser } from '../../types/shared';

describe('course-summary struggleTopics RBAC gate', () => {
    const baseUser = {
        userId: 'faculty-1',
        name: 'Instructor',
        affiliation: 'faculty',
        coursesEnrolled: ['course-1']
    } as GlobalUser;

    it('includes struggleTopics only for platform admins', () => {
        const instructorSummary = buildSummaryPayload(baseUser, { stackedBar: {} } as never);
        expect(instructorSummary).not.toHaveProperty('struggleTopics');
        expect(instructorSummary.downloadConversationAvailable).toBe(false);

        const adminSummary = buildSummaryPayload(
            { ...baseUser, isAdmin: true },
            { stackedBar: {} } as never
        );
        expect(adminSummary.struggleTopics).toEqual({ stackedBar: {} });
        expect(adminSummary.downloadConversationAvailable).toBe(true);
    });
});

/** Mirrors route-mongo course-summary/status struggle field gating. */
function buildSummaryPayload(
    globalUser: GlobalUser,
    struggleTopics: { stackedBar: Record<string, never> }
): {
    struggleTopics?: { stackedBar: Record<string, never> };
    downloadConversationAvailable: boolean;
} {
    const viewerIsAdmin = isAdminUser(globalUser);
    const resolvedStruggle = viewerIsAdmin ? struggleTopics : undefined;

    return {
        ...(resolvedStruggle !== undefined ? { struggleTopics: resolvedStruggle } : {}),
        downloadConversationAvailable: viewerIsAdmin
    };
}
