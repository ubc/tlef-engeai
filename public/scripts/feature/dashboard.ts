// public/scripts/feature/dashboard.ts
/**
 * Dashboard — instructor home cards, course-code topbar, and Advanced Settings.
 *
 * Renders curated navigation cards; Writing Feedback and Pathway Library appear
 * only when their course capabilities are enabled. Owns click-to-reveal course
 * code for all staff, and Advanced Settings (feature toggles + course metadata)
 * for faculty instructors and platform admins. Extra Feature Save is dirty-gated
 * like Model Settings. Dispatches `course-feature-changed` after successful
 * capability PATCHes.
 *
 * @author: EngE-AI Team
 * @date: 2026-07-29
 * @version: 2.3.0
 * @description: Instructor dashboard with inline Advanced Settings accordions + model settings.
 */

import { activeCourse, CourseFeatures, InstructorInfo } from '../types.js';
import { navigateToInstructorView } from '../utils/url-parser.js';
import { renderFeatherIcons } from '../api/api.js';
import { authService } from '../services/auth-service.js';
import { showErrorModal } from '../ui/modal-overlay.js';
import { showErrorToast, showSuccessToast } from '../ui/toast-notification.js';
import { initializeModelSettings, refreshModelSettingsVisibility } from './model-setting.js';

interface DashboardCardDef {
    view: string;
    title: string;
    feather: string;
    feature?: 'writingFeedback' | 'guidedPathway';
}

type FeatureKey = keyof CourseFeatures;

const CARD_DEFS: DashboardCardDef[] = [
    { view: 'documents', title: 'Documents', feather: 'file-text' },
    { view: 'chat', title: 'Chat with EngE-AI', feather: 'message-circle' },
    { view: 'assistant-prompts', title: 'Initial Assistant Prompt', feather: 'sun' },
    { view: 'system-prompts', title: 'System Prompt', feather: 'sliders' },
    { view: 'monitor', title: 'Monitor', feather: 'monitor' },
    { view: 'writing-feedback', title: 'Writing Feedback', feather: 'edit-3', feature: 'writingFeedback' },
    { view: 'pathway-library', title: 'Pathway Library', feather: 'git-branch', feature: 'guidedPathway' }
];

const FEATURE_ENDPOINTS: Record<FeatureKey, string> = {
    writingFeedback: 'writing-feedback',
    memoryAgent: 'memory-agent',
    guidedPathway: 'guided-pathway'
};

const FEATURE_INPUT_IDS: Record<FeatureKey, string> = {
    writingFeedback: 'settingsWritingFeedback',
    memoryAgent: 'settingsMemoryAgent',
    guidedPathway: 'settingsGuidedPathway'
};

/**
 * initializeDashboard - render greeting, cards, course-code topbar, and Advanced Settings.
 *
 * @param currentClass - Active course used for feature gating and metadata
 */
export async function initializeDashboard(currentClass: activeCourse): Promise<void> {
    renderWelcomeHeader();
    renderDashboardCards(currentClass);
    wireCourseCodeFlip(currentClass);
    await wireAdvancedSettings(currentClass);
    renderFeatherIcons();
}

/**
 * firstNameFromDisplayName - take the leading token for a short greeting.
 *
 * @param fullName - Auth display name (may be empty)
 * @returns First name token, or empty string when missing
 */
function firstNameFromDisplayName(fullName: string | undefined): string {
    const trimmed = (fullName || '').trim();
    if (!trimmed) return '';
    return trimmed.split(/\s+/)[0] || '';
}

/**
 * greetingForHour - map local hour to Good morning / afternoon / evening.
 *
 * @param hour - Local hour 0–23
 * @returns Greeting phrase without punctuation
 */
function greetingForHour(hour: number): string {
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
}

/**
 * renderWelcomeHeader - fill personalized greeting and today's date.
 */
function renderWelcomeHeader(): void {
    const welcomeEl = document.getElementById('dashboard-welcome');
    const dateEl = document.getElementById('dashboard-date');
    const now = new Date();
    const greeting = greetingForHour(now.getHours());

    const firstName = firstNameFromDisplayName(authService.getAuthState().user?.name);
    if (welcomeEl) {
        welcomeEl.textContent = firstName
            ? `${greeting}, ${firstName}. Welcome to EngE-AI.`
            : `${greeting}. Welcome to EngE-AI.`;
    }
    if (dateEl) {
        dateEl.textContent = new Intl.DateTimeFormat(undefined, {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        }).format(now);
    }
}

