/**
 * scenario-generation-schema.ts
 *
 * Zod schemas and post-processing for AI scenario question generation (single + batch).
 * Passed to {@link LLMModule.sendStructuredConversation}; see `scenario-display-format.md` and
 * `scenario-batch-generation.md` for the prompt-side contract these schemas encode.
 */

import { z } from 'zod';
import { REQUIRED_SCENARIO_PART_IDS, SCENARIO_BATCH_MAX_COUNT, type ScenarioPartId } from '../types/shared';

const scenarioPartIdSchema = z.enum(['a', 'b', 'c', 'd']);

const subQuestionSchema = z.object({
    partId: scenarioPartIdSchema,
    prompt: z.string(),
    modelAnswer: z.string(),
});

/** One complete generated question — used directly for `single` mode. */
export const singleScenarioSchema = z.object({
    title: z.string(),
    questionBody: z.string(),
    solutionBody: z.string(),
    subQuestions: z.array(subQuestionSchema),
});

export type GeneratedScenario = z.infer<typeof singleScenarioSchema>;

/** `batch` mode — an array of independent questions, capped at {@link SCENARIO_BATCH_MAX_COUNT}. */
export const batchScenarioSchema = z.object({
    questions: z.array(singleScenarioSchema).max(SCENARIO_BATCH_MAX_COUNT),
});

export type GeneratedScenarioBatch = z.infer<typeof batchScenarioSchema>;

/**
 * Validates that a generated question has the required (a)(b)(c) parts with non-empty prompt +
 * modelAnswer, and a non-empty narrative — mirrors `validatePublishScenarioQuestion` (Mongo layer)
 * so malformed AI output never becomes an orphan draft (T-B19). Extra/unknown partIds are dropped;
 * duplicate partIds keep the first occurrence.
 *
 * @returns Sanitized question, or `null` when required parts are missing.
 */
export function sanitizeGeneratedScenario(raw: GeneratedScenario): GeneratedScenario | null {
    if (!raw.questionBody?.trim()) {
        return null;
    }

    const seen = new Set<ScenarioPartId>();
    const subQuestions = raw.subQuestions.filter((sub) => {
        if (seen.has(sub.partId)) return false;
        seen.add(sub.partId);
        return true;
    });

    for (const required of REQUIRED_SCENARIO_PART_IDS) {
        const sub = subQuestions.find((s) => s.partId === required);
        if (!sub || !sub.prompt?.trim() || !sub.modelAnswer?.trim()) {
            return null;
        }
    }

    return {
        title: raw.title?.trim() || 'Untitled scenario question',
        questionBody: raw.questionBody,
        solutionBody: raw.solutionBody ?? '',
        subQuestions,
    };
}
