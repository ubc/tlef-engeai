// public/scripts/entry/admin-course-selection.ts

/**
 * Admin course selection — periods, courses, edit buttons, create modals.
 */

import { GlobalUser, AcademicPeriodDocument, activeCourse, InstructorInfo } from '../types.js';
import { ModalOverlay, showErrorModal, showConfirmModal } from '../ui/modal-overlay.js';
import { createAdminEditButton } from '../ui/admin-edit-button.js';
import {
    createUserSearchMultiSelect,
    type FacultyPickerUser
} from '../ui/user-search-multi-select.js';
import { authService } from '../services/auth-service.js';
import { inactivityTracker } from '../services/inactivity-tracker.js';
import { AdminGuidedPathwayFlagsController } from '../feature/admin-guided-pathway-flags.js';

interface AdminPeriodSection extends AcademicPeriodDocument {
    courseCount: number;
    courses: (activeCourse & { instructorDisplay?: string })[];
}

interface AdminCourseSelectionPayload {
    periods: AdminPeriodSection[];
    defaultPeriodId: string;
    defaultPeriodTitle: string;
    guidedPathwayEscalationsAwaitingReview: number;
}

let currentGlobalUser: GlobalUser | null = null;
let pageData: AdminCourseSelectionPayload | null = null;
let notificationButtonBound = false;
let escalationsPanelOpen = false;
let escalationsPanelClosing = false;
let escalationsController: AdminGuidedPathwayFlagsController | null = null;
let escalationsModal: ModalOverlay | null = null;
let escalationsEscapeHandler: ((event: KeyboardEvent) => void) | null = null;
const ESCALATIONS_CLOSE_MS = 350;
const COURSE_COL_MIN_PCT = 40;
const COURSE_COL_MAX_PCT = 60;
let splitHandleBound = false;

function setSplitHandleVisible(visible: boolean): void {
    const handle = document.getElementById('admin-split-handle');
    if (!handle) return;
    if (visible) {
        handle.removeAttribute('hidden');
        handle.removeAttribute('inert');
    } else {
        handle.setAttribute('hidden', '');
        handle.setAttribute('inert', '');
    }
}

function courseColPctFromWrapper(wrapper: HTMLElement): number {
    const raw = wrapper.style.getPropertyValue('--admin-course-col').trim();
    const parsed = parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : 50;
}

function setCourseColPct(wrapper: HTMLElement, pct: number): void {
    const clamped = Math.min(COURSE_COL_MAX_PCT, Math.max(COURSE_COL_MIN_PCT, pct));
    wrapper.style.setProperty('--admin-course-col', `${clamped}%`);
    const handle = document.getElementById('admin-split-handle');
    handle?.setAttribute('aria-valuenow', String(Math.round(clamped)));
}

function setupSplitHandle(): void {
    if (splitHandleBound) return;
    const handle = document.getElementById('admin-split-handle');
    const wrapper = document.querySelector<HTMLElement>('.admin-course-selection-wrapper');
    if (!handle || !wrapper) return;
    splitHandleBound = true;

    handle.addEventListener('pointerdown', (event) => {
        if (!escalationsPanelOpen || window.matchMedia('(max-width: 768px)').matches) return;
        event.preventDefault();
        handle.setPointerCapture(event.pointerId);
        wrapper.classList.add('admin-course-selection-wrapper--resizing');
        const startX = event.clientX;
        const width = wrapper.getBoundingClientRect().width || 1;
        const main = wrapper.querySelector('.admin-course-selection-main');
        const startPct = main
            ? (main.getBoundingClientRect().width / width) * 100
            : courseColPctFromWrapper(wrapper);

        const onMove = (moveEvent: PointerEvent) => {
            setCourseColPct(wrapper, startPct + ((moveEvent.clientX - startX) / width) * 100);
        };
        const onUp = () => {
            wrapper.classList.remove('admin-course-selection-wrapper--resizing');
            handle.removeEventListener('pointermove', onMove);
            handle.removeEventListener('pointerup', onUp);
        };
        handle.addEventListener('pointermove', onMove);
        handle.addEventListener('pointerup', onUp);
    });

    handle.addEventListener('keydown', (event) => {
        if (!escalationsPanelOpen) return;
        if (event.key === 'ArrowLeft') {
            event.preventDefault();
            setCourseColPct(wrapper, courseColPctFromWrapper(wrapper) - 2);
        }
        if (event.key === 'ArrowRight') {
            event.preventDefault();
            setCourseColPct(wrapper, courseColPctFromWrapper(wrapper) + 2);
        }
    });
}

