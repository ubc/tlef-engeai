/**
 * COURSE SUMMARY MODULE
 *
 * Loads course summary from GET /api/courses/:courseId/course-summary/status (instructor auth).
 *
 * Chart rendering uses the **`chart.js` npm package**: the UMD bundle is copied to
 * `public/vendor/chart.js/chart.umd.js` by `npm run vendor:chart` and loaded by {@link chartsController}
 * (same-origin, not a third-party CDN).
 */

import type {
    activeCourse,
    CourseSummaryStackedBar,
    CourseSummaryStruggleTopics,
    CourseSummaryTopTopic
} from "../types.js";
import { authService } from "../services/auth-service.js";
import { renderFeatherIcons } from "../api/api.js";
import { openConversationExportFormatModal } from "./conversations-export-modal.js";
import { fetchCourseReportPdf } from "./report-pdf-download.js";
import { chartsController, mapCourseSummaryStackedBarToChartSpec } from "../ui/charts.js";

type CourseSummaryStatus = 'locked' | 'available' | 'generated';
type CourseSummaryFrameType = 'byWeek' | 'byTopic';

interface CourseSummaryStatusResponse {
    success: boolean;
    shouldDisplayModal: boolean;
    summary?: CourseSummaryRecord;
    error?: string;
}

interface CourseSummaryRecord {
    id: string;
    courseId: string;
    courseName: string;
    status: CourseSummaryStatus;
    isAvailable: boolean;
    availableAt: string | null;
    instructorDisplayStates: CourseSummaryInstructorDisplayState[];
    course: CourseSummaryCourseInfo;
    totals: CourseSummaryTotals;
    struggleTopics?: CourseSummaryStruggleTopics;
    downloadConversationAvailable: boolean;
    downloadConversationAvailableAt: string | null;
    createdAt: string;
    updatedAt: string;
}

interface CourseSummaryInstructorDisplayState {
    instructorUserId: string;
    instructorName?: string;
    hasBeenDisplayed: boolean;
    firstDisplayedAt: string | null;
    lastDisplayedAt: string | null;
    displayCount: number;
}

interface CourseSummaryCourseInfo {
    id: string;
    name: string;
    frameType: CourseSummaryFrameType;
    startDate: string;
    endDate: string;
}

interface CourseSummaryTotals {
    students: number;
    nonDeletedChats: number;
}

const COURSE_SUMMARY_TEMPLATE_URL = '/components/course-summary/course-summary.html';
const COURSE_SUMMARY_CSS_ID = 'course-summary-stylesheet';
const COURSE_SUMMARY_CSS_HREF = '/styles/instructor-components/course-summary.css';

const ADMIN_STEP_ORDER = ['completion', 'overview', 'metrics', 'download', 'struggle-topics'] as const;
const INSTRUCTOR_STEP_ORDER = ['completion', 'overview', 'metrics'] as const;
type CourseSummaryStep = typeof ADMIN_STEP_ORDER[number];
type CourseSummaryRevealStep = Extract<CourseSummaryStep, 'overview' | 'metrics' | 'download'>;

function getStepOrder(isPlatformAdmin: boolean): readonly CourseSummaryStep[] {
    return isPlatformAdmin ? ADMIN_STEP_ORDER : INSTRUCTOR_STEP_ORDER;
}

const metricCountAnimGeneration = new WeakMap<HTMLElement, number>();

/**
 * Increments the animation generation token for `overlay` so running count animations stop.
 *
 * @param overlay - The course summary modal root (scope for WeakMap).
 */
function bumpMetricCountAnimation(overlay: HTMLElement): void {
    metricCountAnimGeneration.set(overlay, (metricCountAnimGeneration.get(overlay) ?? 0) + 1);
}

/**
 * Animates `element.textContent` as an integer from zero toward `target` over `durationMs`,
 * using an ease-out cubic curve. Stops updating if `overlay`'s animation generation changes
 * (see {@link bumpMetricCountAnimation}).
 *
 * @param element - DOM node to update (typically a metric `<strong>`).
 * @param target - Final non-negative integer value.
 * @param durationMs - Animation length in milliseconds.
 * @param overlay - Modal root used with {@link metricCountAnimGeneration}.
 * @param generation - Generation captured when the animation started; mismatch cancels the run.
 * @param delayMs - Optional delay before the first frame.
 */
