/**
 * unstruggle-yes-followup-schema.ts
 *
 * Zod schema for structured LLM output when a student confirms mastery via unstruggle Yes.
 */

import { z } from 'zod';

export const unstruggleYesFollowupResponseSchema = z.object({
    learningObjectiveTexts: z.array(z.string()).max(3),
});

export type UnstruggleYesFollowupResponse = z.infer<typeof unstruggleYesFollowupResponseSchema>;

/**
 * Keep only objective texts present in the course catalog (exact match after trim).
 */
export function filterVerbatimObjectiveTexts(
    rawTexts: string[],
    allowedTexts: ReadonlySet<string>
): string[] {
    const seen = new Set<string>();
    const validated: string[] = [];
    for (const raw of rawTexts) {
        const trimmed = raw.trim();
        if (!trimmed || !allowedTexts.has(trimmed) || seen.has(trimmed)) {
            continue;
        }
        seen.add(trimmed);
        validated.push(trimmed);
        if (validated.length >= 3) break;
    }
    return validated;
}
