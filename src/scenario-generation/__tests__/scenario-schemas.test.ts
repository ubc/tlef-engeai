/**
 * Scenario schema helpers — title resolution for generated drafts.
 */

import {
    resolveScenarioPersistTitle,
    SCENARIO_DEFAULT_TITLE,
    scenarioInstructorStudentResponsesQuerySchema,
    scenarioProgressQuerySchema,
    scenarioSaveProgressRequestSchema,
} from '../scenario-schemas';

describe('resolveScenarioPersistTitle', () => {
    it('uses LLM title when instructor title is omitted', () => {
        expect(resolveScenarioPersistTitle(undefined, 'Pump Cavitation Alert')).toBe('Pump Cavitation Alert');
    });

    it('treats Untitled placeholder as absent and uses LLM title', () => {
        expect(resolveScenarioPersistTitle('Untitled', 'Pump Cavitation Alert')).toBe('Pump Cavitation Alert');
    });

    it('treats default fallback string as absent and uses LLM title', () => {
        expect(resolveScenarioPersistTitle(SCENARIO_DEFAULT_TITLE, 'Pump Cavitation Alert')).toBe(
            'Pump Cavitation Alert'
        );
    });

    it('honors a real instructor override', () => {
        expect(resolveScenarioPersistTitle('My Custom Title', 'LLM Title')).toBe('My Custom Title');
    });

    it('falls back when both instructor and LLM titles are empty', () => {
        expect(resolveScenarioPersistTitle(undefined, '')).toBe(SCENARIO_DEFAULT_TITLE);
    });
});

describe('scenarioInstructorStudentResponsesQuerySchema', () => {
    it('defaults limit and offset', () => {
        expect(scenarioInstructorStudentResponsesQuerySchema.parse({})).toEqual({
            limit: 10,
            offset: 0,
        });
    });

    it('coerces string query params and caps limit at 50', () => {
        expect(scenarioInstructorStudentResponsesQuerySchema.parse({ limit: '25', offset: '5' })).toEqual({
            limit: 25,
            offset: 5,
        });
        expect(scenarioInstructorStudentResponsesQuerySchema.safeParse({ limit: '99' }).success).toBe(false);
    });
});

describe('scenarioSaveProgressRequestSchema', () => {
    it('Z1: accepts valid save payload', () => {
        const result = scenarioSaveProgressRequestSchema.safeParse({
            mode: 'practice',
            answers: [{ subQuestionId: 'sq1', studentAnswer: 'hello' }],
        });
        expect(result.success).toBe(true);
    });

    it('Z2: rejects all-whitespace answers', () => {
        const result = scenarioSaveProgressRequestSchema.safeParse({
            mode: 'exam',
            answers: [{ subQuestionId: 'sq1', studentAnswer: '   ' }],
        });
        expect(result.success).toBe(false);
    });

    it('Z3: rejects missing mode', () => {
        const result = scenarioSaveProgressRequestSchema.safeParse({
            answers: [{ subQuestionId: 'sq1', studentAnswer: 'hello' }],
        });
        expect(result.success).toBe(false);
    });

    it('Z4: rejects invalid mode', () => {
        const result = scenarioSaveProgressRequestSchema.safeParse({
            mode: 'quiz',
            answers: [{ subQuestionId: 'sq1', studentAnswer: 'hello' }],
        });
        expect(result.success).toBe(false);
    });

    it('Z7: rejects empty answers array', () => {
        const result = scenarioSaveProgressRequestSchema.safeParse({
            mode: 'practice',
            answers: [],
        });
        expect(result.success).toBe(false);
    });
});

describe('scenarioProgressQuerySchema', () => {
    it('Z5: requires mode', () => {
        expect(scenarioProgressQuerySchema.safeParse({}).success).toBe(false);
    });

    it('Z6: accepts practice mode', () => {
        expect(scenarioProgressQuerySchema.safeParse({ mode: 'practice' }).success).toBe(true);
    });
});
