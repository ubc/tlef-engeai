/**
 * struggle-stats-mongo.ts
 * @description Loads Mongo inputs and delegates aggregation to struggle-stats-service.
 */

import { buildCourseStruggleStats } from '../../services/struggle-stats-service';
import type { activeCourse, StruggleStatsResult } from '../../types/shared';
import { countCourseStudentsAndActiveChats } from './course-user-mongo';
import { getAllMemoryAgentEntries } from './memory-agent-mongo';
import type { MongoDalContext } from './mongo-context';
import { getMonitorRosterUsers } from './monitor-roster-mongo';
import { getActiveCourse } from './course-mongo';
import { getAllInstructorStruggleTopics } from './topic-week-mongo';

/**
 * Loads course struggle statistics for monitor and course-summary endpoints.
 *
 * @throws When the course is not found.
 */
export async function getCourseStruggleStats(
    ctx: MongoDalContext,
    courseId: string
): Promise<StruggleStatsResult> {
    const course = await getActiveCourse(ctx, courseId);
    if (!course) {
        throw new Error('Course not found');
    }

    const courseData = course as activeCourse;
    const [catalog, memoryAgentEntries, rosterUsers, totals] = await Promise.all([
        getAllInstructorStruggleTopics(ctx, courseId),
        getAllMemoryAgentEntries(ctx, courseData.courseName),
        getMonitorRosterUsers(ctx, courseData),
        countCourseStudentsAndActiveChats(ctx, courseData.courseName)
    ]);

    return buildCourseStruggleStats({
        course: courseData,
        catalog,
        memoryAgentEntries,
        rosterUsers,
        rosterStudentCount: totals.students
    });
}
