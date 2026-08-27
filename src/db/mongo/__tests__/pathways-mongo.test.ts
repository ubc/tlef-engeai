/**
 * pathways-mongo.test.ts — mocked MongoDalContext tests for pathway CRUD helpers.
 */

import type { Collection } from 'mongodb';
import type { MongoDalContext } from '../mongo-context';
import {
    seedPathwaysIfEmpty,
    listPathways,
    listPathwaysForEvaluation,
    createPathway,
    updatePathway,
    deletePathway,
    reorderPathways,
    resetPathwaysToDefaults,
    normalizeCtaColor,
    getPathwayEvaluationPrompt,
    updatePathwayEvaluationPrompt,
    resetPathwayEvaluationPrompt,
    healRemoveOffTopicPathway,
} from '../pathways-mongo';
import { isPathwayEvaluable } from '../../../guided-pathways/pathway-schema';
import { buildPlatformPathwaySeeds } from '../../../guided-pathways/pathway-seed';
import {
    PATHWAY_EVALUATION_PROMPT_DOC_TYPE,
    PATHWAY_EVALUATION_PROMPT_ID,
    PLATFORM_PATHWAY_EVALUATION_PROMPT_DEFAULT,
} from '../../../guided-pathways/pathway-evaluation-prompt-default';

jest.mock('../collection-registry-mongo', () => ({
    getCollectionNames: jest.fn().mockResolvedValue({
        users: 'Test_users',
        flags: 'Test_flags',
        memoryAgent: 'Test_memory-agent',
        scheduledTasks: 'Test_scheduled_tasks',
        scenarioQuestions: 'Test_scenario_questions',
        scenarioProgress: 'Test_scenario_progress',
        pathways: 'Test_pathways',
    }),
}));

function matchesFilter(doc: any, filter: any = {}): boolean {
    if (!filter || Object.keys(filter).length === 0) return true;
    if (filter.id?.$ne !== undefined && doc.id === filter.id.$ne) return false;
    if (filter.docType?.$ne !== undefined && doc.docType === filter.docType.$ne) return false;
    if (typeof filter.id === 'string' && doc.id !== filter.id) return false;
    return true;
}

