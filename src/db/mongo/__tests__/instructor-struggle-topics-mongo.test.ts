import type { Db } from 'mongodb';
import {
    addInstructorStruggleTopic,
    deleteInstructorStruggleTopic,
    getAllInstructorStruggleTopics,
    updateInstructorStruggleTopic
} from '../topic-week-mongo';
import type { MongoDalContext } from '../mongo-context';

type CourseDoc = {
    id: string;
    topicOrWeekInstances: Array<{
        id: string;
        title: string;
        items: Array<{
            id: string;
            itemTitle?: string;
            title?: string;
            instructorStruggleTopics?: Array<{
                id: string;
                struggleTopic: string;
                createdAt?: Date;
                updatedAt?: string;
            }>;
        }>;
    }>;
    updatedAt?: string;
};

function makeDb(getDoc: () => CourseDoc) {
    return {
        collection: (_name: string) => ({
            findOneAndUpdate: async (
                filter: Record<string, unknown>,
                update: Record<string, unknown>,
                options?: { arrayFilters?: Record<string, unknown>[]; returnDocument?: string }
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

                if (update.$push) {
                    const pushKey = Object.keys(update.$push)[0];
                    const payload = (update.$push as Record<string, unknown>)[pushKey];
                    if (!item.instructorStruggleTopics) {
                        item.instructorStruggleTopics = [];
                    }
                    item.instructorStruggleTopics.push(payload as CourseDoc['topicOrWeekInstances'][0]['items'][0]['instructorStruggleTopics'] extends (infer U)[] | undefined ? U : never);
                }

                if (update.$pull) {
                    const pullId = (update.$pull as Record<string, { id: string }>)[
                        'topicOrWeekInstances.$[instance].items.$[item].instructorStruggleTopics'
                    ]?.id;
                    item.instructorStruggleTopics = (item.instructorStruggleTopics ?? []).filter(
                        (t) => t.id !== pullId
                    );
                }

                if (update.$set) {
                    const sets = update.$set as Record<string, unknown>;
                    for (const [path, value] of Object.entries(sets)) {
                        if (path.includes('instructorStruggleTopics.$[topic].struggleTopic')) {
                            const topicFilter = options?.arrayFilters?.find((f) => 'topic.id' in f) as
                                | { 'topic.id': string }
                                | undefined;
                            const topic = item.instructorStruggleTopics?.find((t) => t.id === topicFilter?.['topic.id']);
                            if (topic) {
                                topic.struggleTopic = value as string;
                            }
                        }
                    }
                }

                return { value: doc };
            },
            aggregate: () => ({
                toArray: async () => {
                    const doc = getDoc();
                    const rows: Array<{
                        struggleTopic: string;
                        topicOrWeekTitle: string;
                        itemTitle: string;
                    }> = [];
                    for (const instance of doc.topicOrWeekInstances) {
                        for (const item of instance.items) {
                            for (const topic of item.instructorStruggleTopics ?? []) {
                                rows.push({
                                    struggleTopic: topic.struggleTopic,
                                    topicOrWeekTitle: instance.title,
                                    itemTitle: item.itemTitle ?? item.title ?? ''
                                });
                            }
                        }
                    }
                    return rows;
                }
            })
        })
    } as unknown as Db;
}

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
                    instructorStruggleTopics: []
                }
            ]
        }
    ]
};

describe('instructor-struggle-topics-mongo', () => {
    let courseDoc: CourseDoc;

    beforeEach(() => {
        courseDoc = structuredClone(baseCourse);
    });

    const ctx = (): MongoDalContext =>
        ({ db: makeDb(() => courseDoc) } as MongoDalContext);

    it('addInstructorStruggleTopic pushes onto item array', async () => {
        const entry = {
            id: 'st-1',
            struggleTopic: 'Phase diagrams',
            createdAt: new Date(),
            updatedAt: new Date()
        };
        await addInstructorStruggleTopic(ctx(), 'course-1', 'tw-1', 'item-1', entry);
        const all = await getAllInstructorStruggleTopics(ctx(), 'course-1');
        expect(all).toEqual([
            {
                struggleTopic: 'Phase diagrams',
                topicOrWeekTitle: 'Week 1',
                itemTitle: 'Lecture 1'
            }
        ]);
    });

    it('updateInstructorStruggleTopic patches label text', async () => {
        await addInstructorStruggleTopic(ctx(), 'course-1', 'tw-1', 'item-1', {
            id: 'st-1',
            struggleTopic: 'Old label',
            createdAt: new Date(),
            updatedAt: new Date()
        });
        await updateInstructorStruggleTopic(ctx(), 'course-1', 'tw-1', 'item-1', 'st-1', {
            struggleTopic: 'New label'
        });
        const all = await getAllInstructorStruggleTopics(ctx(), 'course-1');
        expect(all[0].struggleTopic).toBe('New label');
    });

    it('deleteInstructorStruggleTopic removes entry', async () => {
        await addInstructorStruggleTopic(ctx(), 'course-1', 'tw-1', 'item-1', {
            id: 'st-1',
            struggleTopic: 'To remove',
            createdAt: new Date(),
            updatedAt: new Date()
        });
        await deleteInstructorStruggleTopic(ctx(), 'course-1', 'tw-1', 'item-1', 'st-1');
        const all = await getAllInstructorStruggleTopics(ctx(), 'course-1');
        expect(all).toHaveLength(0);
    });
});
