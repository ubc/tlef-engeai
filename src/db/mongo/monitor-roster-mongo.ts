/**
 * monitor-roster-mongo.ts
 * @description Roster projection for the instructor monitor dashboard (students, faculty, TAs, platform admins).
 */

import { getCollectionNames } from './collection-registry-mongo';
import type { MongoDalContext } from './mongo-context';
import type { activeCourse, MonitorRosterRole } from '../../types/shared';
import { isInCourseInstructors, isInCourseTAs } from '../../utils/course-staff';

export interface MonitorRosterUser {
    userId: string;
    userName: string;
    role: MonitorRosterRole;
    chats: Array<{ id: string; title: string }>;
}

/**
 * Loads monitor roster users — same scope as GET /monitor/:courseId/chat-titles.
 */
export async function getMonitorRosterUsers(
    ctx: MongoDalContext,
    course: activeCourse
): Promise<MonitorRosterUser[]> {
    const courseName = course.courseName;
    const courseId = course.id;
    const collectionNames = await getCollectionNames(ctx, courseName);
    const usersCollection = ctx.db.collection(collectionNames.users);
    const allUsers = await usersCollection
        .find(
            { affiliation: { $in: ['student', 'faculty'] } },
            { projection: { userId: 1, name: 1, affiliation: 1, chats: 1 } }
        )
        .toArray();

    const adminDocs = await ctx.db
        .collection('active-users')
        .find({ isAdmin: true }, { projection: { userId: 1 } })
        .toArray();
    const adminUserIds = new Set(
        adminDocs
            .map((u) => (u as { userId?: string }).userId)
            .filter((id): id is string => typeof id === 'string' && id.length > 0)
    );

    const usersData: MonitorRosterUser[] = [];

    for (const user of allUsers) {
        const userData = user as unknown as {
            userId: string;
            name?: string;
            affiliation?: string;
            chats?: Array<{ id: string; itemTitle?: string; title?: string; isDeleted?: boolean }>;
        };
        const chats = (userData.chats || []).filter((chat) => !chat.isDeleted);
        const chatTitles = chats.map((chat) => ({
            id: chat.id,
            title: chat.itemTitle || chat.title || 'Untitled Chat'
        }));

        let role: MonitorRosterRole = 'student';
        if (adminUserIds.has(userData.userId)) {
            role = 'admin';
        } else if (isInCourseInstructors(course, userData.userId)) {
            role = 'instructor';
        } else if (isInCourseTAs(course, userData.userId)) {
            role = 'ta';
        } else if (userData.affiliation === 'faculty') {
            role = 'instructor';
        }

        usersData.push({
            userId: userData.userId,
            userName: userData.name || 'Unknown User',
            role,
            chats: chatTitles
        });
    }

    return usersData;
}
