/**
 * migrate-platform-admins.ts
 *
 * Startup backfill: set `isAdmin: true` on GlobalUsers whose PUID matches
 * CHARISMA_RUSDIYANTO_PUID or RICHARD_TAPE_PUID. Idempotent on every restart.
 */

import { EngEAI_MongoDB } from '../db/enge-ai-mongodb';
import { getPlatformAdminPuids } from '../utils/admin';
import { appLogger } from '../utils/logger';

export async function migratePlatformAdmins(): Promise<void> {
    const puids = getPlatformAdminPuids();
    if (puids.length === 0) {
        appLogger.log('[MIGRATE-ADM] No platform admin PUID env vars set; skipping');
        return;
    }

    const mongo = await EngEAI_MongoDB.getInstance();
    let promoted = 0;

    for (const puid of puids) {
        const user = await mongo.findGlobalUserByPUID(puid);
        if (!user) {
            appLogger.log(
                `[MIGRATE-ADM] GlobalUser not found for platform admin PUID ${puid}; will be set on login`
            );
            continue;
        }
        if (user.isAdmin === true) {
            continue;
        }
        await mongo.updateGlobalUser(puid, { isAdmin: true });
        promoted++;
        appLogger.log(`[MIGRATE-ADM] Set isAdmin for ${user.name} (${user.userId})`);
    }

    appLogger.log(`[MIGRATE-ADM] Promoted ${promoted} platform admin(s)`);
}
