/**
 * Criterion assessment source — which rubric rows the model is asked about
 *
 * A rubric row rests on evidence the pipeline can see, or it does not. Extraction
 * yields verified text alone, so a row about fonts, margins, spacing, or the
 * submitted file itself has nothing to stand on. Marking such a row `'staff'`
 * keeps it out of generation entirely rather than requiring the model to answer
 * and then narrate the gap.
 *
 * Every consumer partitions criteria through this module so the default -- absent
 * means model-assessed -- is stated once.
 *
 * @author: @rdschrs
 * @date: 2026-09-15
 * @version: 1.0.0
 * @description: Partitions rubric criteria by who authors their feedback.
 */

import type { StaffSummaryEdit, WritingRubricCriterion, WritingRubricDefinition } from './contracts';

/**
 * isStaffAssessed - whether staff, rather than the model, write this criterion.
 *
 * @param criterion - Criterion from any rubric version
 * @returns True only for an explicit `'staff'` marking
 */
export function isStaffAssessed(criterion: WritingRubricCriterion): boolean {
    return criterion.assessedBy === 'staff';
}

/**
 * Label words naming how a document looks rather than what it says. Word boundaries keep
 * "information", "formative", and "formula" out. "Presentation" is deliberately absent: in
 * a criterion label it usually means how ideas or results are presented, which the model
 * can judge. Mirrored in public/scripts/feature/writing-feedback-shared.ts; a parity test
 * pins the two.
 */
export const FORMATTING_CRITERION_PATTERN = /\b(?:format(?:s|ted|ting)?|layouts?|fonts?|margins?|spacing|typograph(?:y|ic|ical))\b/i;

/**
 * looksLikeFormattingCriterion - whether a criterion's label names document formatting.
 *
 * Only the label is read. Descriptions mention format in passing on criteria that are
 * mostly about content, and defaulting those to staff would withhold what the model can do.
 *
 * @param label - Criterion label as staff or Canvas wrote it
 * @returns True when the label names formatting the model cannot see
 */
export function looksLikeFormattingCriterion(label: string): boolean {
    return FORMATTING_CRITERION_PATTERN.test(label);
}

/**
 * defaultFormattingCriteriaToStaff - marks formatting criteria staff-assessed on first entry.
 *
 * Runs only when criteria enter a rubric, never on load: an absent `assessedBy` also means
 * staff chose the model on purpose, so re-running it would undo that choice. A rubric whose
 * every label matches is returned unchanged, because approval requires one model-assessed row.
 *
 * @param criteria - Criteria about to seed a draft
 * @returns The same criteria, formatting rows marked `'staff'`
 */
export function defaultFormattingCriteriaToStaff(criteria: WritingRubricCriterion[]): WritingRubricCriterion[] {
    const matches = criteria.map((criterion) => looksLikeFormattingCriterion(criterion.label));
    if (!matches.some(Boolean) || matches.every(Boolean)) return criteria;
    return criteria.map((criterion, index) => (matches[index] ? { ...criterion, assessedBy: 'staff' as const } : criterion));
}

/**
 * modelAssessedCriteria - the criteria generation is allowed to see.
 *
 * Both structured-output schemas and every system prompt derive their criterion
 * list from this, so a staff-assessed row is never named to the model.
 *
 * @param rubric - Rubric governing a generation or redraft run
 * @returns Criteria in rubric order, staff-assessed rows removed
 */
export function modelAssessedCriteria(rubric: WritingRubricDefinition): WritingRubricCriterion[] {
    return rubric.criteria.filter((criterion) => !isStaffAssessed(criterion));
}

/**
 * staffAssessedCriteria - the criteria staff write themselves in review.
 *
 * @param rubric - Rubric governing a run
 * @returns Criteria in rubric order, model-assessed rows removed
 */
export function staffAssessedCriteria(rubric: WritingRubricDefinition): WritingRubricCriterion[] {
    return rubric.criteria.filter(isStaffAssessed);
}

/**
 * assertStaffCriteriaWritten - approval gate for criteria the model never drafts.
 *
 * A model-assessed criterion left blank cannot reach approval: generation fails, or the
 * schema refuses the result. A staff-assessed one has no such backstop -- unwritten, it
 * is simply missing from the student's document, and nothing says so. This is that
 * backstop.
 *
 * @param rubric - Approved rubric for the lens being approved, when the lens has one
 * @param edit - Summary edit bound to that lens's latest run, when staff saved one
 * @throws Error naming every staff-assessed criterion still unwritten
 */
export function assertStaffCriteriaWritten(
    rubric: WritingRubricDefinition | undefined,
    edit: StaffSummaryEdit | undefined
): void {
    if (!rubric) return;
    const written = new Map(
        (edit?.criterionExplanations ?? []).map((item) => [item.criterion, item.explanation.trim()])
    );
    const missing = staffAssessedCriteria(rubric).filter((criterion) => !written.get(criterion.id));
    if (!missing.length) return;

    const named = missing.map((criterion) => `"${criterion.label}"`).join(', ');
    throw new Error(
        `Write feedback for every criterion the teaching team assesses before approval: ${named} ${missing.length === 1 ? 'is' : 'are'} still blank.`
    );
}
