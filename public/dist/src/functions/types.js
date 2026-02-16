// public/scripts/types.ts
// ===========================================
// ========= ONBOARDING DATA TYPE ============
// ===========================================
export var onBoardingScreen;
(function (onBoardingScreen) {
    onBoardingScreen[onBoardingScreen["GettingStarted"] = 1] = "GettingStarted";
    onBoardingScreen[onBoardingScreen["CourseName"] = 2] = "CourseName";
    onBoardingScreen[onBoardingScreen["InstructorName"] = 3] = "InstructorName";
    onBoardingScreen[onBoardingScreen["TAName"] = 4] = "TAName";
    onBoardingScreen[onBoardingScreen["CourseFrame"] = 5] = "CourseFrame";
    onBoardingScreen[onBoardingScreen["ContentNumber"] = 6] = "ContentNumber";
    onBoardingScreen[onBoardingScreen["Finalization"] = 7] = "Finalization";
})(onBoardingScreen || (onBoardingScreen = {}));
/**
 * Default prompt ID constant
 * Used to identify the system default initial assistant prompt
 */
export const DEFAULT_PROMPT_ID = 'default-engeai-welcome';
/**
 * Default system prompt component ID constants
 * Used to identify the three default system prompt components
 */
export const DEFAULT_BASE_PROMPT_ID = 'default-base-system-prompt';
export const DEFAULT_LEARNING_OBJECTIVES_ID = 'default-learning-objectives';
export const DEFAULT_STRUGGLE_TOPICS_ID = 'default-struggle-topics';
