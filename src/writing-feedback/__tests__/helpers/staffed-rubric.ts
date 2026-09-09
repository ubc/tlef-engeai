/**
 * Test helper — a rubric as it looks after staff have described the assignment
 *
 * `buildDefaultWritingRubric` seeds its description fields empty on purpose: a
 * fresh draft asks the questions rather than answering them, so it is neither
 * savable nor approvable until an instructor fills it in. Tests that need a
 * complete rubric — one the draft schema accepts, or one the engine will
 * generate from — should start here instead, so that the incompleteness of a
 * brand-new draft stays a property the tests can assert rather than an obstacle
 * they work around.
 *
 * @author: @rdschrs
 * @date: 2026-09-09
 * @version: 1.0.0
 * @description: Builds filled-in writing rubrics and SFL profiles for tests.
 */

import { buildDefaultSflContextProfile, buildDefaultWritingRubric } from '../../default-rubric-profile';
import type { WritingRubricDefinition, WritingSflContextProfile } from '../../contracts';

/** The description values an instructor would type into step 1 of the rubric page. */
export const STAFFED_DESCRIPTION = {
    title: 'Assignment writing rubric',
    task: 'Write a short argument for one of the three bridge designs.',
    audience: 'A first-year classmate who has not read the case.',
    purpose: 'Persuade the reader that the chosen design is the safest option.',
    constraints: ['Stay under 1,000 words.'],
    gradingIntent: 'Reward reasoning that connects evidence to the recommendation.'
} as const;

/**
 * buildStaffedSflContextProfile - the starter profile with every required answer supplied
 *
 * @param overrides - Fields to replace after the profile is filled in
 * @returns Profile that {@link requireCompleteSflProfile} accepts
 */
export function buildStaffedSflContextProfile(
    overrides: Partial<WritingSflContextProfile> = {}
): WritingSflContextProfile {
    return {
        ...buildDefaultSflContextProfile(),
        genreLabel: 'A short design proposal',
        genreState: 'staff_confirmed',
        task: STAFFED_DESCRIPTION.task,
        purpose: STAFFED_DESCRIPTION.purpose,
        audience: STAFFED_DESCRIPTION.audience,
        field: 'The collapse of the Quebec Bridge.',
        tenor: 'Personal, but still careful with claims.',
        mode: '1,000 words, submitted as a Word file.',
        productionConditions: 'Take-home, over two weeks.',
        taskRequirements: ['Cite at least three sources.'],
        ...overrides
    };
}

/**
 * buildStaffedWritingRubric - the platform template with step 1 already described
 *
 * @param actorUserId - Internal actor recorded as the template creator
 * @param now - Shared timestamp used for deterministic persistence and tests
 * @returns Draft rubric whose description fields pass the draft schema
 */
export function buildStaffedWritingRubric(
    actorUserId: string = 'platform',
    now: Date = new Date()
): WritingRubricDefinition {
    return {
        ...buildDefaultWritingRubric(actorUserId, now),
        ...STAFFED_DESCRIPTION,
        constraints: [...STAFFED_DESCRIPTION.constraints],
        sflContext: buildStaffedSflContextProfile()
    };
}
