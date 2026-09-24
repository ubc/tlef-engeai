import type { activeCourse, CourseFeatures } from '../types.js';

export type BrowserCourseFeatureId = 'writingFeedback' | 'memoryAgent' | 'guidedPathway' | 'scenarioGeneration';

const DEFAULT_COURSE_FEATURE_ENABLED: Record<BrowserCourseFeatureId, boolean> = {
    writingFeedback: true,
    memoryAgent: true,
    guidedPathway: true,
    scenarioGeneration: true
};

/**
 * Mirrors `isCourseFeatureEnabled` from the server for browser-only feature gates.
 */
export function isBrowserCourseFeatureEnabled(
    course: Pick<activeCourse, 'features'> | null | undefined,
    feature: BrowserCourseFeatureId
): boolean {
    if (!course) return false;
    return course.features?.[feature]?.enabled ?? DEFAULT_COURSE_FEATURE_ENABLED[feature];
}

export function courseFeatureSnapshotFromDefaults(features: CourseFeatures | undefined): Record<BrowserCourseFeatureId, boolean> {
    return {
        writingFeedback: features?.writingFeedback?.enabled ?? DEFAULT_COURSE_FEATURE_ENABLED.writingFeedback,
        memoryAgent: features?.memoryAgent?.enabled ?? DEFAULT_COURSE_FEATURE_ENABLED.memoryAgent,
        guidedPathway: features?.guidedPathway?.enabled ?? DEFAULT_COURSE_FEATURE_ENABLED.guidedPathway,
        scenarioGeneration: features?.scenarioGeneration?.enabled ?? DEFAULT_COURSE_FEATURE_ENABLED.scenarioGeneration
    };
}
