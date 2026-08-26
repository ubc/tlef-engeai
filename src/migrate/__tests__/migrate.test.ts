/**
 * schema-walker + qdrant classify tests (synthetic docs only)
 */

import { PERSISTED_ADDITIONAL_MATERIAL_KEYS } from '../../types/shared';
import { buildCourseCatalogMap } from '../catalog-map';
import { MIGRATE_PIPELINE_OPS, opsToRun, parseArgs } from '../migrate-args';
import { runMigratePipeline } from '../pipeline';
import { classifyQdrantPoint, collectMaterials, groupChunkIdsByMaterial, stripQdrantPayload } from '../qdrant-ops';
import { countMaterialLeftovers, hoistMaterialFile, walkObject } from '../schema-walker';
import { activeCourseSchema, additionalMaterialFields } from '../schemas';

describe('hoistMaterialFile', () => {
    it('copies nested file fields and seeds qdrantChunkIds from qdrantId', () => {
        const next = hoistMaterialFile({
            id: 'mat-1',
            name: 'chapter 2',
            file: {
                fileName: 'Ch2.md',
                qdrantId: 'chunk-0',
                chunksGenerated: 23,
                uploaded: true,
                uploadedBy: '99999999',
            },
        });
        expect(next.fileName).toBe('Ch2.md');
        expect(next.qdrantChunkIds).toEqual(['chunk-0']);
        expect(next.chunksGenerated).toBe(1);
        expect(next.file).toBeUndefined();
        expect(next.qdrantId).toBeUndefined();
    });
});