const CARD_TRANSITION_MS = 320;

/** Cancels overlapping card leave/enter animations when features toggle quickly. */
let dashboardCardAnimToken = 0;

/**
 * prefersReducedMotion - honor OS reduced-motion for card appear/disappear.
 */
function prefersReducedMotion(): boolean {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * createDashboardCard - build one navigable dashboard card button.
 */
function createDashboardCard(card: DashboardCardDef): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dashboard-card';
    btn.dataset.view = card.view;
    btn.setAttribute('role', 'listitem');
    btn.innerHTML = `
        <span class="dashboard-card-title">${escapeHtml(card.title)}</span>
        <span class="dashboard-card-cta" aria-hidden="true">Learn more <i data-feather="arrow-right" aria-hidden="true"></i></span>
        <i class="dashboard-card-icon" data-feather="${card.feather}" aria-hidden="true"></i>`;
    btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        if (view) navigateToInstructorView(view);
    });
    return btn;
}

/**
 * syncDashboardCardOrder - reorder existing cards and insert missing ones.
 *
 * New cards use a keyframe appear animation (avoids rAF class-toggle races).
 */
function syncDashboardCardOrder(
    container: HTMLElement,
    desired: DashboardCardDef[],
    animateEnter: boolean
): void {
    const byView = new Map(
        [...container.querySelectorAll<HTMLButtonElement>('.dashboard-card')].map((el) => [
            el.dataset.view!,
            el
        ])
    );

    const entered: HTMLButtonElement[] = [];

    for (const card of desired) {
        let el = byView.get(card.view);
        if (!el) {
            el = createDashboardCard(card);
            if (animateEnter) {
                el.classList.add('dashboard-card--is-appearing');
            }
            container.appendChild(el);
            byView.set(card.view, el);
            entered.push(el);
        } else {
            el.classList.remove('dashboard-card--is-appearing', 'dashboard-card--is-disappearing');
            container.appendChild(el);
        }
    }

    // Replace feather icons after mount so SVG swap does not interrupt the appear keyframe.
    renderFeatherIcons();

    if (animateEnter) {
        for (const el of entered) {
            el.addEventListener(
                'animationend',
                (event) => {
                    if (event.target !== el || event.animationName !== 'dashboard-card-appear') return;
                    el.classList.remove('dashboard-card--is-appearing');
                },
                { once: true }
            );
        }
    }
}

/**
 * renderDashboardCards - rebuild the card grid from current course features.
 *
 * Optional Writing Feedback / Pathway Library cards animate out when disabled
 * and animate in when enabled (skipped when prefers-reduced-motion).
 *
 * @param currentClass - Active course whose features gate optional cards
 */
export function renderDashboardCards(currentClass: activeCourse): void {
    const container = document.getElementById('dashboard-cards');
    if (!container) return;

    const desired = CARD_DEFS.filter((card) => {
        if (!card.feature) return true;
        return currentClass.features?.[card.feature]?.enabled === true;
    });
    const desiredViews = new Set(desired.map((card) => card.view));
    const existing = [...container.querySelectorAll<HTMLButtonElement>('.dashboard-card')];
    const reduceMotion = prefersReducedMotion();
    const token = ++dashboardCardAnimToken;

    // First paint: mount without per-card appear (grid already has enter animation).
    if (existing.length === 0) {
        syncDashboardCardOrder(container, desired, false);
        return;
    }

    const leaving = existing.filter((el) => !desiredViews.has(el.dataset.view || ''));

    const applyDesired = (): void => {
        if (token !== dashboardCardAnimToken) return;
        leaving.forEach((el) => el.remove());
        syncDashboardCardOrder(container, desired, !reduceMotion);
    };

    if (leaving.length === 0 || reduceMotion) {
        leaving.forEach((el) => el.remove());
        syncDashboardCardOrder(container, desired, !reduceMotion && existing.length > 0);
        return;
    }

    let finished = false;
    const finishOnce = (): void => {
        if (finished) return;
        finished = true;
        applyDesired();
    };

    leaving.forEach((el) => {
        el.classList.add('dashboard-card--is-disappearing');
        // Only the card's own opacity transition — child CTA transitions bubble otherwise.
        el.addEventListener(
            'transitionend',
            (event) => {
                if (event.target !== el || event.propertyName !== 'opacity') return;
                finishOnce();
            },
            { once: true }
        );
    });
    window.setTimeout(finishOnce, CARD_TRANSITION_MS + 50);
}

