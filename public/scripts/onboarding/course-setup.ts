// public/scripts/onboarding/course-setup.ts
/**
 * COURSE SETUP MODULE
 *
 * Five-step instructor onboarding wizard for course structure setup.
 * Course name is chosen before this wizard (course selection or Enter Class).
 *
 * ONBOARDING STEPS:
 * 1. Getting Started
 * 2. Course Division (by week or topic)
 * 3. Content Count
 * 4. Review and complete
 * 5. Congratulations
 *
 * @author: gatahcha (revised)
 * @date: 2025-01-27
 * @version: 4.0.0
 */

import { loadComponentHTML } from "../api/api.js";
import { activeCourse } from "../types.js";
import { showErrorModal, showHelpModal } from "../ui/modal-overlay.js";

type SetupMode = 'create' | 'resume';

interface OnboardingState {
    currentStep: number;
    totalSteps: number;
    setupMode: SetupMode;
    isSubmitting: boolean;
}

/** Mirrors backend resolveInstructorModeRedirect for client-side forward redirects. */
function getInstructorForwardRedirect(courseId: string, course: activeCourse): string {
    if (!course.courseSetup) {
        return `/course/${courseId}/instructor/onboarding/course-setup`;
    }
    if (!course.contentSetup) {
        return `/course/${courseId}/instructor/onboarding/document-setup`;
    }
    if (!course.flagSetup) {
        return `/course/${courseId}/instructor/onboarding/flag-setup`;
    }
    if (!course.monitorSetup) {
        return `/course/${courseId}/instructor/onboarding/monitor-setup`;
    }
    return `/course/${courseId}/instructor/documents`;
}

function applyCourseFields(target: activeCourse, source: activeCourse): void {
    if (source.frameType) {
        target.frameType = source.frameType;
    }
    if (typeof source.tilesNumber === 'number' && source.tilesNumber > 0) {
        target.tilesNumber = source.tilesNumber;
    }
}

async function fetchCourseByName(courseName: string): Promise<activeCourse | null> {
    const response = await fetch(`/api/courses?name=${encodeURIComponent(courseName.trim())}`, {
        method: 'GET',
        credentials: 'same-origin'
    });
    if (!response.ok) {
        return null;
    }
    const json = await response.json();
    return json?.success && json?.data ? (json.data as activeCourse) : null;
}

async function isCourseNameAllowedForCreate(courseName: string): Promise<boolean> {
    const response = await fetch('/api/courses/allowed-for-instructor', {
        method: 'GET',
        credentials: 'same-origin'
    });
    if (!response.ok) {
        return false;
    }
    const json = await response.json();
    const allowedCourses: string[] = json?.allowedCourses ?? [];
    return allowedCourses.some((n) => n.toLowerCase() === courseName.trim().toLowerCase());
}

/**
 * Resolves create vs resume from session-loaded course or a single name lookup (new-course path).
 */
async function resolveSetupMode(
    onBoardingCourse: activeCourse,
    instructorCourse: activeCourse
): Promise<SetupMode | null> {
    const courseName = onBoardingCourse.courseName?.trim() || instructorCourse.courseName?.trim() || '';
    if (!courseName) {
        await showErrorModal(
            'Course Required',
            'No course was selected. Return to course selection and choose a course before continuing.'
        );
        return null;
    }

    onBoardingCourse.courseName = courseName;
    instructorCourse.courseName = courseName;

    const hasSessionCourse = Boolean(instructorCourse.id?.trim() && instructorCourse.courseName?.trim());

    if (hasSessionCourse) {
        onBoardingCourse.id = instructorCourse.id;
        applyCourseFields(onBoardingCourse, instructorCourse);

        if (instructorCourse.courseSetup) {
            window.location.href = getInstructorForwardRedirect(instructorCourse.id, instructorCourse);
            return null;
        }
        return 'resume';
    }

    try {
        const existing = await fetchCourseByName(courseName);
        if (existing) {
            onBoardingCourse.id = existing.id;
            instructorCourse.id = existing.id;
            applyCourseFields(onBoardingCourse, existing);
            Object.assign(instructorCourse, existing);

            if (existing.courseSetup) {
                window.location.href = getInstructorForwardRedirect(existing.id, existing);
                return null;
            }
            return 'resume';
        }

        const allowed = await isCourseNameAllowedForCreate(courseName);
        if (!allowed) {
            await showErrorModal(
                'Course Not Available',
                'This course is not assigned to you for this academic period. Contact a platform admin.'
            );
            return null;
        }
        return 'create';
    } catch {
        await showErrorModal(
            'Connection Error',
            'Failed to verify course setup status. Please refresh and try again.'
        );
        return null;
    }
}

