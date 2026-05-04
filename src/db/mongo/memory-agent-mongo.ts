// memory-agent-mongo.ts
/**
 * memory-agent-mongo.ts
 * @author @gatahcha (refactor)
 * @description Per-course **memory agent** rows in `{courseName}_memory-agent` — stores derived struggle topics used by the chat/RAG flows.
 */

import type { MemoryAgentEntry } from '../../types/shared';
import { getCollectionNames } from './collection-registry-mongo';
import type { MongoDalContext } from './mongo-context';
import { appLogger } from '../../utils/logger';

/** @internal Resolves the memory-agent collection for `courseName`. */
async function getMemoryAgentCollection(ctx: MongoDalContext, courseName: string) {
    const collections = await getCollectionNames(ctx, courseName);
    return ctx.db.collection(collections.memoryAgent);
}

/**
 * mapAffiliationToRole
 *
 * Bridge from auth-level affiliation to the stored `MemoryAgentEntry.role` enum.
 *
 * @internal
 */
function mapAffiliationToRole(affiliation: 'student' | 'faculty'): 'instructor' | 'TA' | 'Student' {
    if (affiliation === 'student') return 'Student';
    return 'instructor';
}

/**
 * createMemoryAgentEntry
 *
 * Inserts a row; treats Mongo duplicate key (`11000`/`11001`) as **success** for idempotent races.
 *
 * @param ctx - MongoDalContext
 * @param courseName - string
 * @param entry - `MemoryAgentEntry`
 *
 * @returns Promise<void>
 */
export async function createMemoryAgentEntry(
    ctx: MongoDalContext,
    courseName: string,
    entry: MemoryAgentEntry
): Promise<void> {
    appLogger.log(`[MONGODB] 🧠 Creating memory agent entry for userId: ${entry.userId} in course: ${courseName}`);
    try {
        const memoryAgentCollection = await getMemoryAgentCollection(ctx, courseName);
        await memoryAgentCollection.insertOne(entry as any);
        appLogger.log(`[MONGODB] ✅ Memory agent entry created successfully for userId: ${entry.userId}`);
    } catch (error: any) {
        if (error.code === 11000 || error.code === 11001) {
            appLogger.log(
                `[MONGODB] ℹ️ Memory agent entry already exists for userId: ${entry.userId} (duplicate key error - treating as success)`
            );
            return;
        }
        appLogger.error(`[MONGODB] 🚨 Error creating memory agent entry:`, error);
        throw error;
    }
}

/**
 * getMemoryAgentEntry
 *
 * Read-only fetch by roster `userId`.
 *
 * @param ctx - MongoDalContext
 * @param courseName - string
 * @param userId - string
 * @returns `MemoryAgentEntry | null`
 */
export async function getMemoryAgentEntry(
    ctx: MongoDalContext,
    courseName: string,
    userId: string
): Promise<MemoryAgentEntry | null> {
    appLogger.log(`[MONGODB] 🔍 Getting memory agent entry for userId: ${userId} in course: ${courseName}`);
    try {
        const memoryAgentCollection = await getMemoryAgentCollection(ctx, courseName);
        const entry = (await memoryAgentCollection.findOne({ userId })) as MemoryAgentEntry | null;
        if (entry) appLogger.log(`[MONGODB] ✅ Found memory agent entry for userId: ${userId}`);
        else appLogger.log(`[MONGODB] ⚠️ Memory agent entry not found for userId: ${userId}`);
        return entry;
    } catch (error) {
        appLogger.error(`[MONGODB] 🚨 Error getting memory agent entry:`, error);
        throw error;
    }
}

/**
 * updateMemoryAgentStruggleWords
 *
 * Overwrites `struggleTopics[]` when the moderation / reflection pipeline persists new wording.
 *
 * @param ctx - MongoDalContext
 * @param courseName - string
 * @param userId - string
 * @param struggleTopics - string[]
 * @returns Promise<void>
 *
 * @throws When no baseline document exists (`findOneAndUpdate` returns null)
 */
export async function updateMemoryAgentStruggleWords(
    ctx: MongoDalContext,
    courseName: string,
    userId: string,
    struggleTopics: string[]
): Promise<void> {
    appLogger.log(`[MONGODB] 🔄 Updating struggle words for userId: ${userId} in course: ${courseName}`);
    appLogger.log(`[MONGODB] 📝 New struggle words:`, struggleTopics);
    try {
        const memoryAgentCollection = await getMemoryAgentCollection(ctx, courseName);
        const result = await memoryAgentCollection.findOneAndUpdate(
            { userId },
            {
                $set: {
                    struggleTopics,
                    updatedAt: new Date()
                }
            },
            { returnDocument: 'after' }
        );
        if (!result) {
            throw new Error(`Memory agent entry not found for userId: ${userId}`);
        }
        appLogger.log(`[MONGODB] ✅ Struggle words updated successfully for userId: ${userId}`);
    } catch (error) {
        appLogger.error(`[MONGODB] 🚨 Error updating struggle words:`, error);
        throw error;
    }
}

/**
 * initializeMemoryAgentForUser
 *
 * Idempotent onboarding — skips when a row exists, otherwise seeds empty `struggleTopics` with inferred `role`.
 *
 * @param name - Display name mirrored into `MemoryAgentEntry.name`
 * @param affiliation - `'student' | 'faculty'` controlling `role` mapping
 */
export async function initializeMemoryAgentForUser(
    ctx: MongoDalContext,
    courseName: string,
    userId: string,
    name: string,
    affiliation: 'student' | 'faculty'
): Promise<void> {
    appLogger.log(`[MONGODB] 🧠 Initializing memory agent for userId: ${userId} in course: ${courseName}`);
    try {
        const existingEntry = await getMemoryAgentEntry(ctx, courseName, userId);
        if (existingEntry) {
            appLogger.log(
                `[MONGODB] ℹ️ Memory agent entry already exists for userId: ${userId}, skipping initialization (idempotent)`
            );
            return;
        }
        const role = mapAffiliationToRole(affiliation);
        const newEntry: MemoryAgentEntry = {
            name,
            userId,
            role,
            struggleTopics: [],
            createdAt: new Date(),
            updatedAt: new Date()
        };
        await createMemoryAgentEntry(ctx, courseName, newEntry);
        appLogger.log(`[MONGODB] ✅ Memory agent initialized successfully for userId: ${userId} with role: ${role}`);
    } catch (error) {
        appLogger.error(`[MONGODB] 🚨 Error initializing memory agent:`, error);
        throw error;
    }
}
