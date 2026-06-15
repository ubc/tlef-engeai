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

import {

    coerceFlatStruggleTopicsFromRaw,

    parseMemoryAgentEntry,

    rawHasLegacyChapterField,

    sanitizeStruggleLabels,

    type MemoryAgentRawDoc

} from '../../helpers/struggle-chapter-normalize';



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

 * Lazily removes legacy `struggleTopicsByChapter` from Mongo when encountered, preserving merged flat labels.

 */

async function cleanupLegacyChapterFieldIfPresent(

    ctx: MongoDalContext,

    courseName: string,

    userId: string,

    raw: MemoryAgentRawDoc,

    flatLabels: string[]

): Promise<void> {

    if (!rawHasLegacyChapterField(raw)) {

        return;

    }



    const memoryAgentCollection = await getMemoryAgentCollection(ctx, courseName);

    await memoryAgentCollection.updateOne(

        { userId },

        {

            $set: {

                struggleTopics: flatLabels,

                updatedAt: new Date()

            },

            $unset: { struggleTopicsByChapter: '' }

        }

    );

    appLogger.log(

        `[MONGODB] 🧹 Removed legacy struggleTopicsByChapter for userId: ${userId} in course: ${courseName}`

    );

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

        const doc = {

            ...entry,

            struggleTopics: sanitizeStruggleLabels(entry.struggleTopics ?? [])

        };

        await memoryAgentCollection.insertOne(doc as any);

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

 * Read-only fetch by roster `userId`. Lazily removes legacy `struggleTopicsByChapter` when present.

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

        const raw = (await memoryAgentCollection.findOne({ userId })) as unknown as MemoryAgentRawDoc | null;

        if (!raw) {

            appLogger.log(`[MONGODB] ⚠️ Memory agent entry not found for userId: ${userId}`);

            return null;

        }



        const flatLabels = coerceFlatStruggleTopicsFromRaw(raw);

        await cleanupLegacyChapterFieldIfPresent(ctx, courseName, userId, raw, flatLabels);



        const entry = parseMemoryAgentEntry({ ...raw, struggleTopics: flatLabels });

        appLogger.log(`[MONGODB] ✅ Found memory agent entry for userId: ${userId}`);

        return entry;

    } catch (error) {

        appLogger.error(`[MONGODB] 🚨 Error getting memory agent entry:`, error);

        throw error;

    }

}



/**

 * Persists flat struggle labels and clears any legacy per-chapter field.

 *

 * @param ctx - MongoDalContext

 * @param courseName - string

 * @param userId - string

 * @param struggleTopics - distinct verbatim labels

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

    try {

        const memoryAgentCollection = await getMemoryAgentCollection(ctx, courseName);

        const labels = sanitizeStruggleLabels(struggleTopics);

        const result = await memoryAgentCollection.findOneAndUpdate(

            { userId },

            {

                $set: {

                    struggleTopics: labels,

                    updatedAt: new Date()

                },

                $unset: { struggleTopicsByChapter: '' }

            },

            { returnDocument: 'after' }

        );

        if (!result) {

            throw new Error(`Memory agent entry not found for userId: ${userId}`);

        }

        appLogger.log(`[MONGODB] ✅ Struggle words updated for userId: ${userId}`);

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



/**

 * Coerces flat labels from a raw Mongo row and lazily removes legacy `struggleTopicsByChapter` when present.

 * Used by batch export paths that do not call {@link getMemoryAgentEntry} per user.

 */

export async function coerceAndCleanupMemoryAgentRawRow(

    ctx: MongoDalContext,

    courseName: string,

    raw: MemoryAgentRawDoc

): Promise<string[]> {

    const flatLabels = coerceFlatStruggleTopicsFromRaw(raw);

    if (typeof raw.userId === 'string') {

        await cleanupLegacyChapterFieldIfPresent(ctx, courseName, raw.userId, raw, flatLabels);

    }

    return flatLabels;

}



/**

 * Reads all memory-agent rows for a course (read-only coercion; no legacy field cleanup).

 */

export async function getAllMemoryAgentEntries(

    ctx: MongoDalContext,

    courseName: string

): Promise<MemoryAgentEntry[]> {

    const memoryAgentCollection = await getMemoryAgentCollection(ctx, courseName);

    const rows = await memoryAgentCollection.find({}).toArray();

    return rows.map((raw) => parseMemoryAgentEntry(raw as unknown as MemoryAgentRawDoc));

}


