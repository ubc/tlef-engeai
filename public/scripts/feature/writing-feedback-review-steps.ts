/**
 * Review steps — DOM-free rules for the two-step review (D-124, D-125)
 *
 * @author: @rdschrs
 * @date: 2026-09-13
 * @version: 1.0.0
 * @description: Step bar state and the Next decision (advance, redraft, or confirm first).
 */

type Lens = 'linguistic' | 'technical';

/** The two review steps. */
export type ReviewStep = 'annotations' | 'summary';

/** What the step bar shows and enables. */
export interface StepBarState {
    title: string;
    position: string;
    backDisabled: boolean;
    nextDisabled: boolean;
}

/** What pressing Next should do. */
export type NextAction = { kind: 'advance' } | { kind: 'redraft'; lenses: Lens[] } | { kind: 'confirm'; lenses: Lens[] };

/**
 * stepBarState - labels and enabled directions for a step.
 *
 * @param step - Current step
 * @returns Title, position text, and which button is disabled
 */
export function stepBarState(step: ReviewStep): StepBarState {
    return step === 'annotations'
        ? { title: 'Review annotations', position: 'Step 1 of 2', backDisabled: true, nextDisabled: false }
        : { title: 'Review feedback and grades', position: 'Step 2 of 2', backDisabled: false, nextDisabled: true };
}

/**
 * changedLenses - lenses whose annotations differ from the ones their summary reflects.
 *
 * @param input - Lenses on screen, fingerprints of the working annotations, and summary sources
 * @returns Changed lenses in the order given
 */
export function changedLenses(input: {
    lenses: Lens[];
    currentFingerprints: Partial<Record<Lens, string>>;
    sourceFingerprints: Partial<Record<Lens, string>>;
}): Lens[] {
    return input.lenses.filter((lens) =>
        input.sourceFingerprints[lens] !== undefined
        && input.currentFingerprints[lens] !== input.sourceFingerprints[lens]);
}

/**
 * decideNextAction - what Next does on the annotations step.
 *
 * @param input - Submission status, changed lenses, lenses whose summary staff edited
 * @returns Advance without a request, redraft, or confirm before redrafting
 */
export function decideNextAction(input: { status: string; changedLenses: Lens[]; editedLenses: Lens[] }): NextAction {
    if (input.status !== 'draft_ready' || !input.changedLenses.length) return { kind: 'advance' };
    const lenses = [...input.changedLenses];
    return lenses.some((lens) => input.editedLenses.includes(lens))
        ? { kind: 'confirm', lenses }
        : { kind: 'redraft', lenses };
}