function animateCountTo(
    element: HTMLElement | null,
    target: number,
    durationMs: number,
    overlay: HTMLElement,
    generation: number,
    delayMs: number
): void {
    if (!element) {
        return;
    }
    const capped = Math.max(0, Math.floor(target));

    const run = (startTime: number): void => {
        const tick = (now: number): void => {
            if ((metricCountAnimGeneration.get(overlay) ?? 0) !== generation) {
                return;
            }
            const elapsed = now - startTime;
            const t = Math.min(1, elapsed / durationMs);
            const eased = 1 - Math.pow(1 - t, 3);
            element.textContent = String(Math.round(capped * eased));
            if (t < 1) {
                requestAnimationFrame(tick);
            } else {
                element.textContent = String(capped);
            }
        };
        requestAnimationFrame(tick);
    };

    if (delayMs > 0) {
        window.setTimeout(() => {
            if ((metricCountAnimGeneration.get(overlay) ?? 0) !== generation) {
                return;
            }
            requestAnimationFrame(run);
        }, delayMs);
    } else {
        requestAnimationFrame(run);
    }
}

/**
 * Runs count-up animations for students and conversations when the modal reaches the metrics step.
 * Respects `prefers-reduced-motion` by setting final values immediately.
 */
function triggerMetricCountUpIfNeeded(overlay: HTMLElement): void {
    bumpMetricCountAnimation(overlay);
    const generation = metricCountAnimGeneration.get(overlay)!;

    const studentsTarget = Math.max(0, Math.floor(Number(overlay.dataset.metricStudentsTarget ?? '0')));
    const chatsTarget = Math.max(0, Math.floor(Number(overlay.dataset.metricChatsTarget ?? '0')));
    const studentsEl = overlay.querySelector('#course-summary-students-count') as HTMLElement | null;
    const chatsEl = overlay.querySelector('#course-summary-chats-count') as HTMLElement | null;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        if (studentsEl) {
            studentsEl.textContent = String(studentsTarget);
        }
        if (chatsEl) {
            chatsEl.textContent = String(chatsTarget);
        }
        return;
    }

    const durationMs = 1100;
    animateCountTo(studentsEl, studentsTarget, durationMs, overlay, generation, 0);
    animateCountTo(chatsEl, chatsTarget, durationMs, overlay, generation, 120);
}

/**
 * Shows the course-summary FAB only after the academic period ends (admins use monitor button earlier).
 */
export async function configureCourseSummaryFabVisibility(courseId: string): Promise<void> {
    const fab = document.getElementById('course-summary-summon-fab');
    if (!fab) {
        return;
    }
    try {
        const response = await fetch(`/api/courses/${encodeURIComponent(courseId)}/analytics-access`, {
            credentials: 'include',
            headers: { Accept: 'application/json' }
        });
        if (!response.ok) {
            fab.classList.add('course-summary-fab-hidden');
            return;
        }
        const payload = (await response.json()) as {
            success: boolean;
            data?: { canViewCourseSummary?: boolean; isAcademicPeriodEnded?: boolean };
        };
        const show =
            payload.success &&
            payload.data?.canViewCourseSummary === true &&
            payload.data?.isAcademicPeriodEnded === true;
        fab.classList.toggle('course-summary-fab-hidden', !show);
    } catch {
        fab.classList.add('course-summary-fab-hidden');
    }
}

/**
 * Initializes the course summary modal once onboarding is complete.
 * Fetches mock data, applies auto-open rules ({@link shouldOpenCourseSummaryModal}), and may show the modal.
 */
export async function initializeCourseSummary(currentClass: activeCourse): Promise<void> {
    try {
        ensureCourseSummaryStylesheet();

        const response = await fetchCourseSummaryStatus(currentClass);
        if (!shouldOpenCourseSummaryModal(response, currentClass)) {
            return;
        }

        await renderCourseSummaryModal(response.summary!, currentClass);
    } catch (error) {
        console.error('[COURSE-SUMMARY] Failed to initialize course summary:', error);
    }
}

/**
 * Opens the course summary modal on demand (e.g. FAB or admin monitor button).
 * When `manual` is true, skips one-time auto-display gates but still requires a loadable summary.
 */