describe('walkObject', () => {
    it('strips extra keys, defaults missing, keeps _id', () => {
        const result = walkObject(
            { _id: 'mongo', id: 'c1', courseName: 'Sandbox', extra: true },
            activeCourseSchema
        );
        expect(result.skipped).toBe(false);
        expect(result.value?._id).toBe('mongo');
        expect(result.value?.extra).toBeUndefined();
        expect(result.value?.frameType).toBe('byTopic');
        expect(result.value?.courseSetup).toBe(false);
        expect(result.changed).toBe(true);
    });

    it('skips documents missing identity', () => {
        const result = walkObject({ courseName: 'Sandbox' }, activeCourseSchema);
        expect(result.skipped).toBe(true);
        expect(result.skipReason).toContain('id');
    });

    it('resets invalid enums', () => {
        const result = walkObject(
            { id: 'c1', courseName: 'Sandbox', frameType: 'byMonth' },
            activeCourseSchema
        );
        expect(result.value?.frameType).toBe('byTopic');
    });

    it('hoists nested file on additionalMaterials and drops struggleTopicsPerChapter', () => {
        const result = walkObject(
            {
                id: 'c1',
                courseName: 'MigrateSandbox',
                topicOrWeekInstances: [
                    {
                        id: 'w1',
                        title: 'Week 1',
                        items: [
                            {
                                id: 'i1',
                                title: 'Lecture 1',
                                struggleTopicsPerChapter: [],
                                additionalMaterials: [
                                    {
                                        id: '9ae',
                                        name: 'chapter 2',
                                        file: { fileName: 'Ch2.md', qdrantId: 'uuid-1' },
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
            activeCourseSchema
        );
        const week = (result.value?.topicOrWeekInstances as any[])[0];
        const item = week.items[0];
        expect(item.struggleTopicsPerChapter).toBeUndefined();
        expect(item.additionalMaterials[0].fileName).toBe('Ch2.md');
        expect(item.additionalMaterials[0].qdrantChunkIds).toEqual(['uuid-1']);
        expect(item.additionalMaterials[0].file).toBeUndefined();
    });
});

describe('parseArgs', () => {
    it('parses op and apply', () => {
        expect(parseArgs(['node', 'cli.ts', '--op', 'qdrant-resolve', '--apply']).op).toBe('qdrant-resolve');
        expect(parseArgs(['node', 'cli.ts', '--apply']).apply).toBe(true);
    });

    it('treats default and --check as dry-run', () => {
        expect(parseArgs(['node', 'cli.ts']).apply).toBe(false);
        expect(parseArgs(['node', 'cli.ts', '--check']).apply).toBe(false);
    });

    it('rejects --check with --apply', () => {
        expect(() => parseArgs(['node', 'cli.ts', '--check', '--apply'])).toThrow(/not both/);
    });

    it('defaults to the full pipeline when --op is omitted', () => {
        expect(opsToRun(parseArgs(['node', 'cli.ts']).op)).toEqual(MIGRATE_PIPELINE_OPS);
        expect(opsToRun(undefined)).toEqual(MIGRATE_PIPELINE_OPS);
    });
});

describe('persist additional material keys', () => {
    it('matches additionalMaterialFields to PERSISTED_ADDITIONAL_MATERIAL_KEYS', () => {
        expect(additionalMaterialFields.map((field) => field.key)).toEqual([...PERSISTED_ADDITIONAL_MATERIAL_KEYS]);
    });
});

describe('countMaterialLeftovers', () => {
    it('counts nested file leftovers', () => {
        const counts = countMaterialLeftovers([
            {
                topicOrWeekInstances: [
                    {
                        items: [
                            {
                                additionalMaterials: [
                                    { id: 'm1', name: 'chapter 2', file: { fileName: 'Ch2.md', qdrantId: 'uuid-1' } },
                                ],
                            },
                        ],
                    },
                ],
            },
        ]);
        expect(counts.nestedFile).toBe(1);
        expect(counts.sampleFileName).toBe('Ch2.md');
        expect(counts.sampleQdrantId).toBe('uuid-1');
    });
});

describe('qdrant classify / strip', () => {
    const catalog = buildCourseCatalogMap([
        { id: 'c1', courseName: 'MigrateSandbox', collections: {} },
    ]).map;

    it('strips learningObjectives', () => {
        const result = stripQdrantPayload({
            id: 'mat-1',
            name: 'chapter 2',
            courseName: 'MigrateSandbox',
            learningObjectives: [{ text: 'nope' }],
        });
        expect(result.next.learningObjectives).toBeUndefined();
        expect(result.next.id).toBe('mat-1');
        expect(result.changed).toBe(true);
    });

    it('marks missing id as orphan', () => {
        expect(
            classifyQdrantPoint({ id: 'p1', payload: { courseName: 'MigrateSandbox' } }, new Map(), catalog)
        ).toBe('orphan');
    });

    it('patches mismatched title from Mongo material', () => {
        const materials = collectMaterials([
            {
                id: 'c1',
                courseName: 'MigrateSandbox',
                topicOrWeekInstances: [
                    {
                        id: 'w1',
                        title: 'Week 1',
                        items: [
                            {
                                id: 'i1',
                                itemTitle: 'Lecture 1',
                                additionalMaterials: [{ id: 'mat-1', name: 'chapter 2', topicOrWeekTitle: 'Week 1' }],
                            },
                        ],
                    },
                ],
            },
        ]);
        expect(
            classifyQdrantPoint(
                {
                    id: 'chunk-9',
                    payload: { id: 'mat-1', courseName: 'MigrateSandbox', topicOrWeekTitle: 'Old Week', name: 'stale' },
                },
                materials,
                catalog
            )
        ).toBe('patch');
        expect(
            classifyQdrantPoint(
                { id: 'chunk-orphan', payload: { id: 'unknown' } },
                materials,
                catalog
            )
        ).toBe('orphan');
    });

    it('groups point UUIDs by material id and lists orphans', () => {
        const materials = collectMaterials([
            {
                id: 'c1',
                courseName: 'MigrateSandbox',
                topicOrWeekInstances: [
                    {
                        id: 'w1',
                        title: 'Week 1',
                        items: [
                            {
                                id: 'i1',
                                itemTitle: 'Lecture 1',
                                additionalMaterials: [{ id: 'mat-1', name: 'chapter 2', topicOrWeekTitle: 'Week 1' }],
                            },
                        ],
                    },
                ],
            },
        ]);
        const grouped = groupChunkIdsByMaterial(
            [
                { id: 'chunk-a', payload: { id: 'mat-1', courseName: 'MigrateSandbox', name: 'chapter 2' } },
                { id: 'chunk-b', payload: { id: 'mat-1', courseName: 'MigrateSandbox', name: 'chapter 2' } },
                { id: 'chunk-orphan', payload: { id: 'unknown' } },
            ],
            materials,
            catalog
        );
        expect(grouped.idsByMaterial.get('mat-1')).toEqual(['chunk-a', 'chunk-b']);
        expect(grouped.untrackedPointIds).toEqual(['chunk-orphan']);
    });
});

describe('runMigratePipeline', () => {
    it('runs A then B then C then D and cannot skip C (resolve) before D (validate)', async () => {
        const ran: string[] = [];
        const handlers = {
            'mongo-attribute-check': async () => {
                ran.push('mongo-attribute-check');
            },
            'qdrant-attribute-check': async () => {
                ran.push('qdrant-attribute-check');
            },
            'qdrant-resolve': async () => {
                ran.push('qdrant-resolve');
            },
            'qdrant-validate': async () => {
                ran.push('qdrant-validate');
            },
        };
        const completed = await runMigratePipeline(MIGRATE_PIPELINE_OPS, handlers, () => undefined);
        expect(MIGRATE_PIPELINE_OPS).toEqual([
            'mongo-attribute-check',
            'qdrant-attribute-check',
            'qdrant-resolve',
            'qdrant-validate',
        ]);
        expect(completed).toEqual(MIGRATE_PIPELINE_OPS);
        expect(ran).toEqual(MIGRATE_PIPELINE_OPS);
        expect(ran.indexOf('qdrant-resolve')).toBeLessThan(ran.indexOf('qdrant-validate'));
    });
});