async function initializeAdminCourseSelection(): Promise<void> {
    try {
        showLoading(true);
        const userResponse = await fetch('/auth/current-user');
        if (!userResponse.ok) {
            throw new Error('Failed to fetch user');
        }
        const authData = await userResponse.json();
        if (!authData.authenticated || !authData.globalUser) {
            window.location.href = '/';
            return;
        }
        if (authData.globalUser.isAdmin !== true) {
            window.location.href = '/course-selection';
            return;
        }

        currentGlobalUser = authData.globalUser;
        const userNameEl = document.getElementById('user-name');
        if (userNameEl) {
            userNameEl.textContent = authData.globalUser.name.split(' ')[0];
        }

        setupLogoutButton();
        setupCreatePeriodButton();
        setupNotificationButton();
        setupSplitHandle();
        await loadAdminData({ promptEscalations: true });
    } catch (error) {
        console.error('[ADMIN-COURSE-SELECTION]', error);
        showLoading(false);
        showError(true);
    }
}

async function loadAdminData(options?: { promptEscalations?: boolean }): Promise<void> {
    const response = await fetch('/api/admin/course-selection', { credentials: 'same-origin' });
    if (!response.ok) {
        throw new Error('Failed to load admin course selection');
    }
    const json = await response.json();
    pageData = json.data as AdminCourseSelectionPayload;
    updateNotificationCount(pageData.guidedPathwayEscalationsAwaitingReview);
    renderPeriodSections();
    showLoading(false);
    showError(false);
    replaceFeather();
    if (options?.promptEscalations) {
        await maybePromptEscalations();
    }
}

async function maybePromptEscalations(): Promise<void> {
    const count = pageData?.guidedPathwayEscalationsAwaitingReview ?? 0;
    if (count <= 0 || escalationsPanelOpen || escalationsPanelClosing) return;

    const noun = count === 1 ? 'message' : 'messages';
    const result = await showConfirmModal(
        'Escalations awaiting review',
        `You have ${count} unreviewed escalated ${noun}. Open the escalations panel to review them.`,
        'View escalations',
        'Not now'
    );
    if (result.action === 'view-escalations') {
        await openEscalationsPanel();
    }
}

function renderPeriodSections(): void {
    const container = document.getElementById('period-sections');
    if (!container || !pageData) {
        return;
    }

    container.innerHTML = pageData.periods
        .map((period) => renderPeriodSection(period))
        .join('');

    attachPeriodListeners();
    replaceFeather();
}

function renderPeriodSection(period: AdminPeriodSection): string {
    const collapsed = false;
    const courseRows = period.courses
        .map((course) => renderCourseRow(course, period.id))
        .join('');

    return `
        <section class="course-selection-container period-section" data-period-id="${period.id}">
            <header class="course-selection-header period-section-header">
                <div class="period-header-left">
                    <button type="button" class="period-collapse-btn" aria-expanded="${!collapsed}" data-period-id="${period.id}">
                        <i data-feather="chevron-down" class="period-chevron"></i>
                    </button>
                    <h2 class="course-selection-title period-title">${escapeHtml(period.title)} COURSE SELECTION</h2>
                    <span class="period-count-pill">${period.courseCount} courses</span>
                </div>
                <div class="period-header-actions">
                    <button type="button" class="create-new-course-btn period-create-course-btn" data-period-id="${period.id}">
                        <i data-feather="file-plus"></i>
                        <span class="btn-text">Create New Course</span>
                    </button>
                    <span class="period-menu-mount" data-period-id="${period.id}"></span>
                </div>
            </header>
            <div class="period-course-list-wrap" data-period-id="${period.id}">
                <div class="period-course-list-inner">
                    <div class="course-workspace-list period-course-list" data-period-id="${period.id}">
                        ${courseRows || '<p class="period-empty">No courses in this period.</p>'}
                    </div>
                </div>
            </div>
        </section>
    `;
}

