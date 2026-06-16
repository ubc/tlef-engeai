/**
 * migrate-instructor-allowances.ts
 *
 * One-time idempotent migration: `instructor-allowed-courses` → `instructor-period-allowances`
 * scoped to default `2025W2` period.
 */

import { EngEAI_MongoDB } from '../db/enge-ai-mongodb';
import { DEFAULT_ACADEMIC_PERIOD_TITLE } from '../db/mongo/academic-period-mongo';
import { appLogger } from '../utils/logger';

const LEGACY_COLLECTION = 'instructor-allowed-courses';

export async function migrateInstructorAllowances(): Promise<void> {
    const mongo = await EngEAI_MongoDB.getInstance();
    const defaultPeriod = await mongo.ensureDefaultAcademicPeriod();
    if (defaultPeriod.title !== DEFAULT_ACADEMIC_PERIOD_TITLE) {
        appLogger.warn('[MIGRATE] Default period title mismatch; using resolved period id');
    }

    const legacyColl = mongo.db.collection<{ puid: string; allowed_courses?: string[] }>(LEGACY_COLLECTION);
    const legacyDocs = await legacyColl.find({}).toArray();

    if (legacyDocs.length === 0) {
        appLogger.log('[MIGRATE] No legacy instructor-allowed-courses rows to migrate');
        return;
    }

    let migrated = 0;
    for (const doc of legacyDocs) {
        if (!doc.puid) {
            continue;
        }
        const names = doc.allowed_courses ?? [];
        await mongo.setInstructorPeriodAllowance(doc.puid, defaultPeriod.id, names);
        migrated += 1;
    }

    appLogger.log(`[MIGRATE] Migrated ${migrated} instructor allowance row(s) to ${DEFAULT_ACADEMIC_PERIOD_TITLE}`);
}
