// conversation-export-mongo.ts
/**
 * conversation-export-mongo.ts
 * @author EngE-AI
 * @description MongoDB aggregation **only**: streams lean student chat rows for ZIP export (no ZIP / formatting).
 */

import type { AggregationCursor, Document } from 'mongodb';
import type { MongoDalContext } from './mongo-context';
import { getCourseUsersMongoCollection } from './course-user-mongo';

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
