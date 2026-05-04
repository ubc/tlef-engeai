import { formatSingleChatExportText } from '../conversation-export-format';

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
});
