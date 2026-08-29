/**
 * Course Extra Feature defaults — single registry for new-course policy and labels.
 *
 * New courses default every capability to off via `buildNewCourseFeatures` /
 * `normalizeCourseFeaturesInput`. Missing keys on existing courses stay off at
 * read time (`isCourseFeatureEnabled`).
 *
 * @author: EngE-AI Team
 * @date: 2026-08-06
 * @version: 1.1.0
 * @description: Extra Feature id/label/default registry for dashboard-setting.
 */

/** One Extra Feature capability definition. */
export interface CourseFeatureDefinition {
    id: 'writingFeedback' | 'memoryAgent' | 'guidedPathway' | 'scenarioGeneration';
    label: string;
    /** Persisted on brand-new courses when the create/setup body omits opt-in. */
    defaultEnabledForNewCourse: boolean;
}

/**
 * COURSE_FEATURE_DEFINITIONS — ordered registry; source of truth for ids and labels.
 */
export const COURSE_FEATURE_DEFINITIONS = [
    {
        id: 'writingFeedback',
        label: 'Writing Feedback',
        defaultEnabledForNewCourse: false,
    },
    {
        id: 'memoryAgent',
        label: 'Memory Agent',
        defaultEnabledForNewCourse: false,
    },
    {
        id: 'guidedPathway',
        label: 'Guided Pathway',
        defaultEnabledForNewCourse: false,
    },
    {
        id: 'scenarioGeneration',
        label: 'Scenario Questions',
        defaultEnabledForNewCourse: false,
    },
] as const satisfies readonly CourseFeatureDefinition[];

/** Union of Extra Feature ids from the registry. */
export type CourseFeatureId = (typeof COURSE_FEATURE_DEFINITIONS)[number]['id'];
