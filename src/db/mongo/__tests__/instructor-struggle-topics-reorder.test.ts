import type { Db } from 'mongodb';
import {
    InvalidInstructorStruggleTopicReorderError,
    reorderInstructorStruggleTopics
} from '../topic-week-mongo';
import type { MongoDalContext } from '../mongo-context';

type StruggleTopic = {
    id: string;
    struggleTopic: string;
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
            itemTitle?: string;
            title?: string;
            instructorStruggleTopics?: StruggleTopic[];
        }>;
    }>;
    updatedAt?: string;
};

function makeDb(getDoc: () => CourseDoc) {
    return {
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
                update: Record<string, unknown>,
                _options?: { arrayFilters?: Record<string, unknown>[]; returnDocument?: string }
            ) => {
                const doc = getDoc();
                if (filter.id !== doc.id) {
                    return { value: null };
                }
                const instanceId = filter['topicOrWeekInstances.id'];
                const itemId = filter['topicOrWeekInstances.items.id'];
                const instance = doc.topicOrWeekInstances.find((i) => i.id === instanceId);
                const item = instance?.items.find((it) => it.id === itemId);
                if (!instance || !item) {
                    return { value: null };
                }

                if (update.$set) {
                    const sets = update.$set as Record<string, unknown>;
                    for (const [path, value] of Object.entries(sets)) {
                        if (
                            path ===
                            'topicOrWeekInstances.$[instance].items.$[item].instructorStruggleTopics'
                        ) {
                            item.instructorStruggleTopics = value as StruggleTopic[];
                        }
                        if (path === 'updatedAt') {
                            doc.updatedAt = value as string;
                        }
                    }
                }

                return { value: doc };
            }
        })
    } as unknown as Db;
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
                    itemTitle: 'Lecture 1',
                    instructorStruggleTopics: [
                        {
                            id: 'st-a',
                            struggleTopic: 'Topic A',
                            createdAt,
                            updatedAt: '2026-01-01'
                        },
                        {
                            id: 'st-b',
                            struggleTopic: 'Topic B',
                            createdAt,
                            updatedAt: '2026-01-02'
                        },
                        {
                            id: 'st-c',
                            struggleTopic: 'Topic C',
                            createdAt,
                            updatedAt: '2026-01-03'
                        }
                    ]
                }
            ]
        }
    ]
};

describe('instructor-struggle-topics-reorder', () => {
    let courseDoc: CourseDoc;

    beforeEach(() => {
        courseDoc = structuredClone(baseCourse);
    });

    const ctx = (): MongoDalContext =>
        ({ db: makeDb(() => courseDoc) } as MongoDalContext);

    it('valid permutation persists order and preserves entry fields', async () => {
        const result = await reorderInstructorStruggleTopics(
            ctx(),
            'course-1',
            'tw-1',
            'item-1',
            ['st-c', 'st-a', 'st-b']
        );

        expect(result.changed).toBe(true);
        expect(result.data.map((t) => t.id)).toEqual(['st-c', 'st-a', 'st-b']);
        expect(result.data[0]).toMatchObject({
            id: 'st-c',
            struggleTopic: 'Topic C',
            createdAt,
            updatedAt: '2026-01-03'
        });
        expect(courseDoc.topicOrWeekInstances[0].items[0].instructorStruggleTopics?.map((t) => t.id)).toEqual([
            'st-c',
            'st-a',
            'st-b'
        ]);
    });

    it('missing id throws InvalidInstructorStruggleTopicReorderError', async () => {
        await expect(
            reorderInstructorStruggleTopics(ctx(), 'course-1', 'tw-1', 'item-1', ['st-a', 'st-b', 'missing'])
        ).rejects.toThrow(InvalidInstructorStruggleTopicReorderError);

        expect(courseDoc.topicOrWeekInstances[0].items[0].instructorStruggleTopics?.map((t) => t.id)).toEqual([
            'st-a',
            'st-b',
            'st-c'
        ]);
    });

    it('extra id throws InvalidInstructorStruggleTopicReorderError', async () => {
        await expect(
            reorderInstructorStruggleTopics(ctx(), 'course-1', 'tw-1', 'item-1', [
                'st-a',
                'st-b',
                'st-c',
                'st-extra'
            ])
        ).rejects.toThrow(InvalidInstructorStruggleTopicReorderError);
    });

    it('empty orderedIds when topics exist throws InvalidInstructorStruggleTopicReorderError', async () => {
        await expect(
            reorderInstructorStruggleTopics(ctx(), 'course-1', 'tw-1', 'item-1', [])
        ).rejects.toThrow(InvalidInstructorStruggleTopicReorderError);
    });

    it('single item reorder is a noop', async () => {
        courseDoc.topicOrWeekInstances[0].items[0].instructorStruggleTopics = [
            {
                id: 'st-only',
                struggleTopic: 'Only topic',
                createdAt,
                updatedAt: '2026-01-01',
            },
        ];

        const result = await reorderInstructorStruggleTopics(
            ctx(),
            'course-1',
            'tw-1',
            'item-1',
            ['st-only']
        );

        expect(result.changed).toBe(false);
        expect(result.data.map((t) => t.id)).toEqual(['st-only']);
    });
});
