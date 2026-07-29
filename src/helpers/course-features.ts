/**
 * Course feature capabilities — read and update opt-in course functionality.
 *
 * Centralizes the backward-compatible policy that an absent capability is
 * disabled and preserves first-enable provenance when a capability is toggled.
 *
 * @author: @rdschrs
 * @date: 2026-07-12
 * @version: 1.1.0
 * @description: Capability policy helpers for optional course features.
 */

import type { activeCourse, CourseFeatureCapability, CourseFeatures } from '../types/shared';

/** Identifier accepted by the generic course-capability authorization gate. */
export type CourseFeatureId = 'writingFeedback' | 'memoryAgent' | 'guidedPathway';

/**
 * isCourseFeatureEnabled — resolves whether a course explicitly opted into a capability.
 *
 * Missing courses, feature maps, or feature entries intentionally resolve to
 * `false`, keeping legacy course records disabled by default.
 *
 * @param course - Course record or feature-bearing projection to inspect
 * @param feature - Supported capability identifier
 * @returns `true` only when the capability has an explicit `enabled: true`
 */
export function isCourseFeatureEnabled(
    course: Pick<activeCourse, 'features'> | null | undefined,
    feature: CourseFeatureId
): boolean {
    // Require an explicit true value so absent legacy configuration never enables a feature.
    return course?.features?.[feature]?.enabled === true;
}

/**
 * updateCourseCapability — builds the next immutable capability map for one feature.
 *
 * The first enabling actor and timestamp are retained across disable/re-enable
 * cycles so the course record keeps stable activation provenance.
 *
 * @param current - Existing feature map; may be absent on legacy courses
 * @param feature - Capability key to update
 * @param enabled - Desired capability state
 * @param actorUserId - Internal staff user id responsible for the first enable
 * @param now - Injectable activation time used when provenance is first created
 * @returns A new feature map; input objects are not mutated
 */
export function updateCourseCapability(
    current: CourseFeatures | undefined,
    feature: CourseFeatureId,
    enabled: boolean,
    actorUserId: string,
    now: Date = new Date()
): CourseFeatures {
    const previous = current?.[feature] as CourseFeatureCapability | undefined;

    // Preserve unrelated capabilities while changing only the targeted feature.
    return {
        ...current,
        [feature]: enabled
            ? {
                enabled: true,
                enabledAt: previous?.enabledAt ?? now,
                enabledBy: previous?.enabledBy ?? actorUserId
            }
            : {
                ...previous,
                enabled: false
            }
    };
}

/**
 * updateWritingFeedbackCapability — thin wrapper for Writing Feedback callers.
 *
 * @param current - Existing feature map; may be absent on legacy courses
 * @param enabled - Desired Writing Feedback state
 * @param actorUserId - Internal staff user id responsible for the first enable
 * @param now - Injectable activation time used when provenance is first created
 * @returns A new feature map; input objects are not mutated
 */
export function updateWritingFeedbackCapability(
    current: CourseFeatures | undefined,
    enabled: boolean,
    actorUserId: string,
    now: Date = new Date()
): CourseFeatures {
    return updateCourseCapability(current, 'writingFeedback', enabled, actorUserId, now);
}

/** Human-readable labels for Feature unavailable notices and API messages. */
export const COURSE_FEATURE_LABELS: Record<CourseFeatureId, string> = {
    writingFeedback: 'Writing Feedback',
    memoryAgent: 'Memory Agent',
    guidedPathway: 'Guided Pathway'
};
