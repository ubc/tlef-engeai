// lms-connection-mongo.ts
/**
 * lms-connection-mongo.ts
 *
 * @description Read-only presence checks on the LMS toolkit's token collections (`canvas_tokens`,
 * `moodle_tokens`, overridable through `CANVAS_TOKEN_COLLECTION_NAME` / `MOODLE_TOKEN_COLLECTION_NAME`).
 * Those collections are written only by `@ubc/ubc-genai-toolkit-lms-integration`, keyed by
 * `userKey` = `GlobalUser.userId`. Nothing here reads, returns, or logs a token: queries project
 * `userKey` alone.
 */

import type { MongoDalContext } from './mongo-context';

/** Same fallbacks as `src/lms/canvas-config.ts` and `src/routes/route-lms.ts`. */
function tokenCollectionNames(): { canvas: string; moodle: string } {
    return {
        canvas: process.env.CANVAS_TOKEN_COLLECTION_NAME || 'canvas_tokens',
        moodle: process.env.MOODLE_TOKEN_COLLECTION_NAME || 'moodle_tokens'
    };
}

/** userIds with a stored Canvas or Moodle connection. */
export interface LmsConnectedUserIds {
    canvas: Set<string>;
    moodle: Set<string>;
}

/**
 * findLmsConnectedUserIds
 *
 * Which of `userIds` have a stored Canvas and/or Moodle token record. A record means the person
 * connected and has not disconnected; it says nothing about whether the token still works.
 *
 * @param ctx - MongoDalContext
 * @param userIds - `GlobalUser.userId` values to check
 * @returns The subsets connected to each LMS; empty sets for an empty input
 */
export async function findLmsConnectedUserIds(ctx: MongoDalContext, userIds: string[]): Promise<LmsConnectedUserIds> {
    if (userIds.length === 0) {
        return { canvas: new Set(), moodle: new Set() };
    }
    const names = tokenCollectionNames();
    const connected = async (collectionName: string) => {
        const docs = await ctx.db
            .collection(collectionName)
            .find({ userKey: { $in: userIds } }, { projection: { _id: 0, userKey: 1 } })
            .toArray();
        return new Set(docs.map((doc) => String(doc.userKey)));
    };
    const [canvas, moodle] = await Promise.all([connected(names.canvas), connected(names.moodle)]);
    return { canvas, moodle };
}
