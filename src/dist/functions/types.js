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