function renderCourseRow(course: activeCourse & { instructorDisplay?: string }, periodId: string): string {
    const instructors = course.instructorDisplay ?? formatInstructors(course.instructors);
    return `
        <div class="workspace-row admin-course-row" data-course-id="${course.id}" data-period-id="${periodId}">
            <div class="workspace-info">
                <div class="workspace-name">${escapeHtml(course.courseName)}</div>
                <div class="workspace-members"><span class="member-count">${escapeHtml(instructors)}</span></div>
            </div>
            <div class="workspace-action admin-course-actions">
                <button class="launch-btn" data-course-id="${course.id}" aria-label="Enter course">
                    <i data-feather="log-in"></i>
                    <span class="btn-text">ENTER CLASS</span>
                </button>
                <span class="course-menu-mount" data-course-id="${course.id}" data-period-id="${periodId}"></span>
            </div>
        </div>
    `;
}

function formatInstructors(raw: InstructorInfo[] | string[] | undefined): string {
    if (!raw?.length) {
        return 'No instructors';
    }
    return raw
        .map((inst) => (typeof inst === 'string' ? inst : inst.name ?? inst.userId))
        .join(', ');
}

function attachPeriodListeners(): void {
    document.querySelectorAll('.period-collapse-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            const periodId = btn.getAttribute('data-period-id');
            const wrap = document.querySelector(`.period-course-list-wrap[data-period-id="${periodId}"]`);
            const expanded = btn.getAttribute('aria-expanded') === 'true';
            const nextExpanded = !expanded;
            btn.setAttribute('aria-expanded', String(nextExpanded));
            wrap?.classList.toggle('is-collapsed', !nextExpanded);
        });
    });

    document.querySelectorAll('.period-create-course-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            const periodId = btn.getAttribute('data-period-id');
            if (periodId) {
                void openCourseModal('create', periodId);
            }
        });
    });

    document.querySelectorAll('.period-menu-mount').forEach((mount) => {
        const periodId = mount.getAttribute('data-period-id');
        if (!periodId || !pageData) {
            return;
        }
        const period = pageData.periods.find((p) => p.id === periodId);
        if (!period) {
            return;
        }
        mount.innerHTML = '';
        const editBtn = createAdminEditButton({
            ariaLabel: 'Edit academic period',
            onClick: () => void openPeriodModal('edit', period)
        });
        mount.appendChild(editBtn);
    });

    document.querySelectorAll('.course-menu-mount').forEach((mount) => {
        const courseId = mount.getAttribute('data-course-id');
        const periodId = mount.getAttribute('data-period-id');
        if (!courseId || !periodId || !pageData) {
            return;
        }
        const period = pageData.periods.find((p) => p.id === periodId);
        const course = period?.courses.find((c) => c.id === courseId);
        if (!course) {
            return;
        }
        mount.innerHTML = '';
        const editBtn = createAdminEditButton({
            ariaLabel: 'Edit course',
            onClick: () => void openCourseModal('edit', periodId, course)
        });
        mount.appendChild(editBtn);
    });

    document.querySelectorAll('.launch-btn').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const courseId = btn.getAttribute('data-course-id');
            if (courseId) {
                await enterCourseAsAdmin(courseId);
            }
        });
    });

}

async function enterCourseAsAdmin(courseId: string): Promise<void> {
    try {
        await fetch(`/api/admin/courses/${courseId}/ensure-enrollment`, {
            method: 'POST',
            credentials: 'same-origin'
        });

        const response = await fetch('/api/course/enter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ courseId })
        });
        const data = await response.json();
        if (data.error) {
            await showErrorModal('Error', data.error);
            return;
        }
        window.location.href = data.redirect;
    } catch (error) {
        await showErrorModal('Error', 'Failed to enter course.');
    }
}

function setupCreatePeriodButton(): void {
    const btn = document.getElementById('create-academic-period-btn');
    btn?.addEventListener('click', () => void openPeriodModal('create'));
}

