import {
    formatSingleChatExportText,
    formatStruggleTopicsExportText,
    struggleTopicsExportToJsonPayload
} from '../conversation-export-format';

describe('formatSingleChatExportText', () => {
    it('matches golden transcript layout for sample chat', () => {
        const out = formatSingleChatExportText({
            courseName: 'CHBE 241',
            studentDisplayName: 'Jane Doe',
            studentUserId: 'roster-1',
            chatId: 'chat-a',
            chat: {
                topicOrWeekTitle: 'Week 2',
                itemTitle: 'Lab help',
                messages: [
                    { sender: 'user', text: 'Hello', timestamp: 1700000000000 },
                    { sender: 'bot', text: 'Hi there', timestamp: 1700000000500 }
                ]
            }
        });

        expect(out).toBe(
            `========================================
CHAT CONVERSATION EXPORT
========================================

Student: Jane Doe
Student ID: roster-1
Course: CHBE 241
Chat ID: chat-a
Chat Title: Lab help
Topic/Week: Week 2
Created: N/A
========================================

--- Messages ---

Message 1:
  Role: Student
  Content: Hello
  Timestamp: 1700000000000

Message 2:
  Role: Assistant
  Content: Hi there
  Timestamp: 1700000000500
`
        );
    });

    describe('formatStruggleTopicsExportText', () => {
        it('formats header, ISO date, and bullet topics', () => {
            const created = new Date('2026-05-01T12:00:00.000Z');
            const out = formatStruggleTopicsExportText({
                userId: 'u-1',
                name: 'Jane Doe',
                memoryAgentCreatedAt: created,
                struggleTopics: ['loops', 'pointers']
            });
            expect(out).toBe(
                `Student name: Jane Doe\nStudent ID: u-1\nMemory agent record created: 2026-05-01T12:00:00.000Z\n\nStruggle topics:\n- loops\n- pointers\n`
            );
        });

        it('shows not initialized and (none) when missing agent row or empty topics', () => {
            expect(
                formatStruggleTopicsExportText({
                    userId: 'u-2',
                    name: 'Alex',
                    memoryAgentCreatedAt: null,
                    struggleTopics: []
                })
            ).toBe(
                `Student name: Alex\nStudent ID: u-2\nMemory agent record created: (not initialized)\n\nStruggle topics:\n(none)\n`
            );
        });
    });

    describe('struggleTopicsExportToJsonPayload', () => {
        it('maps to JSON shape with ISO string or null', () => {
            const d = new Date('2026-05-01T12:00:00.000Z');
            expect(
                struggleTopicsExportToJsonPayload({
                    userId: 'u-1',
                    name: 'Jane',
                    memoryAgentCreatedAt: d,
                    struggleTopics: ['a']
                })
            ).toEqual({
                userId: 'u-1',
                name: 'Jane',
                memoryAgentCreatedAt: '2026-05-01T12:00:00.000Z',
                struggleTopics: ['a']
            });
            expect(
                struggleTopicsExportToJsonPayload({
                    userId: 'u-2',
                    name: 'Pat',
                    memoryAgentCreatedAt: null,
                    struggleTopics: []
                })
            ).toEqual({
                userId: 'u-2',
                name: 'Pat',
                memoryAgentCreatedAt: null,
                struggleTopics: []
            });
        });
    });
});
