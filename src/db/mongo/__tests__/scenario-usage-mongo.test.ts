/**
 * Scenario usage for the instructor Monitor: per-student counts and one student's history.
 */
const mockBatchFindUsers = jest.fn();
jest.mock('../collection-registry-mongo', () => ({
    getCollectionNames: async () => ({ scenarioQuestions: 'test_scenario_questions' }),
}));
jest.mock('../course-user-mongo', () => ({
    batchFindUsersByUserIds: (...args: unknown[]) => mockBatchFindUsers(...args),
}));

import type { activeCourse } from '../../../types/shared';
import type { MongoDalContext } from '../mongo-context';
import {
    buildStudentScenarioUsageHistory,
    getScenarioUsageCounts,
    getStudentScenarioUsageHistory,
    StudentScopedQuestionDoc,
    UNCATEGORIZED_TOPIC_TITLE,
} from '../scenario-usage-mongo';

const course = {
    id: 'c1',
    courseName: 'course',
    topicOrWeekInstances: [
        { id: 'week1', title: 'Week 1' },
        { id: 'week2', title: 'Week 2' },
    ],
} as unknown as activeCourse;

function makeCtx(aggregateResult: unknown[]): { ctx: MongoDalContext; aggregate: jest.Mock } {
    const aggregate = jest.fn().mockReturnValue({ toArray: async () => aggregateResult });
    const ctx = { db: { collection: () => ({ aggregate }) } } as unknown as MongoDalContext;
    return { ctx, aggregate };
}

function response(id: string, mode: 'practice' | 'exam', submittedAt: string, grade?: number) {
    return { id, studentUserId: 'u1', mode, studentAnswer: 'answer', feedback: 'feedback', grade, submittedAt };
}

function question(
    id: string,
    overrides: Partial<StudentScopedQuestionDoc> & { responsesPerPart?: ReturnType<typeof response>[][] }
): StudentScopedQuestionDoc {
    const { responsesPerPart = [[], []], ...rest } = overrides;
    return {
        id,
        title: `Question ${id}`,
        status: 'published',
        topicOrWeekId: 'week1',
        sortOrder: 0,
        subQuestions: responsesPerPart.map((responses, i) => ({
            subQuestionId: `${id}-p${i}`,
            subQuestionType: 'calculation',
            prompt: `Part ${i}`,
            studentResponses: responses,
        })),
        ...rest,
    };
}

describe('getScenarioUsageCounts', () => {
    it('maps aggregated rows to counts keyed by stringified userId', async () => {
        const { ctx, aggregate } = makeCtx([
            { _id: 'u1', questionsAttempted: 2 },
            { _id: 42, questionsAttempted: 1 },
            { _id: null, questionsAttempted: 5 },
        ]);

        await expect(getScenarioUsageCounts(ctx, 'course')).resolves.toEqual({
            questionsAttemptedByUserId: { u1: 2, '42': 1 },
        });

        // Counts distinct questions per student, not attempts
        const pipeline = aggregate.mock.calls[0][0];
        expect(pipeline[2].$group._id).toEqual({
            userId: '$subQuestions.studentResponses.studentUserId',
            questionId: '$id',
        });
    });
});

describe('getStudentScenarioUsageHistory', () => {
    beforeEach(() => mockBatchFindUsers.mockReset());

    it('returns null for a user who is not on the roster', async () => {
        mockBatchFindUsers.mockResolvedValue(new Map());
        const { ctx, aggregate } = makeCtx([]);
        await expect(getStudentScenarioUsageHistory(ctx, course, 'u1')).resolves.toBeNull();
        expect(aggregate).not.toHaveBeenCalled();
    });

    it('returns null for a Student View test student', async () => {
        mockBatchFindUsers.mockResolvedValue(new Map([['u1', { name: 'Test', isTestStudent: true }]]));
        const { ctx } = makeCtx([]);
        await expect(getStudentScenarioUsageHistory(ctx, course, 'u1')).resolves.toBeNull();
    });

    it("reads only this student's responses", async () => {
        mockBatchFindUsers.mockResolvedValue(new Map([['u1', { name: 'Ada', isTestStudent: false }]]));
        const { ctx, aggregate } = makeCtx([]);

        const history = await getStudentScenarioUsageHistory(ctx, course, 'u1');
        expect(history?.studentName).toBe('Ada');

        const [match, project] = aggregate.mock.calls[0][0];
        expect(match.$match.$or).toEqual([
            { status: 'published' },
            { 'subQuestions.studentResponses.studentUserId': 'u1' },
        ]);
        const filter = project.$project.subQuestions.$map.in.studentResponses.$filter;
        expect(filter.cond).toEqual({ $eq: ['$$r.studentUserId', 'u1'] });
    });
});

