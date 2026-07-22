import type { Db } from 'mongodb';
import type { MongoDalContext } from '../mongo-context';
import type { ScenarioQuestion } from '../../../types/shared';
import {
    findPublishedScenariosByObjectiveIds,
    findPublishedScenariosByObjectiveTexts,
    pickRandomSubset,
} from '../scenario-questions-mongo';

function makeCtx(docs: ScenarioQuestion[], courseName = 'TestCourse'): MongoDalContext {
    const collectionName = `${courseName}_scenario_questions`;
    const state = { docs: [...docs] };

    const db = {
        collection: (name: string) => {
            if (name !== collectionName) {
                throw new Error(`Unexpected collection: ${name}`);
            }
            return {
                find: (query: Record<string, unknown>) => ({
                    toArray: async () =>
                        state.docs.filter((doc) => {
                            if (query.status && doc.status !== query.status) return false;
                            const objectiveIds = query['learningObjectives.objectiveId'] as
                                | { $in: string[] }
                                | undefined;
                            if (!objectiveIds?.$in?.length) return true;
                            const set = new Set(objectiveIds.$in);
                            return (doc.learningObjectives ?? []).some((lo) =>
                                set.has(lo.objectiveId)
                            );
                        }),
                }),
            };
        },
    } as unknown as Db;

    return {
        db,
        idGenerator: {} as MongoDalContext['idGenerator'],
        scheduledTasksIndexesEnsured: new Set<string>(),
        collectionNamesCache: new Map([
            [
                courseName,
                {
                    users: `${courseName}_users`,
                    flags: `${courseName}_flags`,
                    memoryAgent: `${courseName}_memory-agent`,
                    scheduledTasks: `${courseName}_scheduled_tasks`,
                    scenarioQuestions: collectionName,
                    scenarioProgress: `${courseName}_scenario_progress`,
                },
            ],
        ]),
    };
}

describe('findPublishedScenariosByObjectiveIds', () => {
    const base = (overrides: Partial<ScenarioQuestion>): ScenarioQuestion =>
        ({
            id: 'q-1',
            courseId: 'c-1',
            courseName: 'TestCourse',
            topicOrWeekId: 'tw-1',
            title: 'Scenario A',
            status: 'published',
            sourcePrompt: '',
            questionBody: 'body',
            solutionBody: 'sol',
            subQuestions: [],
            learningObjectives: [{ objectiveId: 'lo-1', text: 'LO 1', sourceTopicOrWeekId: 'tw-1', sourceItemId: 'i-1' }],
            difficulty: 'medium',
            expectedTimeMinutes: 10,
            sortOrder: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
            publishedAt: new Date(),
            createdByUserId: 'u-1',
            ...overrides,
        }) as ScenarioQuestion;

    it('returns published scenarios matching objective ids', async () => {
        const ctx = makeCtx([
            base({ id: 'q-1', title: 'First' }),
            base({
                id: 'q-2',
                title: 'Second',
                status: 'draft',
                learningObjectives: [
                    { objectiveId: 'lo-1', text: 'LO 1', sourceTopicOrWeekId: 'tw-1', sourceItemId: 'i-1' },
                ],
            }),
            base({
                id: 'q-3',
                title: 'Third',
                learningObjectives: [
                    { objectiveId: 'lo-2', text: 'LO 2', sourceTopicOrWeekId: 'tw-1', sourceItemId: 'i-1' },
                ],
            }),
        ]);

        const result = await findPublishedScenariosByObjectiveIds(ctx, 'TestCourse', ['lo-1', 'lo-2'], 3);
        expect(result.map((r) => r.id)).toEqual(['q-1', 'q-3']);
    });

    it('returns empty when no ids provided', async () => {
        const ctx = makeCtx([base({})]);
        expect(await findPublishedScenariosByObjectiveIds(ctx, 'TestCourse', [])).toEqual([]);
    });
});

