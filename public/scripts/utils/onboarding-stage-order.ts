/**
 * onboarding-stage-order.ts
 *
 * Single source of instructor onboarding stage ordering for the browser.
 *
 * Deliberately import-free and DOM-free so it can be unit tested from the
 * backend Jest project, which compiles `src` only and runs in a Node
 * environment. `tsconfig.jest.json` hand-includes this file for that reason,
 * following the precedent set by `instructor-response-carousel.ts`.
 *
 * The backend mirror lives in `src/helpers/instructor-onboarding-redirect.ts`.
 * Neither side can import the other, so `src/helpers/__tests__/instructor-onboarding-redirect.test.ts`
 * asserts both resolve identically for every input combination.
 *
 * @author: @rdschrs
 * @date: 2026-08-17
 */

/** Every instructor onboarding stage slug, matching its route and component name. */
export type InstructorOnboardingStage =
    | 'course-setup'
    | 'document-setup'
    | 'scenario-generation-setup'
    | 'writing-feedback-setup'
    | 'guided-pathway-setup'
    | 'flag-setup'
    | 'monitor-setup';

/** Course capability keys that own an onboarding tutorial. */
export type OnboardingFeatureKey = 'scenarioGeneration' | 'writingFeedback' | 'guidedPathway';

/**
 * Structural view of the course fields stage resolution depends on.
 *
 * Declared structurally rather than imported so this module stays import-free.
 * Both `activeCourse` copies satisfy it. Tutorial progress is not here: it lives
 * on the user and arrives as the separate `progress` argument.
 */
export interface OnboardingCourseProgress {
    courseSetup?: boolean;
    /** True once a completed Document Setup recorded that this course's content was filed. */
    contentSetup?: boolean;
    /** Course divisions; only an item filed under one proves the content exists. */
    topicOrWeekInstances?: Array<{ items?: unknown[] }>;
    features?: {
        scenarioGeneration?: { enabled: boolean };
        writingFeedback?: { enabled: boolean };
        guidedPathway?: { enabled: boolean };
    };
}

/**
 * Structural view of the viewer's own tutorial progress.
 *
 * Satisfied by both `InstructorOnboardingProgress` copies. `courseSetup` is
 * deliberately absent: it writes real course configuration and stays on the course.
 */
export interface OnboardingUserProgress {
    contentSetup?: boolean;
    flagSetup?: boolean;
    monitorSetup?: boolean;
    scenarioGeneration?: boolean;
    writingFeedback?: boolean;
    guidedPathway?: boolean;
}

/**
 * Feature tutorials in the order they are presented, between Document and Flag setup.
 *
 * Order is product-specified. Changing it changes what instructors see, so the
 * sequence is pinned by test rather than left to declaration order elsewhere.
 */
export const FEATURE_ONBOARDING_STAGES: ReadonlyArray<{
    stage: InstructorOnboardingStage;
    feature: OnboardingFeatureKey;
}> = [
    { stage: 'scenario-generation-setup', feature: 'scenarioGeneration' },
    { stage: 'writing-feedback-setup', feature: 'writingFeedback' },
    { stage: 'guided-pathway-setup', feature: 'guidedPathway' }
];

const DEFAULT_FEATURE_ENABLED: Record<OnboardingFeatureKey, boolean> = {
    scenarioGeneration: true,
    writingFeedback: true,
    guidedPathway: true
};

/** A capability counts as available unless the course explicitly disables it. */
function isFeatureEnabled(course: OnboardingCourseProgress, feature: OnboardingFeatureKey): boolean {
    return course.features?.[feature]?.enabled ?? DEFAULT_FEATURE_ENABLED[feature];
}

/**
 * resolveNextOnboardingStage - first onboarding stage this staff member still owes.
 *
 * Sequence: Course, Document, then each enabled-and-incomplete feature tutorial
 * in `FEATURE_ONBOARDING_STAGES` order, then Flag and Monitor.
 *
 * `courseSetup` is read from the course because it writes real configuration that
 * a second instructor must not be able to override. Every tutorial stage is read
 * from the viewer's own record, so an instructor new to EngE-AI is taught even on
 * a course a colleague set up, and one who has been taught is never taught again.
 * The three feature tutorials are additionally gated on their course capability.
 *
 * Course Setup is reserved for roster managers. It defines `frameType` and
 * `tilesNumber` — whether the course runs by week or by topic, and how many
 * divisions it has — and its endpoint requires roster-management authority. Every
 * later stage files content under those divisions, so a teaching assistant reaching
 * an unconfigured course is owed nothing here rather than being sent into a stage
 * they cannot complete or a document step with no structure to populate.
 *
 * @param course - course setup flag and capability map
 * @param progress - viewer's own tutorial progress; missing is treated as none
 * @param canManageRoster - true for faculty instructors and platform admins
 * @returns the stage slug to render, or null when nothing is owed
 */