function updateSelectedCourseBanner(courseName: string): void {
    const banner = document.getElementById('selectedCourseBanner');
    if (banner) {
        banner.textContent = courseName;
    }
}

function setNavigationSubmitting(isSubmitting: boolean): void {
    const nextBtn = document.getElementById('nextBtn') as HTMLButtonElement;
    const backBtn = document.getElementById('backBtn') as HTMLButtonElement;
    if (nextBtn) {
        nextBtn.disabled = isSubmitting;
    }
    if (backBtn) {
        backBtn.disabled = isSubmitting;
    }
}

export const renderOnCourseSetup = async (instructorCourse: activeCourse): Promise<void> => {
    try {
        const onBoardingCourse: activeCourse = { ...instructorCourse };

        const state: OnboardingState = {
            currentStep: 1,
            totalSteps: 5,
            setupMode: 'create',
            isSubmitting: false
        };

        const container = document.getElementById('main-content-area');
        if (!container) {
            throw new Error("Main content area not found");
        }

        document.body.classList.add('onboarding-active');

        const html = await loadComponentHTML('course-setup');
        container.innerHTML = html;

        await new Promise(resolve => requestAnimationFrame(resolve));

        if (typeof (window as any).feather !== 'undefined') {
            (window as any).feather.replace();
        }

        await initializeOnboarding(state, onBoardingCourse, instructorCourse);
    } catch (error) {
        console.error("❌ Error during onboarding initialization:", error);
        await showErrorModal("Initialization Error", "Failed to initialize onboarding. Please refresh the page and try again.");
    }
};

async function initializeOnboarding(
    state: OnboardingState,
    onBoardingCourse: activeCourse,
    instructorCourse: activeCourse
): Promise<void> {
    const mode = await resolveSetupMode(onBoardingCourse, instructorCourse);
    if (!mode) {
        return;
    }
    state.setupMode = mode;

    updateSelectedCourseBanner(onBoardingCourse.courseName);

    setupNavigationListeners(state, onBoardingCourse, instructorCourse);
    setupFormListeners(state, onBoardingCourse);
    setupReviewFormListeners(state, onBoardingCourse);
    setupHelpListener(state);
    setupResizeListener(state);

    updateStepDisplay(state, onBoardingCourse);
    updateStepIndicators(state);
    updateNavigationButtons(state);
}

function setupResizeListener(state: OnboardingState): void {
    let resizeTimeout: number;

    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = window.setTimeout(() => {
            const currentStepElement = document.getElementById(`content-step-${state.currentStep}`);
            if (currentStepElement?.classList.contains('active')) {
                adjustContentJustification(currentStepElement);
            }
        }, 100);
    });
}

function setupNavigationListeners(
    state: OnboardingState,
    onBoardingCourse: activeCourse,
    instructorCourse: activeCourse
): void {
    const backBtn = document.getElementById('backBtn') as HTMLButtonElement;
    const nextBtn = document.getElementById('nextBtn') as HTMLButtonElement;

    backBtn?.addEventListener('click', () => handleBackNavigation(state, onBoardingCourse));
    nextBtn?.addEventListener('click', () => handleNextNavigation(state, onBoardingCourse, instructorCourse));
}

