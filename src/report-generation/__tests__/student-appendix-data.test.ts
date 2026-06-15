import { buildStudentAppendixPdfRows } from '../report-data';
import type { CourseSummaryStackedBar, MonitorStruggleUserRow } from '../../types/shared';

const stackedBar: CourseSummaryStackedBar = {
    xAxisLabel: 'Course Topic',
    yAxisLabel: 'Students',
    categories: [
        { id: 'tw-1', label: 'Topic 1', order: 0 },
        { id: 'tw-2', label: 'Topic 2', order: 1 }
    ],
    series: [
        {
            topic: 'enthalpy',
            color: '#111111',
            values: [
                { categoryId: 'tw-2', studentCount: 3, tooltip: '' },
                { categoryId: 'tw-1', studentCount: 0, tooltip: '' }
            ]
        },
        {
            topic: 'entropy',
            color: '#222222',
            values: [{ categoryId: 'tw-2', studentCount: 2, tooltip: '' }]
        }
    ]
};

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

describe('buildStudentAppendixPdfRows', () => {
    it('includes all students with chapter-binned topic groups', () => {
        const users: MonitorStruggleUserRow[] = [
            makeUser({
                userId: 's1',
                userName: 'Alex Student',
                role: 'student',
                struggleTopicCount: 2,
                struggleTopicsByChapter: [
                    {
                        topicOrWeekId: 'tw-2',
                        topicOrWeekTitle: 'Topic 2',
                        struggleTopics: ['enthalpy', 'entropy']
                    }
                ]
            }),
            makeUser({
                userId: 's2',
                userName: 'Jordan Lee',
                role: 'student',
                struggleTopicCount: 0,
                struggleTopicsByChapter: []
            }),
            makeUser({
                userId: 'i1',
                userName: 'Instructor',
                role: 'instructor',
                struggleTopicCount: 1,
                struggleTopicsByChapter: [
                    {
                        topicOrWeekId: 'tw-2',
                        topicOrWeekTitle: 'Topic 2',
                        struggleTopics: ['enthalpy']
                    }
                ]
            })
        ];

        const rows = buildStudentAppendixPdfRows(users, stackedBar);

        expect(rows).toEqual([
            {
                userName: 'Alex Student',
                chapterGroups: [{ chapterNum: 2, topics: ['enthalpy', 'entropy'] }]
            },
            {
                userName: 'Jordan Lee',
                chapterGroups: []
            }
        ]);
    });

    it('bins multiple topics under the same chapter into one group', () => {
        const users: MonitorStruggleUserRow[] = [
            makeUser({
                userId: 's1',
                userName: 'Sam Patel',
                role: 'student',
                struggleTopicCount: 2,
                struggleTopicsByChapter: [
                    {
                        topicOrWeekId: 'tw-2',
                        topicOrWeekTitle: 'Topic 2',
                        struggleTopics: ['enthalpy', 'entropy']
                    }
                ]
            })
        ];

        const rows = buildStudentAppendixPdfRows(users, stackedBar);

        expect(rows[0].chapterGroups).toHaveLength(1);
        expect(rows[0].chapterGroups[0].topics).toEqual(['enthalpy', 'entropy']);
    });

    it('does not embed course-wide student counts in chapter groups', () => {
        const users: MonitorStruggleUserRow[] = [
            makeUser({
                userId: 's1',
                userName: 'Alex Student',
                role: 'student',
                struggleTopicCount: 1,
                struggleTopicsByChapter: [
                    {
                        topicOrWeekId: 'tw-2',
                        topicOrWeekTitle: 'Topic 2',
                        struggleTopics: ['enthalpy']
                    }
                ]
            })
        ];

        const rows = buildStudentAppendixPdfRows(users, stackedBar);

        expect(rows[0].chapterGroups[0]).toEqual({ chapterNum: 2, topics: ['enthalpy'] });
        expect(JSON.stringify(rows[0].chapterGroups)).not.toMatch(/studentCount/);
    });
});
