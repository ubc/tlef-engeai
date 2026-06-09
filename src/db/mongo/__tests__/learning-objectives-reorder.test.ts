import type { Db } from 'mongodb';
import {
    InvalidLearningObjectiveReorderError,
    reorderLearningObjectives
} from '../topic-week-mongo';
import type { MongoDalContext } from '../mongo-context';

type LearningObjective = {
    id: string;
    LearningObjective: string;
    createdAt: Date;
    updatedAt: string;
};

type CourseDoc = {
    id: string;
    topicOrWeekInstances: Array<{
        id: string;
        title: string;
        items: Array<{
            id: string;
            title?: string;
            learningObjectives?: LearningObjective[];
        }>;
    }>;
    updatedAt?: string;
};

function makeDb(getDoc: () => CourseDoc) {
    let updateCount = 0;
    const db = {
        collection: (_name: string) => ({
            findOne: async (filter: Record<string, unknown>) => {
                const doc = getDoc();
                if (filter.id === doc.id) {
                    return doc;
                }
                return null;
            },
            findOneAndUpdate: async (
                filter: Record<string, unknown>,
                update: Record<string, unknown>
            ) => {
                updateCount += 1;
                const doc = getDoc();
                if (filter.id !== doc.id) {
                    return null;
                }
                const instanceId = filter['topicOrWeekInstances.id'];
                const itemId = filter['topicOrWeekInstances.items.id'];
                const instance = doc.topicOrWeekInstances.find((i) => i.id === instanceId);
                const item = instance?.items.find((it) => it.id === itemId);
                if (!instance || !item) {
                    return null;
                }

                if (update.$set) {
                    const sets = update.$set as Record<string, unknown>;
                    for (const [path, value] of Object.entries(sets)) {
                        if (
                            path ===
                            'topicOrWeekInstances.$[instance].items.$[item].learningObjectives'
                        ) {
                            item.learningObjectives = value as LearningObjective[];
                        }
                        if (path === 'updatedAt') {
                            doc.updatedAt = value as string;
                        }
                    }
                }

                return doc;
            }
        }),
        getUpdateCount: () => updateCount
    };
    return db as unknown as Db & { getUpdateCount: () => number };
}

const createdAt = new Date('2026-01-01T00:00:00.000Z');

const baseCourse: CourseDoc = {
    id: 'course-1',
    topicOrWeekInstances: [
        {
            id: 'tw-1',
            title: 'Week 1',
            items: [
                {
                    id: 'item-1',
                    title: 'Lecture 1',
                    learningObjectives: [
                        {
                            id: 'lo-a',
                            LearningObjective: 'Objective A',
                            createdAt,
                            updatedAt: '2026-01-01'
                        },
                        {
                            id: 'lo-b',
                            LearningObjective: 'Objective B',
                            createdAt,
                            updatedAt: '2026-01-02'
                        }
                    ]
                }
            ]
        }
    ]
};

describe('learning-objectives-reorder', () => {
    let courseDoc: CourseDoc;
    let db: ReturnType<typeof makeDb>;

    beforeEach(() => {
        courseDoc = structuredClone(baseCourse);
        db = makeDb(() => courseDoc);
    });

    const ctx = (): MongoDalContext =>
        ({ db } as unknown as MongoDalContext);

    it('valid permutation persists order', async () => {
        const result = await reorderLearningObjectives(
            ctx(),
            'course-1',
            'tw-1',
            'item-1',
            ['lo-b', 'lo-a']
        );

        expect(result.changed).toBe(true);
        expect(result.data.map((o) => o.id)).toEqual(['lo-b', 'lo-a']);
    });

    it('same order is a noop without findOneAndUpdate', async () => {
        const result = await reorderLearningObjectives(
            ctx(),
            'course-1',
            'tw-1',
            'item-1',
            ['lo-a', 'lo-b']
        );

        expect(result.changed).toBe(false);
        expect(result.data.map((o) => o.id)).toEqual(['lo-a', 'lo-b']);
        expect(db.getUpdateCount()).toBe(0);
    });

    it('unknown id throws InvalidLearningObjectiveReorderError', async () => {
        await expect(
            reorderLearningObjectives(ctx(), 'course-1', 'tw-1', 'item-1', ['lo-a', 'missing'])
        ).rejects.toThrow(InvalidLearningObjectiveReorderError);
    });
});
