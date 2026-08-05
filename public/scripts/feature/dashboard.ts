// public/scripts/feature/dashboard.ts
/**
 * Dashboard — instructor home cards, course-code topbar, and Advanced Settings.
 *
 * Renders curated navigation cards; Writing Feedback and Pathway Library appear
 * only when their course capabilities are enabled. Owns click-to-reveal course
 * code for all staff, and Advanced Settings (feature toggles + course metadata)
 * for faculty instructors and platform admins. Dispatches `course-feature-changed`
 * after successful capability PATCHes.
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
import { initializeModelSettings } from './model-setting.js';

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

const EXCLUDED_INSTRUCTOR_NAMES = ['Charisma Rusdiyanto', 'Richard Tape'];

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

/**
 * renderDashboardCards - rebuild the card grid from current course features.
 *
 * @param currentClass - Active course whose features gate optional cards
 */
export function renderDashboardCards(currentClass: activeCourse): void {
    const container = document.getElementById('dashboard-cards');
    if (!container) return;

    const cards = CARD_DEFS.filter((card) => {
        if (!card.feature) return true;
        return currentClass.features?.[card.feature]?.enabled === true;
    });

    container.innerHTML = cards
        .map(
            (card) => `
        <button type="button" class="dashboard-card" data-view="${card.view}" role="listitem">
            <span class="dashboard-card-title">${escapeHtml(card.title)}</span>
            <span class="dashboard-card-cta" aria-hidden="true">Learn more <i data-feather="arrow-right" aria-hidden="true"></i></span>
            <i class="dashboard-card-icon" data-feather="${card.feather}" aria-hidden="true"></i>
        </button>`
        )
        .join('');

    container.querySelectorAll<HTMLButtonElement>('.dashboard-card').forEach((btn) => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.view;
            if (view) navigateToInstructorView(view);
        });
    });

    renderFeatherIcons();
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

/**
 * wireFeatureToggles - bind capability checkboxes and save for roster managers.
 *
 * @param currentClass - Course whose features are edited
 * @param canManage - Whether inputs should be enabled
 */
async function wireFeatureToggles(currentClass: activeCourse, canManage: boolean): Promise<void> {
    for (const key of Object.keys(FEATURE_INPUT_IDS) as FeatureKey[]) {
        const input = document.getElementById(FEATURE_INPUT_IDS[key]) as HTMLInputElement | null;
        if (input) {
            input.checked = currentClass.features?.[key]?.enabled === true;
            input.disabled = !canManage;
        }
    }

    const saveBtn = document.getElementById('saveCourseFeatures') as HTMLButtonElement | null;
    const statusEl = document.getElementById('settingsFeatureStatus');
    if (saveBtn) saveBtn.disabled = !canManage;

    saveBtn?.addEventListener('click', async () => {
        if (!canManage) return;
        saveBtn.disabled = true;
        if (statusEl) statusEl.textContent = 'Saving…';

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
            if (statusEl) statusEl.textContent = 'Feature settings saved.';
            renderDashboardCards(currentClass);
        } catch (error) {
            for (const key of Object.keys(FEATURE_INPUT_IDS) as FeatureKey[]) {
                const input = document.getElementById(FEATURE_INPUT_IDS[key]) as HTMLInputElement | null;
                if (input) input.checked = currentClass.features?.[key]?.enabled === true;
            }
            await showErrorModal(
                'Save Failed',
                error instanceof Error ? error.message : 'Failed to save feature settings.'
            );
            if (statusEl) statusEl.textContent = 'Feature settings were not changed.';
        } finally {
            saveBtn.disabled = !canManage;
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
    const names = arr
        .map((item) => getDisplayName(item))
        .filter((name) => !EXCLUDED_INSTRUCTOR_NAMES.includes(name));
    return names.length > 0 ? names.join(', ') : 'None';
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
