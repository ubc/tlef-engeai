// course-user-mongo.ts
/**
 * course-user-mongo.ts
 * @author @gatahcha (refactor)
 * @description Course **roster** storage in `{courseName}_users` — privacy-focused reads (no `puid` persistence on create) plus batch helpers for flag overlays.
 */

import type { CourseUser } from '../../types/shared';
import { getCollectionNames } from './collection-registry-mongo';
import type { MongoDalContext } from './mongo-context';
import { appLogger } from '../../utils/logger';

/**
 * getCourseUsersMongoCollection
 *
 * Resolves the `{courseName}_users` `Collection` via `getCollectionNames` (cached on `ctx`).
 *
 * @param ctx - MongoDalContext
 * @param courseName - string — logical course name / namespace key
 *
 * @returns Promise<Collection> — users collection handle
 *
 * Actions:
 * - Await registry, return `ctx.db.collection(names.users)`.
 */
export async function getCourseUsersMongoCollection(ctx: MongoDalContext, courseName: string) {
    const collections = await getCollectionNames(ctx, courseName);
    return ctx.db.collection(collections.users);
}

/**
 * findUserByUserId
 *
 * Lightweight projection for dashboards — **never** returns `puid` (privacy contract).
 *
 * @param ctx - MongoDalContext
 * @param courseName - string
 * @param userId - string — roster user id (`CourseUser.userId`)
 *
 * @returns `{ name, affiliation, userId } | null`
 *
 * Actions:
 * - `findOne({ userId })`, map to trimmed object or `null`.
 */
export async function findUserByUserId(
    ctx: MongoDalContext,
    courseName: string,
    userId: string
): Promise<{ name: string; affiliation: string; userId: string } | null> {
    appLogger.log(`[MONGODB] 🔍 Finding user with userId: ${userId} in course: ${courseName}`);
    try {
        const userCollection = await getCourseUsersMongoCollection(ctx, courseName);
        const user = await userCollection.findOne({ userId: userId });
        if (user) {
            appLogger.log(`[MONGODB] ✅ Found user:`, {
                name: user.name,
                userId: user.userId,
                affiliation: user.affiliation
            });
            return { name: user.name, affiliation: user.affiliation, userId: user.userId };
        }
        appLogger.log(`[MONGODB] ❌ User with userId ${userId} not found in course ${courseName}`);
        return null;
    } catch (error) {
        appLogger.error(`[MONGODB] 🚨 Error finding user with userId ${userId}:`, error);
        throw error;
    }
}

/**
 * batchFindUsersByUserIds
 *
 * Single round-trip `$in` query; map keys are **stringified** `userId` so numeric flag ids join reliably.
 *
 * @param ctx - MongoDalContext
 * @param courseName - string
 * @param userIds - readonly `(string | number)[]` — roster ids to hydrate
 *
 * @returns `Map<string, { name, affiliation, userId }>` — missing ids simply absent from map
 */
export async function batchFindUsersByUserIds(
    ctx: MongoDalContext,
    courseName: string,
    userIds: readonly (string | number)[]
): Promise<Map<string, { name: string; affiliation: string; userId: string }>> {
    appLogger.log(`[MONGODB] 🔍 Batch finding ${userIds.length} users in course: ${courseName}`);
    try {
        const userCollection = await getCourseUsersMongoCollection(ctx, courseName);
        const users = await userCollection.find({ userId: { $in: userIds as unknown[] } }).toArray();
        const userMap = new Map<string, { name: string; affiliation: string; userId: string }>();
        for (const user of users) {
            userMap.set(String(user.userId), {
                name: user.name,
                affiliation: user.affiliation,
                userId: user.userId
            });
        }
        appLogger.log(`[MONGODB] ✅ Batch lookup found ${userMap.size} out of ${userIds.length} users`);
        return userMap;
    } catch (error) {
        appLogger.error(`[MONGODB] 🚨 Error in batch user lookup:`, error);
        throw error;
    }
}

/**
 * findStudentByUserId
 *
 * Returns the full `CourseUser` document (or null) for auth/session flows that need the embedded `chats` array.
 *
 * @param ctx - MongoDalContext
 * @param courseName - string
 * @param userId - string
 *
 * @returns Mongo document | null
 */
export async function findStudentByUserId(ctx: MongoDalContext, courseName: string, userId: string) {
    appLogger.log(`[MONGODB] 🔍 Finding student with userId: ${userId} in course: ${courseName}`);
    try {
        const userCollection = await getCourseUsersMongoCollection(ctx, courseName);
        const student = await userCollection.findOne({ userId });
        if (student) appLogger.log(`[MONGODB] ✅ Found existing student:`, student);
        else
            appLogger.log(
                `[MONGODB] ❌ Student with userId ${userId} not found in course ${courseName}`
            );
        return student;
    } catch (error) {
        appLogger.error(`[MONGODB] 🚨 Error finding student with userId ${userId}:`, error);
        throw error;
    }
}

/**
 * findStudentByPUID
 *
 * @deprecated Prefer `findStudentByUserId` — `puid` must not be the primary course roster key.
 *
 * @returns Mongo document | null
 */
export async function findStudentByPUID(ctx: MongoDalContext, courseName: string, puid: string) {
    appLogger.log(`[MONGODB] 🔍 Finding student with PUID: ${puid} in course: ${courseName}`);
    try {
        const userCollection = await getCourseUsersMongoCollection(ctx, courseName);
        const student = await userCollection.findOne({ puid });
        if (student) appLogger.log(`[MONGODB] ✅ Found existing student:`, student);
        else appLogger.log(`[MONGODB] ❌ Student with PUID ${puid} not found in course ${courseName}`);
        return student;
    } catch (error) {
        appLogger.error(`[MONGODB] 🚨 Error finding student with PUID ${puid}:`, error);
        throw error;
    }
}

/**
 * createStudent
 *
 * Inserts a `CourseUser` without persisting `puid` (stripped before write).
 *
 * @param ctx - MongoDalContext
 * @param courseName - string
 * @param userData - `Partial<CourseUser>` — must include fields required by `idGenerator.userID`
 *
 * @returns The in-memory `newStudent` object that was inserted
 *
 * Actions:
 * - Generate `id` via `ctx.idGenerator.userID`.
 * - Remove `puid` from payload, `insertOne`, return constructed object.
 */
export async function createStudent(
    ctx: MongoDalContext,
    courseName: string,
    userData: Partial<CourseUser>
): Promise<CourseUser> {
    appLogger.log(`[MONGODB] 🚀 Creating new student in course: ${courseName}`, userData);
    try {
        const userCollection = await getCourseUsersMongoCollection(ctx, courseName);
        const studentId = ctx.idGenerator.userID(userData as CourseUser);
        const { puid: _omit, ...userDataWithoutPuid } = userData as any;
        void _omit;
        const newStudent: CourseUser = {
            ...userDataWithoutPuid,
            id: studentId,
            createdAt: new Date(),
            updatedAt: new Date()
        } as CourseUser;
        await userCollection.insertOne(newStudent as any);
        appLogger.log(`[MONGODB] ✅ Created new student with ID: ${studentId} (userId: ${newStudent.userId})`);
        return newStudent;
    } catch (error) {
        appLogger.error(`[MONGODB] 🚨 Error creating student:`, error);
        throw error;
    }
}
