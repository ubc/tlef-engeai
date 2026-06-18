/**
 * Sync Express session globalUser from MongoDB after enrollment mutations.
 */

import type { Request } from 'express';
import { EngEAI_MongoDB } from '../db/enge-ai-mongodb';
import type { GlobalUser } from '../types/shared';

/**
 * Reload GlobalUser from DB and assign to req.session.globalUser.
 */
export async function refreshSessionGlobalUser(
    req: Request,
    mongoDB?: EngEAI_MongoDB
): Promise<GlobalUser | null> {
    const sessionUser = (req as { user?: { puid?: string } }).user;
    const sessionGlobal = (req.session as { globalUser?: GlobalUser })?.globalUser;

    if (!sessionUser?.puid && !sessionGlobal?.userId) {
        return null;
    }

    const db = mongoDB ?? (await EngEAI_MongoDB.getInstance());
    const fresh = sessionUser?.puid
        ? await db.findGlobalUserByPUID(sessionUser.puid)
        : await db.findGlobalUserByUserId(sessionGlobal!.userId);

    if (fresh) {
        (req.session as unknown as { globalUser: GlobalUser }).globalUser = fresh;
    }

    return fresh;
}
