import { selectStudentsForAppendix } from '../student-appendix-select';
import type { MonitorStruggleUserRow } from '../../types/shared';

function makeUser(
    overrides: Partial<MonitorStruggleUserRow> & Pick<MonitorStruggleUserRow, 'userId' | 'userName' | 'role'>
): MonitorStruggleUserRow {
    return {
        conversationCount: 0,
        struggleTopicCount: 0,
        struggleTopics: [],
        struggleTopicsByChapter: [],
        chats: [],
        ...overrides
    };
}

describe('selectStudentsForAppendix', () => {
    it('includes only students with struggle data, sorted by name', () => {
        const users: MonitorStruggleUserRow[] = [
            makeUser({
                userId: '1',
                userName: 'Zara',
                role: 'student',
                struggleTopicCount: 2,
                struggleTopicsByChapter: [
                    {
                        topicOrWeekId: 'tw-1',
                        topicOrWeekTitle: 'Topic 1',
                        struggleTopics: ['A', 'B']
                    }
                ]
            }),
            makeUser({
                userId: '2',
                userName: 'Alex',
                role: 'student',
                struggleTopicCount: 1,
                struggleTopicsByChapter: [
                    {
                        topicOrWeekId: 'tw-1',
                        topicOrWeekTitle: 'Topic 1',
                        struggleTopics: ['A']
                    }
                ]
            }),
            makeUser({
                userId: '3',
                userName: 'Instructor One',
                role: 'instructor',
                struggleTopicCount: 1,
                struggleTopicsByChapter: [
                    {
                        topicOrWeekId: 'tw-1',
                        topicOrWeekTitle: 'Topic 1',
                        struggleTopics: ['A']
                    }
                ]
            }),
            makeUser({
                userId: '4',
                userName: 'Empty Student',
                role: 'student',
                struggleTopicCount: 0,
                struggleTopicsByChapter: []
            })
        ];

        const selected = selectStudentsForAppendix(users);

        expect(selected.map((user) => user.userName)).toEqual(['Alex', 'Zara']);
    });
});