async function openPeriodModal(mode: 'create' | 'edit', period?: AdminPeriodSection): Promise<void> {
    const modal = new ModalOverlay();
    const content = document.createElement('div');
    content.className = 'admin-period-modal';

    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.className = 'admin-modal-input';
    titleInput.placeholder = 'e.g. 2025W2';

    const startInput = document.createElement('input');
    startInput.type = 'date';
    startInput.className = 'admin-modal-input';

    const endInput = document.createElement('input');
    endInput.type = 'date';
    endInput.className = 'admin-modal-input';

    if (mode === 'edit' && period) {
        titleInput.value = period.title;
        startInput.value = toDateInputValue(period.startDate);
        endInput.value = toDateInputValue(period.endDate);
    }

    content.append(
        labelField('Title', titleInput),
        labelField('Start date', startInput),
        labelField('End date', endInput)
    );

    const actions = document.createElement('div');
    actions.className = 'admin-modal-actions';
    const submitBtn = document.createElement('button');
    submitBtn.type = 'button';
    submitBtn.className = 'create-new-course-btn';
    submitBtn.textContent = mode === 'edit' ? 'Save' : 'Create';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'retry-btn';
    cancelBtn.textContent = 'Cancel';

    actions.append(cancelBtn, submitBtn);
    content.appendChild(actions);

    const showPromise = modal.show({
        type: 'custom',
        title: mode === 'edit' ? 'Edit academic period' : 'Create academic period',
        content,
        showCloseButton: true,
        closeOnOverlayClick: true,
        maxWidth: '480px'
    });

    cancelBtn.addEventListener('click', () => modal.close('cancel'));

    submitBtn.addEventListener('click', async () => {
        const body = {
            title: titleInput.value.trim(),
            startDate: startInput.value,
            endDate: endInput.value
        };
        if (!body.title || !body.startDate || !body.endDate) {
            await showErrorModal('Validation', 'All fields are required.');
            return;
        }

        const url =
            mode === 'edit' && period
                ? `/api/academic-periods/${period.id}`
                : '/api/academic-periods';
        const method = mode === 'edit' ? 'PUT' : 'POST';

        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
            await showErrorModal('Error', data.error ?? 'Save failed');
            return;
        }
        modal.close('success');
        await loadAdminData();
    });

    await showPromise;
}

async function openCourseModal(
    mode: 'create' | 'edit',
    periodId: string,
    course?: activeCourse
): Promise<void> {
    if (!pageData) {
        return;
    }

    const modal = new ModalOverlay();
    const content = document.createElement('div');
    content.className = 'admin-course-modal';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'admin-modal-input';
    nameInput.placeholder = 'Course name';

    const periodSelect = document.createElement('select');
    periodSelect.className = 'admin-modal-input';
    for (const p of pageData.periods) {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.title;
        if (p.id === periodId) {
            opt.selected = true;
        }
        periodSelect.appendChild(opt);
    }

    let selectedInstructors: FacultyPickerUser[] = [];
    if (mode === 'edit' && course?.instructors) {
        selectedInstructors = (course.instructors as InstructorInfo[])
            .filter((i): i is InstructorInfo => typeof i !== 'string')
            .map((i) => ({ userId: i.userId, name: i.name, affiliation: 'faculty' }));
    }
    if (mode === 'edit' && course) {
        nameInput.value = course.courseName;
    }

    const instructorPicker = createUserSearchMultiSelect({
        selected: selectedInstructors,
        onChange: (sel) => {
            selectedInstructors = sel;
        }
    });

    content.append(
        labelField('Course name', nameInput),
        labelField('Academic period', periodSelect),
        labelField('Instructors (faculty)', instructorPicker)
    );

    const actions = document.createElement('div');
    actions.className = 'admin-modal-actions';
    const submitBtn = document.createElement('button');
    submitBtn.type = 'button';
    submitBtn.className = 'create-new-course-btn';
    submitBtn.textContent = mode === 'edit' ? 'Save' : 'Create';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'retry-btn';
    cancelBtn.textContent = 'Cancel';
    actions.append(cancelBtn, submitBtn);
    content.appendChild(actions);

    const showPromise = modal.show({
        type: 'custom',
        title: mode === 'edit' ? 'Edit course' : 'Create new course',
        content,
        showCloseButton: true,
        closeOnOverlayClick: true,
        maxWidth: '520px'
    });

    cancelBtn.addEventListener('click', () => modal.close('cancel'));

    submitBtn.addEventListener('click', async () => {
        const courseName = nameInput.value.trim();
        const academicPeriodId = periodSelect.value;
        const instructorUserIds = selectedInstructors.map((u) => u.userId);

        if (!courseName) {
            await showErrorModal('Validation', 'Course name is required.');
            return;
        }

        const url =
            mode === 'edit' && course ? `/api/admin/courses/${course.id}` : '/api/admin/courses';
        const method = mode === 'edit' ? 'PUT' : 'POST';

        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ courseName, academicPeriodId, instructorUserIds })
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
            await showErrorModal('Error', data.error ?? 'Save failed');
            return;
        }
        modal.close('success');
        await loadAdminData();
    });

    await showPromise;
}