/**
 * wireCourseCodeFlip - flip card on header right: ***** → course code + copy.
 *
 * @param currentClass - Active course providing courseCode
 */
function wireCourseCodeFlip(currentClass: activeCourse): void {
    const flipRoot = document.getElementById('dashboard-code-flip');
    const flipBtn = document.getElementById('dashboard-code-flip-btn') as HTMLButtonElement | null;
    const hideBtn = document.getElementById('dashboard-code-hide-btn') as HTMLButtonElement | null;
    const maskedEl = document.getElementById('dashboardCourseCodeMasked');
    const codeEl = document.getElementById('dashboardCourseCodeDisplay');
    const copyBtn = document.getElementById('dashboardCopyCourseCodeBtn') as HTMLButtonElement | null;

    const hasCode = Boolean(currentClass.courseCode);

    const setRevealed = (revealed: boolean): void => {
        flipRoot?.classList.toggle('is-revealed', revealed);
        flipBtn?.setAttribute('aria-expanded', String(revealed));
        if (flipBtn) {
            flipBtn.setAttribute('aria-label', revealed ? 'Course code visible' : 'Show course code');
        }
    };

    if (codeEl) {
        if (hasCode) {
            codeEl.textContent = currentClass.courseCode!;
            codeEl.classList.remove('is-unset');
        } else {
            codeEl.textContent = 'Not set';
            codeEl.classList.add('is-unset');
        }
    }

    if (maskedEl && !hasCode) {
        maskedEl.textContent = 'Not set';
        maskedEl.classList.add('is-unset');
    }

    if (!hasCode) {
        flipBtn?.setAttribute('disabled', '');
        flipBtn?.setAttribute('aria-label', 'Course code not set');
        copyBtn?.setAttribute('disabled', '');
        return;
    }

    flipBtn?.addEventListener('click', () => setRevealed(true));
    hideBtn?.addEventListener('click', () => setRevealed(false));

    copyBtn?.addEventListener('click', async (event) => {
        event.stopPropagation();
        if (!currentClass.courseCode) return;
        try {
            await navigator.clipboard.writeText(currentClass.courseCode);
            const originalHTML = copyBtn.innerHTML;
            copyBtn.classList.add('is-copied');
            copyBtn.innerHTML = '<i data-feather="check"></i>';
            renderFeatherIcons();
            setTimeout(() => {
                copyBtn.innerHTML = originalHTML;
                copyBtn.classList.remove('is-copied');
                renderFeatherIcons();
            }, 2000);
        } catch {
            await showErrorModal('Copy Failed', 'Failed to copy course code to clipboard. Please try again.');
        }
    });
}

/**
 * bindAccordionToggle - wire inline expand/collapse for a dashboard accordion item.
 *
 * @param itemId - `.dashboard-accordion-item` element id
 * @param toggleId - Button element id
 * @param bodyId - Body element id
 * @param canExpand - When false, toggle stays disabled and body closed
 */
function bindAccordionToggle(itemId: string, toggleId: string, bodyId: string, canExpand: boolean): void {
    const item = document.getElementById(itemId);
    const toggle = document.getElementById(toggleId) as HTMLButtonElement | null;
    const body = document.getElementById(bodyId);
    if (!item || !toggle || !body) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const setOpen = (open: boolean): void => {
        toggle.setAttribute('aria-expanded', String(open));
        item.classList.toggle('is-open', open);
        if (prefersReducedMotion) {
            body.hidden = !open;
        }
    };

    if (!canExpand) {
        toggle.disabled = true;
        setOpen(false);
        if (prefersReducedMotion) body.hidden = true;
        return;
    }

    toggle.addEventListener('click', () => {
        const open = toggle.getAttribute('aria-expanded') === 'true';
        setOpen(!open);
    });
}

/**
 * wireAdvancedSettings - inline accordions: model, features (managers), course info (all staff).
 *
 * @param currentClass - Active course for toggles and metadata
 */
