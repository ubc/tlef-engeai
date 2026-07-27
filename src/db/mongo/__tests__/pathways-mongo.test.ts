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
    resetPathwaysToDefaults,
    normalizeCtaColor,
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
            if (update.$unset) {
                for (const key of Object.keys(update.$unset)) {
                    delete doc[key];
                }
            }
            return { matchedCount: 1 };
        }),
        deleteOne: jest.fn(async (q: any) => {
            const idx = store.findIndex((d) => d.id === q.id);
            if (idx < 0) return { deletedCount: 0 };
            store.splice(idx, 1);
            return { deletedCount: 1 };
        }),
        deleteMany: jest.fn(async () => {
            const n = store.length;
            store.splice(0, store.length);
            return { deletedCount: n };
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
        expect(store[0].title).toBe('Mental health crisis');
        expect(store[0].triggerDescription).toMatch(/^Detects if/);
    });

    it('listPathways returns sorted docs and restores platform titles when missing', async () => {
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
            }
        );
        const list = await listPathways(ctx, 'Test');
        expect(list.map((p) => p.id)).toEqual(['mental-health-crisis', 'custom-row']);
        expect(list[0].title).toBe('Mental health crisis');
        expect(list[1].title).toBe('Untitled');
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

    it('create/update/delete pathway', async () => {
        const created = await createPathway(ctx, 'Test', {
            triggerDescription: 'spill',
            assistantResponse: 'Call safety',
            ctas: [{ id: 'c1', label: 'Safety', url: 'https://example.com', color: '#4d7a2f' }],
        });
        expect(created.id).toMatch(/^pathway-/);
        expect(created.order).toBe(0);
        expect(created.title).toBe('Untitled');
        expect(created.ctas[0].color).toBe('#4d7a2f');

        const updated = await updatePathway(ctx, 'Test', created.id, {
            title: 'Spill response',
            assistantResponse: 'Updated',
            enabled: false,
        });
        expect(updated?.assistantResponse).toBe('Updated');
        expect(updated?.enabled).toBe(false);
        expect(updated?.title).toBe('Spill response');

        const deleted = await deletePathway(ctx, 'Test', created.id);
        expect(deleted).toBe(true);
        expect(store).toHaveLength(0);
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

    it('resetPathwaysToDefaults wipes and re-seeds platform defaults', async () => {
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
        expect(list).toHaveLength(3);
        expect(list.map((p) => p.id)).toEqual([
            'mental-health-crisis',
            'inappropriate-content',
            'off-topic',
        ]);
        expect(list[1].title).toBe('Inappropriate content');
        expect(list[2].triggerDescription).toMatch(/unrelated to the course/);
    });

    it('seed defaults are evaluable and titled', () => {
        for (const seed of buildPlatformPathwaySeeds()) {
            expect(isPathwayEvaluable(seed)).toBe(true);
            expect(seed.title.trim().length).toBeGreaterThan(0);
        }
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
