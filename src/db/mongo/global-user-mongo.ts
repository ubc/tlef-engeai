// global-user-mongo.ts
/**
 * global-user-mongo.ts
 * @author @gatahcha (refactor)
 * @description Global identity documents in **`active-users`** — the only collection that stores `puid` at rest alongside `userId`.
 *
 * Mutations here affect **all** courses (enrollment arrays, affiliation reconciliation, etc.).
 */

import type { GlobalUser } from '../../types/shared';
import type { MongoDalContext } from './mongo-context';
import { activeUsersMongoCollection } from './mongo-collections';

/**
 * findGlobalUserByPUID
 *
 * Primary Shibboleth / CWL reconciliation path when the IdP hands back a `puid`.
 *
 * @param ctx - MongoDalContext
 * @param puid - string
 *
 * @returns `GlobalUser | null`
 */
export async function findGlobalUserByPUID(ctx: MongoDalContext, puid: string): Promise<GlobalUser | null> {
    const collection = activeUsersMongoCollection(ctx.db);
    return (await collection.findOne({ puid })) as GlobalUser | null;
}

/**
 * findGlobalUserByUserId
 *
 * Preferred for HTTP handlers that already resolved a non-PII `userId`.
 *
 * @param ctx - MongoDalContext
 * @param userId - string
 *
 * @returns `GlobalUser | null`
 */
export async function findGlobalUserByUserId(
    ctx: MongoDalContext,
    userId: string
): Promise<GlobalUser | null> {
    const collection = activeUsersMongoCollection(ctx.db);
    return (await collection.findOne({ userId })) as GlobalUser | null;
}

/**
 * createGlobalUser
 *
 * Inserts a brand-new global row with required profile fields and timestamps.
 *
 * @param ctx - MongoDalContext
 * @param userData - `Partial<GlobalUser>` — must include `name`, `puid`, `userId`, `affiliation`
 *
 * @returns Materialized `GlobalUser`
 *
 * Actions:
 * - Default `coursesEnrolled` to `[]`, `status` to `active`, stamp `createdAt` / `updatedAt`.
 */
export async function createGlobalUser(
    ctx: MongoDalContext,
    userData: Partial<GlobalUser>
): Promise<GlobalUser> {
    const collection = activeUsersMongoCollection(ctx.db);
    const newUser: GlobalUser = {
        name: userData.name!,
        puid: userData.puid!,
        userId: userData.userId!,
        coursesEnrolled: userData.coursesEnrolled || [],
        affiliation: userData.affiliation!,
        status: userData.status || 'active',
        createdAt: new Date(),
        updatedAt: new Date()
    };
    await collection.insertOne(newUser as any);
    return newUser;
}

/**
 * addCourseToGlobalUser
 *
 * Idempotent enrollment append — uses `$addToSet` so duplicate course ids are ignored.
 *
 * @param ctx - MongoDalContext
 * @param puid - string — lookup key
 * @param courseId - string — `activeCourse.id`
 *
 * @returns Promise<void>
 */
export async function addCourseToGlobalUser(
    ctx: MongoDalContext,
    puid: string,
    courseId: string
): Promise<void> {
    const collection = activeUsersMongoCollection(ctx.db);
    await collection.updateOne(
        { puid },
        {
            $addToSet: { coursesEnrolled: courseId },
            $set: { updatedAt: new Date() }
        }
    );
}

/**
 * updateGlobalUser
 *
 * Shallow merge of arbitrary fields on the document located by `puid`.
 *
 * @returns Post-image `GlobalUser` (driver-specific shape — cast for legacy callers)
 */
export async function updateGlobalUser(
    ctx: MongoDalContext,
    puid: string,
    updateData: Partial<GlobalUser>
): Promise<GlobalUser> {
    const collection = activeUsersMongoCollection(ctx.db);
    const result = await collection.findOneAndUpdate(
        { puid },
        {
            $set: {
                ...updateData,
                updatedAt: new Date()
            }
        },
        { returnDocument: 'after' }
    );
    return result as unknown as GlobalUser;
}

/**
 * updateGlobalUserAffiliation
 *
 * Targeted helper for CWL ↔︎ DB affiliation drift; keyed by `userId` for routes that avoid `puid`.
 *
 * @throws When no document matches `userId`
 */
export async function updateGlobalUserAffiliation(
    ctx: MongoDalContext,
    userId: string,
    affiliation: 'student' | 'faculty'
): Promise<GlobalUser> {
    const collection = activeUsersMongoCollection(ctx.db);
    const result = await collection.findOneAndUpdate(
        { userId },
        {
            $set: {
                affiliation,
                updatedAt: new Date()
            }
        },
        { returnDocument: 'after' }
    );
    if (!result) {
        throw new Error(`GlobalUser with userId ${userId} not found`);
    }
    return result as unknown as GlobalUser;
}
