/**
 * scenario-feedback-schema.ts
 *
 * Zod schema for the per-part check-answer verdict returned by the LLM. Passed to
 * {@link LLMModule.sendStructuredConversation} from `scenario-feedback.ts`.
 */

import { z } from 'zod';

export const scenarioFeedbackResponseSchema = z.object({
    verdict: z.enum(['correct', 'needs_improvement']),
    /** Socratic hints only — empty/omitted when verdict is `correct`. */
    guidance: z.string().optional(),
});

export type ScenarioFeedbackLLMResponse = z.infer<typeof scenarioFeedbackResponseSchema>;

/**
 * Enforces the "no worked solution leak" contract server-side regardless of what the model
 * returned (T-B14): `correct` verdicts never carry `guidance`, and `guidance` text is dropped if
 * it happens to quote the model answer near-verbatim (defense in depth, not the primary control —
 * the primary control is the prompt itself never receiving the model answer for other parts).
 */
export function sanitizeScenarioFeedback(
    raw: ScenarioFeedbackLLMResponse,
    modelAnswer: string
): { verdict: 'correct' | 'needs_improvement'; guidance?: string } {
    if (raw.verdict === 'correct') {
        return { verdict: 'correct' };
    }

    const guidance = raw.guidance?.trim();
    const modelAnswerNormalized = modelAnswer.trim().toLowerCase();
    const leaksModelAnswer =
        !!guidance &&
        modelAnswerNormalized.length > 20 &&
        guidance.toLowerCase().includes(modelAnswerNormalized);

    return {
        verdict: 'needs_improvement',
        guidance: !guidance || leaksModelAnswer
            ? 'Review the scenario details again — what governing equation or principle applies here, and what assumption are you relying on?'
            : guidance,
    };
}
