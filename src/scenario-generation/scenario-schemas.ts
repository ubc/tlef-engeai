/**
 * Scenario Schemas — Zod contracts for Practice Scenarios generation and grading
 *
 * Single source of truth for LLM structured-output schemas, request validation,
 * persistence shapes, and pure sanitizers. Routes and ScenarioService import from
 * here; generation/feedback LLM calls never receive persistence-only schemas.
 *
 * @author: @gatahcha
 * @date: 2026-07-14
 * @version: 1.0.0
 * @description: Zod schemas and sanitizers for scenario generation, grading, and persistence.
 */

import { z } from 'zod';
import {
    SCENARIO_BATCH_MAX_COUNT,
    type ScenarioSubQuestionType,
} from '../types/shared';

export const scenarioModeSchema = z.enum(['practice', 'exam']);
export const scenarioSubQuestionIdSchema = z.string().trim().min(1);
export const scenarioGradeSchema = z.number().int().min(1).max(10);
export const scenarioSubQuestionTypeSchema = z.enum([
    'calculation',
    'troubleshoot',
    'action',
    'corrective',
]);

/** Storage-only response history. The server creates `id`; the LLM never receives this schema. */
export const scenarioStudentResponsePersistenceSchema = z.object({
    id: z.string().trim().min(1),
    studentUserId: z.string().trim().min(1),
    mode: scenarioModeSchema,
    studentAnswer: z.string().trim().min(1),
    grade: scenarioGradeSchema,
    feedback: z.string().trim().min(1),
    submittedAt: z.coerce.date(),
});

/** LLM generation output: the server assigns subQuestionId during persistence. */
export const generatedSubQuestionSchema = z.object({
    subQuestionType: scenarioSubQuestionTypeSchema,
    prompt: z.string().trim().min(1),
    modelAnswer: z.string().trim().min(1),
});

/** Persisted sub-question. The ID and history are server-owned, never LLM output. */
export const persistedSubQuestionSchema = generatedSubQuestionSchema.extend({
    subQuestionId: scenarioSubQuestionIdSchema,
    points: z.number().nonnegative().optional(),
    studentResponses: z.array(scenarioStudentResponsePersistenceSchema),
});

/**
 * Base question returned by the generation LLM. Intentionally excludes database fields,
 * IDs, embedded student responses, and other server-owned metadata.
 */
export const generatedScenarioSchema = z.object({
    title: z.string().trim().min(1),
    questionBody: z.string().trim().min(1),
    solutionBody: z.string().trim(),
    subQuestions: z.array(generatedSubQuestionSchema).min(1).max(26),
});

/** One complete generated question — alias used by single-mode structured output. */
export const singleScenarioSchema = generatedScenarioSchema;

export type GeneratedScenario = z.infer<typeof generatedScenarioSchema>;

/** `batch` mode — an array of independent questions, capped at {@link SCENARIO_BATCH_MAX_COUNT}. */
export const batchScenarioSchema = z.object({
    questions: z.array(generatedScenarioSchema).max(SCENARIO_BATCH_MAX_COUNT),
});

export type GeneratedScenarioBatch = z.infer<typeof batchScenarioSchema>;

/** Storage-only question shape after the server adds its ID, metadata, and response arrays. */
export const scenarioQuestionPersistenceSchema = generatedScenarioSchema
    .omit({ subQuestions: true })
    .extend({
        id: z.string().trim().min(1),
        courseId: z.string().trim().min(1),
        courseName: z.string().trim().min(1),
        topicOrWeekId: z.string().trim().min(1),
        status: z.enum(['draft', 'published', 'rejected']),
        sourcePrompt: z.string(),
        subQuestions: z.array(persistedSubQuestionSchema).min(1).max(26),
        learningObjectives: z.array(
            z.object({
                objectiveId: z.string().trim().min(1),
                text: z.string().trim().min(1),
                sourceTopicOrWeekId: z.string().trim().min(1),
                sourceItemId: z.string().trim().min(1),
            })
        ),
        sortOrder: z.number().int().nonnegative(),
        createdAt: z.coerce.date(),
        updatedAt: z.coerce.date(),
        publishedAt: z.coerce.date().nullable().optional(),
        createdByUserId: z.string().trim().min(1),
        lastEditedByUserId: z.string().trim().min(1).optional(),
    });