/**
 * True when this course still owes the content Document Setup files.
 *
 * Mirrors `courseOwesContent` in `src/helpers/instructor-onboarding-redirect.ts`; the
 * parity test asserts both agree. Read from the course's own items rather than from
 * `contentSetup` alone, because every course provisioned since OB-002 carries
 * `contentSetup: false` whether or not its content was filed, so a flag-only test would
 * drag all of them through Document Setup again. The flag is a fast path once a completed
 * Document Setup has recorded it, and lets a deliberately empty course settle.
 *
 * @param course - course whose content is in question
 */
function courseOwesContent(course: OnboardingCourseProgress): boolean {
    if (course.contentSetup === true) {
        return false;
    }
    return !(course.topicOrWeekInstances ?? []).some(instance => (instance.items?.length ?? 0) > 0);
}

export function resolveNextOnboardingStage(
    course: OnboardingCourseProgress,
    progress: OnboardingUserProgress | null | undefined,
    canManageRoster = true
): InstructorOnboardingStage | null {
    if (!course.courseSetup) {
        return canManageRoster ? 'course-setup' : null;
    }
    // Document Setup does two jobs: it teaches the viewer and it files the course's content.
    // Either one being outstanding owes the stage.
    if (courseOwesContent(course) || !progress?.contentSetup) {
        return 'document-setup';
    }

    for (const { stage, feature } of FEATURE_ONBOARDING_STAGES) {
        if (isFeatureEnabled(course, feature) && progress[feature] !== true) {
            return stage;
        }
    }

    if (!progress.flagSetup) {
        return 'flag-setup';
    }
    if (!progress.monitorSetup) {
        return 'monitor-setup';
    }
    return null;
}

/** Builds the instructor onboarding route for a stage. */
export function buildOnboardingStagePath(courseId: string, stage: InstructorOnboardingStage): string {
    return `/course/${courseId}/instructor/onboarding/${stage}`;
}

/**
 * Human-readable stage names for tutorial chrome.
 *
 * Copy only: no slug and no internal identifier ever reaches the interface, so a
 * stage is named the way the product names its area rather than by its route.
 */
export const ONBOARDING_STAGE_LABELS: Record<InstructorOnboardingStage, string> = {
    'course-setup': 'Course Setup',
    'document-setup': 'Course Content',
    'scenario-generation-setup': 'Scenario Generation',
    'writing-feedback-setup': 'Writing Feedback',
    'guided-pathway-setup': 'Guided Pathway',
    'flag-setup': 'Flags',
    'monitor-setup': 'Monitor'
};

/**
 * Stages that offer Skip tutorial.
 *
 * Course Setup writes the course's own structure and Course Content files real
 * material under it, so neither may be skipped; every stage after them only
 * teaches, and staff who already know the product need a way out.
 */
export const SKIPPABLE_ONBOARDING_STAGES: ReadonlyArray<InstructorOnboardingStage> = [
    'scenario-generation-setup',
    'writing-feedback-setup',
    'guided-pathway-setup',
    'flag-setup',
    'monitor-setup'
];

/** True when this stage offers Skip tutorial. */
export function isSkippableOnboardingStage(stage: InstructorOnboardingStage): boolean {
    return SKIPPABLE_ONBOARDING_STAGES.includes(stage);
}

/**
 * Every stage this viewer can be routed through on this course, in presentation order.
 *
 * Completion is deliberately ignored: this is the denominator of "Tutorial 3 of 7",
 * which must not shrink as stages are finished. Ordering and capability gating mirror
 * {@link resolveNextOnboardingStage} so the two cannot disagree about which stages
 * exist for a viewer.
 *
 * @param course - course setup flag and capability map
 * @param canManageRoster - true for faculty instructors and platform admins; a teaching
 *        assistant is never routed through Course Setup, so it is omitted for them
 * @returns ordered stage slugs
 */
export function buildOnboardingStageSequence(
    course: OnboardingCourseProgress,
    canManageRoster = true
): InstructorOnboardingStage[] {
    const sequence: InstructorOnboardingStage[] = [];
    if (canManageRoster) {
        sequence.push('course-setup');
    }
    sequence.push('document-setup');
    for (const { stage, feature } of FEATURE_ONBOARDING_STAGES) {
        if (isFeatureEnabled(course, feature)) {
            sequence.push(stage);
        }
    }
    sequence.push('flag-setup', 'monitor-setup');
    return sequence;
}

/**
 * One-based position of a stage within {@link buildOnboardingStageSequence}.
 *
 * @param stage - stage being rendered
 * @param course - course setup flag and capability map
 * @param canManageRoster - true for faculty instructors and platform admins
 * @returns `{ index, total }`, or null when this viewer is never routed through the
 *          stage — a disabled capability, or Course Setup for a teaching assistant
 */
export function resolveOnboardingStagePosition(
    stage: InstructorOnboardingStage,
    course: OnboardingCourseProgress,
    canManageRoster = true
): { index: number; total: number } | null {
    const sequence = buildOnboardingStageSequence(course, canManageRoster);
    const zeroBased = sequence.indexOf(stage);
    if (zeroBased === -1) {
        return null;
    }
    return { index: zeroBased + 1, total: sequence.length };
}