function makeCtxForTexts(docs: ScenarioQuestion[], courseName = 'TestCourse'): MongoDalContext {
    const collectionName = `${courseName}_scenario_questions`;
    const state = { docs: [...docs] };

    const db = {
        collection: (name: string) => {
            if (name !== collectionName) {
                throw new Error(`Unexpected collection: ${name}`);
            }
            return {
                find: (query: Record<string, unknown>) => ({
                    toArray: async () =>
                        state.docs.filter((doc) => {
                            if (query.status && doc.status !== query.status) return false;
                            const objectiveTexts = query['learningObjectives.text'] as
                                | { $in: string[] }
                                | undefined;
                            if (!objectiveTexts?.$in?.length) return true;
                            const set = new Set(objectiveTexts.$in);
                            return (doc.learningObjectives ?? []).some((lo) =>
                                set.has(lo.text)
                            );
                        }),
                }),
            };
        },
    } as unknown as Db;

    return {
        db,
        idGenerator: {} as MongoDalContext['idGenerator'],
        scheduledTasksIndexesEnsured: new Set<string>(),
        collectionNamesCache: new Map([
            [
                courseName,
                {
                    users: `${courseName}_users`,
                    flags: `${courseName}_flags`,
                    memoryAgent: `${courseName}_memory-agent`,
                    scheduledTasks: `${courseName}_scheduled_tasks`,
                    scenarioQuestions: collectionName,
                    scenarioProgress: `${courseName}_scenario_progress`,
                },
            ],
        ]),
    };
}

describe('findPublishedScenariosByObjectiveTexts', () => {
    const base = (overrides: Partial<ScenarioQuestion>): ScenarioQuestion =>
        ({
            id: 'q-1',
            courseId: 'c-1',
            courseName: 'TestCourse',
            topicOrWeekId: 'tw-1',
            title: 'Scenario A',
            status: 'published',
            sourcePrompt: '',
            questionBody: 'body',
            solutionBody: 'sol',
            subQuestions: [],
            learningObjectives: [
                { objectiveId: 'lo-1', text: 'LO 1', sourceTopicOrWeekId: 'tw-1', sourceItemId: 'i-1' },
            ],
            difficulty: 'medium',
            expectedTimeMinutes: 10,
            sortOrder: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
            publishedAt: new Date(),
            createdByUserId: 'u-1',
            ...overrides,
        }) as ScenarioQuestion;

    it('returns published scenarios matching objective texts', async () => {
        const ctx = makeCtxForTexts([
            base({ id: 'q-1', title: 'First' }),
            base({
                id: 'q-2',
                title: 'Second',
                status: 'draft',
                learningObjectives: [
                    { objectiveId: 'lo-1', text: 'LO 1', sourceTopicOrWeekId: 'tw-1', sourceItemId: 'i-1' },
                ],
            }),
            base({
                id: 'q-3',
                title: 'Third',
                difficulty: 'hard',
                learningObjectives: [
                    { objectiveId: 'lo-2', text: 'LO 2', sourceTopicOrWeekId: 'tw-1', sourceItemId: 'i-1' },
                ],
            }),
        ]);

        const result = await findPublishedScenariosByObjectiveTexts(
            ctx,
            'TestCourse',
            ['LO 1', 'LO 2'],
            3
        );
        expect(result).toHaveLength(2);
        expect(result.map((r) => r.id).sort()).toEqual(['q-1', 'q-3']);
        expect(result.find((r) => r.id === 'q-1')?.difficulty).toBe('medium');
        expect(result.find((r) => r.id === 'q-3')?.difficulty).toBe('hard');
    });

    it('returns at most limit when pool is larger', async () => {
        const ctx = makeCtxForTexts([
            base({ id: 'q-1', title: 'First' }),
            base({ id: 'q-2', title: 'Second', sortOrder: 1 }),
            base({ id: 'q-3', title: 'Third', sortOrder: 2 }),
            base({ id: 'q-4', title: 'Fourth', sortOrder: 3 }),
        ]);

        const result = await findPublishedScenariosByObjectiveTexts(ctx, 'TestCourse', ['LO 1'], 3);
        expect(result).toHaveLength(3);
        expect(new Set(result.map((r) => r.id)).size).toBe(3);
        for (const row of result) {
            expect(['q-1', 'q-2', 'q-3', 'q-4']).toContain(row.id);
        }
    });

    it('returns empty when no texts provided', async () => {
        const ctx = makeCtxForTexts([base({})]);
        expect(await findPublishedScenariosByObjectiveTexts(ctx, 'TestCourse', [])).toEqual([]);
    });
});

describe('pickRandomSubset', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('returns all items when pool is smaller than limit', () => {
        expect(pickRandomSubset(['a', 'b'], 5)).toEqual(['a', 'b']);
    });

    it('returns deterministic first picks when Math.random is always 0', () => {
        jest.spyOn(Math, 'random').mockReturnValue(0);
        expect(pickRandomSubset(['a', 'b', 'c', 'd'], 3)).toEqual(['a', 'b', 'c']);
    });
});
