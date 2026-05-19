/**
 * Admin Users Migration
 *
 * Sets isAdmin: true on active-users for seed PUIDs (Charisma, Richard) on every server start.
 * Idempotent — safe to run on each restart.
 */

import { EngEAI_MongoDB } from '../db/enge-ai-mongodb';
import { getAdminSeedPuids } from '../utils/admin';
import { appLogger } from '../utils/logger';

/**
 * Ensures platform admin flag is set for configured seed PUIDs.
 */
export async function migrateAdminUsers(): Promise<void> {
    const seedPuids = getAdminSeedPuids();
    if (seedPuids.length === 0) {
        appLogger.warn('[MIGRATE-ADMIN] No admin seed PUIDs configured (CHARISMA_RUSDIYANTO_PUID, RICHARD_TAPE_PUID)');
        return;
    }

    const instance = await EngEAI_MongoDB.getInstance();
    const collection = instance.db.collection('active-users');
    let updatedCount = 0;

    for (const puid of seedPuids) {
        const result = await collection.updateOne(
            { puid },
            { $set: { isAdmin: true, updatedAt: new Date() } }
        );
        if (result.matchedCount > 0) {
            updatedCount += result.modifiedCount > 0 ? 1 : 0;
            if (result.modifiedCount === 0) {
                appLogger.log(`[MIGRATE-ADMIN] ${puid} already has isAdmin: true`);
            } else {
                appLogger.log(`[MIGRATE-ADMIN] Set isAdmin: true for PUID ${puid}`);
            }
        } else {
            appLogger.warn(`[MIGRATE-ADMIN] No active-users document for PUID ${puid} — will apply on first login/create`);
        }
    }

    appLogger.log(`[MIGRATE-ADMIN] Done. Updated ${updatedCount} user(s).`);
}
