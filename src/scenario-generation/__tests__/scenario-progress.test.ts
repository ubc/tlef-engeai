/**
 * Scenario progress — service-layer draft save/load and exam-submit cleanup.
 */

const mockDeleteScenarioStudentProgress = jest.fn();
const mockAppendScenarioExamResponses = jest.fn();
const mockGetScenarioQuestionById = jest.fn();
const mockGetScenarioStudentProgress = jest.fn();
const mockUpsertScenarioStudentProgress = jest.fn();

jest.mock('../../db/enge-ai-mongodb', () => ({
    EngEAI_MongoDB: {
        getInstance: jest.fn(async () => ({
            getScenarioQuestionById: mockGetScenarioQuestionById,
            appendScenarioExamResponses: mockAppendScenarioExamResponses,
            deleteScenarioStudentProgress: mockDeleteScenarioStudentProgress,
            getScenarioStudentProgress: mockGetScenarioStudentProgress,
            upsertScenarioStudentProgress: mockUpsertScenarioStudentProgress,
            appendScenarioStudentResponse: jest.fn(),
        })),
    },
}));

jest.mock('../../helpers/developer-mode', () => ({
    isDeveloperMode: () => true,
    getMockGeneratedScenario: jest.fn(),
    getMockScenarioFeedback: () => ({ grade: 8, feedback: 'Good work.' }),
    getMockScenarioPracticeFeedback: jest.fn(),
}));

import { getScenarioService, submitScenarioExam } from '../scenario-service';
import type { ScenarioQuestion } from '../../types/shared';

function makePublishedQuestion(): ScenarioQuestion {
    return {
        id: 'q1',
        courseId: 'c1',
        courseName: 'TestCourse',
        topicOrWeekId: 'tw1',
        title: 'Test',
        status: 'published',
        sourcePrompt: 'prompt',
        questionBody: 'body',
        solutionBody: 'solution',
        subQuestions: [
            {
                subQuestionId: 'sq1',
                subQuestionType: 'calculation',
                prompt: 'Part 1',
                modelAnswer: '42',
                studentResponses: [],
            },
        ],
        difficulty: 'medium',
        expectedTimeMinutes: 25,
        learningObjectives: [],
        generatedBy: 'instructor',
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdByUserId: 'inst1',
    };
}

describe('scenario progress service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('saveStudentProgress upserts filtered answers for published question', async () => {
        const question = makePublishedQuestion();
        mockGetScenarioQuestionById.mockResolvedValue(question);
        const updatedAt = new Date('2026-07-21T12:00:00Z');
        mockUpsertScenarioStudentProgress.mockResolvedValue({
            userId: 'u1',
            questionId: 'q1',
            mode: 'practice',
            answers: [{ subQuestionId: 'sq1', studentAnswer: 'draft' }],
            updatedAt,
        });

        const result = await getScenarioService().saveStudentProgress('TestCourse', 'q1', 'u1', {
            mode: 'practice',
            answers: [{ subQuestionId: 'sq1', studentAnswer: 'draft' }],
        });

        expect(result).toEqual({
            questionId: 'q1',
            mode: 'practice',
            answers: [{ subQuestionId: 'sq1', studentAnswer: 'draft' }],
            updatedAt: updatedAt.toISOString(),
        });
        expect(mockUpsertScenarioStudentProgress).toHaveBeenCalled();
    });

    it('getStudentProgress returns empty when no draft', async () => {
        mockGetScenarioQuestionById.mockResolvedValue(makePublishedQuestion());
        mockGetScenarioStudentProgress.mockResolvedValue(null);

        const result = await getScenarioService().getStudentProgress(
            'TestCourse',
            'q1',
            'u1',
            'practice'
        );

        expect(result.answers).toEqual([]);
    });

    it('S1: submitExam success deletes exam progress', async () => {
        mockGetScenarioQuestionById.mockResolvedValue(makePublishedQuestion());
        mockAppendScenarioExamResponses.mockResolvedValue(undefined);
        mockDeleteScenarioStudentProgress.mockResolvedValue(undefined);

        const result = await submitScenarioExam({
            courseId: 'c1',
            courseName: 'TestCourse',
            questionId: 'q1',
            studentUserId: 'u1',
            answers: [{ subQuestionId: 'sq1', studentAnswer: 'final answer' }],
        });

        expect(result.success).toBe(true);
        expect(mockDeleteScenarioStudentProgress).toHaveBeenCalledWith(
            'TestCourse',
            'u1',
            'q1',
            'exam'
        );
    });

    it('S2: submitExam validation failure does not delete progress', async () => {
        mockGetScenarioQuestionById.mockResolvedValue(makePublishedQuestion());

        const result = await submitScenarioExam({
            courseId: 'c1',
            courseName: 'TestCourse',
            questionId: 'q1',
            studentUserId: 'u1',
            answers: [],
        });

        expect(result.success).toBe(false);
        expect(mockDeleteScenarioStudentProgress).not.toHaveBeenCalled();
    });
});
