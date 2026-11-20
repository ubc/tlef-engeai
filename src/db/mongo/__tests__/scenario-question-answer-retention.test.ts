/**
 * Student answers on scenario questions must survive instructor deletes and edits:
 * answered questions are archived instead of removed, answered parts can't be dropped,
 * and an edit racing a student submission re-reads instead of overwriting the answer.
 */
jest.mock('../collection-registry-mongo', () => ({
    getCollectionNames: async () => ({ scenarioQuestions: 'test_scenario_questions' }),
}));

import type { ScenarioQuestion, ScenarioStudentResponse, ScenarioSubQuestion } from '../../../types/shared';
import type { MongoDalContext } from '../mongo-context';
import {
    buildScenarioQuestionUpdate,
    deleteScenarioQuestion,
    listScenarioQuestions,
    patchScenarioQuestionStatus,
    ScenarioPartHasResponsesError,
    ScenarioQuestionEditConflictError,
    updateScenarioQuestion,
} from '../scenario-questions-mongo';

const idGenerator = {
    scenarioSubQuestionID: (_q: string, index: number) => `generated-${index}`,
} as unknown as MongoDalContext['idGenerator'];

function makeCtx(collection: Record<string, jest.Mock>): MongoDalContext {
    return {
        db: { collection: () => collection },
        idGenerator,
    } as unknown as MongoDalContext;
}

function response(id: string): ScenarioStudentResponse {
    return {
        id,
        studentUserId: 'student-1',
        mode: 'practice',
        studentAnswer: 'my answer',
        feedback: 'feedback',
        submittedAt: new Date('2026-11-01T10:00:00Z'),
    };
}

function part(subQuestionId: string, responses: ScenarioStudentResponse[] = []): ScenarioSubQuestion {
    return {
        subQuestionId,
        subQuestionType: 'calculation',
        prompt: `prompt ${subQuestionId}`,
        modelAnswer: '# Answer',
        studentResponses: responses,
    };
}

function question(subQuestions: ScenarioSubQuestion[], updatedAt = new Date('2026-11-01T09:00:00Z')): ScenarioQuestion {
    return {
        id: 'q1',
        courseId: 'c1',
        courseName: 'course',
        topicOrWeekId: 't1',
        title: 'Q',
        status: 'published',
        sourcePrompt: '',
        questionBody: 'body',
        solutionBody: '',
        subQuestions,
        difficulty: 'medium',
        expectedTimeMinutes: 20,
        learningObjectives: [],
        generatedBy: 'ai',
        sortOrder: 0,
        createdAt: updatedAt,
        updatedAt,
        createdByUserId: 'instructor-1',
    };
}

function editOf(subQuestions: ScenarioSubQuestion[]) {
    return subQuestions.map(({ studentResponses, ...rest }) => rest);
}

describe('deleteScenarioQuestion', () => {
    it('removes a question with no student answers', async () => {
        const collection = {
            deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
            updateOne: jest.fn(),
        };
        await expect(deleteScenarioQuestion(makeCtx(collection), 'course', 'q1')).resolves.toBe('deleted');

        // The delete itself is conditional on there being no answers
        expect(collection.deleteOne).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 'q1',
                'subQuestions.studentResponses.0': { $exists: false },
            })
        );
        expect(collection.updateOne).not.toHaveBeenCalled();
    });

    it('archives a question students have answered', async () => {
        const collection = {
            deleteOne: jest.fn().mockResolvedValue({ deletedCount: 0 }),
            updateOne: jest.fn().mockResolvedValue({ matchedCount: 1 }),
        };
        await expect(deleteScenarioQuestion(makeCtx(collection), 'course', 'q1')).resolves.toBe('archived');

        const [filter, update] = collection.updateOne.mock.calls[0];
        expect(filter).toEqual({ id: 'q1', status: { $ne: 'archived' } });
        expect(update.$set.status).toBe('archived');
        expect(update.$set.archivedAt).toBeInstanceOf(Date);
    });

    it('returns null for a missing or already archived question', async () => {
        const collection = {
            deleteOne: jest.fn().mockResolvedValue({ deletedCount: 0 }),
            updateOne: jest.fn().mockResolvedValue({ matchedCount: 0 }),
        };
        await expect(deleteScenarioQuestion(makeCtx(collection), 'course', 'q1')).resolves.toBeNull();
    });
});

