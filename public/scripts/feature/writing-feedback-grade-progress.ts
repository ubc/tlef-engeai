/**
 * Grade progress — DOM-free rules for per-criterion grading in the staff review
 *
 * Grades are entered on each criterion card of the Summary step and checked on the Review and
 * release step. These rules decide what counts as graded, what is left, and what stops approval.
 *
 * @author: Kathleen Tom
 * @date: 2026-09-15
 * @version: 1.0.0
 * @description: Points parsing, grading progress, and the approval blocker sentence.
 */

/** One gradable rubric criterion as the progress rules see it. */
export interface GradeCriterion {
    id: string;
    label: string;
    max: number; // criterion weight; entered points may not exceed it
}

/** How far grading has got across one rubric. */
export interface GradeProgress {
    total: number;
    graded: GradeCriterion[];
    missing: GradeCriterion[];
    invalid: GradeCriterion[];
    points: number; // sum of valid points, rounded to two decimals
    maxPoints: number;
    complete: boolean; // every criterion has valid points
}

function roundPoints(value: number): number {
    return Math.round(value * 100) / 100;
}

/**
 * readPoints - interprets what staff typed for one criterion.
 *
 * @param raw - Input text
 * @param max - Criterion maximum
 * @returns The points, `undefined` when blank, or `null` when not a number from 0 to the maximum
 */
export function readPoints(raw: string, max: number): number | null | undefined {
    const text = raw.trim();
    if (text === '') return undefined;
    const points = Number(text);
    return Number.isFinite(points) && points >= 0 && points <= max ? points : null;
}

/**
 * gradeProgress - sorts a rubric's criteria into graded, missing and invalid.
 *
 * @param criteria - Criteria in rubric order
 * @param raw - Input text by criterion id; absent ids count as blank
 * @returns Progress, with lists kept in rubric order
 */
export function gradeProgress(criteria: GradeCriterion[], raw: Readonly<Record<string, string>>): GradeProgress {
    const graded: GradeCriterion[] = [];
    const missing: GradeCriterion[] = [];
    const invalid: GradeCriterion[] = [];
    let points = 0;
    for (const criterion of criteria) {
        const value = readPoints(raw[criterion.id] ?? '', criterion.max);
        if (value === undefined) missing.push(criterion);
        else if (value === null) invalid.push(criterion);
        else {
            graded.push(criterion);
            points += value;
        }
    }
    return {
        total: criteria.length,
        graded,
        missing,
        invalid,
        points: roundPoints(points),
        maxPoints: roundPoints(criteria.reduce((sum, criterion) => sum + criterion.max, 0)),
        complete: criteria.length > 0 && graded.length === criteria.length
    };
}

function listLabels(criteria: GradeCriterion[]): string {
    const labels = criteria.map((criterion) => criterion.label);
    if (labels.length <= 1) return labels.join('');
    return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

/**
 * describeApprovalBlocker - why Approve is unavailable, in words staff can act on.
 *
 * Criteria are named while there are few enough to read in one line; past three the
 * sentence gives the count instead.
 *
 * @param progress - Current grading progress
 * @returns The sentence, or `undefined` when grading does not stand in the way of approval
 */
export function describeApprovalBlocker(progress: GradeProgress): string | undefined {
    if (progress.invalid.length) {
        return `Fix the points for ${listLabels(progress.invalid)} in Step 2 before approving.`;
    }
    if (!progress.missing.length) return undefined;
    return progress.missing.length <= 3
        ? `Grade ${listLabels(progress.missing)} in Step 2 to approve.`
        : `Grade the ${progress.missing.length} remaining criteria in Step 2 to approve.`;
}
