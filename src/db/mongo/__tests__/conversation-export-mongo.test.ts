import type { ConversationZipExportRow } from '../conversation-export-mongo';
import { studentConversationZipExportPipeline } from '../conversation-export-mongo';

describe('conversation-export-mongo', () => {
    it('aggregation pipeline matches snapshot', () => {
        expect(studentConversationZipExportPipeline()).toMatchSnapshot();
    });

    it('pretty-printed JSON row matches snapshot', () => {
        const sampleRow: ConversationZipExportRow = {
            userId: 'u-sample',
            studentName: 'Alex Student',
            chat: {
                id: 'chat-sample',
                courseName: 'DemoCourse',
                topicOrWeekTitle: 'Week 1',
                itemTitle: 'My chat',
                title: '',
                createdAt: '2026-05-03',
                messages: [{ sender: 'user', text: 'Question?', timestamp: 1715000000000 }]
            }
        };
        expect(JSON.stringify(sampleRow, null, 2)).toMatchSnapshot();
    });
});
