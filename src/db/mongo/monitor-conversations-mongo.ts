/**
 * monitor-conversations-mongo.ts
 * @description Roster-only monitor rows for instructors (no struggle / memory-agent fields).
 */

import type { activeCourse, MonitorConversationUserRow } from '../../types/shared';
import { getActiveCourse } from './course-mongo';
import { getMonitorRosterUsers } from './monitor-roster-mongo';
import type { MongoDalContext } from './mongo-context';

/**
 * Maps monitor roster users to conversation rows for GET …/monitor/:courseId/conversations.
 *
 * @throws When the course is not found.
 */
export async function getMonitorConversationUsers(
    ctx: MongoDalContext,
    courseId: string
): Promise<MonitorConversationUserRow[]> {
    const course = await getActiveCourse(ctx, courseId);
    if (!course) {
        throw new Error('Course not found');
    }

    const courseData = course as activeCourse;
    const rosterUsers = await getMonitorRosterUsers(ctx, courseData);

    return rosterUsers.map((user) => ({
        userId: user.userId,
        userName: user.userName,
        role: user.role,
        conversationCount: user.chats.length,
        chats: user.chats
    }));
}