export async function summonCourseSummary(
    currentClass: activeCourse,
    options?: { manual?: boolean }
): Promise<void> {
    try {
        if (document.querySelector('.course-summary-overlay')) {
            return;
        }

        ensureCourseSummaryStylesheet();

        const response = await fetchCourseSummaryStatus(currentClass);
        if (!summaryPayloadAllowsSummon(response, options?.manual) || !response.summary) {
            console.warn('[COURSE-SUMMARY] Cannot summon: summary not available');
            return;
        }

        await renderCourseSummaryModal(response.summary, currentClass);
    } catch (error) {
        console.error('[COURSE-SUMMARY] Failed to summon course summary:', error);
    }
}

/**
 * Fetches course-summary JSON from the API (live roster counts and catalog dates).
 */
async function fetchCourseSummaryStatus(currentClass: activeCourse): Promise<CourseSummaryStatusResponse> {
    const response = await fetch(`/api/courses/${encodeURIComponent(currentClass.id)}/course-summary/status`, {
        credentials: 'include',
        headers: {
            Accept: 'application/json'
        }
    });

    if (!response.ok) {
        throw new Error(`Course summary request failed: ${response.status}`);
    }

    return (await response.json()) as CourseSummaryStatusResponse;
}

/**
 * Returns whether the summary is technically eligible to show (unlocked, available, not before `availableAt`).
 * Does **not** include `shouldDisplayModal` or “already displayed” checks — see {@link shouldOpenCourseSummaryModal}.
 */
function summaryPayloadAllowsSummon(response: CourseSummaryStatusResponse, manual = false): boolean {
    if (!response.success || !response.summary) {
        return false;
    }

    const summary = response.summary;
    if (!manual && (!summary.isAvailable || summary.status === 'locked')) {
        return false;
    }

    if (!manual && summary.availableAt && new Date(summary.availableAt).getTime() > Date.now()) {
        return false;
    }

    if (manual && summary.status === 'locked' && !summary.isAvailable) {
        return false;
    }

    return true;
}

/**
 * Decides auto-open on first load: `shouldDisplayModal` from API, payload eligibility, not yet shown for this
 * instructor (localStorage + `instructorDisplayStates`).
 */
function shouldOpenCourseSummaryModal(response: CourseSummaryStatusResponse, currentClass: activeCourse): boolean {
    if (!response.shouldDisplayModal || !summaryPayloadAllowsSummon(response) || !response.summary) {
        return false;
    }

    const summary = response.summary;
    const currentInstructorId = getCurrentInstructorId();
    const localDisplayed = getLocalDisplayedState(summary.courseId || currentClass.id, currentInstructorId);
    if (localDisplayed) {
        return false;
    }

    const displayState = getInstructorDisplayState(summary, currentInstructorId);
    return !displayState?.hasBeenDisplayed;
}

/**
 * Builds the modal DOM from the HTML template, hydrates fields, wires navigation and close handlers,
 * and runs the step machine (completion → summary reveals → struggle chart).
 */
