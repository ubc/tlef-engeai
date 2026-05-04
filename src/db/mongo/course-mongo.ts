// course-mongo.ts
/**
 * course-mongo.ts
 * @author @gatahcha (refactor)
 * @description Writes and reads the **`active-course-list`** catalog plus a few global side effects (`active-users` enrollment cleanup, arbitrary `dropCollection`).
 *
 * Creating a course materializes per-course collections and stores their names on the `activeCourse.collections` field.
 */

import type { activeCourse } from '../../types/shared';
import { fetchActiveCourseDocByCourseName, fetchActiveCourseDocById } from './active-course-queries-mongo';
import { createFlagIndexes } from './flag-mongo';
import type { MongoDalContext } from './mongo-context';
import { activeCourseListCollection, activeUsersMongoCollection } from './mongo-collections';
import { appLogger } from '../../utils/logger';

/**
 * postActiveCourse
 *
 * Idempotently provisions a new course: creates namespace collections, inserts the catalog row, and builds flag indexes.
 *
 * @param ctx - MongoDalContext
 * @param course - `activeCourse` — inbound document (duplicate `course.id` short-circuit)
 *
 * @returns Promise<void>
 *
 * Actions:
 * - Exit early when `course.id` already exists in `active-course-list`.
 * - Derive **`courseCode`**: reuse provided code or retry `idGenerator.courseCodeID` against uniqueness (bounded attempts).
 * - `createCollection` for `{courseName}_users`, `_flags`, `_memory-agent`, `_scheduled_tasks` (ignore NamespaceExists).
 * - `insertOne` course including `collections` map.
 * - Call `createFlagIndexes` — failures are logged but do not rollback course creation (legacy behavior).
 *
 * Notes:
 * - Throws on unexpected errors so API surfaces creation failures.
 */
export async function postActiveCourse(ctx: MongoDalContext, course: activeCourse): Promise<void> {
    try {
        const existingCourse = await getActiveCourse(ctx, course.id);
        if (existingCourse) {
            appLogger.log(`⚠️ Course with id ${course.id} already exists, skipping creation`);
            return;
        }

        const courseName = course.courseName;
        let courseCode: string;
        if (course.courseCode) {
            courseCode = course.courseCode;
        } else {
            let attempts = 0;
            const maxAttempts = 10;
            let codeDate = course.date;
            do {
                courseCode = ctx.idGenerator.courseCodeID(courseName, codeDate);
                const existingCourseWithCode = await activeCourseListCollection(ctx.db).findOne({
                    courseCode: courseCode
                });
                if (!existingCourseWithCode) break;
                attempts++;
                codeDate = new Date(codeDate.getTime() + attempts);
                appLogger.log(`[COURSE-CODE] Duplicate code found, retrying with modified date (attempt ${attempts})`);
            } while (attempts < maxAttempts);
            if (attempts >= maxAttempts) {
                appLogger.error(
                    `[COURSE-CODE] ⚠️ Failed to generate unique course code after ${maxAttempts} attempts`
                );
            }
            appLogger.log(`[COURSE-CODE] Generated course code: ${courseCode} for course: ${courseName}`);
        }

        const userCollection = `${courseName}_users`;
        const flagsCollection = `${courseName}_flags`;
        const memoryAgentCollection = `${courseName}_memory-agent`;
        const scheduledTasksCollection = `${courseName}_scheduled_tasks`;

        for (const colName of [userCollection, flagsCollection, memoryAgentCollection, scheduledTasksCollection]) {
            try {
                await ctx.db.createCollection(colName);
            } catch (error: any) {
                if (error.codeName !== 'NamespaceExists') throw error;
            }
        }

        const courseWithCollections: activeCourse = {
            ...course,
            courseCode: courseCode,
            collections: {
                users: userCollection,
                flags: flagsCollection,
                memoryAgent: memoryAgentCollection,
                scheduledTasks: scheduledTasksCollection
            }
        };

        await activeCourseListCollection(ctx.db).insertOne(courseWithCollections as any);

        try {
            const indexResult = await createFlagIndexes(ctx, courseName);
            if (indexResult.success) {
                appLogger.log(`✅ Created ${indexResult.indexesCreated.length} indexes for course: ${courseName}`);
            } else {
                appLogger.warn(`⚠️ Some indexes failed to create for course: ${courseName}`, indexResult.errors);
            }
        } catch (indexError) {
            appLogger.error(`❌ Error creating indexes for course ${courseName}:`, indexError);
        }
    } catch (error) {
        appLogger.error('Error creating collections and schemas:', error);
        throw error;
    }
}

/**
 * getActiveCourse
 *
 * Loads a catalog document by `id`.
 *
 * @param ctx - MongoDalContext
 * @param id - string — matches `activeCourse.id`
 *
 * @returns Promise<activeCourse | null>
 *
 * Actions:
 * - Delegates to `fetchActiveCourseDocById`.
 */
export async function getActiveCourse(ctx: MongoDalContext, id: string) {
    return await fetchActiveCourseDocById(ctx.db, id);
}

