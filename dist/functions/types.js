"use strict";
// public/scripts/types.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_STRUGGLE_TOPICS_ID = exports.DEFAULT_LEARNING_OBJECTIVES_ID = exports.DEFAULT_BASE_PROMPT_ID = exports.DEFAULT_PROMPT_ID = exports.onBoardingScreen = void 0;
// ===========================================
// ========= ONBOARDING DATA TYPE ============
// ===========================================
var onBoardingScreen;
(function (onBoardingScreen) {
    onBoardingScreen[onBoardingScreen["GettingStarted"] = 1] = "GettingStarted";
    onBoardingScreen[onBoardingScreen["CourseName"] = 2] = "CourseName";
    onBoardingScreen[onBoardingScreen["InstructorName"] = 3] = "InstructorName";
    onBoardingScreen[onBoardingScreen["TAName"] = 4] = "TAName";
    onBoardingScreen[onBoardingScreen["CourseFrame"] = 5] = "CourseFrame";
    onBoardingScreen[onBoardingScreen["ContentNumber"] = 6] = "ContentNumber";
    onBoardingScreen[onBoardingScreen["Finalization"] = 7] = "Finalization";
})(onBoardingScreen || (exports.onBoardingScreen = onBoardingScreen = {}));
/**
 * Default prompt ID constant
 * Used to identify the system default initial assistant prompt
 */
exports.DEFAULT_PROMPT_ID = 'default-engeai-welcome';
/**
 * Default system prompt component ID constants
 * Used to identify the three default system prompt components
 */
exports.DEFAULT_BASE_PROMPT_ID = 'default-base-system-prompt';
exports.DEFAULT_LEARNING_OBJECTIVES_ID = 'default-learning-objectives';
exports.DEFAULT_STRUGGLE_TOPICS_ID = 'default-struggle-topics';