describe('buildScenarioQuestionUpdate', () => {
    it('keeps answers on parts whose wording changed', () => {
        const existing = question([part('a', [response('r1')]), part('b')]);
        const edited = editOf(existing.subQuestions).map((s) => ({ ...s, prompt: `${s.prompt} (edited)` }));

        const update = buildScenarioQuestionUpdate(existing, { subQuestions: edited as any }, 'q1', idGenerator);
        const subQuestions = update.subQuestions as ScenarioSubQuestion[];
        expect(subQuestions[0].prompt).toBe('prompt a (edited)');
        expect(subQuestions[0].studentResponses.map((r) => r.id)).toEqual(['r1']);
    });

    it('rejects removing a part that has answers', () => {
        const existing = question([part('a'), part('b', [response('r1')])]);
        const withoutB = editOf(existing.subQuestions).slice(0, 1);

        expect(() =>
            buildScenarioQuestionUpdate(existing, { subQuestions: withoutB as any }, 'q1', idGenerator)
        ).toThrow(ScenarioPartHasResponsesError);
    });

    it('allows removing a part nobody has answered', () => {
        const existing = question([part('a', [response('r1')]), part('b')]);
        const withoutB = editOf(existing.subQuestions).slice(0, 1);

        const update = buildScenarioQuestionUpdate(existing, { subQuestions: withoutB as any }, 'q1', idGenerator);
        expect((update.subQuestions as ScenarioSubQuestion[]).map((s) => s.subQuestionId)).toEqual(['a']);
    });

    it('leaves sub-questions alone when the patch does not include them', () => {
        const existing = question([part('a', [response('r1')])]);
        const update = buildScenarioQuestionUpdate(existing, { title: 'New title' }, 'q1', idGenerator);
        expect(update.subQuestions).toBeUndefined();
        expect(update.title).toBe('New title');
    });
});

describe('updateScenarioQuestion', () => {
    it('re-reads and carries over an answer submitted mid-edit', async () => {
        const before = question([part('a')], new Date('2026-11-01T09:00:00Z'));
        // A student answers between the instructor's read and write
        const after = question([part('a', [response('r-new')])], new Date('2026-11-01T09:00:05Z'));

        const collection = {
            findOne: jest.fn().mockResolvedValueOnce(before).mockResolvedValueOnce(after),
            findOneAndUpdate: jest
                .fn()
                .mockResolvedValueOnce(null)
                .mockImplementationOnce(async (_filter, update) => ({ ...after, ...update.$set })),
        };

        const result = await updateScenarioQuestion(makeCtx(collection), 'course', 'q1', {
            subQuestions: editOf(before.subQuestions) as any,
        });

        expect(collection.findOneAndUpdate).toHaveBeenCalledTimes(2);
        // Each write is guarded by the updatedAt that was read
        expect(collection.findOneAndUpdate.mock.calls[0][0].updatedAt).toEqual(before.updatedAt);
        expect(collection.findOneAndUpdate.mock.calls[1][0].updatedAt).toEqual(after.updatedAt);
        // The second write rebuilt from the fresh read, so the new answer is kept
        const written = collection.findOneAndUpdate.mock.calls[1][1].$set.subQuestions as ScenarioSubQuestion[];
        expect(written[0].studentResponses.map((r) => r.id)).toEqual(['r-new']);
        expect(result?.subQuestions[0].studentResponses.map((r) => r.id)).toEqual(['r-new']);
    });

    it('gives up with a conflict error when the question keeps changing', async () => {
        const existing = question([part('a')]);
        const collection = {
            findOne: jest.fn().mockResolvedValue(existing),
            findOneAndUpdate: jest.fn().mockResolvedValue(null),
        };

        await expect(
            updateScenarioQuestion(makeCtx(collection), 'course', 'q1', { title: 'x' })
        ).rejects.toBeInstanceOf(ScenarioQuestionEditConflictError);
        expect(collection.findOneAndUpdate).toHaveBeenCalledTimes(3);
    });

    it('returns null for an archived or missing question', async () => {
        const collection = {
            findOne: jest.fn().mockResolvedValue(null),
            findOneAndUpdate: jest.fn(),
        };
        await expect(
            updateScenarioQuestion(makeCtx(collection), 'course', 'q1', { title: 'x' })
        ).resolves.toBeNull();
        expect(collection.findOne).toHaveBeenCalledWith({ id: 'q1', status: { $ne: 'archived' } });
        expect(collection.findOneAndUpdate).not.toHaveBeenCalled();
    });
});

describe('archived questions stay out of the bank', () => {
    it('excludes archived questions from the instructor listing', async () => {
        const toArray = jest.fn().mockResolvedValue([]);
        const sort = jest.fn().mockReturnValue({ toArray });
        const collection = { find: jest.fn().mockReturnValue({ sort }) };

        await listScenarioQuestions(makeCtx(collection), 'course');
        expect(collection.find).toHaveBeenCalledWith({ status: { $ne: 'archived' } });

        await expect(
            listScenarioQuestions(makeCtx(collection), 'course', { status: 'archived' })
        ).resolves.toEqual([]);
    });

    it('refuses to set or clear archived through the status API', async () => {
        const collection = { findOne: jest.fn().mockResolvedValue(null), findOneAndUpdate: jest.fn() };

        await expect(
            patchScenarioQuestionStatus(makeCtx(collection), 'course', 'q1', 'archived')
        ).resolves.toEqual({ error: 'Invalid status' });

        // An archived question reads as missing, so it can't be republished
        await expect(
            patchScenarioQuestionStatus(makeCtx(collection), 'course', 'q1', 'published')
        ).resolves.toEqual({ error: 'Question not found' });
        expect(collection.findOneAndUpdate).not.toHaveBeenCalled();
    });
});
