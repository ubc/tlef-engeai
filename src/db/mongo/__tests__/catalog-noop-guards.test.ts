import type { Db } from 'mongodb';
import {
    reorderInstructorStruggleTopics,
    reorderTopicOrWeekInstances,
    updateInstructorStruggleTopic,
    updateLearningObjective
} from '../topic-week-mongo';
import type { MongoDalContext } from '../mongo-context';

type CourseDoc = {
    id: string;
    topicOrWeekInstances: Array<{
        id: string;
        title: string;
        items: Array<{
            id: string;
            title?: string;
            learningObjectives?: Array<{
                id: string;
                LearningObjective: string;
                createdAt: Date;
                updatedAt: string;
            }>;
            instructorStruggleTopics?: Array<{
                id: string;
                struggleTopic: string;
                createdAt: Date;
                updatedAt: string;
            }>;
        }>;
    }>;
};

function makeDb(getDoc: () => CourseDoc) {
    let updateCount = 0;
    const api = {
        collection: (_name: string) => ({
            findOne: async (filter: Record<string, unknown>) => {
                const doc = getDoc();
                return filter.id === doc.id ? doc : null;
            },
            findOneAndUpdate: async (
                _filter: Record<string, unknown>,
                update: Record<string, unknown>
            ) => {
                updateCount += 1;
                const doc = getDoc();
                if (update.$set) {
                    const sets = update.$set as Record<string, unknown>;
                    if (sets.topicOrWeekInstances) {
                        doc.topicOrWeekInstances = sets.topicOrWeekInstances as CourseDoc['topicOrWeekInstances'];
                    }
                }
                return doc;
            }
        }),
        getUpdateCount: () => updateCount
    };
    return api as unknown as Db & { getUpdateCount: () => number };
}

const createdAt = new Date('2026-01-01T00:00:00.000Z');

describe('catalog-noop-guards', () => {
    let courseDoc: CourseDoc;
    let db: ReturnType<typeof makeDb>;

    beforeEach(() => {
        courseDoc = {
            id: 'course-1',
            topicOrWeekInstances: [
                {
                    id: 'tw-1',
                    title: 'Week 1',
                    items: [
                        {
                            id: 'item-1',
                            learningObjectives: [
                                {
                                    id: 'lo-1',
                                    LearningObjective: 'Same text',
                                    createdAt,
                                    updatedAt: '2026-01-01'
                                }
                            ],
                            instructorStruggleTopics: [
                                {
                                    id: 'st-1',
                                    struggleTopic: 'Same label',
                                    createdAt,
                                    updatedAt: '2026-01-01'
                                }
                            ]
                        }
                    ]
                }
            ]
        };
        db = makeDb(() => courseDoc);
    });

    const ctx = (): MongoDalContext =>
        ({ db } as unknown as MongoDalContext);

    it('updateLearningObjective skips write when text unchanged', async () => {
        const result = await updateLearningObjective(
            ctx(),
            'course-1',
            'tw-1',
            'item-1',
            'lo-1',
            { LearningObjective: 'Same text' }
        );

        expect(result.changed).toBe(false);
        expect(result.data?.LearningObjective).toBe('Same text');
        expect(db.getUpdateCount()).toBe(0);
    });

    it('updateInstructorStruggleTopic skips write when label unchanged', async () => {
        const result = await updateInstructorStruggleTopic(
            ctx(),
            'course-1',
            'tw-1',
            'item-1',
            'st-1',
            { struggleTopic: 'Same label' }
        );

        expect(result.changed).toBe(false);
        expect(result.data?.struggleTopic).toBe('Same label');
        expect(db.getUpdateCount()).toBe(0);
    });

    it('reorderInstructorStruggleTopics skips write when order unchanged', async () => {
        const result = await reorderInstructorStruggleTopics(
            ctx(),
            'course-1',
            'tw-1',
            'item-1',
            ['st-1']
        );

        expect(result.changed).toBe(false);
        expect(db.getUpdateCount()).toBe(0);
    });

    it('reorderTopicOrWeekInstances skips write when order unchanged', async () => {
        const result = await reorderTopicOrWeekInstances(ctx(), 'course-1', ['tw-1']);

        expect(result.changed).toBe(false);
        expect(db.getUpdateCount()).toBe(0);
    });
});
