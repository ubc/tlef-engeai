import type { Db } from 'mongodb';
import type { MongoDalContext } from '../mongo-context';
import {
    getMemoryAgentEntry,
    initializeMemoryAgentForUser,
    updateMemoryAgentStruggleWords
} from '../memory-agent-mongo';

type MemoryDoc = {
    userId: string;
    name: string;
    role: string;
    struggleTopics?: string[];
    struggleTopicsByChapter?: Array<{
        topicOrWeekId: string;
        topicOrWeekTitle: string;
        struggleTopics: string[];
    }>;
    createdAt: Date;
    updatedAt: Date;
};

function makeCtx(docs: MemoryDoc[], courseName = 'TestCourse'): MongoDalContext {
    const memoryCollectionName = `${courseName}_memory-agent`;
    const state = { docs };

    const db = {
        collection: (name: string) => {
            if (name === memoryCollectionName) {
                return {
                    findOne: async (filter: { userId?: string }) =>
                        state.docs.find((d) => d.userId === filter.userId) ?? null,
                    insertOne: async (doc: MemoryDoc) => {
                        state.docs.push(doc);
                    },
                    findOneAndUpdate: async (
                        filter: { userId?: string },
                        update: { $set?: Partial<MemoryDoc>; $unset?: Record<string, string> }
                    ) => {
                        const doc = state.docs.find((d) => d.userId === filter.userId);
                        if (!doc) return null;
                        if (update.$set) Object.assign(doc, update.$set);
                        if (update.$unset) {
                            for (const key of Object.keys(update.$unset)) {
                                delete (doc as Record<string, unknown>)[key];
                            }
                        }
                        return doc;
                    },
                    updateOne: async (
                        filter: { userId?: string },
                        update: { $set?: Partial<MemoryDoc>; $unset?: Record<string, string> }
                    ) => {
                        const doc = state.docs.find((d) => d.userId === filter.userId);
                        if (!doc) return { matchedCount: 0 };
                        if (update.$set) Object.assign(doc, update.$set);
                        if (update.$unset) {
                            for (const key of Object.keys(update.$unset)) {
                                delete (doc as Record<string, unknown>)[key];
                            }
                        }
                        return { matchedCount: 1 };
                    }
                };
            }
            throw new Error(`Unexpected collection: ${name}`);
        }
    } as unknown as Db;

    return {
        db,
        idGenerator: { globalUserID: () => 'uid-1' } as unknown as MongoDalContext['idGenerator'],
        collectionNamesCache: new Map([
            [
                courseName,
                {
                    users: `${courseName}_users`,
                    flags: `${courseName}_flags`,
                    memoryAgent: memoryCollectionName,
                    scheduledTasks: `${courseName}_scheduled-tasks`,
                    scenarioQuestions: `${courseName}_scenario_questions`
                }
            ]
        ]),
        scheduledTasksIndexesEnsured: new Set<string>()
    };
}

describe('memory-agent-mongo', () => {
    it('initializeMemoryAgentForUser seeds empty struggleTopics', async () => {
        const ctx = makeCtx([]);
        await initializeMemoryAgentForUser(ctx, 'TestCourse', 'u-1', 'Student', 'student');
        const entry = await getMemoryAgentEntry(ctx, 'TestCourse', 'u-1');
        expect(entry?.struggleTopics).toEqual([]);
    });

    it('updateMemoryAgentStruggleWords persists flat labels and unsets legacy chapter field', async () => {
        const now = new Date();
        const ctx = makeCtx([
            {
                userId: 'u-1',
                name: 'Student',
                role: 'Student',
                struggleTopics: ['legacy'],
                struggleTopicsByChapter: [
                    {
                        topicOrWeekId: 'tw-1',
                        topicOrWeekTitle: 'Week 1',
                        struggleTopics: ['Enthalpy']
                    }
                ],
                createdAt: now,
                updatedAt: now
            }
        ]);

        await updateMemoryAgentStruggleWords(ctx, 'TestCourse', 'u-1', ['Enthalpy', 'Entropy']);

        const raw = (await ctx.db
            .collection('TestCourse_memory-agent')
            .findOne({ userId: 'u-1' })) as unknown as MemoryDoc;
        expect(raw.struggleTopics).toEqual(['Enthalpy', 'Entropy']);
        expect(raw.struggleTopicsByChapter).toBeUndefined();
    });

    it('getMemoryAgentEntry lazily removes legacy struggleTopicsByChapter', async () => {
        const now = new Date();
        const ctx = makeCtx([
            {
                userId: 'u-1',
                name: 'Student',
                role: 'Student',
                struggleTopicsByChapter: [
                    {
                        topicOrWeekId: 'tw-1',
                        topicOrWeekTitle: 'Week 1',
                        struggleTopics: ['Enthalpy']
                    }
                ],
                createdAt: now,
                updatedAt: now
            }
        ]);

        const entry = await getMemoryAgentEntry(ctx, 'TestCourse', 'u-1');
        expect(entry?.struggleTopics).toEqual(['Enthalpy']);

        const raw = (await ctx.db
            .collection('TestCourse_memory-agent')
            .findOne({ userId: 'u-1' })) as unknown as MemoryDoc;
        expect(raw.struggleTopics).toEqual(['Enthalpy']);
        expect(raw.struggleTopicsByChapter).toBeUndefined();
    });
});
