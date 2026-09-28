import type { activeCourse, GlobalUser, TopicOrWeekInstance } from '../../types/shared';
import type { MaterialChunkForCopy } from '../../rag/rag-app';
import type { CourseMaterialReplacement } from '../../db/mongo/course-material-copy-mongo';
import {
    copyCourseMaterials,
    countCourseMaterials,
    CourseMaterialCopyDeps,
    listMaterialCopySources,
    MaterialCopyInProgressError,
    MaterialCopyLeaseLostError
} from '../course-material-copy-service';

jest.mock('../../jobs/scheduled-publish-audit', () => ({ scheduledPublishAudit: {} }));

const NOW = new Date('2026-09-28T12:00:00.000Z');
const FUTURE = new Date('2026-10-05T15:00:00.000Z');

function material(id: string, name: string, chunkIds: string[], extra: Record<string, unknown> = {}) {
    return {
        id,
        date: NOW,
        name,
        courseName: 'LLED 200 V89',
        topicOrWeekTitle: 'Week 1',
        itemTitle: 'Lecture',
        sourceType: 'file' as const,
        fileName: `${name}.pdf`,
        uploaded: true,
        qdrantChunkIds: chunkIds,
        chunksGenerated: chunkIds.length,
        courseId: 'src',
        ...extra
    };
}

function instance(id: string, title: string, items: any[], extra: Partial<TopicOrWeekInstance> = {}): TopicOrWeekInstance {
    return {
        id,
        date: NOW,
        title,
        courseName: 'LLED 200 V89',
        published: true,
        items,
        createdAt: NOW,
        updatedAt: NOW,
        ...extra
    } as TopicOrWeekInstance;
}

function item(id: string, title: string, materials: any[]) {
    return {
        id,
        date: NOW,
        title,
        courseName: 'LLED 200 V89',
        topicOrWeekTitle: 'Week 1',
        itemTitle: title,
        learningObjectives: [{ id: `lo-${id}`, LearningObjective: 'Explain X', createdAt: NOW, updatedAt: NOW }],
        instructorStruggleTopics: [{ id: `st-${id}`, struggleTopic: 'Y', createdAt: NOW, updatedAt: NOW }],
        additionalMaterials: materials,
        createdAt: NOW,
        updatedAt: NOW
    };
}

function sourceCourse(): activeCourse {
    return {
        id: 'src',
        date: NOW,
        courseSetup: true,
        courseName: 'LLED 200 V89',
        instructors: [{ userId: 'u-inst', name: 'Instructor' }],
        teachingAssistants: [],
        frameType: 'byWeek',
        tilesNumber: 2,
        topicOrWeekInstances: [
            instance('src-w1', 'Week 1', [
                // Two items with the same title in one week: hash-based ids would collide.
                item('src-i1', 'Lecture', [material('src-m1', 'Syllabus', ['p1', 'p2'])]),
                item('src-i2', 'Lecture', [material('src-m2', 'Notes', ['p3'])])
            ]),
            instance('src-w2', 'Week 2', [
                item('src-i3', 'Tutorial', [
                    material('src-m3', 'Gone', ['p4'], { deleted: true }),
                    material('src-m4', 'Never uploaded', []),
                    material('src-m5', 'Missing in Qdrant', ['p9'])
                ])
            ], { published: false, scheduledPublishAt: FUTURE })
        ]
    } as activeCourse;
}

function targetCourse(): activeCourse {
    return {
        ...sourceCourse(),
        id: 'tgt',
        courseName: 'LLED 200 V92',
        frameType: 'byTopic',
        tilesNumber: 1,
        topicOrWeekInstances: [
            instance('tgt-w1', 'Topic 1', [item('tgt-i1', 'Old', [material('tgt-m1', 'Old doc', ['old-1', 'old-2'])])],
                { published: false, scheduledPublishAt: FUTURE })
        ]
    } as activeCourse;
}

const STORED_CHUNKS: Record<string, MaterialChunkForCopy[]> = {
    'src-m1': [
        { id: 'p1', vector: [0.1, 0.2], payload: { id: 'src-m1', courseName: 'LLED 200 V89', courseId: 'src', topicOrWeekId: 'src-w1', itemId: 'src-i1', itemTitle: 'Lecture', content: 'chunk one' } },
        {
            id: 'p2',
            vector: [0.3, 0.4],
            payload: {
                id: 'src-m1', courseName: 'LLED 200 V89', itemTitle: 'Lecture', content: 'chunk two',
                chunkMetadata: { chunkNumber: 2, sourceDocumentMetadata: { id: 'src-m1', courseName: 'LLED 200 V89', loc: { lines: { from: 1, to: 9 } } } }
            }
        }
    ],
    'src-m2': [
        { id: 'p3', vector: [0.5, 0.6], payload: { id: 'src-m2', courseName: 'LLED 200 V89', itemTitle: 'Lecture', content: 'chunk three' } }
    ]
};