function setupFormListeners(state: OnboardingState, onBoardingCourse: activeCourse): void {
    const divisionRadios = document.querySelectorAll('input[name="division"]') as NodeListOf<HTMLInputElement>;
    divisionRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            const target = e.target as HTMLInputElement;
            onBoardingCourse.frameType = target.value as 'byWeek' | 'byTopic';
            updateContentCountDescription(onBoardingCourse);
        });
    });

    const contentCountInput = document.getElementById('contentCount') as HTMLInputElement;
    if (contentCountInput) {
        contentCountInput.value = onBoardingCourse.tilesNumber.toString();
        contentCountInput.addEventListener('input', (e) => {
            const target = e.target as HTMLInputElement;
            onBoardingCourse.tilesNumber = parseInt(target.value) || 12;
            updateStepIndicators(state);
        });
    }
}

function setupReviewFormListeners(state: OnboardingState, onBoardingCourse: activeCourse): void {
    const reviewDivisionRadios = document.querySelectorAll('input[name="reviewDivision"]') as NodeListOf<HTMLInputElement>;
    reviewDivisionRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            const target = e.target as HTMLInputElement;
            onBoardingCourse.frameType = target.value as 'byWeek' | 'byTopic';
            updateReviewContentCountDescription(onBoardingCourse);
        });
    });

    const reviewContentCountInput = document.getElementById('reviewContentCount') as HTMLInputElement;
    reviewContentCountInput?.addEventListener('input', (e) => {
        const target = e.target as HTMLInputElement;
        onBoardingCourse.tilesNumber = parseInt(target.value) || 12;
        updateStepIndicators(state);
    });
}

function setupHelpListener(state: OnboardingState): void {
    const helpBtn = document.getElementById('helpBtn') as HTMLButtonElement;
    helpBtn?.addEventListener('click', () => {
        showStepHelp(state.currentStep);
    });
}

async function showStepHelp(stepNumber: number): Promise<void> {
    const helpContent = getStepHelpContent(stepNumber);
    await showHelpModal(stepNumber, helpContent.title, helpContent.content);
}

function getStepHelpContent(stepNumber: number): { title: string; content: string } {
    const stepTitles: Record<number, string> = {
        1: "Getting Started",
        2: "Course Organization",
        3: "Content Count",
        4: "Review & Complete",
        5: "Setup Complete"
    };

    const helpElement = document.getElementById(`help-step-${stepNumber}`);
    const content = helpElement ? helpElement.innerHTML : "<p>No help content available for this step.</p>";

    return {
        title: stepTitles[stepNumber] || "Help",
        content
    };
}

function handleBackNavigation(state: OnboardingState, onBoardingCourse: activeCourse): void {
    if (state.currentStep > 1) {
        state.currentStep--;
        updateStepDisplay(state, onBoardingCourse);
        updateStepIndicators(state);
        updateNavigationButtons(state);
    }
}

async function handleNextNavigation(
    state: OnboardingState,
    onBoardingCourse: activeCourse,
    instructorCourse: activeCourse
): Promise<void> {
    if (state.isSubmitting) {
        return;
    }

    if (!(await validateCurrentStep(state, onBoardingCourse))) {
        return;
    }

    if (state.currentStep < state.totalSteps) {
        state.currentStep++;

        if (state.currentStep === 5) {
            state.isSubmitting = true;
            setNavigationSubmitting(true);
            await handleDatabaseSubmission(state, onBoardingCourse, instructorCourse);
            state.isSubmitting = false;
            setNavigationSubmitting(false);
        }

        updateStepDisplay(state, onBoardingCourse);
        updateStepIndicators(state);
        updateNavigationButtons(state);

        if (state.currentStep === 4) {
            updateReviewContent(onBoardingCourse);
        }
    } else {
        handleWindowReset();
    }
}

async function validateCurrentStep(state: OnboardingState, onBoardingCourse: activeCourse): Promise<boolean> {
    switch (state.currentStep) {
        case 1:
            return true;
        case 2:
            return true;
        case 3:
            if (onBoardingCourse.tilesNumber < 1 || onBoardingCourse.tilesNumber > 52) {
                await showErrorModal("Validation Error", "Please enter a valid number of sections (1-52).");
                return false;
            }
            if (onBoardingCourse.frameType === 'byWeek' && onBoardingCourse.tilesNumber > 14) {
                await showErrorModal("Validation Error", "For weekly organization, please enter 14 weeks or fewer.");
                return false;
            }
            return true;
        case 4:
            return validateAllFields(onBoardingCourse);
        case 5:
            return true;
        default:
            return true;
    }
}

