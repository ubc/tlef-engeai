/**
 * Feedback lenses — the mapping from a lens to the rubric it is governed by
 *
 * A lab-report assignment carries two independent rubrics, one per lens. This
 * module owns the single mapping between a lens and the assignment fields that
 * hold its approved rubric, editable draft, and approval history, so no caller
 * has to hard-code a field name.
 *
 * @author: @rdschrs
 * @date: 2026-08-20
 * @version: 1.0.0
 * @description: Resolves which rubric on an assignment a feedback lens uses.
 */

import type { WritingAssignment, WritingFeedbackLens, WritingRubricDefinition } from './contracts';

/** Every supported lens, in the order generation and review present them. */
export const WRITING_FEEDBACK_LENSES: ReadonlyArray<WritingFeedbackLens> = ['linguistic', 'technical'];

/** Assignment field names holding one lens's rubric state. */
export interface RubricFieldPaths {
    approved: string; // field holding the approved rubric
    draft: string; // field holding the editable draft
    history: string; // field holding previously approved versions
}

const FIELD_PATHS: Record<WritingFeedbackLens, RubricFieldPaths> = {
    linguistic: { approved: 'rubric', draft: 'rubricDraft', history: 'rubricHistory' },
    technical: {
        approved: 'technicalRubric',
        draft: 'technicalRubricDraft',
        history: 'technicalRubricHistory'
    }
};

/**
 * rubricFieldPaths - names the assignment fields owned by one lens.
 *
 * @param lens - Lens whose rubric fields are needed
 * @returns Field names for the approved rubric, draft, and history
 */
export function rubricFieldPaths(lens: WritingFeedbackLens): RubricFieldPaths {
    return { ...FIELD_PATHS[lens] };
}

/** One lens's current rubric state read off an assignment. */
export interface SelectedRubric {
    approved?: WritingRubricDefinition; // present only once approved
    draft?: WritingRubricDefinition; // editable draft, or an unapproved initial template
    history: WritingRubricDefinition[]; // previously approved versions, oldest first
}

/**
 * rubricForVersion - one lens's approved rubric at a particular version
 *
 * Feedback records the rubric version it was generated with. Once a newer version is
 * approved, feedback that has already been released still has to be read against its own
 * version, which by then lives in that lens's history.
 *
 * @param assignment - Assignment holding one or two rubrics
 * @param lens - Lens whose rubric is wanted
 * @param version - Version stamped on the feedback; runs from before versions were recorded
 *   count as version 1, the same rule the staleness check applies
 * @returns The approved rubric at that version, or undefined when none is on record
 */
export function rubricForVersion(
    assignment: WritingAssignment,
    lens: WritingFeedbackLens,
    version: number | undefined
): WritingRubricDefinition | undefined {
    const { approved, history } = selectRubric(assignment, lens);
    const wanted = version ?? 1;
    return [approved, ...history].find((rubric) => rubric?.version === wanted);
}

/**
 * selectRubric - reads one lens's rubric state without exposing field names.
 *
 * The linguistic lens keeps its legacy shape, where a never-approved assignment
 * stores its initial template in `rubric` with draft status; that value is
 * reported as the draft so editors treat both lenses identically.
 *
 * @param assignment - Assignment holding one or two rubrics
 * @param lens - Lens whose rubric state is requested
 * @returns Approved rubric, editable draft, and approval history for that lens
 */
export function selectRubric(assignment: WritingAssignment, lens: WritingFeedbackLens): SelectedRubric {
    if (lens === 'linguistic') {
        return {
            approved: assignment.rubric.status === 'approved' ? assignment.rubric : undefined,
            draft: assignment.rubricDraft ?? (assignment.rubric.status === 'draft' ? assignment.rubric : undefined),
            history: assignment.rubricHistory ?? []
        };
    }
    return {
        approved: assignment.technicalRubric?.status === 'approved' ? assignment.technicalRubric : undefined,
        draft: assignment.technicalRubricDraft
            ?? (assignment.technicalRubric?.status === 'draft' ? assignment.technicalRubric : undefined),
        history: assignment.technicalRubricHistory ?? []
    };
}

/**
 * lensesForAssignment - lists the lenses an assignment must generate.
 *
 * @param assignment - Assignment being generated, approved, or released
 * @returns Linguistic alone, or both lenses for a lab report
 */
export function lensesForAssignment(assignment: WritingAssignment): WritingFeedbackLens[] {
    return assignment.isLabReport ? ['linguistic', 'technical'] : ['linguistic'];
}

/**
 * parseLens - validates an untrusted lens value from a request.
 *
 * @param value - Query or body value naming a lens
 * @returns The named lens, defaulting to linguistic when absent
 * @throws Error when the value is present but not a supported lens
 */
export function parseLens(value: unknown): WritingFeedbackLens {
    if (value === undefined || value === null || value === '') return 'linguistic';
    if (value === 'linguistic' || value === 'technical') return value;
    throw new Error('Unknown feedback lens');
}