async function wireAdvancedSettings(currentClass: activeCourse): Promise<void> {
    const featuresTaNote = document.getElementById('dashboard-features-ta-note');
    const canManage = await resolveCanManage(currentClass);

    fillCourseMetadata(currentClass);

    await initializeModelSettings(currentClass, canManage);

    bindAccordionToggle('dashboard-model-accordion', 'dashboard-model-toggle', 'dashboard-model-body', true);
    bindAccordionToggle('dashboard-features-accordion', 'dashboard-features-toggle', 'dashboard-features-body', canManage);
    bindAccordionToggle('dashboard-course-info-accordion', 'dashboard-course-info-toggle', 'dashboard-course-info-body', true);

    if (featuresTaNote) featuresTaNote.hidden = canManage;

    await wireFeatureToggles(currentClass, canManage);
}

/**
 * resolveCanManage - faculty instructor or platform admin (not TA).
 *
 * @param currentClass - Course whose instructors list is checked
 * @returns Whether the current user may edit capabilities / open Advanced Settings
 */
async function resolveCanManage(currentClass: activeCourse): Promise<boolean> {
    try {
        const currentUserResponse = await fetch('/auth/current-user', { credentials: 'same-origin' });
        const currentUserData = currentUserResponse.ok ? await currentUserResponse.json() : {};
        const currentUser = currentUserData.globalUser;
        const instructorIds = (currentClass.instructors ?? []).map((item: string | InstructorInfo) =>
            typeof item === 'string' ? item : item.userId
        );
        return Boolean(currentUser?.isAdmin === true || instructorIds.includes(currentUser?.userId));
    } catch {
        return false;
    }
}

/**
 * fillCourseMetadata - populate Advanced Settings course information fields.
 *
 * @param currentClass - Active course metadata source
 */
function fillCourseMetadata(currentClass: activeCourse): void {
    const courseNameEl = document.getElementById('courseInfoCourseName');
    if (courseNameEl) courseNameEl.textContent = currentClass.courseName || 'Not set';

    const instructorsEl = document.getElementById('courseInfoInstructors');
    if (instructorsEl) {
        instructorsEl.textContent = formatInstructorsForDisplay(currentClass.instructors || []);
    }

    const tasEl = document.getElementById('courseInfoTAs');
    if (tasEl) tasEl.textContent = formatNamesForDisplay(currentClass.teachingAssistants || []);

    const byWeekRadio = document.getElementById('courseInfoByWeek') as HTMLInputElement | null;
    const byTopicRadio = document.getElementById('courseInfoByTopic') as HTMLInputElement | null;
    if (byWeekRadio && byTopicRadio) {
        byWeekRadio.checked = currentClass.frameType === 'byWeek';
        byTopicRadio.checked = currentClass.frameType !== 'byWeek';
    }

    const contentCountInput = document.getElementById('courseInfoContentCount') as HTMLInputElement | null;
    if (contentCountInput) {
        contentCountInput.value = (currentClass.tilesNumber ?? 0).toString();
    }

    const descriptionElement = document.getElementById('courseInfoCountDescription');
    if (descriptionElement) {
        descriptionElement.textContent =
            currentClass.frameType === 'byWeek'
                ? 'How many weeks are in your course?'
                : 'How many topics are in your course?';
    }
}

type FeatureEnabledSnapshot = Record<FeatureKey, boolean>;

/**
 * readFeatureCheckboxSnapshot - current Extra Feature checkbox enabled flags.
 */
function readFeatureCheckboxSnapshot(): FeatureEnabledSnapshot {
    const snapshot = {} as FeatureEnabledSnapshot;
    for (const key of Object.keys(FEATURE_INPUT_IDS) as FeatureKey[]) {
        const input = document.getElementById(FEATURE_INPUT_IDS[key]) as HTMLInputElement | null;
        snapshot[key] = input?.checked === true;
    }
    return snapshot;
}

/**
 * featureSnapshotFromCourse - enabled flags from persisted course features.
 */
function featureSnapshotFromCourse(currentClass: activeCourse): FeatureEnabledSnapshot {
    const snapshot = {} as FeatureEnabledSnapshot;
    for (const key of Object.keys(FEATURE_INPUT_IDS) as FeatureKey[]) {
        snapshot[key] = currentClass.features?.[key]?.enabled === true;
    }
    return snapshot;
}

/**
 * wireFeatureToggles - bind capability checkboxes and save for roster managers.
 *
 * Save stays disabled until checkboxes differ from the last persisted snapshot
 * (same dirty-gate pattern as Model Settings).
 *
 * @param currentClass - Course whose features are edited
 * @param canManage - Whether inputs should be enabled
 */
