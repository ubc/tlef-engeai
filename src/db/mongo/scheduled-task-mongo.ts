// scheduled-task-mongo.ts
/**
 * scheduled-task-mongo.ts
 * @author @gatahcha (refactor)
 * @description Auto-publish jobs stored in each course’s **`{courseName}_scheduled_tasks`** collection.
 *
 * One document per topic/week id (enforced by unique index on `content.topicOrWeekId`). The publish runner queries by `scheduledFor`.
 */

import type { Collection } from 'mongodb';
import { randomUUID } from 'crypto';
import type { ScheduledTaskDocument } from '../../types/shared';
import { getCollectionNames } from './collection-registry-mongo';
import type { MongoDalContext } from './mongo-context';
import { appLogger } from '../../utils/logger';

/**
 * Creates index keys on `scheduledFor` and unique `content.topicOrWeekId` once per physical collection name.
 *
 * @param ctx - MongoDalContext — owns `scheduledTasksIndexesEnsured`
 * @param collection - `Collection` — scheduled-tasks collection handle
 *
 * @returns Promise<void>
 *
 * Actions:
 * - No-op if collection name already tracked in `scheduledTasksIndexesEnsured`.
 * - Attempt `createIndex` calls; swallow/log duplicate errors.
 * - Always record the collection name after the attempt so repeated calls stay cheap.
 */
async function ensureScheduledTasksIndexes(ctx: MongoDalContext, collection: Collection): Promise<void> {
    const name = collection.collectionName;
    if (ctx.scheduledTasksIndexesEnsured.has(name)) {
        return;
    }
    try {
        await collection.createIndex({ scheduledFor: 1 });
        await collection.createIndex({ 'content.topicOrWeekId': 1 }, { unique: true });
    } catch (e) {
        appLogger.warn(`[MONGODB] scheduled-tasks index create (may already exist):`, e);
    }
    ctx.scheduledTasksIndexesEnsured.add(name);
}

async function getScheduledTasksCollection(ctx: MongoDalContext, courseName: string): Promise<Collection> {
    const names = await getCollectionNames(ctx, courseName);
    const col = ctx.db.collection(names.scheduledTasks);
    await ensureScheduledTasksIndexes(ctx, col);
    return col;
}

/**
 * upsertScheduledTopicOrWeekTask
 *
 * Inserts or replaces the scheduled row for a draft topic/week while keeping a stable `id` when updating.
 *
 * @param ctx - MongoDalContext
 * @param courseName - string — namespace for the scheduled-tasks collection
 * @param courseId - string — `activeCourse.id` (debug / audit on the task doc)
 * @param topicOrWeekId - string — topic/week instance id to publish
 * @param title - string — denormalized label for logs/UI
 * @param scheduledFor - Date — UTC instant when the runner should publish
 *
 * @returns Promise<void>
 *
 * Actions:
 * - Resolve collection + indexes.
 * - `findOne` by `content.topicOrWeekId`.
 * - If row exists: `replaceOne` preserving `id`; else `insertOne` with new `randomUUID()`.
 */
export async function upsertScheduledTopicOrWeekTask(
    ctx: MongoDalContext,
    courseName: string,
    courseId: string,
    topicOrWeekId: string,
    title: string,
    scheduledFor: Date
): Promise<void> {
    const col = await getScheduledTasksCollection(ctx, courseName);
    const existing = await col.findOne({ 'content.topicOrWeekId': topicOrWeekId });
    const id = (existing as { id?: string } | null)?.id ?? randomUUID();
    const doc: ScheduledTaskDocument = {
        id,
        type: 'scheduled_topic_or_week',
        scheduledFor,
        content: { topicOrWeekId, title },
        courseId
    };
    if (existing) {
        await col.replaceOne({ id }, doc as any);
    } else {
        await col.insertOne(doc as any);
    }
}

/**
 * deleteScheduledTaskByTopicOrWeekId
 *
 * Removes **all** tasks tied to one topic/week (cancel schedule, manual publish cleanup, orphan repair).
 *
 * @param ctx - MongoDalContext
 * @param courseName - string
 * @param topicOrWeekId - string
 *
 * @returns Promise<void>
 *
 * Actions:
 * - `deleteMany({ 'content.topicOrWeekId': topicOrWeekId })` on scheduled-tasks namespace.
 */
export async function deleteScheduledTaskByTopicOrWeekId(
    ctx: MongoDalContext,
    courseName: string,
    topicOrWeekId: string
): Promise<void> {
    const names = await getCollectionNames(ctx, courseName);
    await ctx.db.collection(names.scheduledTasks).deleteMany({ 'content.topicOrWeekId': topicOrWeekId });
}

/**
 * deleteScheduledTaskById
 *
 * Deletes exactly one scheduler row after successful publish or when removing a stray task doc.
 *
 * @param ctx - MongoDalContext
 * @param courseName - string
 * @param taskId - string — `ScheduledTaskDocument.id`
 *
 * @returns Promise<void>
 */
export async function deleteScheduledTaskById(
    ctx: MongoDalContext,
    courseName: string,
    taskId: string
): Promise<void> {
    const names = await getCollectionNames(ctx, courseName);
    await ctx.db.collection(names.scheduledTasks).deleteOne({ id: taskId });
}

/**
 * findDueScheduledTasksForCourse
 *
 * Returns tasks whose `scheduledFor` is **on or before** `before` (inclusive), for the publish runner.
 *
 * @param ctx - MongoDalContext
 * @param courseName - string
 * @param before - Date — upper bound (typically `new Date()`)
 *
 * @returns Promise<ScheduledTaskDocument[]>
 *
 * Actions:
 * - Ensure indexes, then `find({ scheduledFor: { $lte: before } })` and map to typed array.
 */
export async function findDueScheduledTasksForCourse(
    ctx: MongoDalContext,
    courseName: string,
    before: Date
): Promise<ScheduledTaskDocument[]> {
    const col = await getScheduledTasksCollection(ctx, courseName);
    const rows = await col.find({ scheduledFor: { $lte: before } }).toArray();
    return rows as unknown as ScheduledTaskDocument[];
}