function makeDeps(overrides: Partial<CourseMaterialCopyDeps> = {}) {
    let idCounter = 0;
    const calls = {
        upserted: [] as MaterialChunkForCopy[],
        deleted: [] as string[][],
        replacement: null as CourseMaterialReplacement | null,
        released: 0,
        removedSchedules: [] as string[],
        addedSchedules: [] as Array<{ id: string; when: Date }>,
        warnings: [] as string[]
    };
    const deps: CourseMaterialCopyDeps = {
        getMaterialChunks: async (materialId, courseName) => {
            expect(courseName).toBe('LLED 200 V89');
            return STORED_CHUNKS[materialId] ?? [];
        },
        upsertChunks: async (points) => { calls.upserted.push(...points); },
        deleteChunks: async (ids) => { calls.deleted.push(ids); },
        acquireLease: async () => targetCourse(),
        replaceUnderLease: async (_courseId, _token, replacement) => {
            calls.replacement = replacement;
            return targetCourse();
        },
        releaseLease: async () => { calls.released += 1; },
        removeScheduledPublish: async (_course, inst) => { calls.removedSchedules.push(inst.id); },
        addScheduledPublish: async (_course, inst, when) => { calls.addedSchedules.push({ id: inst.id, when }); },
        newCatalogId: () => `new-${++idCounter}`,
        now: () => NOW,
        warn: (message) => { calls.warnings.push(message); },
        ...overrides
    };
    return { deps, calls };
}

function sourceIds(course: activeCourse): Set<string> {
    const ids = new Set<string>();
    for (const inst of course.topicOrWeekInstances) {
        ids.add(inst.id);
        for (const it of inst.items) {
            ids.add(it.id);
            it.learningObjectives.forEach((lo) => ids.add(lo.id));
            (it.instructorStruggleTopics || []).forEach((t) => ids.add(t.id));
            (it.additionalMaterials || []).forEach((m) => ids.add(m.id));
        }
    }
    return ids;
}

