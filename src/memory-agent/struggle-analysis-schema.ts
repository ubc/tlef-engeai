/**
 * struggle-analysis-schema.ts
 *
 * Zod schema and post-processing for memory-agent structured struggle detection (V2).
 * Labels must match the instructor catalog verbatim; at most one topic per analysis run.
 */

import { z } from 'zod';

/**
 * Zod schema passed to {@link LLMModule.sendStructuredConversation} for memory-agent analysis.
 * Enforces `struggleTopics` as a string array with at most one element.
 */
export const struggleAnalysisResponseSchema = z.object({
    struggleTopics: z.array(z.string()).max(1)
});

/** Parsed shape of {@link struggleAnalysisResponseSchema}. */
export type StruggleAnalysisResponse = z.infer<typeof struggleAnalysisResponseSchema>;

/**
 * Validates LLM output against the instructor catalog after structured parsing.
 *
 * Trims each candidate, keeps only labels present in `allowedLabels` (exact match, case-sensitive),
 * deduplicates, and returns at most one label (V2 product rule).
 *
 * @param rawTopics - Values from `response.parsed.struggleTopics` (may be empty or invalid).
 * @param allowedLabels - Set of `struggleTopic` strings from `getAllInstructorStruggleTopics`.
 * @returns Zero or one catalog label safe to persist on the student's memory-agent entry.
 */
export function filterVerbatimStruggleTopics(
    rawTopics: string[],
    allowedLabels: ReadonlySet<string>
): string[] {
    const seen = new Set<string>();
    const validated: string[] = [];
    for (const raw of rawTopics) {
        const trimmed = raw.trim();
        if (!trimmed || !allowedLabels.has(trimmed) || seen.has(trimmed)) {
            continue;
        }
        seen.add(trimmed);
        validated.push(trimmed);
        if (validated.length >= 1) {
            break;
        }
    }
    return validated;
}