function makeCollection(store: any[] = []): Collection & { _store: any[] } {
    const col: any = {
        _store: store,
        countDocuments: jest.fn(async (filter: any = {}) => store.filter((d) => matchesFilter(d, filter)).length),
        insertMany: jest.fn(async (docs: any[]) => {
            store.push(...docs);
            return { insertedCount: docs.length };
        }),
        insertOne: jest.fn(async (doc: any) => {
            store.push(doc);
            return { insertedId: doc.id };
        }),
        find: jest.fn((filter: any = {}) => {
            const filtered = () => store.filter((d) => matchesFilter(d, filter));
            return {
                sort: () => ({
                    toArray: async () => [...filtered()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
                }),
                project: () => ({
                    toArray: async () => filtered().map((d) => ({ order: d.order })),
                }),
                toArray: async () => [...filtered()],
            };
        }),
        findOne: jest.fn(async (q: any) => store.find((d) => matchesFilter(d, q)) || null),
        updateOne: jest.fn(async (q: any, update: any, options?: any) => {
            let doc = store.find((d) => matchesFilter(d, q));
            if (!doc) {
                if (options?.upsert) {
                    doc = { ...(update.$set || {}) };
                    store.push(doc);
                    return { matchedCount: 0, upsertedCount: 1 };
                }
                return { matchedCount: 0 };
            }
            Object.assign(doc, update.$set || {});
            if (update.$unset) {
                for (const key of Object.keys(update.$unset)) {
                    delete doc[key];
                }
            }
            return { matchedCount: 1 };
        }),
        deleteOne: jest.fn(async (q: any) => {
            const idx = store.findIndex((d) => matchesFilter(d, q));
            if (idx < 0) return { deletedCount: 0 };
            store.splice(idx, 1);
            return { deletedCount: 1 };
        }),
        deleteMany: jest.fn(async (q: any = {}) => {
            const before = store.length;
            for (let i = store.length - 1; i >= 0; i--) {
                if (matchesFilter(store[i], q)) store.splice(i, 1);
            }
            return { deletedCount: before - store.length };
        }),
        createIndex: jest.fn(async () => 'ok'),
    };
    return col;
}

describe('pathways-mongo', () => {
    let store: any[];
    let collection: Collection;
    let ctx: MongoDalContext;

    beforeEach(() => {
        store = [];
        collection = makeCollection(store);
        ctx = {
            db: {
                collection: jest.fn(() => collection),
                createCollection: jest.fn(async () => undefined),
            } as any,
            idGenerator: {
                uniqueIDGenerator: (input: string) => `id-${input.length}`,
            } as any,
            collectionNamesCache: new Map(),
            scheduledTasksIndexesEnsured: new Set(),
        };
    });

    it('seedPathwaysIfEmpty inserts platform defaults once and evaluation prompt', async () => {
        const n1 = await seedPathwaysIfEmpty(ctx, 'Test');
        expect(n1).toBe(2);
        const n2 = await seedPathwaysIfEmpty(ctx, 'Test');
        expect(n2).toBe(0);
        expect(store.filter((d) => d.id !== PATHWAY_EVALUATION_PROMPT_ID)).toHaveLength(2);
        expect(store.some((d) => d.id === PATHWAY_EVALUATION_PROMPT_ID)).toBe(true);
        expect(store[0].title).toBe('Mental health crisis');
        expect(
            store
                .filter((d) => d.id !== PATHWAY_EVALUATION_PROMPT_ID)
                .every((pathway) => pathway.notifyInstructorOnTrigger === true)
        ).toBe(true);
        expect(store[0].triggerDescription).toMatch(/^Detects if/);
    });

    it('listPathways on empty collection does not auto-seed', async () => {
        const list = await listPathways(ctx, 'Test');
        expect(list).toEqual([]);
        expect(store).toHaveLength(0);
    });

    it('listPathways excludes evaluation-prompt singleton and restores platform titles', async () => {
        store.push(
            {
                id: 'mental-health-crisis',
                order: 0,
                enabled: true,
                triggerDescription: '',
                assistantResponse: 'x',
                ctas: [],
                updatedAt: 1,
            },
            {
                id: 'custom-row',
                order: 1,
                enabled: true,
                triggerDescription: '',
                assistantResponse: 'y',
                ctas: [],
                updatedAt: 1,
            },
            {
                id: PATHWAY_EVALUATION_PROMPT_ID,
                docType: PATHWAY_EVALUATION_PROMPT_DOC_TYPE,
                usePlatformDefault: true,
                body: PLATFORM_PATHWAY_EVALUATION_PROMPT_DEFAULT,
                updatedAt: 1,
            }
        );
        const list = await listPathways(ctx, 'Test');
        expect(list.map((p) => p.id)).toEqual(['mental-health-crisis', 'custom-row']);
        expect(list[0].title).toBe('Mental health crisis');
        expect(list[1].title).toBe('Untitled');
        expect(list.every((pathway) => pathway.notifyInstructorOnTrigger === true)).toBe(true);
    });

    it('listPathways maps legacy enabledGlobally to enabled', async () => {
        store.push({
            id: 'legacy-off',
            order: 0,
            enabledGlobally: false,
            triggerDescription: '',
            assistantResponse: 'x',
            ctas: [],
            updatedAt: 1,
        });
        const list = await listPathways(ctx, 'Test');
        expect(list[0].enabled).toBe(false);
        expect((list[0] as any).enabledGlobally).toBeUndefined();
    });

    it('healRemoveOffTopicPathway deletes legacy off-topic docs', async () => {
        store.push(
            {
                id: 'off-topic',
                order: 2,
                title: 'Off-topic',
                enabled: true,
                triggerDescription: 'x',
                assistantResponse: 'y',
                ctas: [],
                updatedAt: 1,
            },
            {
                id: 'inappropriate-content',
                order: 1,
                title: 'Inappropriate content',
                enabled: true,
                triggerDescription: 'x',
                assistantResponse: 'y',
                ctas: [],
                updatedAt: 1,
            }
        );
        const deleted = await healRemoveOffTopicPathway(collection, 'Test');
        expect(deleted).toBe(1);
        expect(store.map((d) => d.id)).toEqual(['inappropriate-content']);
        expect(await healRemoveOffTopicPathway(collection, 'Test')).toBe(0);
    });

    it('create/update/delete pathway', async () => {
        const created = await createPathway(ctx, 'Test', {
            triggerDescription: 'spill',
            assistantResponse: 'Call safety',
            ctas: [{ id: 'c1', label: 'Safety', url: 'https://example.com', color: '#4d7a2f' }],
        });
        expect(created.id).toMatch(/^pathway-/);
        expect(created.order).toBe(0);
        expect(created.title).toBe('Untitled');
        expect(created.notifyInstructorOnTrigger).toBe(true);
        expect(created.ctas[0].color).toBe('#4d7a2f');

        const updated = await updatePathway(ctx, 'Test', created.id, {
            title: 'Spill response',
            assistantResponse: 'Updated',
            enabled: false,
            notifyInstructorOnTrigger: false,
        });
        expect(updated?.assistantResponse).toBe('Updated');
        expect(updated?.enabled).toBe(false);
        expect(updated?.notifyInstructorOnTrigger).toBe(false);
        expect(updated?.title).toBe('Spill response');

        const deleted = await deletePathway(ctx, 'Test', created.id);
        expect(deleted).toBe(true);
        expect(store).toHaveLength(0);
    });

    it('returns an instructor-created pathway through the chat evaluation list', async () => {
        const created = await createPathway(ctx, 'Test', {
            title: 'Instructor support route',
            triggerDescription: 'Detect a request for instructor support',
            assistantResponse: 'Please use these support options.',
            enabled: true,
            notifyInstructorOnTrigger: true,
            ctas: []
        });

        const evaluable = await listPathwaysForEvaluation(ctx, 'Test');

        expect(evaluable).toEqual([expect.objectContaining({
            id: created.id,
            title: 'Instructor support route',
            enabled: true,
            notifyInstructorOnTrigger: true
        })]);
    });

    it('reorderPathways rewrites order', async () => {
        store.push(
            {
                id: 'a',
                order: 0,
                title: 'A',
                enabled: true,
                triggerDescription: '',
                assistantResponse: 'a',
                ctas: [],
                updatedAt: 1,
            },
            {
                id: 'b',
                order: 1,
                title: 'B',
                enabled: true,
                triggerDescription: '',
                assistantResponse: 'b',
                ctas: [],
                updatedAt: 1,
            }
        );
        const list = await reorderPathways(ctx, 'Test', ['b', 'a']);
        expect(list.map((p) => p.id)).toEqual(['b', 'a']);
        expect(list[0].order).toBe(0);
        expect(list[1].order).toBe(1);
    });

    it('rejects invalid reorder permutation', async () => {
        store.push({
            id: 'a',
            order: 0,
            title: 'A',
            enabled: true,
            triggerDescription: '',
            assistantResponse: 'a',
            ctas: [],
            updatedAt: 1,
        });
        await expect(reorderPathways(ctx, 'Test', ['a', 'missing'])).rejects.toThrow(/permutation/i);
    });

    it('resetPathwaysToDefaults wipes and re-seeds platform defaults plus evaluation prompt', async () => {
        store.push({
            id: 'custom',
            order: 0,
            title: 'Custom',
            enabled: true,
            triggerDescription: 'x',
            assistantResponse: 'y',
            ctas: [],
            updatedAt: 1,
        });
        const list = await resetPathwaysToDefaults(ctx, 'Test');
        expect(list).toHaveLength(2);
        expect(list.map((p) => p.id)).toEqual(['mental-health-crisis', 'inappropriate-content']);
        expect(list[1].title).toBe('Inappropriate content');
        expect(store.some((d) => d.id === PATHWAY_EVALUATION_PROMPT_ID)).toBe(true);
        expect(store.some((d) => d.id === 'off-topic')).toBe(false);
    });

    it('get/update/reset pathway evaluation prompt', async () => {
        const initial = await getPathwayEvaluationPrompt(ctx, 'Test');
        expect(initial.usePlatformDefault).toBe(true);
        expect(initial.body).toContain('{{pathway_trigger_sections}}');

        const updated = await updatePathwayEvaluationPrompt(ctx, 'Test', 'Custom shell\n{{pathway_trigger_sections}}');
        expect(updated.usePlatformDefault).toBe(false);
        expect(updated.body).toContain('Custom shell');

        const again = await getPathwayEvaluationPrompt(ctx, 'Test');
        expect(again.usePlatformDefault).toBe(false);
        expect(again.body).toContain('Custom shell');

        const reset = await resetPathwayEvaluationPrompt(ctx, 'Test');
        expect(reset.usePlatformDefault).toBe(true);
        expect(reset.body).toBe(PLATFORM_PATHWAY_EVALUATION_PROMPT_DEFAULT);
    });

    it('seed defaults are evaluable and titled', () => {
        for (const seed of buildPlatformPathwaySeeds()) {
            expect(isPathwayEvaluable(seed)).toBe(true);
            expect(seed.title.trim().length).toBeGreaterThan(0);
        }
        expect(buildPlatformPathwaySeeds().some((p) => p.id === 'off-topic')).toBe(false);
    });

    it('normalizeCtaColor accepts hex and maps legacy style', () => {
        expect(normalizeCtaColor('#2F5F8F')).toBe('#2f5f8f');
        expect(normalizeCtaColor('#abc')).toBe('#aabbcc');
        expect(normalizeCtaColor(undefined, 'secondary')).toBe('#2f5f8f');
        expect(normalizeCtaColor('nope', 'tertiary')).toBe('#1b365d');
        expect(normalizeCtaColor(undefined, undefined)).toBe('#4d7a2f');
    });

    it('createPathway maps legacy style to color', async () => {
        const created = await createPathway(ctx, 'Test', {
            triggerDescription: 'legacy',
            assistantResponse: 'ok',
            ctas: [
                {
                    id: 'c-legacy',
                    label: 'Help',
                    url: 'https://example.com',
                    style: 'secondary',
                } as any,
            ],
        });
        expect(created.ctas[0].color).toBe('#2f5f8f');
        expect((created.ctas[0] as any).style).toBeUndefined();
    });
});
