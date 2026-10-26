/**
 * Assignment context — the instructor material the general analysis reads
 *
 * Joins an assignment's instructions, its Canvas description, and every file or paste the
 * instructor added into one labelled block for the feedback prompt, using the same listing and
 * labels auto-fill uses. Material beyond the character cap is cut at a source boundary where
 * possible and flagged, so an oversized handout never fails generation.
 *
 * Instructor material only; no student text is involved.
 *
 * @author: @rdschrs
 * @date: 2026-10-26
 * @version: 1.0.0
 * @description: Builds the capped, labelled assignment-material block for general feedback.
 */

import type { WritingAssignment, WritingSourceMaterial } from '../contracts';
import { listAutofillSources, MAX_AUTOFILL_SOURCE_CHARS } from './autofill-sources';

/** Staff-only pipeline flags this module can raise. */
export const ASSIGNMENT_CONTEXT_FLAGS = {
    empty: 'no_assignment_material',
    truncated: 'assignment_material_truncated'
} as const;

/** The assignment material as sent to the model. */
export interface AssignmentContext {
    block: string; // labelled sources, joined; empty when there is nothing to read
    sourceCount: number; // sources included, whole or in part
    empty: boolean; // no instructions, description, or material at all
    truncated: boolean; // at least one source was cut or left out at the cap
}

/**
 * buildAssignmentContext - every instructor source for one assignment, capped.
 *
 * Sources keep the auto-fill order: instructions, then the Canvas description when it differs,
 * then files and pastes oldest first. Each is labelled so the model can tell a handout from the
 * instructions. Once the cap is reached the current source is cut and the rest are left out.
 *
 * @param assignment - Assignment whose instructions and Canvas description are read
 * @param materials - The assignment's stored files and pastes, oldest first
 * @param maxChars - Character cap for the joined block; defaults to the auto-fill cap
 * @returns The block, how many sources it holds, and whether anything was empty or cut
 */
export function buildAssignmentContext(
    assignment: Pick<WritingAssignment, 'instructions' | 'canvasAssignmentId' | 'canvasDetails'>,
    materials: ReadonlyArray<WritingSourceMaterial>,
    maxChars: number = MAX_AUTOFILL_SOURCE_CHARS
): AssignmentContext {
    const sources = listAutofillSources(assignment, materials);
    if (!sources.length) return { block: '', sourceCount: 0, empty: true, truncated: false };

    // Step 1: add whole sources while they fit; cut the first one that does not, then stop.
    const parts: string[] = [];
    let used = 0;
    let truncated = false;
    for (const [index, source] of sources.entries()) {
        const separator = parts.length ? '\n\n' : '';
        const heading = `${separator}=== Source ${index + 1} of ${sources.length}: ${source.label.replace(/\s+/g, ' ')} ===\n`;
        const room = maxChars - used - heading.length;
        if (room <= 0) {
            truncated = true;
            break;
        }
        const text = source.text.length > room ? source.text.slice(0, room) : source.text;
        if (text.length < source.text.length) truncated = true;
        parts.push(`${heading}${text}`);
        used += heading.length + text.length;
        if (truncated) break;
    }
    return { block: parts.join(''), sourceCount: parts.length, empty: false, truncated };
}
