/**
 * struggle-generation-schema.ts
 *
 * Zod schema and post-processing for instructor struggle-topic generation on material upload.
 * Labels are new catalog entries (not verbatim-matched against a pre-existing catalog).
 */

import { z } from 'zod';

/** Max labels returned from one generation run (product rule). */
export const MAX_STRUGGLE_TOPICS = 5;

/** Max characters per instructor struggle-topic label. */
export const MAX_STRUGGLE_TOPIC_LABEL_LENGTH = 300;

/**
 * Zod schema passed to {@link LLMModule.sendStructuredConversation} for struggle-topic generation.
 * Enforces `struggleTopics` as a string array with at most five elements.
 */
export const struggleGenerationResponseSchema = z.object({
    struggleTopics: z.array(z.string()).max(MAX_STRUGGLE_TOPICS),
});

/** Parsed shape of {@link struggleGenerationResponseSchema}. */
export type StruggleGenerationResponse = z.infer<typeof struggleGenerationResponseSchema>;

/**
 * Validates LLM output after structured parsing via {@link LLMModule.sendStructuredConversation}.
 *
 * Trims each candidate, drops empty or over-length labels, removes labels present in
 * `excludedSet` (exact match, case-sensitive), deduplicates within the batch, and returns
 * at most {@link MAX_STRUGGLE_TOPICS} labels.
 *
 * @param rawTopics - Values from `response.parsed.struggleTopics` (may be empty or invalid).
 * @param excludedSet - All prior + current-section labels from FIFO XML (exact match).
 * @returns Labels safe to append to the instructor catalog.
 */
export function filterGeneratedStruggleTopics(
    rawTopics: string[],
    excludedSet: ReadonlySet<string>
): string[] {
    const seen = new Set<string>();
    const validated: string[] = [];

    for (const raw of rawTopics) {
        const trimmed = raw.trim();
        if (
            !trimmed ||
            trimmed.length > MAX_STRUGGLE_TOPIC_LABEL_LENGTH ||
            excludedSet.has(trimmed) ||
            seen.has(trimmed)
        ) {
            continue;
        }
        seen.add(trimmed);
        validated.push(trimmed);
        if (validated.length >= MAX_STRUGGLE_TOPICS) {
            break;
        }
    }

    return validated;
}
