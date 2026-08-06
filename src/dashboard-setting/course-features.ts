/**
 * Course feature capabilities — read, update, and normalize opt-in course functionality.
 *
 * Defaults live in `course-feature-defaults.ts`. Absent capability keys resolve to
 * disabled at read time; create/setup always persist a full map via
 * `normalizeCourseFeaturesInput`.
 *
 * @author: @gatahcha
 * @date: 2026-07-12
 * @version: 1.3.0
 * @description: Capability policy helpers for optional course features.
 */

import type { activeCourse, CourseFeatureCapability, CourseFeatures } from '../types/shared';
import {
    COURSE_FEATURE_DEFINITIONS,
    type CourseFeatureId,
} from './course-feature-defaults';

export type { CourseFeatureId };
export { COURSE_FEATURE_DEFINITIONS } from './course-feature-defaults';

/** Human-readable labels for Feature unavailable notices and API messages. */
export const COURSE_FEATURE_LABELS: Record<CourseFeatureId, string> = Object.fromEntries(
    COURSE_FEATURE_DEFINITIONS.map((def) => [def.id, def.label])
) as Record<CourseFeatureId, string>;

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
                  enabledBy: previous?.enabledBy ?? actorUserId,
              }
            : {
                  ...previous,
                  enabled: false,
              },
    };
}

/**
 * buildNewCourseFeatures - full capability map for a brand-new course (all off by default).
 *
 * Every registry key is present. `enabled` follows `defaultEnabledForNewCourse`
 * (currently false for all Extra Features).
 *
 * @returns Complete {@link CourseFeatures} map
 */
export function buildNewCourseFeatures(): CourseFeatures {
    const features = {} as CourseFeatures;
    for (const def of COURSE_FEATURE_DEFINITIONS) {
        features[def.id] = { enabled: def.defaultEnabledForNewCourse };
    }
    return features;
}

/**
 * normalizeCourseFeaturesInput - merge create/setup body onto new-course defaults.
 *
 * Only explicit `enabled: true` in the input turns a capability on. Enabling sets
 * first-enable provenance from `actorUserId`. All registry keys are always present
 * on the returned map.
 *
 * @param input - Partial features from the request body (may be undefined)
 * @param actorUserId - Staff user id for first-enable provenance
 * @param now - Injectable timestamp for provenance
 * @returns Complete normalized {@link CourseFeatures} map
 */
export function normalizeCourseFeaturesInput(
    input: CourseFeatures | undefined,
    actorUserId: string,
    now: Date = new Date()
): CourseFeatures {
    let features = buildNewCourseFeatures();
    for (const def of COURSE_FEATURE_DEFINITIONS) {
        const desired = input?.[def.id]?.enabled === true;
        features = updateCourseCapability(features, def.id, desired, actorUserId, now);
    }
    return features;
}
