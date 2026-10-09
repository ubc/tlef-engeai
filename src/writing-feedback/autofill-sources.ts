/**
 * Auto-fill sources — which instructor material "Fill these in for me" reads
 *
 * An assignment's details can be spread across its own instructions, the Canvas description,
 * and files or pastes the instructor added. This module lists what one assignment has, applies
 * the instructor's selection, refuses a selection too long for one model call, and joins the
 * chosen sources into one labelled block for the prompt.
 *
 * Instructor material only; no student text is involved.
 *
 * @author: EngE-AI Team
 * @date: 2026-10-08
 * @version: 1.0.0
 * @description: Lists, selects, and labels the material auto-fill reads for one assignment.
 */

import type { WritingAssignment, WritingSourceMaterial } from './contracts';

/** Most characters of source material sent to the model in one auto-fill or extraction call. */
export const MAX_AUTOFILL_SOURCE_CHARS = 60000;

/** Source ids for the two sources that are not stored materials. Material ids are UUIDs. */
export const INSTRUCTIONS_SOURCE_ID = 'instructions';
export const CANVAS_DESCRIPTION_SOURCE_ID = 'canvas_description';

/** Refusal messages staff can read and act on. Each is also a safe error prefix for routes. */
export const AUTOFILL_SOURCE_ERRORS = {
    none: 'Add the assignment instructions, or upload or paste the assignment material, first',
    noneSelected: 'Select at least one source to fill from',
    unknown: 'One of the selected sources no longer exists. Reload the page and try again.',
    tooLong: `The selected sources are longer than ${MAX_AUTOFILL_SOURCE_CHARS.toLocaleString('en-US')} characters together. Untick one or more before filling.`
} as const;

/** One piece of material auto-fill can read. */
export interface AutofillSource {
    id: string;
    kind: 'instructions' | 'canvas_description' | 'file' | 'paste';
    label: string; // staff-facing name, also used to label the source in the prompt
    text: string;
    characterCount: number;
    hasTables: boolean;
}

function sameText(left: string, right: string): boolean {
    return left.replace(/\s+/g, ' ').trim() === right.replace(/\s+/g, ' ').trim();
}

/**
 * listAutofillSources - every source one assignment has, in the order staff see them.
 *
 * The Canvas description is offered only when it differs from the instructions: Canvas import
 * copies it into the instructions, so offering both would send the same text twice. It differs
 * once the description is changed in Canvas and the assignment re-imported, because re-import
 * refreshes the stored description but never the instructions.
 *
 * @param assignment - Assignment whose instructions and Canvas description are read
 * @param materials - The assignment's stored files and pastes, oldest first
 * @returns Sources with text, instructions first, then the Canvas description, then materials
 */
export function listAutofillSources(
    assignment: Pick<WritingAssignment, 'instructions' | 'canvasAssignmentId' | 'canvasDetails'>,
    materials: ReadonlyArray<WritingSourceMaterial>
): AutofillSource[] {
    const sources: AutofillSource[] = [];
    const instructions = assignment.instructions?.trim() ?? '';
    if (instructions) {
        sources.push({
            id: INSTRUCTIONS_SOURCE_ID,
            kind: 'instructions',
            label: assignment.canvasAssignmentId ? 'Canvas assignment description (as imported)' : 'Assignment instructions',
            text: instructions,
            characterCount: instructions.length,
            hasTables: false
        });
    }

    const description = assignment.canvasDetails?.descriptionText?.trim() ?? '';
    if (description && !sameText(description, instructions)) {
        sources.push({
            id: CANVAS_DESCRIPTION_SOURCE_ID,
            kind: 'canvas_description',
            label: instructions ? 'Canvas assignment description (latest)' : 'Canvas assignment description',
            text: description,
            characterCount: description.length,
            hasTables: false
        });
    }

    let pasteNumber = 0;
    materials.forEach((material) => {
        if (material.kind === 'paste') pasteNumber += 1;
        sources.push({
            id: material.id,
            kind: material.kind,
            label: material.kind === 'file' ? material.fileName || 'Uploaded file' : `Pasted text ${pasteNumber}`,
            text: material.text,
            characterCount: material.characterCount,
            hasTables: material.hasTables
        });
    });
    return sources;
}

/**
 * selectAutofillSources - the sources one fill reads, refused when unusable.
 *
 * With no selection given, every source is read, which is what a fill on first opening the
 * page and a client that predates the selection both mean.
 *
 * @param available - Every source the assignment has
 * @param requestedIds - Ids the instructor ticked, or undefined for all of them
 * @returns The chosen sources, in the order of `available`
 * @throws Error with an {@link AUTOFILL_SOURCE_ERRORS} message when there is nothing to read,
 *         nothing was ticked, a ticked source is gone, or the selection is too long
 */
export function selectAutofillSources(
    available: ReadonlyArray<AutofillSource>,
    requestedIds?: ReadonlyArray<string>
): AutofillSource[] {
    if (available.length === 0) throw new Error(AUTOFILL_SOURCE_ERRORS.none);
    if (requestedIds && requestedIds.length === 0) throw new Error(AUTOFILL_SOURCE_ERRORS.noneSelected);
    const wanted = requestedIds ? new Set(requestedIds) : undefined;
    if (wanted && [...wanted].some((id) => !available.some((source) => source.id === id))) {
        throw new Error(AUTOFILL_SOURCE_ERRORS.unknown);
    }
    const selected = wanted ? available.filter((source) => wanted.has(source.id)) : [...available];
    const total = selected.reduce((sum, source) => sum + source.characterCount, 0);
    if (total > MAX_AUTOFILL_SOURCE_CHARS) throw new Error(AUTOFILL_SOURCE_ERRORS.tooLong);
    return selected;
}

/**
 * composeAutofillMaterial - the chosen sources as one block, each under its own heading.
 *
 * A single source is sent bare, exactly as auto-fill sent the instructions before sources
 * existed. Several are numbered and labelled so the model can tell them apart.
 *
 * @param selected - Sources returned by {@link selectAutofillSources}
 * @returns Text for the prompt's assignment-material section
 */
export function composeAutofillMaterial(selected: ReadonlyArray<AutofillSource>): string {
    if (selected.length === 1) return selected[0]!.text;
    return selected
        .map((source, index) => `=== Source ${index + 1} of ${selected.length}: ${source.label.replace(/\s+/g, ' ')} ===\n${source.text}`)
        .join('\n\n');
}