/** Practice check-answer — TA suggestions only (no grade). */
export const scenarioPracticeFeedbackResponseSchema = z.object({
    feedback: z.string().trim().min(1),
});

export type ScenarioPracticeFeedbackLLMResponse = z.infer<typeof scenarioPracticeFeedbackResponseSchema>;

/** Exam grading (and legacy single-part grade path). */
export const scenarioFeedbackResponseSchema = z.object({
    grade: scenarioGradeSchema,
    feedback: z.string().trim().min(1),
});

export type ScenarioFeedbackLLMResponse = z.infer<typeof scenarioFeedbackResponseSchema>;

/** Batch exam grading — one LLM structured response for every sub-question answer. */
export const scenarioExamGradingResponseSchema = z.object({
    results: z
        .array(
            z.object({
                subQuestionId: scenarioSubQuestionIdSchema,
                grade: scenarioGradeSchema,
                feedback: z.string().trim().min(1),
            })
        )
        .min(1),
});

export type ScenarioExamGradingLLMResponse = z.infer<typeof scenarioExamGradingResponseSchema>;

export const checkScenarioAnswerRequestSchema = z.object({
    subQuestionId: scenarioSubQuestionIdSchema,
    studentAnswer: z.string().trim().min(1),
    mode: scenarioModeSchema,
});

export const submitScenarioExamRequestSchema = z.object({
    answers: z
        .array(
            z.object({
                subQuestionId: scenarioSubQuestionIdSchema,
                studentAnswer: z.string().trim().min(1),
            })
        )
        .min(1),
});

export const scenarioGenerateRequestSchema = z.object({
    mode: z.enum(['single', 'batch']),
    sourcePrompt: z.string().trim().min(1),
    topicOrWeekId: z.string().trim().min(1),
    learningObjectiveIds: z.array(z.string().trim().min(1)).optional(),
    subQuestionTypes: z.array(scenarioSubQuestionTypeSchema).min(1).max(26).optional(),
    difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
    title: z.string().trim().optional(),
    count: z.number().int().min(1).max(SCENARIO_BATCH_MAX_COUNT).optional(),
});

const FALLBACK_FEEDBACK =
    'Your answer was evaluated against the learning goals for this part. Review the scenario details, check your assumptions and units, and ensure your reasoning addresses the question asked.';

const FALLBACK_PRACTICE_FEEDBACK =
    'Thanks for sharing your work. Re-read the scenario details, check your units and assumptions, and see whether your reasoning fully addresses what the question is asking.';

/**
 * Sanitizes practice TA feedback — no grade. Strips model-answer leaks.
 */
export function sanitizeScenarioPracticeFeedback(
    raw: ScenarioPracticeFeedbackLLMResponse,
    modelAnswer: string
): { feedback: string } {
    const feedback = raw.feedback?.trim() || FALLBACK_PRACTICE_FEEDBACK;

    const modelAnswerNormalized = modelAnswer.trim().toLowerCase();
    const leaksModelAnswer =
        modelAnswerNormalized.length > 20 && feedback.toLowerCase().includes(modelAnswerNormalized);

    return {
        feedback: leaksModelAnswer ? FALLBACK_PRACTICE_FEEDBACK : feedback,
    };
}

/**
 * Drops model-answer leaks and clamps invalid grades. Always returns a safe
 * `{ grade, feedback }` pair for persistence and API responses.
 */
