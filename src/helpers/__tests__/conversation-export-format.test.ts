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
        it('formats per-chapter headings and bullet topics', () => {
            const created = new Date('2026-05-01T12:00:00.000Z');
            const out = formatStruggleTopicsExportText({
                userId: 'u-1',
                name: 'Jane Doe',
                memoryAgentCreatedAt: created,
                struggleTopicsByChapter: [
                    {
                        topicOrWeekId: 'tw-1',
                        topicOrWeekTitle: 'Week 1',
                        struggleTopics: ['loops', 'pointers']
                    }
                ]
            });
            expect(out).toBe(
                `Student name: Jane Doe\nStudent ID: u-1\nMemory agent record created: 2026-05-01T12:00:00.000Z\n\nStruggle topics by chapter:\n\nWeek 1\n- loops\n- pointers\n`
            );
        });

        it('shows not initialized and (none) when missing agent row or empty topics', () => {
            expect(
                formatStruggleTopicsExportText({
                    userId: 'u-2',
                    name: 'Alex',
                    memoryAgentCreatedAt: null,
                    struggleTopicsByChapter: []
                })
            ).toBe(
                `Student name: Alex\nStudent ID: u-2\nMemory agent record created: (not initialized)\n\nStruggle topics by chapter:\n(none)\n`
            );
        });

        it('falls back to flat legacy list when chapters empty', () => {
            const out = formatStruggleTopicsExportText({
                userId: 'u-3',
                name: 'Pat',
                memoryAgentCreatedAt: new Date('2026-05-01T12:00:00.000Z'),
                struggleTopicsByChapter: [],
                struggleTopics: ['legacy-topic']
            });
            expect(out).toContain('Struggle topics:\n- legacy-topic');
        });
    });

    describe('struggleTopicsExportToJsonPayload', () => {
        it('maps to JSON shape with per-chapter structure', () => {
            const d = new Date('2026-05-01T12:00:00.000Z');
            expect(
                struggleTopicsExportToJsonPayload({
                    userId: 'u-1',
                    name: 'Jane',
                    memoryAgentCreatedAt: d,
                    struggleTopicsByChapter: [
                        {
                            topicOrWeekId: 'tw-1',
                            topicOrWeekTitle: 'Week 1',
                            struggleTopics: ['a']
                        }
                    ]
                })
            ).toEqual({
                userId: 'u-1',
                name: 'Jane',
                memoryAgentCreatedAt: '2026-05-01T12:00:00.000Z',
                struggleTopicsByChapter: [
                    {
                        topicOrWeekId: 'tw-1',
                        topicOrWeekTitle: 'Week 1',
                        struggleTopics: ['a']
                    }
                ],
                struggleTopics: ['a']
            });
            expect(
                struggleTopicsExportToJsonPayload({
                    userId: 'u-2',
                    name: 'Pat',
                    memoryAgentCreatedAt: null,
                    struggleTopicsByChapter: [],
                    struggleTopics: []
                })
            ).toEqual({
                userId: 'u-2',
                name: 'Pat',
                memoryAgentCreatedAt: null,
                struggleTopicsByChapter: [],
                struggleTopics: []
            });
        });
    });
});
