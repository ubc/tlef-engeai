/**
 * Platform admin utilities.
 */

import type { EngEAI_MongoDB } from '../db/enge-ai-mongodb';
import type { GlobalUser } from '../types/shared';

/** True when the global user has platform admin privileges. */
export function isAdminUser(globalUser: GlobalUser | null | undefined): boolean {
    return globalUser?.isAdmin === true;
}

/** PUIDs that receive platform admin (from env: CHARISMA_RUSDIYANTO_PUID, RICHARD_TAPE_PUID). */
export function getPlatformAdminPuids(): string[] {
    const puids: string[] = [];
    const charisma = process.env.CHARISMA_RUSDIYANTO_PUID?.trim();
    const richard = process.env.RICHARD_TAPE_PUID?.trim();
    if (charisma) puids.push(charisma);
    if (richard) puids.push(richard);
    return puids;
}

/** True when the given PUID is configured as a platform admin. */
export function isPlatformAdminPuid(puid: string): boolean {
    if (!puid || typeof puid !== 'string') return false;
    return getPlatformAdminPuids().includes(puid.trim());
}

/**
 * Ensures env-configured platform admins have `isAdmin: true` in MongoDB.
 * Idempotent — no-op when already admin or PUID is not in the admin list.
 */
export async function ensurePlatformAdminGlobalUser(
    mongoDB: EngEAI_MongoDB,
    globalUser: GlobalUser,
    puid: string
): Promise<GlobalUser> {
    if (!isPlatformAdminPuid(puid) || globalUser.isAdmin === true) {
        return globalUser;
    }
    return mongoDB.updateGlobalUser(puid, { isAdmin: true });
}
