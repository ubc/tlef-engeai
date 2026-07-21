import type { Db } from 'mongodb';
import type { MongoDalContext } from '../mongo-context';
import type { ScenarioStudentProgress } from '../../../types/shared';
import {
    deleteScenarioStudentProgress,
    filterProgressAnswers,
    getScenarioStudentProgress,
    upsertScenarioStudentProgress,
} from '../scenario-progress-mongo';

type ProgressDoc = ScenarioStudentProgress;

function makeCtx(docs: ProgressDoc[], courseName = 'TestCourse'): MongoDalContext {
    const progressCollectionName = `${courseName}_scenario_progress`;
    const state = { docs: [...docs] };

    const db = {
        collection: (name: string) => {
            if (name !== progressCollectionName) {
                throw new Error(`Unexpected collection: ${name}`);
            }
            return {
                findOne: async (filter: { userId?: string; questionId?: string; mode?: string }) =>
                    state.docs.find(
                        (d) =>
                            d.userId === filter.userId &&
                            d.questionId === filter.questionId &&
                            d.mode === filter.mode
                    ) ?? null,
                updateOne: async (
                    filter: { userId?: string; questionId?: string; mode?: string },
                    update: { $set: ProgressDoc },
                    options?: { upsert?: boolean }
                ) => {
                    const idx = state.docs.findIndex(
                        (d) =>
                            d.userId === filter.userId &&
                            d.questionId === filter.questionId &&
                            d.mode === filter.mode
                    );
                    if (idx >= 0) {
                        state.docs[idx] = update.$set;
                        return { matchedCount: 1, upsertedCount: 0 };
                    }
                    if (options?.upsert) {
                        state.docs.push(update.$set);
                        return { matchedCount: 0, upsertedCount: 1 };
                    }
                    return { matchedCount: 0, upsertedCount: 0 };
                },
                deleteOne: async (filter: { userId?: string; questionId?: string; mode?: string }) => {
                    const before = state.docs.length;
                    state.docs = state.docs.filter(
                        (d) =>
                            !(
                                d.userId === filter.userId &&
                                d.questionId === filter.questionId &&
                                d.mode === filter.mode
                            )
                    );
                    return { deletedCount: before - state.docs.length };
                },
            };
        },
    } as unknown as Db;

    return {
        db,
        idGenerator: {} as MongoDalContext['idGenerator'],
        collectionNamesCache: new Map([
            [
                courseName,
                {
                    users: `${courseName}_users`,
                    flags: `${courseName}_flags`,
                    memoryAgent: `${courseName}_memory-agent`,
                    scheduledTasks: `${courseName}_scheduled_tasks`,
                    scenarioQuestions: `${courseName}_scenario_questions`,
                    scenarioProgress: progressCollectionName,
                },
            ],
        ]),
        scheduledTasksIndexesEnsured: new Set<string>(),
    };
}

describe('filterProgressAnswers', () => {
    it('drops unknown subQuestionId values', () => {
        const valid = new Set(['sq1', 'sq2']);
        const filtered = filterProgressAnswers(
            [
                { subQuestionId: 'sq1', studentAnswer: 'a' },
                { subQuestionId: 'sq-bad', studentAnswer: 'b' },
            ],
            valid
        );
        expect(filtered).toEqual([{ subQuestionId: 'sq1', studentAnswer: 'a' }]);
    });
});

