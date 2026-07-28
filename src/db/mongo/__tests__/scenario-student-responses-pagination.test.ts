import type { ScenarioQuestion, ScenarioStudentResponse } from '../../../types/shared';
import { sortStudentResponsesNewestFirst, toInstructorProjection } from '../scenario-questions-mongo';

function makeResponse(
    overrides: Partial<ScenarioStudentResponse> & Pick<ScenarioStudentResponse, 'id' | 'submittedAt'>
): ScenarioStudentResponse {
    return {
        studentUserId: 'u1',
        mode: 'practice',
        studentAnswer: 'answer',
        feedback: 'feedback',
        ...overrides,
    };
}

describe('sortStudentResponsesNewestFirst', () => {
    it('orders by submittedAt descending', () => {
        const responses = [
            makeResponse({ id: 'old', submittedAt: new Date('2026-01-01T10:00:00Z') }),
            makeResponse({ id: 'new', submittedAt: new Date('2026-01-02T10:00:00Z') }),
        ];
        const sorted = sortStudentResponsesNewestFirst(responses);
        expect(sorted.map((r) => r.id)).toEqual(['new', 'old']);
    });

    it('paginates newest-first slices correctly', () => {
        const responses = Array.from({ length: 12 }, (_, index) =>
            makeResponse({
                id: `r${index}`,
                submittedAt: new Date(`2026-01-${String(index + 1).padStart(2, '0')}T10:00:00Z`),
            })
        );
        const sorted = sortStudentResponsesNewestFirst(responses);
        const page = sorted.slice(0, 10);
        expect(page).toHaveLength(10);
        expect(page[0].id).toBe('r11');
        expect(sorted.length - page.length).toBe(2);
    });
});

describe('toInstructorProjection', () => {
    it('strips studentResponses and exposes counts', () => {
        const question = {
            id: 'q1',
            subQuestions: [
                {
                    subQuestionId: 'sq1',
                    studentResponses: [makeResponse({ id: 'r1', submittedAt: new Date() })],
                },
            ],
        } as unknown as ScenarioQuestion;

        const projected = toInstructorProjection(question);
        expect(projected.subQuestions[0].studentResponseCount).toBe(1);
        expect((projected.subQuestions[0] as { studentResponses?: unknown }).studentResponses).toBeUndefined();
    });
});