describe('buildStudentScenarioUsageHistory', () => {
    it('orders published questions by chapter then sortOrder, and lists unattempted ones', () => {
        const history = buildStudentScenarioUsageHistory(
            course,
            [
                question('late', { topicOrWeekId: 'week2' }),
                question('second', { sortOrder: 2 }),
                question('first', { sortOrder: 1 }),
            ],
            'u1',
            'Ada'
        );
        expect(history.questions.map((q) => q.questionId)).toEqual(['first', 'second', 'late']);
        expect(history.questions.map((q) => q.topicTitle)).toEqual(['Week 1', 'Week 1', 'Week 2']);
        expect(history.questions.every((q) => q.progress === 'not_attempted' && q.parts.length === 0)).toBe(true);
        expect(history.publishedQuestionCount).toBe(3);
        expect(history.questionsAttempted).toBe(0);
    });

    it('computes progress, modes, newest-first attempts, and exam-only grades', () => {
        const history = buildStudentScenarioUsageHistory(
            course,
            [
                question('partial', {
                    responsesPerPart: [
                        [
                            response('old', 'practice', '2026-11-01T10:00:00Z', 9),
                            response('new', 'practice', '2026-11-02T10:00:00Z'),
                        ],
                        [],
                    ],
                }),
                question('complete', {
                    sortOrder: 1,
                    responsesPerPart: [
                        [response('e1', 'exam', '2026-11-03T10:00:00Z', 7)],
                        [response('e2', 'exam', '2026-11-03T10:00:00Z', 6)],
                    ],
                }),
            ],
            'u1',
            'Ada'
        );

        const [partial, complete] = history.questions;
        expect(partial.progress).toBe('partial');
        expect(partial.modesUsed).toEqual(['practice']);
        expect(partial.parts[0].attempts.map((a) => a.id)).toEqual(['new', 'old']);
        // A grade on a practice attempt is not passed through
        expect(partial.parts[0].attempts[1].grade).toBeUndefined();
        expect(partial.lastSubmittedAt).toBe('2026-11-02T10:00:00.000Z');

        expect(complete.progress).toBe('complete');
        expect(complete.modesUsed).toEqual(['exam']);
        expect(complete.parts[0].attempts[0].grade).toBe(7);

        expect(history.questionsAttempted).toBe(2);
        expect(history.questionsCompleted).toBe(1);
    });

    it('puts removed and unpublished questions the student answered last, and drops unanswered ones', () => {
        const history = buildStudentScenarioUsageHistory(
            course,
            [
                question('removed', {
                    status: 'archived',
                    responsesPerPart: [[response('r1', 'practice', '2026-11-01T10:00:00Z')]],
                }),
                question('draft-answered', {
                    status: 'draft',
                    responsesPerPart: [[response('r2', 'practice', '2026-11-05T10:00:00Z')]],
                }),
                question('draft-unanswered', { status: 'draft' }),
                question('live', { topicOrWeekId: 'gone-chapter' }),
            ],
            'u1',
            'Ada'
        );

        expect(history.questions.map((q) => [q.questionId, q.questionState])).toEqual([
            ['live', 'published'],
            ['draft-answered', 'unpublished'],
            ['removed', 'removed'],
        ]);
        expect(history.questions[0].topicTitle).toBe(UNCATEGORIZED_TOPIC_TITLE);
        // Removed work still counts toward the student's totals
        expect(history.publishedQuestionCount).toBe(1);
        expect(history.questionsAttempted).toBe(2);
    });
});
