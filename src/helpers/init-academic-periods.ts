/**
 * init-academic-periods.ts
 *
 * Startup seed for default academic period `2025W2` (idempotent).
 */

import { EngEAI_MongoDB } from '../db/enge-ai-mongodb';
import { appLogger } from '../utils/logger';

export async function initAcademicPeriods(): Promise<void> {
    try {
        const mongo = await EngEAI_MongoDB.getInstance();
        await mongo.ensureDefaultAcademicPeriod();
        appLogger.log('[INIT] Academic periods initialized');
    } catch (error) {
        appLogger.error('[INIT] Failed to initialize academic periods:', error);
        throw error;
    }
}
