// course-backup-mongo.ts
/**
 * course-backup-mongo.ts
 * @description Reads catalog + four per-course collections for instructor ZIP backup (BSON EJSON).
 */

import { EJSON } from 'bson';
import type { activeCourse } from '../../types/shared';
import { activeCourseListCollection } from './mongo-collections';
import type { MongoDalContext } from './mongo-context';
import { getCollectionNames } from './collection-registry-mongo';

function ejsonPretty(value: unknown): string {
    return EJSON.stringify(value, undefined, 2, { relaxed: false });
}

export type CourseMongoBackupPayloads = {
    /** Single `active-course-list` document for this course, or `null` if missing. */
    activeCourseListJson: string;
    usersJson: string;
    flagsJson: string;
    scheduledTasksJson: string;
    memoryAgentJson: string;
};

/**
 * loadCourseMongoBackupPayloads
 *
 * Loads all Mongo slices for one course; uses `getCollectionNames` for physical collection names.
 *
 * @param ctx - MongoDalContext
 * @param course - active course (must match catalog `id` and `courseName`)
 *
 * @returns Promise<CourseMongoBackupPayloads> — five EJSON (canonical) strings
 */
export async function loadCourseMongoBackupPayloads(
    ctx: MongoDalContext,
    course: activeCourse
): Promise<CourseMongoBackupPayloads> {
    const courseName = course.courseName;
    const names = await getCollectionNames(ctx, courseName);

    const catalogDoc = await activeCourseListCollection(ctx.db).findOne({ id: course.id });

    const [users, flags, scheduledTasks, memoryAgent] = await Promise.all([
        ctx.db.collection(names.users).find({}).toArray(),
        ctx.db.collection(names.flags).find({}).toArray(),
        ctx.db.collection(names.scheduledTasks).find({}).toArray(),
        ctx.db.collection(names.memoryAgent).find({}).toArray()
    ]);

    return {
        activeCourseListJson: ejsonPretty(catalogDoc),
        usersJson: ejsonPretty(users),
        flagsJson: ejsonPretty(flags),
        scheduledTasksJson: ejsonPretty(scheduledTasks),
        memoryAgentJson: ejsonPretty(memoryAgent)
    };
}