describe('scenario-progress-mongo', () => {
    const courseName = 'TestCourse';
    const validIds = new Set(['sq1', 'sq2']);

    it('M1: first upsert creates doc', async () => {
        const ctx = makeCtx([]);
        const doc = await upsertScenarioStudentProgress(ctx, courseName, {
            userId: 'u1',
            questionId: 'q1',
            mode: 'practice',
            answers: [{ subQuestionId: 'sq1', studentAnswer: 'hello' }],
            validSubQuestionIds: validIds,
        });
        expect(doc.answers).toEqual([{ subQuestionId: 'sq1', studentAnswer: 'hello' }]);
        expect(doc.updatedAt).toBeInstanceOf(Date);
    });

    it('M2: second upsert overwrites answers', async () => {
        const now = new Date('2026-01-01T10:00:00Z');
        const ctx = makeCtx([
            {
                userId: 'u1',
                questionId: 'q1',
                mode: 'practice',
                answers: [{ subQuestionId: 'sq1', studentAnswer: 'old' }],
                updatedAt: now,
            },
        ]);
        const doc = await upsertScenarioStudentProgress(ctx, courseName, {
            userId: 'u1',
            questionId: 'q1',
            mode: 'practice',
            answers: [{ subQuestionId: 'sq1', studentAnswer: 'new' }],
            validSubQuestionIds: validIds,
        });
        expect(doc.answers[0].studentAnswer).toBe('new');
        expect(doc.updatedAt.getTime()).toBeGreaterThanOrEqual(now.getTime());
    });

    it('M3: get returns null when missing', async () => {
        const ctx = makeCtx([]);
        const doc = await getScenarioStudentProgress(ctx, courseName, 'u1', 'q1', 'practice');
        expect(doc).toBeNull();
    });

    it('M4: get returns only caller doc', async () => {
        const ctx = makeCtx([
            {
                userId: 'u1',
                questionId: 'q1',
                mode: 'practice',
                answers: [{ subQuestionId: 'sq1', studentAnswer: 'a' }],
                updatedAt: new Date(),
            },
            {
                userId: 'u2',
                questionId: 'q1',
                mode: 'practice',
                answers: [{ subQuestionId: 'sq1', studentAnswer: 'b' }],
                updatedAt: new Date(),
            },
        ]);
        const doc = await getScenarioStudentProgress(ctx, courseName, 'u1', 'q1', 'practice');
        expect(doc?.answers[0].studentAnswer).toBe('a');
    });

    it('M5: practice vs exam isolation', async () => {
        const ctx = makeCtx([
            {
                userId: 'u1',
                questionId: 'q1',
                mode: 'practice',
                answers: [{ subQuestionId: 'sq1', studentAnswer: 'practice' }],
                updatedAt: new Date(),
            },
            {
                userId: 'u1',
                questionId: 'q1',
                mode: 'exam',
                answers: [{ subQuestionId: 'sq1', studentAnswer: 'exam' }],
                updatedAt: new Date(),
            },
        ]);
        const practice = await getScenarioStudentProgress(ctx, courseName, 'u1', 'q1', 'practice');
        const exam = await getScenarioStudentProgress(ctx, courseName, 'u1', 'q1', 'exam');
        expect(practice?.answers[0].studentAnswer).toBe('practice');
        expect(exam?.answers[0].studentAnswer).toBe('exam');
    });

    it('M7: delete removes doc', async () => {
        const ctx = makeCtx([
            {
                userId: 'u1',
                questionId: 'q1',
                mode: 'exam',
                answers: [{ subQuestionId: 'sq1', studentAnswer: 'x' }],
                updatedAt: new Date(),
            },
        ]);
        await deleteScenarioStudentProgress(ctx, courseName, 'u1', 'q1', 'exam');
        const doc = await getScenarioStudentProgress(ctx, courseName, 'u1', 'q1', 'exam');
        expect(doc).toBeNull();
    });

    it('M8: delete is no-op when missing', async () => {
        const ctx = makeCtx([]);
        await expect(
            deleteScenarioStudentProgress(ctx, courseName, 'u1', 'q1', 'exam')
        ).resolves.toBeUndefined();
    });

    it('M9: upsert keeps one doc per user+question+mode', async () => {
        const ctx = makeCtx([]);
        await upsertScenarioStudentProgress(ctx, courseName, {
            userId: 'u1',
            questionId: 'q1',
            mode: 'practice',
            answers: [{ subQuestionId: 'sq1', studentAnswer: 'first' }],
            validSubQuestionIds: validIds,
        });
        await upsertScenarioStudentProgress(ctx, courseName, {
            userId: 'u1',
            questionId: 'q1',
            mode: 'practice',
            answers: [{ subQuestionId: 'sq1', studentAnswer: 'second' }],
            validSubQuestionIds: validIds,
        });
        const doc = await getScenarioStudentProgress(ctx, courseName, 'u1', 'q1', 'practice');
        expect(doc?.answers[0].studentAnswer).toBe('second');
    });
});