async function wireFeatureToggles(currentClass: activeCourse, canManage: boolean): Promise<void> {
    let persistedFeatures = featureSnapshotFromCourse(currentClass);
    let isSaving = false;

    for (const key of Object.keys(FEATURE_INPUT_IDS) as FeatureKey[]) {
        const input = document.getElementById(FEATURE_INPUT_IDS[key]) as HTMLInputElement | null;
        if (input) {
            input.checked = persistedFeatures[key];
            input.disabled = !canManage;
            input.addEventListener('change', () => updateFeatureSaveButtonState());
        }
    }

    const saveBtn = document.getElementById('saveCourseFeatures') as HTMLButtonElement | null;

    function updateFeatureSaveButtonState(): void {
        if (!saveBtn) return;
        const dirty =
            JSON.stringify(readFeatureCheckboxSnapshot()) !== JSON.stringify(persistedFeatures);
        saveBtn.disabled = !canManage || isSaving || !dirty;
    }

    updateFeatureSaveButtonState();

    saveBtn?.addEventListener('click', async () => {
        if (!canManage || isSaving) return;
        isSaving = true;
        updateFeatureSaveButtonState();

        const snapshot = currentClass.features
            ? {
                  writingFeedback: currentClass.features.writingFeedback
                      ? { ...currentClass.features.writingFeedback }
                      : undefined,
                  memoryAgent: currentClass.features.memoryAgent
                      ? { ...currentClass.features.memoryAgent }
                      : undefined,
                  guidedPathway: currentClass.features.guidedPathway
                      ? { ...currentClass.features.guidedPathway }
                      : undefined,
              }
            : undefined;
        let appliedAny = false;

        try {
            const keys = Object.keys(FEATURE_ENDPOINTS) as FeatureKey[];
            for (const key of keys) {
                const input = document.getElementById(FEATURE_INPUT_IDS[key]) as HTMLInputElement;
                const desired = input.checked;
                const already = currentClass.features?.[key]?.enabled === true;
                if (desired === already) continue;

                const response = await fetch(
                    `/api/courses/${encodeURIComponent(currentClass.id)}/features/${FEATURE_ENDPOINTS[key]}`,
                    {
                        method: 'PATCH',
                        credentials: 'same-origin',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ enabled: desired })
                    }
                );
                const result = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(result.error || `Failed to update ${key}`);

                appliedAny = true;
                currentClass.features = result.data?.features ?? {
                    ...currentClass.features,
                    [key]: { enabled: desired }
                };
                window.dispatchEvent(
                    new CustomEvent('course-feature-changed', {
                        detail: { feature: key, enabled: desired }
                    })
                );
            }
            persistedFeatures = featureSnapshotFromCourse(currentClass);
            showSuccessToast('Extra Feature settings saved.');
            renderDashboardCards(currentClass);
            refreshModelSettingsVisibility(currentClass);
        } catch (error) {
            currentClass.features = snapshot;
            for (const key of Object.keys(FEATURE_INPUT_IDS) as FeatureKey[]) {
                const input = document.getElementById(FEATURE_INPUT_IDS[key]) as HTMLInputElement | null;
                if (input) input.checked = currentClass.features?.[key]?.enabled === true;
            }
            persistedFeatures = featureSnapshotFromCourse(currentClass);
            renderDashboardCards(currentClass);
            refreshModelSettingsVisibility(currentClass);
            await showErrorModal(
                'Save Failed',
                error instanceof Error ? error.message : 'Failed to save feature settings.'
            );
            showErrorToast(
                appliedAny
                    ? 'Some Extra Feature updates may have been applied. Reload and retry.'
                    : 'Extra Feature settings were not changed.'
            );
        } finally {
            isSaving = false;
            updateFeatureSaveButtonState();
        }
    });
}

function getDisplayName(item: string | InstructorInfo): string {
    if (typeof item === 'string') return item;
    if (item && item.name) return item.name;
    return item?.userId || 'Unknown';
}

function formatNamesForDisplay(arr: string[] | InstructorInfo[]): string {
    if (!arr || arr.length === 0) return 'None';
    return arr.map((item) => getDisplayName(item)).join(', ');
}

function formatInstructorsForDisplay(arr: string[] | InstructorInfo[]): string {
    if (!arr || arr.length === 0) return 'None';
    return arr.map((item) => getDisplayName(item)).join(', ');
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
