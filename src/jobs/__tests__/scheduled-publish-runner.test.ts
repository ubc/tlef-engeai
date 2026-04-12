import {
    runDueScheduledPublishTasks,
    resetScheduledPublishThrottleForTests
} from '../scheduled-publish-runner';
import type { activeCourse, TopicOrWeekInstance, ScheduledTaskDocument } from '../../types/shared';

describe('runDueScheduledPublishTasks', () => {
    beforeEach(() => {
        resetScheduledPublishThrottleForTests();
    });

    function makeTopic(overrides: Partial<TopicOrWeekInstance> = {}): TopicOrWeekInstance {
        return {
            id: 'tw-1',
            date: new Date(),
            title: 'Week 1',
            courseName: 'TestCourse',
            published: false,
            scheduledPublishAt: null,
            items: [],
            createdAt: new Date(),
            updatedAt: new Date(),
            ...overrides
        };
    }

    it('publishes due draft and deletes scheduled task after successful update', async () => {
        const tw = makeTopic({ id: 'tw-1', published: false });
        const course: Partial<activeCourse> = {
            id: 'c1',
            courseName: 'MyCourse',
            topicOrWeekInstances: [tw]
        };

        const task: ScheduledTaskDocument = {
            id: 'task-1',
            type: 'scheduled_topic_or_week',
            scheduledFor: new Date(Date.now() - 1000),
            content: { topicOrWeekId: 'tw-1', title: 'Week 1' },
            courseId: 'c1'
        };

        const mongo = {
            getAllActiveCourses: jest.fn().mockResolvedValue([course]),
            findDueScheduledTasksForCourse: jest.fn().mockResolvedValue([task]),
            getActiveCourse: jest.fn().mockResolvedValue(course),
            updateActiveCourse: jest.fn().mockResolvedValue({ ...course }),
            deleteScheduledTaskById: jest.fn().mockResolvedValue(undefined)
        };

        await runDueScheduledPublishTasks(mongo as any);

        expect(mongo.updateActiveCourse).toHaveBeenCalledWith(
            'c1',
            expect.objectContaining({
                topicOrWeekInstances: expect.arrayContaining([
                    expect.objectContaining({ id: 'tw-1', published: true, scheduledPublishAt: null })
                ])
            })
        );
        expect(mongo.deleteScheduledTaskById).toHaveBeenCalledWith('MyCourse', 'task-1');
    });

    it('keeps scheduled task when updateActiveCourse returns null', async () => {
        const tw = makeTopic();
        const course: Partial<activeCourse> = {
            id: 'c1',
            courseName: 'MyCourse',
            topicOrWeekInstances: [tw]
        };
        const task: ScheduledTaskDocument = {
            id: 'task-1',
            type: 'scheduled_topic_or_week',
            scheduledFor: new Date(Date.now() - 1000),
            content: { topicOrWeekId: 'tw-1', title: 'Week 1' }
        };

        const mongo = {
            getAllActiveCourses: jest.fn().mockResolvedValue([course]),
            findDueScheduledTasksForCourse: jest.fn().mockResolvedValue([task]),
            getActiveCourse: jest.fn().mockResolvedValue(course),
            updateActiveCourse: jest.fn().mockResolvedValue(null),
            deleteScheduledTaskById: jest.fn()
        };

        await runDueScheduledPublishTasks(mongo as any);

        expect(mongo.deleteScheduledTaskById).not.toHaveBeenCalled();
    });

    it('removes orphan scheduled task when topic/week is missing', async () => {
        const course: Partial<activeCourse> = {
            id: 'c1',
            courseName: 'MyCourse',
            topicOrWeekInstances: []
        };
        const task: ScheduledTaskDocument = {
            id: 'task-orphan',
            type: 'scheduled_topic_or_week',
            scheduledFor: new Date(Date.now() - 1000),
            content: { topicOrWeekId: 'gone', title: 'X' }
        };

        const mongo = {
            getAllActiveCourses: jest.fn().mockResolvedValue([course]),
            findDueScheduledTasksForCourse: jest.fn().mockResolvedValue([task]),
            getActiveCourse: jest.fn().mockResolvedValue(course),
            updateActiveCourse: jest.fn(),
            deleteScheduledTaskById: jest.fn().mockResolvedValue(undefined)
        };

        await runDueScheduledPublishTasks(mongo as any);

        expect(mongo.updateActiveCourse).not.toHaveBeenCalled();
        expect(mongo.deleteScheduledTaskById).toHaveBeenCalledWith('MyCourse', 'task-orphan');
    });

    it('deletes scheduled task only when already published (idempotent)', async () => {
        const tw = makeTopic({ published: true });
        const course: Partial<activeCourse> = {
            id: 'c1',
            courseName: 'MyCourse',
            topicOrWeekInstances: [tw]
        };
        const task: ScheduledTaskDocument = {
            id: 'task-1',
            type: 'scheduled_topic_or_week',
            scheduledFor: new Date(Date.now() - 1000),
            content: { topicOrWeekId: 'tw-1', title: 'Week 1' }
        };

        const mongo = {
            getAllActiveCourses: jest.fn().mockResolvedValue([course]),
            findDueScheduledTasksForCourse: jest.fn().mockResolvedValue([task]),
            getActiveCourse: jest.fn().mockResolvedValue(course),
            updateActiveCourse: jest.fn(),
            deleteScheduledTaskById: jest.fn().mockResolvedValue(undefined)
        };

        await runDueScheduledPublishTasks(mongo as any);

        expect(mongo.updateActiveCourse).not.toHaveBeenCalled();
        expect(mongo.deleteScheduledTaskById).toHaveBeenCalledWith('MyCourse', 'task-1');
    });
});