export function sanitizeScenarioFeedback(
    raw: ScenarioFeedbackLLMResponse,
    modelAnswer: string
): { grade: number; feedback: string } {
    // Clamp grade to valid 1–10 integer; default to mid-range when LLM returns garbage
    const grade = Number.isInteger(raw.grade) && raw.grade >= 1 && raw.grade <= 10 ? raw.grade : 5;
    const feedback = raw.feedback?.trim() || FALLBACK_FEEDBACK;

    // Reject feedback that quotes the model answer back to the student
    const modelAnswerNormalized = modelAnswer.trim().toLowerCase();
    const leaksModelAnswer =
        modelAnswerNormalized.length > 20 && feedback.toLowerCase().includes(modelAnswerNormalized);

    return {
        grade,
        feedback: leaksModelAnswer ? FALLBACK_FEEDBACK : feedback,
    };
}

/**
 * Validates batch exam grading covers every expected subQuestionId exactly once,
 * sanitizes each grade/feedback pair, and returns results in expectedId order.
 */
export function sanitizeExamGradingResponse(
    raw: ScenarioExamGradingLLMResponse,
    expectedSubQuestionIds: string[],
    modelAnswersBySubQuestionId: Record<string, string>
): { subQuestionId: string; grade: number; feedback: string }[] | null {
    if (!raw.results?.length) return null;

    // Build map — reject duplicates, unknown ids, or partial coverage
    const byId = new Map<string, { grade: number; feedback: string }>();
    for (const item of raw.results) {
        const id = item.subQuestionId?.trim();
        if (!id || byId.has(id)) return null;
        if (!expectedSubQuestionIds.includes(id)) return null;
        byId.set(id, sanitizeScenarioFeedback(item, modelAnswersBySubQuestionId[id] ?? ''));
    }

    if (byId.size !== expectedSubQuestionIds.length) return null;

    // Return in question order, not LLM result order
    return expectedSubQuestionIds.map((subQuestionId) => {
        const graded = byId.get(subQuestionId)!;
        return { subQuestionId, ...graded };
    });
}

/**
 * Validates generated question has ≥1 complete part; remaps to requested type order when
 * provided. LLM output has no subQuestionId — the server assigns IDs at persist time.
 */
export function sanitizeGeneratedScenario(
    raw: GeneratedScenario,
    requestedTypes?: ScenarioSubQuestionType[]
): GeneratedScenario | null {
    // Drop questions with no narrative
    if (!raw.questionBody?.trim()) {
        return null;
    }

    // Keep only complete parts from raw LLM output
    let subQuestions = (raw.subQuestions ?? []).filter(
        (sub) => !!sub.prompt?.trim() && !!sub.modelAnswer?.trim() && !!sub.subQuestionType
    );

    // Remap to instructor-requested type order when types were specified
    if (requestedTypes && requestedTypes.length > 0) {
        subQuestions = requestedTypes
            .map((subQuestionType, index) => {
                const fromModel =
                    raw.subQuestions[index] ??
                    raw.subQuestions.find((s) => s.subQuestionType === subQuestionType) ??
                    raw.subQuestions[0];
                return {
                    subQuestionType,
                    prompt: fromModel?.prompt?.trim() || `Complete the ${subQuestionType} part of this scenario.`,
                    modelAnswer: fromModel?.modelAnswer?.trim() || '',
                };
            })
            .filter((sub) => sub.modelAnswer.length > 0);

        if (subQuestions.length === 0) {
            subQuestions = raw.subQuestions
                .filter((sub) => !!sub.prompt?.trim() && !!sub.modelAnswer?.trim())
                .map((sub, index) => ({
                    subQuestionType: requestedTypes[index] ?? sub.subQuestionType,
                    prompt: sub.prompt.trim(),
                    modelAnswer: sub.modelAnswer.trim(),
                }));
        }
    }

    if (subQuestions.length === 0) {
        return null;
    }

    return {
        title: raw.title?.trim() || 'Untitled scenario question',
        questionBody: raw.questionBody.trim(),
        solutionBody: (raw.solutionBody ?? '').trim(),
        subQuestions,
    };
}