describe('copyCourseMaterials', () => {
    it('copies layout, objectives, struggle topics and materials under fresh ids', async () => {
        const { deps, calls } = makeDeps();
        const source = sourceCourse();

        const result = await copyCourseMaterials(deps, source, 'tgt');

        const replacement = calls.replacement!;
        expect(replacement.frameType).toBe('byWeek');
        expect(replacement.tilesNumber).toBe(2);
        expect(replacement.topicOrWeekInstances.map((i) => i.title)).toEqual(['Week 1', 'Week 2']);
        expect(replacement.topicOrWeekInstances[1].published).toBe(false);

        const [lecture1, lecture2] = replacement.topicOrWeekInstances[0].items;
        expect(lecture1.id).not.toBe(lecture2.id);
        expect(lecture1.learningObjectives[0].LearningObjective).toBe('Explain X');
        expect(lecture1.instructorStruggleTopics?.[0].struggleTopic).toBe('Y');

        const old = sourceIds(source);
        for (const id of sourceIds({ ...source, topicOrWeekInstances: replacement.topicOrWeekInstances })) {
            expect(old.has(id)).toBe(false);
        }

        const copiedSyllabus = lecture1.additionalMaterials![0];
        expect(copiedSyllabus).toMatchObject({ name: 'Syllabus', courseName: 'LLED 200 V92', courseId: 'tgt', itemId: lecture1.id });
        expect(copiedSyllabus.qdrantChunkIds).toHaveLength(2);

        expect(result).toMatchObject({
            sourceCourseId: 'src',
            topicsOrWeeksCopied: 2,
            materialsCopied: 2,
            chunksCopied: 3,
            replacedMaterialCount: 1
        });
    });

    it('writes chunk copies that point only at the target', async () => {
        const { deps, calls } = makeDeps();

        await copyCourseMaterials(deps, sourceCourse(), 'tgt');

        const syllabus = calls.replacement!.topicOrWeekInstances[0].items[0].additionalMaterials![0];
        const copies = calls.upserted.filter((p) => p.payload.id === syllabus.id);
        expect(copies.map((p) => p.id)).toEqual(syllabus.qdrantChunkIds);
        expect(copies.map((p) => p.vector)).toEqual([[0.1, 0.2], [0.3, 0.4]]);
        expect(copies[0].payload).toMatchObject({
            courseName: 'LLED 200 V92',
            courseId: 'tgt',
            topicOrWeekId: calls.replacement!.topicOrWeekInstances[0].id,
            itemId: calls.replacement!.topicOrWeekInstances[0].items[0].id,
            content: 'chunk one',
            itemTitle: 'Lecture'
        });
        expect(copies[1].payload.chunkMetadata).toEqual({
            chunkNumber: 2,
            sourceDocumentMetadata: expect.objectContaining({
                id: syllabus.id,
                courseName: 'LLED 200 V92',
                courseId: 'tgt',
                loc: { lines: { from: 1, to: 9 } }
            })
        });
        expect(copies[0].payload.chunkMetadata).toBeUndefined();
        for (const point of calls.upserted) {
            expect(['p1', 'p2', 'p3']).not.toContain(point.id);
        }
    });

    it('skips soft-deleted materials silently and reports materials with no stored chunks', async () => {
        const { deps, calls } = makeDeps();

        const result = await copyCourseMaterials(deps, sourceCourse(), 'tgt');

        expect(result.skippedMaterials).toEqual([
            { name: 'Never uploaded', topicOrWeekTitle: 'Week 2', itemTitle: 'Tutorial' },
            { name: 'Missing in Qdrant', topicOrWeekTitle: 'Week 2', itemTitle: 'Tutorial' }
        ]);
        expect(calls.replacement!.topicOrWeekInstances[1].items[0].additionalMaterials).toEqual([]);
    });

    it('deletes the replaced chunks and schedules, and schedules copied publishes', async () => {
        const { deps, calls } = makeDeps();

        await copyCourseMaterials(deps, sourceCourse(), 'tgt');

        expect(calls.deleted).toEqual([['old-1', 'old-2']]);
        expect(calls.removedSchedules).toEqual(['tgt-w1']);
        expect(calls.addedSchedules).toEqual([{ id: calls.replacement!.topicOrWeekInstances[1].id, when: FUTURE }]);
        expect(calls.released).toBe(0);
    });

    it('cleans up what the swap actually replaced, including uploads made mid-copy', async () => {
        const replacedWithLateUpload = targetCourse();
        replacedWithLateUpload.topicOrWeekInstances[0].items[0].additionalMaterials!.push(
            material('tgt-late', 'Late upload', ['late-1']) as any
        );
        const { deps, calls } = makeDeps({ replaceUnderLease: async () => replacedWithLateUpload });

        const result = await copyCourseMaterials(deps, sourceCourse(), 'tgt');

        expect(calls.deleted).toEqual([['old-1', 'old-2', 'late-1']]);
        expect(result.replacedMaterialCount).toBe(2);
    });

    it('refuses when another copy holds the target, writing nothing', async () => {
        const { deps, calls } = makeDeps({ acquireLease: async () => null });

        await expect(copyCourseMaterials(deps, sourceCourse(), 'tgt')).rejects.toBeInstanceOf(MaterialCopyInProgressError);
        expect(calls.upserted).toHaveLength(0);
        expect(calls.released).toBe(0);
    });

    it('rolls back written chunks and leaves the target untouched when the chunk upload fails', async () => {
        const { deps, calls } = makeDeps({
            upsertChunks: async () => { throw new Error('qdrant down'); },
            replaceUnderLease: async () => { throw new Error('must not swap'); }
        });

        await expect(copyCourseMaterials(deps, sourceCourse(), 'tgt')).rejects.toThrow('qdrant down');
        expect(calls.deleted).toHaveLength(1);
        expect(calls.deleted[0]).toHaveLength(3);
        expect(calls.deleted[0]).not.toEqual(expect.arrayContaining(['old-1']));
        expect(calls.released).toBe(1);
        expect(calls.removedSchedules).toEqual([]);
    });

    it('rolls back when the lease was lost before the swap', async () => {
        const { deps, calls } = makeDeps({ replaceUnderLease: async () => null });

        await expect(copyCourseMaterials(deps, sourceCourse(), 'tgt')).rejects.toBeInstanceOf(MaterialCopyLeaseLostError);
        expect(calls.deleted).toEqual([calls.upserted.map((p) => p.id)]);
        expect(calls.released).toBe(1);
    });

    it('still succeeds when cleaning up the replaced materials fails', async () => {
        let deleteCalls = 0;
        const { deps, calls } = makeDeps({
            deleteChunks: async () => {
                deleteCalls += 1;
                throw new Error('qdrant hiccup');
            },
            removeScheduledPublish: async () => { throw new Error('mongo hiccup'); }
        });

        const result = await copyCourseMaterials(deps, sourceCourse(), 'tgt');

        expect(result.materialsCopied).toBe(2);
        expect(deleteCalls).toBe(1);
        expect(calls.warnings).toHaveLength(2);
    });
});

describe('listMaterialCopySources', () => {
    const faculty = { userId: 'u-inst', affiliation: 'faculty' } as GlobalUser;

    it('lists courses the user instructs, other than the target, with counts', () => {
        const other = { ...sourceCourse(), id: 'other', instructors: [{ userId: 'someone-else', name: 'X' }] } as activeCourse;
        const empty = { ...sourceCourse(), id: 'empty', topicOrWeekInstances: [] } as activeCourse;

        const sources = listMaterialCopySources([sourceCourse(), targetCourse(), other, empty], faculty, 'tgt');

        expect(sources).toEqual([
            { id: 'src', courseName: 'LLED 200 V89', frameType: 'byWeek', topicOrWeekCount: 2, materialCount: 4 }
        ]);
    });

    it('excludes courses where the user is only a TA', () => {
        const taCourse = {
            ...sourceCourse(),
            instructors: [],
            teachingAssistants: [{ userId: 'u-inst', name: 'Instructor' }]
        } as unknown as activeCourse;

        expect(listMaterialCopySources([taCourse], faculty, 'tgt')).toEqual([]);
    });

    it('counts only live materials', () => {
        expect(countCourseMaterials(sourceCourse())).toBe(4);
    });
});