function labelField(label: string, control: HTMLElement): HTMLElement {
    const wrap = document.createElement('label');
    wrap.className = 'admin-modal-field';
    const span = document.createElement('span');
    span.textContent = label;
    wrap.append(span, control);
    return wrap;
}

function toDateInputValue(value: Date | string): string {
    const d = value instanceof Date ? value : new Date(value);
    return d.toISOString().slice(0, 10);
}

function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showLoading(show: boolean): void {
    const el = document.getElementById('loading-message');
    if (el) {
        el.style.display = show ? 'block' : 'none';
    }
}

function showError(show: boolean): void {
    const el = document.getElementById('error-message');
    if (el) {
        el.style.display = show ? 'block' : 'none';
    }
}

function updateNotificationCount(count: number): void {
    const safeCount = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
    const badge = document.getElementById('admin-notification-count');
    const button = document.getElementById('admin-notification-btn');
    if (badge) badge.textContent = String(safeCount);
    button?.setAttribute(
        'aria-label',
        `Open escalations, ${safeCount} awaiting review`
    );
    if (pageData) pageData.guidedPathwayEscalationsAwaitingReview = safeCount;
}

function prefersReducedMotion(): boolean {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function isPhoneEscalationsModal(): boolean {
    return window.matchMedia('(max-width: 768px)').matches;
}

function finishEscalationsClose(): void {
    const panel = document.getElementById('admin-escalations-panel');
    const button = document.getElementById('admin-notification-btn');

    escalationsController?.destroy();
    escalationsController = null;
    escalationsPanelClosing = false;

    panel?.classList.remove('admin-escalations-panel--closing');
    panel?.setAttribute('hidden', '');
    panel?.setAttribute('inert', '');
    setSplitHandleVisible(false);
    button?.focus();
}

function closeEscalationsPanel(): void {
    if (escalationsModal) {
        escalationsModal.close('hide');
        return;
    }
    if (!escalationsPanelOpen || escalationsPanelClosing) return;

    const wrapper = document.querySelector('.admin-course-selection-wrapper');
    const panel = document.getElementById('admin-escalations-panel');
    const button = document.getElementById('admin-notification-btn');
    if (!panel) return;

    escalationsPanelOpen = false;
    escalationsPanelClosing = true;
    panel.classList.remove('admin-escalations-panel--open');
    panel.classList.add('admin-escalations-panel--closing');
    wrapper?.classList.remove('admin-course-selection-wrapper--split');
    wrapper?.classList.remove('admin-course-selection-wrapper--resizing');
    setSplitHandleVisible(false);
    panel.setAttribute('inert', '');

    button?.classList.remove('admin-notification-btn--active');
    button?.setAttribute('aria-expanded', 'false');

    if (escalationsEscapeHandler) {
        document.removeEventListener('keydown', escalationsEscapeHandler);
        escalationsEscapeHandler = null;
    }

    if (prefersReducedMotion()) {
        finishEscalationsClose();
        return;
    }

    let finished = false;
    const complete = () => {
        if (finished) return;
        finished = true;
        panel.removeEventListener('transitionend', onEnd);
        finishEscalationsClose();
    };
    const onEnd = (event: TransitionEvent) => {
        if (event.target !== panel) return;
        if (event.propertyName !== 'transform' && event.propertyName !== 'flex-grow' && event.propertyName !== 'opacity') {
            return;
        }
        complete();
    };
    panel.addEventListener('transitionend', onEnd);
    window.setTimeout(complete, ESCALATIONS_CLOSE_MS + 50);
}

async function openEscalationsPanel(): Promise<void> {
    if (!pageData || escalationsPanelOpen || escalationsPanelClosing) return;
    if (isPhoneEscalationsModal()) {
        await openEscalationsAsModal();
        return;
    }
    await openEscalationsAsSplit();
}

async function openEscalationsAsModal(): Promise<void> {
    if (!pageData) return;
    const button = document.getElementById('admin-notification-btn');

    escalationsPanelOpen = true;
    button?.classList.add('admin-notification-btn--active');
    button?.setAttribute('aria-expanded', 'true');

    const queueRoot = document.createElement('section');
    queueRoot.className = 'admin-escalations-modal-root';
    const controller = new AdminGuidedPathwayFlagsController(queueRoot, {
        periods: pageData.periods,
        initialAwaitingReviewCount: pageData.guidedPathwayEscalationsAwaitingReview,
        initialFilters: { status: 'escalated', reviewState: 'needs-review' },
        onAwaitingReviewCountChange: updateNotificationCount,
        showCloseButton: false,
        onClose: () => escalationsModal?.close('hide'),
    });
    escalationsController = controller;

    const modal = new ModalOverlay();
    escalationsModal = modal;

    try {
        await controller.initialize();
        const closed = modal.show({
            type: 'custom',
            title: 'Flag Escalations',
            content: queueRoot,
            showCloseButton: true,
            closeOnOverlayClick: true,
            closeOnEscape: true,
            maxWidth: 'calc(100vw - 1rem)',
            customClass: 'admin-escalations-mobile-modal',
        });
        await controller.activate();
        replaceFeather();
        await closed;
    } catch (error) {
        await showErrorModal(
            'Unable to open escalations',
            error instanceof Error ? error.message : 'Escalations could not be opened.'
        );
    } finally {
        controller.destroy();
        if (escalationsController === controller) escalationsController = null;
        escalationsModal = null;
        escalationsPanelOpen = false;
        button?.classList.remove('admin-notification-btn--active');
        button?.setAttribute('aria-expanded', 'false');
        button?.focus();
    }
}

async function openEscalationsAsSplit(): Promise<void> {
    if (!pageData) return;

    const wrapper = document.querySelector('.admin-course-selection-wrapper');
    const panel = document.getElementById('admin-escalations-panel');
    const root = document.getElementById('admin-escalations-panel-root');
    const button = document.getElementById('admin-notification-btn');
    if (!wrapper || !panel || !root || !button) return;

    escalationsPanelOpen = true;
    wrapper.classList.add('admin-course-selection-wrapper--split');
    panel.removeAttribute('hidden');
    panel.removeAttribute('inert');
    setSplitHandleVisible(true);
    requestAnimationFrame(() => panel.classList.add('admin-escalations-panel--open'));
    button.classList.add('admin-notification-btn--active');
    button.setAttribute('aria-expanded', 'true');

    escalationsController = new AdminGuidedPathwayFlagsController(root, {
        periods: pageData.periods,
        initialAwaitingReviewCount: pageData.guidedPathwayEscalationsAwaitingReview,
        initialFilters: { status: 'escalated', reviewState: 'needs-review' },
        onAwaitingReviewCountChange: updateNotificationCount,
        showCloseButton: true,
        onClose: closeEscalationsPanel,
    });

    try {
        await escalationsController.initialize();
        await escalationsController.activate();
        const heading = root.querySelector<HTMLElement>('h1');
        heading?.focus();
    } catch (error) {
        closeEscalationsPanel();
        await showErrorModal(
            'Unable to open escalations',
            error instanceof Error ? error.message : 'Escalations could not be opened.'
        );
        return;
    }

    escalationsEscapeHandler = (event: KeyboardEvent) => {
        if (event.key === 'Escape') closeEscalationsPanel();
    };
    document.addEventListener('keydown', escalationsEscapeHandler);
    replaceFeather();
}

function toggleEscalationsPanel(): void {
    if (escalationsPanelOpen) {
        closeEscalationsPanel();
    } else {
        void openEscalationsPanel();
    }
}

function setupNotificationButton(): void {
    if (notificationButtonBound) return;
    const button = document.getElementById('admin-notification-btn');
    if (!button) return;
    button.addEventListener('click', () => toggleEscalationsPanel());
    notificationButtonBound = true;
}

function setupLogoutButton(): void {
    document.getElementById('logout-btn')?.addEventListener('click', () => {
        window.location.href = '/auth/logout';
    });
}

function replaceFeather(): void {
    if (typeof (window as any).feather !== 'undefined') {
        (window as any).feather.replace();
    }
}

document.getElementById('retry-btn')?.addEventListener('click', () => {
    void initializeAdminCourseSelection();
});

document.addEventListener('DOMContentLoaded', () => {
    void initializeAdminCourseSelection();
    inactivityTracker.start();
});