/**
 * getActiveCourseByCode
 *
 * Student entry flow: resolve a course by its short numeric PIN string.
 *
 * @param ctx - MongoDalContext
 * @param courseCode - string — stored `courseCode`
 *
 * @returns Promise<Document | null> — Mongo document or null (typed as inferred by driver)
 *
 * Actions:
 * - `findOne({ courseCode })` against `active-course-list`.
 */
export async function getActiveCourseByCode(ctx: MongoDalContext, courseCode: string) {
    return await activeCourseListCollection(ctx.db).findOne({ courseCode });
}

/**
 * getCourseByName
 *
 * Resolves catalog row by **`courseName`**, including forgiving case-insensitive matching (delegated query helper).
 *
 * @param ctx - MongoDalContext
 * @param name - string — course display name
 *
 * @returns Promise<activeCourse | null>
 */
export async function getCourseByName(ctx: MongoDalContext, name: string) {
    return fetchActiveCourseDocByCourseName(ctx.db, name);
}

/**
 * getAllActiveCourses
 *
 * Returns every row in the course catalog (admin / batch jobs).
 *
 * @param ctx - MongoDalContext
 *
 * @returns Promise<activeCourse[]>
 *
 * Actions:
 * - `find({})` + `toArray()` on `active-course-list`.
 */
export async function getAllActiveCourses(ctx: MongoDalContext) {
    return await activeCourseListCollection(ctx.db).find({}).toArray();
}

/**
 * updateActiveCourse
 *
 * Partial merge into a catalog document and bump `updatedAt` (string timestamp, legacy format).
 *
 * @param ctx - MongoDalContext
 * @param id - string — target `activeCourse.id`
 * @param updateData - `Partial<activeCourse>` — fields merged with `$set`
 *
 * @returns `findOneAndUpdate` result from the driver (callers may interpret `.ok` / doc shape per driver version)
 *
 * Actions:
 * - `$set` merges `updateData` with `updatedAt: Date.now().toString()`.
 */
export async function updateActiveCourse(
    ctx: MongoDalContext,
    id: string,
    updateData: Partial<activeCourse>
) {
    const result = await activeCourseListCollection(ctx.db).findOneAndUpdate(
        { id: id },
        { $set: { ...updateData, updatedAt: Date.now().toString() } },
        { returnDocument: 'after' }
    );
    return result;
}

/**
 * deleteActiveCourse
 *
 * Removes the catalog row only — caller must still drop / clean per-course collections if required.
 *
 * @param ctx - MongoDalContext
 * @param course - `activeCourse` — uses `course.id` for the delete filter
 *
 * @returns Promise<void>
 */
export async function deleteActiveCourse(ctx: MongoDalContext, course: activeCourse) {
    await activeCourseListCollection(ctx.db).deleteOne({ id: course.id });
}

/**
 * removeCourseFromAllUsers
 *
 * After deleting a course, strip its id from every `GlobalUser.coursesEnrolled` array in `active-users`.
 *
 * @param ctx - MongoDalContext
 * @param courseId - string — `activeCourse.id`
 *
 * @returns Promise<number> — `modifiedCount` from `updateMany`
 *
 * Actions:
 * - `updateMany` with `$pull` on `coursesEnrolled`.
 */
export async function removeCourseFromAllUsers(ctx: MongoDalContext, courseId: string): Promise<number> {
    try {
        const updateResult = await activeUsersMongoCollection(ctx.db).updateMany(
            { coursesEnrolled: { $in: [courseId] } },
            { $pull: { coursesEnrolled: courseId } } as any
        );
        appLogger.log(`✅ Removed course ${courseId} from ${updateResult.modifiedCount} user(s) in active-users`);
        return updateResult.modifiedCount;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        appLogger.error(`❌ Error removing course from active-users:`, errorMessage);
        throw error;
    }
}

/**
 * dropCollection
 *
 * Drops an arbitrary Mongo collection by name — idempotent when the namespace already vanished.
 *
 * @param ctx - MongoDalContext
 * @param collectionName - string
 *
 * @returns Promise<{ success: boolean; error?: string }>
 *
 * Actions:
 * - If `listCollections` shows the namespace, run `dropCollection`.
 * - If missing, return `{ success: true }` anyway (consistent with legacy).
 * - On driver error return `{ success: false, error }` without throwing.
 */
export async function dropCollection(ctx: MongoDalContext, collectionName: string) {
    try {
        const collectionExists = await ctx.db.listCollections({ name: collectionName }).hasNext();
        if (collectionExists) {
            await ctx.db.dropCollection(collectionName);
            appLogger.log(`✅ Successfully dropped collection: ${collectionName}`);
            return { success: true };
        }
        appLogger.log(`⚠️ Collection ${collectionName} does not exist, skipping drop`);
        return { success: true };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        appLogger.error(`❌ Error dropping collection ${collectionName}:`, errorMessage);
        return { success: false, error: errorMessage };
    }
}
