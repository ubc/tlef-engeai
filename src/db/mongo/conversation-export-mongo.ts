// conversation-export-mongo.ts
/**
 * conversation-export-mongo.ts
 * @author EngE-AI
 * @description Instructor ZIP export data: student chat aggregation stream plus roster struggle-topic rows (memory agent).
 */

import type { AggregationCursor, Document } from 'mongodb';
import type { MemoryAgentChapterStruggle } from '../../types/shared';
import type { MongoDalContext } from './mongo-context';
import { getCollectionNames } from './collection-registry-mongo';
import { getCourseUsersMongoCollection } from './course-user-mongo';
import { getCourseByName } from './course-mongo';
import { getAllInstructorStruggleTopics } from './topic-week-mongo';
import {
    deriveStruggleTopicsByChapter,
    type MemoryAgentRawDoc
} from '../../helpers/struggle-chapter-normalize';
import { coerceAndCleanupMemoryAgentRawRow } from './memory-agent-mongo';

/** Projected chat document embedded in each export row. */
export interface ConversationZipExportChatProjection {
    id: string;
    courseName?: string;
    topicOrWeekTitle?: string;
    itemTitle?: string;
    title?: string;
    createdAt?: unknown;
    messages: Array<{
        sender?: string;
        role?: string;
        text?: string;
        content?: unknown;
        timestamp?: number;
    }>;
}

/** One unwinded chat row for bulk export (TXT or JSON ZIP entry). */
export interface ConversationZipExportRow {
    userId: string;
    studentName: string;
    chat: ConversationZipExportChatProjection;
}

/**
 * Aggregation stages: students → unwind chats → exclude soft-deleted → project messages fields → sort.
 * Exported for tests that verify pipeline shape.
 */
export function studentConversationZipExportPipeline(): Document[] {
    return [
        { $match: { affiliation: 'student' } },
        { $unwind: { path: '$chats', preserveNullAndEmptyArrays: false } },
        {
            $match: {
                $expr: { $ne: ['$chats.isDeleted', true] }
            }
        },
        {
            $addFields: {
                studentName: { $ifNull: ['$name', 'Unknown'] },
                __sortTs: {
                    $reduce: {
                        input: { $ifNull: ['$chats.messages', []] },
                        initialValue: 0,
                        in: { $max: ['$$value', { $ifNull: ['$$this.timestamp', 0] }] }
                    }
                }
            }
        },
        { $sort: { studentName: 1, userId: 1, __sortTs: -1 } },
        {
            $project: {
                _id: 0,
                userId: 1,
                studentName: 1,
                chat: {
                    id: '$chats.id',
                    courseName: '$chats.courseName',
                    topicOrWeekTitle: '$chats.topicOrWeekTitle',
                    itemTitle: '$chats.itemTitle',
                    title: '$chats.title',
                    createdAt: '$chats.createdAt',
                    messages: {
                        $map: {
                            input: { $ifNull: ['$chats.messages', []] },
                            as: 'm',
                            in: {
                                sender: '$$m.sender',
                                role: '$$m.role',
                                text: '$$m.text',
                                content: '$$m.content',
                                timestamp: '$$m.timestamp'
                            }
                        }
                    }
                }
            }
        }
    ];
}

/**
 * aggregateStudentChatsForZipExport
 *
 * @param ctx - MongoDalContext
 * @param courseName - logical course name (`{courseName}_users`)
 *
 * @returns AggregationCursor streaming `{ userId, studentName, chat }` rows (non-deleted student chats).
 */
export async function aggregateStudentChatsForZipExport(
    ctx: MongoDalContext,
    courseName: string
): Promise<AggregationCursor<ConversationZipExportRow>> {
    const coll = await getCourseUsersMongoCollection(ctx, courseName);
    return coll.aggregate<ConversationZipExportRow>(studentConversationZipExportPipeline(), {
        allowDiskUse: true
    });
}

/** Student roster slice + memory-agent fields for `Struggle topics/` ZIP entries. */
export interface StudentStruggleZipRow {
    userId: string;
    studentName: string;
    /** When no `{course}_memory-agent` document exists for the user. */
    memoryAgentCreatedAt: Date | null;
    struggleTopicsByChapter: MemoryAgentChapterStruggle[];
    /** Flat distinct labels derived from chapters or legacy flat storage. */
    struggleTopics: string[];
}

function parseMemoryAgentCreatedAt(value: unknown): Date | null {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value;
    }
    if (typeof value === 'string' || typeof value === 'number') {
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? null : d;
    }
    return null;
}

/**
 * List all course students sorted by display name then `userId`, with per-chapter struggle topics when a row exists.
 *
 * Used by instructor conversations ZIP exports (`Struggle topics/` folder).
 *
 * @param ctx - MongoDalContext
 * @param courseName - logical course name
 */
export async function listStudentStruggleRowsForZipExport(
    ctx: MongoDalContext,
    courseName: string
): Promise<StudentStruggleZipRow[]> {

    const usersColl = await getCourseUsersMongoCollection(ctx, courseName);
    const docs = await usersColl
        .find({ affiliation: 'student' }, { projection: { userId: 1, name: 1 } })
        .toArray();

    const sorted = docs
        .map((d) => ({
            userId: d.userId as string,
            studentName: ((d as { name?: string }).name || 'Unknown').trim() || 'Unknown'
        }))
        .sort((a, b) => {
            const nameCmp = a.studentName.localeCompare(b.studentName, undefined, { sensitivity: 'base' });
            if (nameCmp !== 0) return nameCmp;
            return a.userId.localeCompare(b.userId);
        });

    const userIds = sorted.map((s) => s.userId);
    if (userIds.length === 0) {
        return [];
    }

    const course = await getCourseByName(ctx, courseName);
    const catalog = course?.id ? await getAllInstructorStruggleTopics(ctx, course.id) : [];

    const names = await getCollectionNames(ctx, courseName);
    const memColl = ctx.db.collection(names.memoryAgent);
    const entries = await memColl
        .find(
            { userId: { $in: userIds } },
            { projection: { userId: 1, struggleTopics: 1, struggleTopicsByChapter: 1, createdAt: 1, name: 1, role: 1, updatedAt: 1 } }
        )
        .toArray();
    const byUser = new Map<
        string,
        { struggleTopicsByChapter: MemoryAgentChapterStruggle[]; struggleTopics: string[]; memoryAgentCreatedAt: Date | null }
    >();

    for (const e of entries) {
        const row = e as unknown as MemoryAgentRawDoc;
        if (typeof row.userId !== 'string') continue;
        const flatLabels = await coerceAndCleanupMemoryAgentRawRow(ctx, courseName, row);
        byUser.set(row.userId, {
            struggleTopicsByChapter: deriveStruggleTopicsByChapter(flatLabels, catalog),
            struggleTopics: flatLabels,
            memoryAgentCreatedAt: parseMemoryAgentCreatedAt(row.createdAt)
        });
    }

    return sorted.map((s) => {
        const mem = byUser.get(s.userId);
        return {
            userId: s.userId,
            studentName: s.studentName,
            memoryAgentCreatedAt: mem?.memoryAgentCreatedAt ?? null,
            struggleTopicsByChapter: mem?.struggleTopicsByChapter ?? [],
            struggleTopics: mem?.struggleTopics ?? []
        };
    });
}
