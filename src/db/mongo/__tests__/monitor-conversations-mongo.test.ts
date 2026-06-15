import { getMonitorConversationUsers } from '../monitor-conversations-mongo';
import * as courseMongo from '../course-mongo';
import * as monitorRosterMongo from '../monitor-roster-mongo';
import type { MongoDalContext } from '../mongo-context';

jest.mock('../course-mongo');
jest.mock('../monitor-roster-mongo');

const ctx = {} as MongoDalContext;

describe('getMonitorConversationUsers', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('maps roster users to conversation rows without struggle fields', async () => {
        jest.spyOn(courseMongo, 'getActiveCourse').mockResolvedValue({
            id: 'course-1',
            courseName: 'CHBE 241'
        } as Awaited<ReturnType<typeof courseMongo.getActiveCourse>>);

        jest.spyOn(monitorRosterMongo, 'getMonitorRosterUsers').mockResolvedValue([
            {
                userId: 'u1',
                userName: 'Alice',
                role: 'student',
                chats: [
                    { id: 'ch1', title: 'Chat 1' },
                    { id: 'ch2', title: 'Chat 2' }
                ]
            },
            {
                userId: 'u2',
                userName: 'Bob',
                role: 'instructor',
                chats: []
            }
        ]);

        const rows = await getMonitorConversationUsers(ctx, 'course-1');

        expect(rows).toEqual([
            {
                userId: 'u1',
                userName: 'Alice',
                role: 'student',
                conversationCount: 2,
                chats: [
                    { id: 'ch1', title: 'Chat 1' },
                    { id: 'ch2', title: 'Chat 2' }
                ]
            },
            {
                userId: 'u2',
                userName: 'Bob',
                role: 'instructor',
                conversationCount: 0,
                chats: []
            }
        ]);
        expect(rows[0]).not.toHaveProperty('struggleTopics');
        expect(rows[0]).not.toHaveProperty('struggleTopicCount');
    });

    it('throws when the course is not found', async () => {
        jest.spyOn(courseMongo, 'getActiveCourse').mockResolvedValue(null);

        await expect(getMonitorConversationUsers(ctx, 'missing')).rejects.toThrow('Course not found');
    });
});