async function validateAllFields(onBoardingCourse: activeCourse): Promise<boolean> {
    if (!onBoardingCourse.courseName?.trim()) {
        await showErrorModal("Validation Error", "Course name is required.");
        return false;
    }

    if (onBoardingCourse.tilesNumber < 1 || onBoardingCourse.tilesNumber > 52) {
        await showErrorModal("Validation Error", "Invalid number of sections.");
        return false;
    }

    if (onBoardingCourse.frameType === 'byWeek' && onBoardingCourse.tilesNumber > 14) {
        await showErrorModal("Validation Error", "For weekly organization, maximum 14 weeks allowed.");
        return false;
    }

    return true;
}

function updateStepDisplay(state: OnboardingState, onBoardingCourse: activeCourse): void {
    document.querySelectorAll('.content-step').forEach(step => step.classList.remove('active'));

    const currentStepElement = document.getElementById(`content-step-${state.currentStep}`);
    if (currentStepElement) {
        currentStepElement.classList.add('active');
        setTimeout(() => adjustContentJustification(currentStepElement), 10);
    }

    synchronizeFormValues(state, onBoardingCourse);
}

function adjustContentJustification(contentStepElement: HTMLElement): void {
    const contentStepInner = contentStepElement.querySelector('.content-step-inner') as HTMLElement;
    if (!contentStepInner) return;

    const availableHeight = window.innerHeight - 200;
    const contentHeight = contentStepInner.scrollHeight;

    if (contentHeight > availableHeight) {
        contentStepElement.classList.add('overflow-content');
        contentStepElement.classList.remove('center-content');
    } else {
        contentStepElement.classList.add('center-content');
        contentStepElement.classList.remove('overflow-content');
    }
}

function synchronizeFormValues(state: OnboardingState, onBoardingCourse: activeCourse): void {
    const divisionRadios = document.querySelectorAll('input[name="division"]') as NodeListOf<HTMLInputElement>;
    divisionRadios.forEach(radio => {
        radio.checked = radio.value === onBoardingCourse.frameType;
    });

    const contentCountInput = document.getElementById('contentCount') as HTMLInputElement;
    if (contentCountInput) {
        contentCountInput.value = onBoardingCourse.tilesNumber.toString();
    }

    updateContentCountDescription(onBoardingCourse);

    if (state.currentStep === 4) {
        updateReviewContent(onBoardingCourse);
    }
}

function updateStepIndicators(state: OnboardingState): void {
    const stepItems = document.querySelectorAll('.step-item');

    stepItems.forEach((item, index) => {
        const stepNumber = index + 1;
        const stepCircle = item.querySelector('.step-circle');
        const stepLine = item.querySelector('.step-line');

        if (stepCircle) {
            stepCircle.className = 'step-circle';
            if (stepNumber < state.currentStep) {
                stepCircle.classList.add('completed');
            } else if (stepNumber === state.currentStep) {
                stepCircle.classList.add('current');
            } else {
                stepCircle.classList.add('pending');
            }
        }

        if (stepLine && stepNumber < state.currentStep) {
            stepLine.classList.add('completed');
        }
    });
}

function updateNavigationButtons(state: OnboardingState): void {
    const backBtn = document.getElementById('backBtn') as HTMLButtonElement;
    const nextBtn = document.getElementById('nextBtn') as HTMLButtonElement;

    if (backBtn) {
        backBtn.style.display = state.currentStep > 1 ? 'flex' : 'none';
        backBtn.disabled = state.isSubmitting;
    }

    if (nextBtn) {
        const label = state.currentStep === state.totalSteps ? 'Complete Setup' : 'Next';
        const span = nextBtn.querySelector('.nav-btn-text');
        if (span) {
            span.textContent = label;
        } else {
            nextBtn.textContent = label;
        }
        nextBtn.disabled = state.isSubmitting;
    }
}

