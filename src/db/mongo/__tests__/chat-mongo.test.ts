/**
 * Chat Mongo conversation-star retirement tests
 *
 * Verifies that historical `isPinned` values remain harmless in MongoDB while
 * current full-chat and metadata reads omit the retired conversation feature.
 * Message-level `pinnedMessageId` remains part of the supported contract.
 *
 * @author: @rdschrs
 * @date: 2026-07-31
 * @version: 1.0.0
 * @description: Regression coverage for removing chat starring without mutating legacy records.
 */

import type { MongoDalContext } from '../mongo-context';

jest.mock('../course-user-mongo', () => ({
    getCourseUsersMongoCollection: jest.fn(),
}));

import { getCourseUsersMongoCollection } from '../course-user-mongo';
import { getUserChats, getUserChatsMetadata } from '../chat-mongo';

const ctx = {} as MongoDalContext;

function storedChat(id: string, timestamp: number, isPinned: boolean, isDeleted = false) {
    return {
        id,
        courseName: 'CHBE 241',
        topicOrWeekTitle: '',
        itemTitle: `Chat ${id}`,
        messages: [{ id: `message-${id}`, timestamp }],
        isPinned,
        pinnedMessageId: `message-${id}`,
        isDeleted,
    };
}

describe('chat conversation-star retirement', () => {
    let findOne: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        findOne = jest.fn();
        (getCourseUsersMongoCollection as jest.Mock).mockResolvedValue({ findOne });
    });

    it('omits legacy isPinned from full chat reads while preserving message pins', async () => {
        const active = storedChat('active', 100, true);
        const deleted = storedChat('deleted', 200, true, true);
        findOne.mockResolvedValue({ userId: 'user-1', chats: [active, deleted] });

        const chats = await getUserChats(ctx, 'CHBE 241', 'user-1');

        expect(chats).toEqual([
            expect.objectContaining({ id: 'active', pinnedMessageId: 'message-active' }),
        ]);
        expect(chats[0]).not.toHaveProperty('isPinned');
        expect(active).toHaveProperty('isPinned', true);
    });

    it('returns metadata in activity order without conversation-star state', async () => {
        findOne.mockResolvedValue({
            userId: 'user-1',
            chats: [storedChat('older', 100, true), storedChat('newer', 200, false)],
        });

        const metadata = await getUserChatsMetadata(ctx, 'CHBE 241', 'user-1');

        expect(metadata.map((chat) => chat.id)).toEqual(['newer', 'older']);
        expect(metadata).toEqual(expect.arrayContaining([
            expect.objectContaining({ id: 'older', pinnedMessageId: 'message-older' }),
        ]));
        expect(metadata.every((chat) => !Object.prototype.hasOwnProperty.call(chat, 'isPinned'))).toBe(true);
    });
});
