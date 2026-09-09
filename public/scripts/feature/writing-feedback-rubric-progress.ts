/**
 * writing-feedback-rubric-progress.ts
 *
 * Every completeness judgement the rubric page makes, with no DOM in sight.
 *
 * The page tells staff a step is finished. Three places decide what finished
 * means -- collectSflContext blocks saving, approveRubricDraft blocks nothing,
 * and requireCompleteSflProfile blocks feedback -- and only the third one
 * matters to the person waiting for feedback to appear. This module answers to
 * that one, so the page can promise what the engine will honour.
 *
 * DOM-free on purpose: the Jest project runs in Node with no jsdom, so logic
 * that lives here can be tested and logic that lives in the renderer cannot.
 *
 * @author: @rdschrs
 * @date: 2026-08-31
 * @version: 1.0.0
 */

import type {
    SflContextProfile,
    RubricCriterion,
    RubricLevel
} from './writing-feedback-shared.js';

type SflGenreProfileState = SflContextProfile['genreState'];

/** The seven assignment-description values, as the details form holds them. */
export interface DetailsValues {
    title: string;
    task: string;
    audience: string;
    purpose: string;
    constraints: string[];
    learningOutcomes: string[];
    gradingIntent: string;
}

/** How far through one step the user is, and what is still owed. */
export interface StepReadiness {
    done: number;
    total: number;
    complete: boolean;
    /** Staff-facing labels of the unanswered items, in form order. */
    missing: string[];
}

/** The grid's size and whether every box says something. */
export interface GridReadiness {
    criteria: number;
    levels: number;
    totalPoints: number;
    emptyCells: number;
    complete: boolean;
}

/**
 * answered - whether a field holds something a staff member actually wrote
 *
 * Fields once seeded with stub prose needed a second test, comparing the value
 * against the exact text it shipped with. Drafts now seed those fields empty and
 * carry their guidance in the input placeholder, so blankness is the whole test.
 *
 * @param value - Current field value
 * @returns True when the value is not blank
 */
function answered(value: string | undefined): boolean {
    return (value ?? '').trim().length > 0;
}

/**
 * describeDetails - readiness of the seven assignment-description fields
 *
 * Counts exactly what the page has always counted, so the number staff see does
 * not change meaning with this redesign.
 *
 * @param details - Current description values
 * @returns Count, completeness, and the labels of anything unanswered
 */
export function describeDetails(details: DetailsValues): StepReadiness {
    const entries: Array<[string, boolean]> = [
        ['Rubric name', answered(details.title)],
        ['What are students asked to do?', answered(details.task)],
        ['Who are they writing for?', answered(details.audience)],
        ['Why are they writing it?', answered(details.purpose)],
        ['Rules they must follow', details.constraints.length > 0],
        ['What they should learn from it', details.learningOutcomes.length > 0],
        ['What matters most when you mark it?', answered(details.gradingIntent)]
    ];
    return summarize(entries);
}

/**
 * profileEntries - the profile checks, paired with the label staff see
 *
 * Mirrors requireCompleteSflProfile check for check, including the three
 * structural ones it makes after the prose: at least one stage with a label and
 * a purpose, at least one task requirement, and at least one learning outcome.
 * Stopping at the nine text fields would let the page call a profile finished
 * that generation still rejects, which is the trap this module exists to close.
 *
 * `task`, `purpose`, `audience` and `learningOutcomes` are deliberately read
 * from the description rather than the profile form, because collectSflContext
 * copies them from there on save -- so those are the values the engine will see.
 */
function profileEntries(
    profile: SflContextProfile | undefined,
    details: DetailsValues
): Array<[string, boolean]> {
    const stages = profile?.stages ?? [];
    return [
        ['What kind of writing is it?', answered(profile?.genreLabel)],
        ['What are students asked to do?', answered(details.task)],
        ['Why are they writing it?', answered(details.purpose)],
        ['Who are they writing for?', answered(details.audience)],
        ['What is the writing about?', answered(profile?.field)],
        ['How should the student sound?', answered(profile?.tenor)],
        ['How long, and in what form?', answered(profile?.mode)],
        ['Who marks it?', answered(profile?.actualEvaluator)],
        ['What were the writing conditions?', answered(profile?.productionConditions)],
        [
            'What sections should it have, in order?',
            stages.length > 0 && stages.every((stage) => answered(stage.id) && answered(stage.label) && answered(stage.purpose))
        ],
        ['What must they include?', (profile?.taskRequirements ?? []).length > 0],
        ['What they should learn from it', details.learningOutcomes.length > 0]
    ];
}

/**
 * summarize - turns a list of labelled checks into the readiness the page shows
 *
 * @param entries - Staff-facing label paired with whether it is answered
 * @returns Count, completeness, and the labels of anything unanswered
 */
function summarize(entries: Array<[string, boolean]>): StepReadiness {
    const missing = entries.filter(([, ok]) => !ok).map(([label]) => label);
    return {
        done: entries.length - missing.length,
        total: entries.length,
        complete: missing.length === 0,
        missing
    };
}

/**
 * describeProfile - readiness of the "Describe the writing" sub-card
 *
 * Answers to requireCompleteSflProfile, not to the looser non-empty test the
 * page used before, which reported a seeded placeholder profile as ready.
 *
 * @param profile - Current profile, or undefined on a brand-new draft
 * @param details - Description values the profile borrows task/purpose/audience/outcomes from
 * @returns Count, completeness, and the labels of anything unanswered
 */
export function describeProfile(
    profile: SflContextProfile | undefined,
    details: DetailsValues
): StepReadiness {
    return summarize(profileEntries(profile, details));
}

/**
 * deriveGenreState - replaces the "Profile status" dropdown staff were asked to set
 *
 * The stored field still exists and is still sent; it is simply no longer a
 * question. Deriving it is what lets the control go without leaving a profile
 * permanently stuck on `needs_staff_input`, which would block feedback forever.
 *
 * Because the engine rejects `needs_staff_input` outright, this must never
 * return `staff_confirmed` for anything requireCompleteSflProfile would refuse,
 * and must never return `needs_staff_input` for anything it would accept.
 *
 * @param profile - Current profile values
 * @param details - Description values supplying task, purpose, audience and outcomes
 * @returns `staff_confirmed` once the profile would satisfy the engine, else `needs_staff_input`
 */
export function deriveGenreState(
    profile: SflContextProfile,
    details: DetailsValues
): SflGenreProfileState {
    return describeProfile(profile, details).complete ? 'staff_confirmed' : 'needs_staff_input';
}

/**
 * describeGrid - size, weight, and whether every box in the grid says something
 *
 * A cell counts as filled only when its descriptor has text. Points are read
 * from the criterion when present, which is what a weighted rubric means.
 *
 * @param criteria - Working criteria, in row order
 * @param levels - Working levels, in column order
 * @returns Counts plus the number of cells still empty
 */
export function describeGrid(criteria: RubricCriterion[], levels: RubricLevel[]): GridReadiness {
    let emptyCells = 0;
    for (const criterion of criteria) {
        for (const level of levels) {
            if (!answered(criterion.cells?.[level.id]?.descriptor)) emptyCells += 1;
        }
    }
    const totalPoints = criteria.reduce((sum, criterion) => sum + (criterion.points ?? 0), 0);
    return {
        criteria: criteria.length,
        levels: levels.length,
        totalPoints: Number(totalPoints.toFixed(2)),
        emptyCells,
        complete: emptyCells === 0 && criteria.length > 0 && levels.length > 0
    };
}