async function renderCourseSummaryModal(summary: CourseSummaryRecord, currentClass: activeCourse): Promise<void> {
    await authService.checkAuthStatus();
    const hasAnalyticsSections =
        summary.downloadConversationAvailable || Boolean(summary.struggleTopics);
    const stepOrder = getStepOrder(hasAnalyticsSections);

    const template = await fetchCourseSummaryTemplate();
    const overlay = document.createElement('div');
    overlay.className = 'course-summary-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'course-summary-title');
    overlay.innerHTML = template;

    document.body.appendChild(overlay);
    document.body.classList.add('modal-open');
    configureCourseSummaryAdminOnlySections(overlay, hasAnalyticsSections);
    hydrateSummaryContent(overlay, summary, hasAnalyticsSections);
    renderFeatherIcons();

    const downloadConversationsBtn = overlay.querySelector('#course-summary-download-conversations-btn') as HTMLButtonElement | null;
    downloadConversationsBtn?.addEventListener('click', () => {
        if (!summary.downloadConversationAvailable) {
            return;
        }
        openConversationExportFormatModal(currentClass.id);
    });

    const downloadReportBtn = overlay.querySelector('#course-summary-download-report-btn') as HTMLButtonElement | null;
    downloadReportBtn?.addEventListener('click', () => {
        if (!summary.downloadConversationAvailable) {
            return;
        }
        downloadReportBtn.disabled = true;
        void fetchCourseReportPdf(currentClass.id).catch((err) => {
            alert(`Report download failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }).finally(() => {
            downloadReportBtn.disabled = false;
        });
    });

    let currentStepIndex = 0;

    const closeBtn = overlay.querySelector('#course-summary-close-btn') as HTMLButtonElement | null;
    const nextBtn = overlay.querySelector('#course-summary-next-btn') as HTMLButtonElement | null;

    const closeModal = async (): Promise<void> => {
        bumpMetricCountAnimation(overlay);
        await markCourseSummaryDisplayed(summary, currentClass);
        chartsController.destroyActiveChart();
        window.removeEventListener('keydown', keyHandler);
        overlay.classList.remove('show');
        document.body.classList.remove('modal-open');

        setTimeout(() => {
            overlay.remove();
        }, 250);
    };

    const renderStep = async (): Promise<void> => {
        const activeStep = stepOrder[currentStepIndex];
        setActiveStep(overlay, activeStep);
        setSummaryRevealState(overlay, activeStep, hasAnalyticsSections);
        renderProgress(overlay, activeStep, hasAnalyticsSections);

        if (nextBtn) {
            const isLast = currentStepIndex === stepOrder.length - 1;
            if (isLast) {
                nextBtn.innerHTML = '<i data-feather="x" aria-hidden="true"></i>';
                nextBtn.setAttribute('aria-label', 'Quit');
                renderFeatherIcons();
            } else {
                nextBtn.innerHTML = '<i data-feather="chevron-right" aria-hidden="true"></i>';
                nextBtn.setAttribute('aria-label', 'Next');
                renderFeatherIcons();
            }
        }

        if (stepOrder[currentStepIndex] === 'struggle-topics' && hasAnalyticsSections && summary.struggleTopics) {
            await renderStackedBarGraph(overlay, summary.struggleTopics.stackedBar);
        }

        if (stepOrder[currentStepIndex] === 'metrics') {
            triggerMetricCountUpIfNeeded(overlay);
        }
    };

    const goNext = async (): Promise<void> => {
        if (currentStepIndex >= stepOrder.length - 1) {
            await closeModal();
            return;
        }

        currentStepIndex += 1;
        await renderStep();
    };

    function keyHandler(event: KeyboardEvent): void {
        if (event.key === 'Escape') {
            event.preventDefault();
            void closeModal();
        }

        if (event.key === 'Enter') {
            event.preventDefault();
            void goNext();
        }
    }

    closeBtn?.addEventListener('click', () => void closeModal());
    nextBtn?.addEventListener('click', () => void goNext());
    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) {
            void closeModal();
        }
    });
    window.addEventListener('keydown', keyHandler);

    requestAnimationFrame(() => {
        overlay.classList.add('show');
    });

    await renderStep();
}

/** Fetches the modal HTML fragment used as `innerHTML` for the overlay. */
async function fetchCourseSummaryTemplate(): Promise<string> {
    const response = await fetch(COURSE_SUMMARY_TEMPLATE_URL, {
        headers: {
            'Accept': 'text/html'
        }
    });

    if (!response.ok) {
        throw new Error('Failed to load course summary template');
    }

    return response.text();
}

/** Hides analytics sections in the template when not available from API. */
function configureCourseSummaryAdminOnlySections(overlay: HTMLElement, showAnalyticsSections: boolean): void {
    if (showAnalyticsSections) {
        return;
    }

    overlay.querySelector('[data-course-summary-step="struggle-topics"]')?.setAttribute('hidden', '');
    overlay.querySelector('[data-course-summary-reveal="download"]')?.setAttribute('hidden', '');
}

/** Writes welcome text, dates, metric targets (starting at 0), and topic chips into the overlay. */
function hydrateSummaryContent(
    overlay: HTMLElement,
    summary: CourseSummaryRecord,
    showAnalyticsSections: boolean
): void {
    const instructorName = getCurrentInstructorName(summary);
    const rawCourseName = summary.course.name || summary.courseName;
    const courseName = getShortCourseName(rawCourseName);
    const startDateRaw = summary.course.startDate || '';
    const endDateRaw = summary.course.endDate || '';
    const startDate = startDateRaw ? formatDateForDisplay(startDateRaw) : 'Not available';
    const endDate = endDateRaw ? formatDateForDisplay(endDateRaw) : 'Not available';

    setText(overlay, '#course-summary-welcome', `Welcome Back, ${instructorName}!`);
    setText(overlay, '#course-summary-complete-course', courseName);

    setText(overlay, '#course-summary-summary-title', `${courseName}: Engagement Summary`);

    setText(overlay, '#course-summary-start-date', startDate);
    setText(overlay, '#course-summary-end-date', endDate);

    overlay.dataset.metricStudentsTarget = String(Math.max(0, summary.totals.students));
    overlay.dataset.metricChatsTarget = String(Math.max(0, summary.totals.nonDeletedChats));
    setText(overlay, '#course-summary-students-count', '0');
    setText(overlay, '#course-summary-chats-count', '0');

    if (showAnalyticsSections && summary.struggleTopics?.topTopics) {
        renderTopTopicChips(overlay, summary.struggleTopics.topTopics);
    }
}

/** Toggles which full-screen step (`completion` | `summary` | `struggle-topics`) is active. */
function setActiveStep(overlay: HTMLElement, activeStep: CourseSummaryStep): void {
    const visibleStep = getVisibleStep(activeStep);
    const steps = overlay.querySelectorAll<HTMLElement>('.course-summary-step');
    steps.forEach((step) => {
        step.classList.toggle('course-summary-step--active', step.dataset.courseSummaryStep === visibleStep);
    });
}

/** Collapses internal sub-steps (`overview` / `metrics` / `download`) into the single `summary` panel for layout. */
function getVisibleStep(activeStep: CourseSummaryStep): 'completion' | 'summary' | 'struggle-topics' {
    if (activeStep === 'overview' || activeStep === 'metrics' || activeStep === 'download') {
        return 'summary';
    }

    return activeStep;
}

/** Progressive disclosure within the summary step: dates, then metrics, then download row (admin only). */
function setSummaryRevealState(
    overlay: HTMLElement,
    activeStep: CourseSummaryStep,
    isPlatformAdmin: boolean
): void {
    const revealOrder: CourseSummaryRevealStep[] = isPlatformAdmin
        ? ['overview', 'metrics', 'download']
        : ['overview', 'metrics'];
    const activeRevealIndex = revealOrder.indexOf(activeStep as CourseSummaryRevealStep);
    const revealBlocks = overlay.querySelectorAll<HTMLElement>('[data-course-summary-reveal]');

    revealBlocks.forEach((block) => {
        const blockStep = block.dataset.courseSummaryReveal as CourseSummaryRevealStep | undefined;
        const blockIndex = blockStep ? revealOrder.indexOf(blockStep) : -1;
        const shouldShow = activeRevealIndex >= 0 && blockIndex >= 0 && blockIndex <= activeRevealIndex;
        block.classList.toggle('course-summary-reveal-block--visible', shouldShow);
    });
}

/** Renders progress dots: completion / summary / struggle-topics (admin) or completion / summary (instructor). */
function renderProgress(
    overlay: HTMLElement,
    activeStep: CourseSummaryStep,
    isPlatformAdmin: boolean
): void {
    const progress = overlay.querySelector('#course-summary-progress');
    if (!progress) return;

    progress.innerHTML = '';
    const progressSteps = isPlatformAdmin
        ? (['completion', 'summary', 'struggle-topics'] as const)
        : (['completion', 'summary'] as const);
    const activeVisibleStep = getVisibleStep(activeStep);

    progressSteps.forEach((step) => {
        const dot = document.createElement('span');
        dot.className = 'course-summary-progress-dot';
        if (step === activeVisibleStep) {
            dot.classList.add('course-summary-progress-dot--active');
        }
        progress.appendChild(dot);
    });
}

/** Populates the struggle-topics chip list under the chart. */
function renderTopTopicChips(overlay: HTMLElement, topTopics: CourseSummaryTopTopic[]): void {
    const list = overlay.querySelector('#course-summary-topic-list');
    if (!list) return;

    list.innerHTML = '';
    topTopics.forEach((topic) => {
        const chip = document.createElement('span');
        chip.className = 'course-summary-topic-chip';
        chip.textContent = `${topic.topic}: ${topic.studentCount} students`;
        list.appendChild(chip);
    });
}

/**
 * Renders the struggle-topics stacked bar on the modal canvas via {@link chartsController}.
 */
async function renderStackedBarGraph(overlay: HTMLElement, stackedBar: CourseSummaryStackedBar): Promise<void> {
    const canvas = overlay.querySelector('#course-summary-struggle-chart') as HTMLCanvasElement | null;
    if (!stackedBar.categories?.length || !stackedBar.series?.length) {
        chartsController.destroyActiveChart();
        return;
    }
    const spec = mapCourseSummaryStackedBarToChartSpec(stackedBar);
    await chartsController.renderStackedBarChart(canvas, spec);
}

/**
 * Records that the current instructor has seen the summary (localStorage + in-memory payload mutation).
 * Server persistence is TODO.
 */
async function markCourseSummaryDisplayed(summary: CourseSummaryRecord, currentClass: activeCourse): Promise<void> {
    const instructorUserId = getCurrentInstructorId();
    setLocalDisplayedState(summary.courseId || currentClass.id, instructorUserId);

    const now = new Date().toISOString();
    const existingState = getInstructorDisplayState(summary, instructorUserId);
    if (existingState) {
        existingState.hasBeenDisplayed = true;
        existingState.firstDisplayedAt = existingState.firstDisplayedAt || now;
        existingState.lastDisplayedAt = now;
        existingState.displayCount += 1;
    }

    // TODO: Replace localStorage with PATCH /api/courses/:courseId/course-summary/displayed.
}

/** Looks up per-instructor display metadata on the summary record (mock / future API). */
function getInstructorDisplayState(
    summary: CourseSummaryRecord,
    instructorUserId: string
): CourseSummaryInstructorDisplayState | null {
    return summary.instructorDisplayStates.find((state) => state.instructorUserId === instructorUserId) || null;
}

/** Authenticated user id, or mock default `instructorA`. */
function getCurrentInstructorId(): string {
    return authService.getAuthState().user?.userId || 'instructorA';
}

/** Display name from auth session, else from summary `instructorDisplayStates`, else `Instructor`. */
function getCurrentInstructorName(summary: CourseSummaryRecord): string {
    const authUser = authService.getAuthState().user;
    if (authUser?.name) {
        return authUser.name;
    }

    const displayState = getInstructorDisplayState(summary, getCurrentInstructorId());
    return displayState?.instructorName || 'Instructor';
}

/** Whether localStorage indicates this instructor already saw the summary for the course. */
function getLocalDisplayedState(courseId: string, instructorUserId: string): boolean {
    if (!courseId || !instructorUserId) {
        return false;
    }

    return localStorage.getItem(getLocalDisplayedKey(courseId, instructorUserId)) === 'true';
}

/** Marks summary as displayed for this course + instructor in localStorage. */
function setLocalDisplayedState(courseId: string, instructorUserId: string): void {
    if (!courseId || !instructorUserId) {
        return;
    }

    localStorage.setItem(getLocalDisplayedKey(courseId, instructorUserId), 'true');
}

/** Stable localStorage key for the course-summary display flag. */
function getLocalDisplayedKey(courseId: string, instructorUserId: string): string {
    return `course-summary-displayed:${courseId}:${instructorUserId}`;
}

/** Injects the course-summary stylesheet once per page. */
function ensureCourseSummaryStylesheet(): void {
    if (document.getElementById(COURSE_SUMMARY_CSS_ID)) {
        return;
    }

    const link = document.createElement('link');
    link.id = COURSE_SUMMARY_CSS_ID;
    link.rel = 'stylesheet';
    link.href = COURSE_SUMMARY_CSS_HREF;
    document.head.appendChild(link);
}

/** Sets `textContent` on the first match of `selector` under `root`, if found. */
function setText(root: HTMLElement, selector: string, value: string): void {
    const element = root.querySelector(selector);
    if (element) {
        element.textContent = value;
    }
}

/** Extracts a short code like `CHBE 241` from a full course title for headings. */
function getShortCourseName(courseName: string): string {
    const trimmed = courseName.trim();
    const match = trimmed.match(/^([A-Z]{2,}\s*\d+[A-Z]?)/);
    return match?.[1] || trimmed || 'Course';
}

/** Formats a date for summary date rows using the runtime locale. */
function formatDateForDisplay(value: Date | string): string {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
        return 'Not available';
    }

    return new Intl.DateTimeFormat(undefined, {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
    }).format(date);
}
