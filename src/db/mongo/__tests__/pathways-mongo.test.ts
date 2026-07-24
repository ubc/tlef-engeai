/**
 * pathways-mongo.test.ts — mocked MongoDalContext tests for pathway CRUD helpers.
 */

import type { Collection } from 'mongodb';
import type { MongoDalContext } from '../mongo-context';
import {
    seedPathwaysIfEmpty,
    listPathways,
    createPathway,
    updatePathway,
    deletePathway,
    reorderPathways,
} from '../pathways-mongo';
import { isPathwayEvaluable } from '../../../guided-pathways/pathway-schema';
import { buildPlatformPathwaySeeds } from '../../../guided-pathways/pathway-seed';

jest.mock('../collection-registry-mongo', () => ({
    getCollectionNames: jest.fn().mockResolvedValue({
        users: 'Test_users',
        flags: 'Test_flags',
        memoryAgent: 'Test_memory-agent',
        scheduledTasks: 'Test_scheduled_tasks',
        scenarioQuestions: 'Test_scenario_questions',
        pathways: 'Test_pathways',
    }),
}));

function makeCollection(store: any[] = []): Collection & { _store: any[] } {
    const col: any = {
        _store: store,
        countDocuments: jest.fn(async () => store.length),
        insertMany: jest.fn(async (docs: any[]) => {
            store.push(...docs);
            return { insertedCount: docs.length };
        }),
        insertOne: jest.fn(async (doc: any) => {
            store.push(doc);
            return { insertedId: doc.id };
        }),
        find: jest.fn(() => ({
            sort: () => ({
                toArray: async () => [...store].sort((a, b) => a.order - b.order),
            }),
            project: () => ({
                toArray: async () => store.map((d) => ({ order: d.order })),
            }),
            toArray: async () => [...store],
        })),
        findOne: jest.fn(async (q: any) => store.find((d) => d.id === q.id) || null),
        updateOne: jest.fn(async (q: any, update: any) => {
            const doc = store.find((d) => d.id === q.id);
            if (!doc) return { matchedCount: 0 };
            Object.assign(doc, update.$set || {});
            return { matchedCount: 1 };
        }),
        deleteOne: jest.fn(async (q: any) => {
            const idx = store.findIndex((d) => d.id === q.id);
            if (idx < 0) return { deletedCount: 0 };
            store.splice(idx, 1);
            return { deletedCount: 1 };
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
            } as any,
            idGenerator: {
                uniqueIDGenerator: (input: string) => `id-${input.length}`,
            } as any,
            collectionNamesCache: new Map(),
            scheduledTasksIndexesEnsured: new Set(),
        };
    });

    it('seedPathwaysIfEmpty inserts platform defaults once', async () => {
        const n1 = await seedPathwaysIfEmpty(ctx, 'Test');
        expect(n1).toBe(3);
        const n2 = await seedPathwaysIfEmpty(ctx, 'Test');
        expect(n2).toBe(0);
        expect(store).toHaveLength(3);
    });

    it('listPathways returns sorted docs', async () => {
        store.push(
            { id: 'b', order: 2, enabledGlobally: true, triggerDescription: '', assistantResponse: 'x', ctas: [], updatedAt: 1 },
            { id: 'a', order: 0, enabledGlobally: true, triggerDescription: '', assistantResponse: 'y', ctas: [], updatedAt: 1 }
        );
        const list = await listPathways(ctx, 'Test');
        expect(list.map((p) => p.id)).toEqual(['a', 'b']);
    });

    it('create/update/delete pathway', async () => {
        const created = await createPathway(ctx, 'Test', {
            triggerDescription: 'spill',
            assistantResponse: 'Call safety',
            ctas: [{ id: 'c1', label: 'Safety', url: 'https://example.com', style: 'primary' }],
        });
        expect(created.id).toMatch(/^pathway-/);
        expect(created.order).toBe(0);

        const updated = await updatePathway(ctx, 'Test', created.id, {
            assistantResponse: 'Updated',
            enabledGlobally: false,
        });
        expect(updated?.assistantResponse).toBe('Updated');
        expect(updated?.enabledGlobally).toBe(false);

        const deleted = await deletePathway(ctx, 'Test', created.id);
        expect(deleted).toBe(true);
        expect(store).toHaveLength(0);
    });

    it('reorderPathways rewrites order', async () => {
        store.push(
            { id: 'a', order: 0, enabledGlobally: true, triggerDescription: '', assistantResponse: 'a', ctas: [], updatedAt: 1 },
            { id: 'b', order: 1, enabledGlobally: true, triggerDescription: '', assistantResponse: 'b', ctas: [], updatedAt: 1 }
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
            enabledGlobally: true,
            triggerDescription: '',
            assistantResponse: 'a',
            ctas: [],
            updatedAt: 1,
        });
        await expect(reorderPathways(ctx, 'Test', ['a', 'missing'])).rejects.toThrow(/permutation/i);
    });

    it('seed defaults are evaluable', () => {
        for (const seed of buildPlatformPathwaySeeds()) {
            expect(isPathwayEvaluable(seed)).toBe(true);
        }
    });
});
