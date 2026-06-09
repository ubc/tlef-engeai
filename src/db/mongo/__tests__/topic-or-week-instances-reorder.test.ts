import type { Db } from 'mongodb';
import {
    InvalidTopicOrWeekInstanceReorderError,
    reorderTopicOrWeekInstances
} from '../topic-week-mongo';
import type { MongoDalContext } from '../mongo-context';

type Instance = {
    id: string;
    title: string;
    items: Array<{ id: string; title?: string }>;
};

type CourseDoc = {
    id: string;
    topicOrWeekInstances: Instance[];
    updatedAt?: string;
};

function makeDb(getDoc: () => CourseDoc) {
    let updateCount = 0;
    const db = {
        collection: (_name: string) => ({
            findOne: async (filter: Record<string, unknown>) => {
                const doc = getDoc();
                return filter.id === doc.id ? doc : null;
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
                if (update.$set) {
                    const sets = update.$set as Record<string, unknown>;
                    if (sets.topicOrWeekInstances) {
                        doc.topicOrWeekInstances = sets.topicOrWeekInstances as Instance[];
                    }
                    if (sets.updatedAt) {
                        doc.updatedAt = sets.updatedAt as string;
                    }
                }
                return doc;
            }
        }),
        getUpdateCount: () => updateCount
    };
    return db as unknown as Db & { getUpdateCount: () => number };
}

const baseCourse: CourseDoc = {
    id: 'course-1',
    topicOrWeekInstances: [
        { id: 'tw-1', title: 'Week 1', items: [{ id: 'item-1' }] },
        { id: 'tw-2', title: 'Week 2', items: [{ id: 'item-1' }, { id: 'item-2' }] },
        { id: 'tw-3', title: 'Week 3', items: [] }
    ]
};

describe('topic-or-week-instances-reorder', () => {
    let courseDoc: CourseDoc;
    let db: ReturnType<typeof makeDb>;

    beforeEach(() => {
        courseDoc = structuredClone(baseCourse);
        db = makeDb(() => courseDoc);
    });

    const ctx = (): MongoDalContext =>
        ({ db } as unknown as MongoDalContext);

    it('valid permutation persists order', async () => {
        const result = await reorderTopicOrWeekInstances(ctx(), 'course-1', [
            'tw-3',
            'tw-1',
            'tw-2'
        ]);

        expect(result.changed).toBe(true);
        expect(result.data.map((i) => i.id)).toEqual(['tw-3', 'tw-1', 'tw-2']);
        expect(courseDoc.topicOrWeekInstances.map((i) => i.id)).toEqual(['tw-3', 'tw-1', 'tw-2']);
    });

    it('same order is a noop without findOneAndUpdate', async () => {
        const result = await reorderTopicOrWeekInstances(ctx(), 'course-1', [
            'tw-1',
            'tw-2',
            'tw-3'
        ]);

        expect(result.changed).toBe(false);
        expect(result.data.map((i) => i.id)).toEqual(['tw-1', 'tw-2', 'tw-3']);
        expect(db.getUpdateCount()).toBe(0);
    });

    it('unknown id throws InvalidTopicOrWeekInstanceReorderError', async () => {
        await expect(
            reorderTopicOrWeekInstances(ctx(), 'course-1', ['tw-1', 'tw-2', 'missing'])
        ).rejects.toThrow(InvalidTopicOrWeekInstanceReorderError);
    });

    it('duplicate id throws InvalidTopicOrWeekInstanceReorderError', async () => {
        await expect(
            reorderTopicOrWeekInstances(ctx(), 'course-1', ['tw-1', 'tw-1', 'tw-3'])
        ).rejects.toThrow(InvalidTopicOrWeekInstanceReorderError);
    });

    it('length mismatch throws InvalidTopicOrWeekInstanceReorderError', async () => {
        await expect(
            reorderTopicOrWeekInstances(ctx(), 'course-1', ['tw-1', 'tw-2'])
        ).rejects.toThrow(InvalidTopicOrWeekInstanceReorderError);
    });
});