function updateContentCountDescription(onBoardingCourse: activeCourse): void {
    const descriptionElement = document.getElementById('countDescription');
    if (!descriptionElement) return;

    descriptionElement.textContent =
        onBoardingCourse.frameType === 'byWeek'
            ? 'How many weeks are in your course?'
            : 'How many topics are in your course?';
}

function updateReviewContent(onBoardingCourse: activeCourse): void {
    const reviewCourseName = document.getElementById('reviewCourseName');
    if (reviewCourseName) {
        reviewCourseName.textContent = onBoardingCourse.courseName || '';
    }

    const reviewByWeek = document.getElementById('reviewByWeek') as HTMLInputElement;
    const reviewByTopic = document.getElementById('reviewByTopic') as HTMLInputElement;
    if (reviewByWeek && reviewByTopic) {
        reviewByWeek.checked = onBoardingCourse.frameType === 'byWeek';
        reviewByTopic.checked = onBoardingCourse.frameType === 'byTopic';
    }

    const reviewContentCountInput = document.getElementById('reviewContentCount') as HTMLInputElement;
    if (reviewContentCountInput) {
        reviewContentCountInput.value = onBoardingCourse.tilesNumber.toString();
    }

    updateReviewContentCountDescription(onBoardingCourse);
}

function updateReviewContentCountDescription(onBoardingCourse: activeCourse): void {
    const descriptionElement = document.getElementById('reviewCountDescription');
    if (!descriptionElement) return;

    descriptionElement.textContent =
        onBoardingCourse.frameType === 'byWeek'
            ? 'How many weeks are in your course?'
            : 'How many topics are in your course?';
}

async function handleDatabaseSubmission(
    state: OnboardingState,
    onBoardingCourse: activeCourse,
    instructorCourse: activeCourse
): Promise<void> {
    try {
        let submittedCourse: activeCourse;

        if (state.setupMode === 'resume' && onBoardingCourse.id) {
            submittedCourse = await completeCourseSetupOnExisting(
                onBoardingCourse.id,
                onBoardingCourse.frameType,
                onBoardingCourse.tilesNumber
            );
        } else {
            const courseData: activeCourse = {
                id: generateUniqueId(),
                date: new Date(),
                courseSetup: true,
                contentSetup: false,
                flagSetup: false,
                monitorSetup: false,
                courseName: onBoardingCourse.courseName,
                instructors: [],
                teachingAssistants: [],
                frameType: onBoardingCourse.frameType,
                tilesNumber: onBoardingCourse.tilesNumber,
                topicOrWeekInstances: []
            };
            submittedCourse = await postCourseToDatabase(courseData);
        }

        Object.assign(instructorCourse, submittedCourse);
        onBoardingCourse.id = submittedCourse.id;
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to save course data. Please try again.';
        await showErrorModal("Submission Error", message);
        state.currentStep = 4;
        updateStepDisplay(state, onBoardingCourse);
        updateStepIndicators(state);
        updateNavigationButtons(state);
    }
}

function handleWindowReset(): void {
    document.body.classList.remove('onboarding-active');
    window.dispatchEvent(new CustomEvent('onboardingComplete'));
}

async function completeCourseSetupOnExisting(
    courseId: string,
    frameType: 'byWeek' | 'byTopic',
    tilesNumber: number
): Promise<activeCourse> {
    const response = await fetch(`/api/courses/${courseId}/complete-course-setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ frameType, tilesNumber })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || response.statusText);
    }

    const result = await response.json();
    return result.data as activeCourse;
}

async function postCourseToDatabase(courseData: activeCourse): Promise<activeCourse> {
    const courseDataToPost = {
        ...courseData,
        date: courseData.date instanceof Date ? courseData.date : new Date(courseData.date)
    };

    const response = await fetch('/api/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(courseDataToPost)
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || response.statusText);
    }

    const result = await response.json();
    return result.data as activeCourse;
}

function generateUniqueId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

