/**
 * Platform admin utilities.
 * Seed PUIDs come from the same env vars used for faculty override (Charisma, Richard).
 */

import type { GlobalUser } from '../types/shared';

/** PUIDs granted isAdmin on server startup (from env). */
export function getAdminSeedPuids(): string[] {
    const puids: string[] = [];
    const charisma = process.env.CHARISMA_RUSDIYANTO_PUID?.trim();
    const richard = process.env.RICHARD_TAPE_PUID?.trim();
    if (charisma) puids.push(charisma);
    if (richard) puids.push(richard);
    return puids;
}

/** True when the global user has platform admin privileges. */
export function isAdminUser(globalUser: GlobalUser | null | undefined): boolean {
    return globalUser?.isAdmin === true;
}
