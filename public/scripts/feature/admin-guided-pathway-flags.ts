// public/scripts/feature/admin-guided-pathway-flags.ts

/**
 * Platform-admin, cross-course Guided Pathway alert queue.
 * List data stays anonymous; identity is requested only through the audited reveal action.
 *
 * @author EngE-AI Team
 * @date 2026-08-09
 * @version 1.1.0
 * @description Global anonymous alert queue embedded in Flags, with audited reveal and admin review.
 */

import type {
    GuidedPathwayFlagFacets,
    GuidedPathwayFlagListPage,
    GuidedPathwayFlagReviewState,
    GuidedPathwayFlagStatus,
    GuidedPathwayFlagView,
} from '../types.js';
import {
    listAdminGuidedPathwayFlags,
    revealAdminGuidedPathwayFlagIdentity,
    reviewAdminGuidedPathwayFlag,
    type AdminGuidedPathwayFlagFilters,
} from '../api/guided-pathway-flags-api.js';
import { showConfirmModal, showErrorModal } from '../ui/modal-overlay.js';

const PAGE_SIZE = 20;

export interface AdminGuidedPathwayPeriodOption {
    id: string;
    title: string;
    courses: Array<{ id: string; courseName: string }>;
}

let periods: AdminGuidedPathwayPeriodOption[] = [];
let currentPage = 1;
let pageData: GuidedPathwayFlagListPage | null = null;
let queueLoaded = false;
let boundControlsRoot: HTMLFormElement | null = null;

interface AdminGuidedPathwayContextPayload {
    periods: AdminGuidedPathwayPeriodOption[];
    guidedPathwayEscalationsAwaitingReview: number;
}

function byId<T extends HTMLElement>(id: string): T | null {
    return document.getElementById(id) as T | null;
}

function formatDate(value: string | undefined): string {
    if (!value) return 'Not recorded';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Not recorded';
    return new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(date);
}

function statusLabel(status: GuidedPathwayFlagStatus): string {
    if (status === 'escalated') return 'Escalated to LTIC';
    if (status === 'dismissed') return 'Dismissed';
    return 'Pending instructor decision';
}

function setQueueStatus(message: string): void {
    const status = byId('admin-guided-alerts-status');
    if (status) status.textContent = message;
}

function setQueueBusy(busy: boolean): void {
    byId('admin-guided-alerts-list')?.setAttribute('aria-busy', String(busy));
    const form = byId<HTMLFormElement>('admin-guided-alert-filters');
    form?.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
        button.disabled = busy;
    });
}

function setAwaitingReviewCount(count: number): void {
    const badge = byId('admin-guided-alert-count');
    if (!badge) return;
    const safeCount = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
    badge.textContent = String(safeCount);
    badge.setAttribute('aria-label', `${safeCount} awaiting review`);
}

async function loadAdminQueueContext(): Promise<AdminGuidedPathwayContextPayload> {
    const response = await fetch('/api/admin/course-selection', { credentials: 'same-origin' });
    const body = await response.json().catch(() => ({})) as {
        data?: AdminGuidedPathwayContextPayload;
        error?: string;
    };
    if (!response.ok || !body.data) {
        throw new Error(body.error || 'Unable to load course filters.');
    }
    return body.data;
}

function replaceSelectOptions(
    select: HTMLSelectElement | null,
    firstLabel: string,
    options: Array<{ value: string; label: string }>
): void {
    if (!select) return;
    const selected = select.value;
    const selectedLabel = select.selectedOptions[0]?.textContent?.trim() || selected;
    select.replaceChildren();
    const first = document.createElement('option');
    first.value = '';
    first.textContent = firstLabel;
    select.appendChild(first);
    options.forEach(({ value, label }) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        select.appendChild(option);
    });
    if (selected && ![...select.options].some((option) => option.value === selected)) {
        const preserved = document.createElement('option');
        preserved.value = selected;
        preserved.textContent = selectedLabel;
        select.appendChild(preserved);
    }
    if (selected) select.value = selected;
}

function populatePeriodOptions(): void {
    replaceSelectOptions(
        byId<HTMLSelectElement>('admin-guided-alert-period'),
        'All periods',
        periods.map((period) => ({ value: period.id, label: period.title }))
    );
    populateCourseOptions();
}

function populateCourseOptions(): void {
    const periodId = byId<HTMLSelectElement>('admin-guided-alert-period')?.value ?? '';
    const visiblePeriods = periodId ? periods.filter((period) => period.id === periodId) : periods;
    const courses = visiblePeriods
        .flatMap((period) => period.courses)
        .filter((course, index, all) => all.findIndex((candidate) => candidate.id === course.id) === index)
        .sort((a, b) => a.courseName.localeCompare(b.courseName));
    replaceSelectOptions(
        byId<HTMLSelectElement>('admin-guided-alert-course'),
        'All courses',
        courses.map((course) => ({ value: course.id, label: course.courseName }))
    );
}

function refreshFacetOptions(facets: GuidedPathwayFlagFacets | undefined): void {
    if (!facets) return;
    const pathways = facets.pathways
        .map((pathway) => ({ value: pathway.pathwayId, label: pathway.pathwayTitle }))
        .sort((a, b) => a.label.localeCompare(b.label));
    replaceSelectOptions(byId<HTMLSelectElement>('admin-guided-alert-pathway'), 'All pathways', pathways);

    replaceSelectOptions(
        byId<HTMLSelectElement>('admin-guided-alert-reviewer'),
        'All reviewers',
        [...facets.reviewers].sort().map((name) => ({ value: name, label: name }))
    );
}

function currentFilters(): AdminGuidedPathwayFlagFilters {
    const status = byId<HTMLSelectElement>('admin-guided-alert-status-filter')?.value;
    const reviewState = byId<HTMLSelectElement>('admin-guided-alert-review-state')?.value;
    return {
        page: currentPage,
        pageSize: PAGE_SIZE,
        status: status ? (status as GuidedPathwayFlagStatus) : undefined,
        reviewState: (reviewState || 'all') as GuidedPathwayFlagReviewState,
        academicPeriodId: byId<HTMLSelectElement>('admin-guided-alert-period')?.value || undefined,
        courseId: byId<HTMLSelectElement>('admin-guided-alert-course')?.value || undefined,
        pathwayId: byId<HTMLSelectElement>('admin-guided-alert-pathway')?.value || undefined,
        reviewer: byId<HTMLSelectElement>('admin-guided-alert-reviewer')?.value || undefined,
        dateFrom: byId<HTMLInputElement>('admin-guided-alert-date-from')?.value || undefined,
        dateTo: byId<HTMLInputElement>('admin-guided-alert-date-to')?.value || undefined,
    };
}

async function loadQueue(): Promise<void> {
    setQueueBusy(true);
    setQueueStatus('Loading Guided Pathway alerts...');
    try {
        pageData = await listAdminGuidedPathwayFlags(currentFilters());
        refreshFacetOptions(pageData.facets);
        renderQueue();
        setQueueStatus(`${pageData.total} ${pageData.total === 1 ? 'alert' : 'alerts'}`);
    } catch (error) {
        pageData = null;
        renderQueue('Alerts could not be loaded. Use Refresh to try again.');
        setQueueStatus(error instanceof Error ? error.message : 'Unable to load Guided Pathway alerts.');
    } finally {
        setQueueBusy(false);
    }
}

async function refreshAwaitingReviewCount(): Promise<void> {
    try {
        const page = await listAdminGuidedPathwayFlags({
            page: 1,
            pageSize: 1,
            status: 'escalated',
            reviewState: 'needs-review',
        });
        setAwaitingReviewCount(page.total);
    } catch {
        // Keep the last known count; the queue itself reports actionable load errors.
    }
}

function metadataItem(label: string, value: string): HTMLElement {
    const item = document.createElement('span');
    const strong = document.createElement('strong');
    strong.textContent = `${label}: `;
    item.append(strong, document.createTextNode(value));
    return item;
}

function createRevealControl(flag: GuidedPathwayFlagView): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'admin-guided-alert-card__identity';
    const label = document.createElement('label');
    label.className = 'admin-guided-alert-card__identity-toggle';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    const labelText = document.createElement('span');
    labelText.textContent = 'Reveal student identity';
    const revealed = document.createElement('span');
    revealed.className = 'admin-guided-alert-card__revealed-name';
    revealed.setAttribute('role', 'status');
    revealed.setAttribute('aria-live', 'polite');
    label.append(checkbox, labelText);
    wrapper.append(label, revealed);

    checkbox.addEventListener('change', async () => {
        if (!checkbox.checked) {
            revealed.textContent = '';
            return;
        }

        const confirmation = await showConfirmModal(
            'Reveal student identity',
            'This access is restricted to escalated alerts and will be recorded with your administrator account and the current time.',
            'Reveal identity',
            'Cancel',
            'danger'
        );
        if (confirmation.action !== 'reveal-identity') {
            checkbox.checked = false;
            return;
        }

        checkbox.disabled = true;
        try {
            const identity = await revealAdminGuidedPathwayFlagIdentity(flag.id);
            revealed.textContent = `Student: ${identity.studentName}`;
        } catch (error) {
            checkbox.checked = false;
            revealed.textContent = '';
            await showErrorModal(
                'Unable to reveal identity',
                error instanceof Error ? error.message : 'The identity could not be revealed.'
            );
        } finally {
            checkbox.disabled = false;
        }
    });
    return wrapper;
}

async function markReviewed(flag: GuidedPathwayFlagView, button: HTMLButtonElement): Promise<void> {
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    try {
        await reviewAdminGuidedPathwayFlag(flag.id);
        await Promise.all([loadQueue(), refreshAwaitingReviewCount()]);
    } catch (error) {
        button.disabled = false;
        await showErrorModal(
            'Unable to mark alert reviewed',
            error instanceof Error ? error.message : 'The review could not be saved.'
        );
    } finally {
        button.removeAttribute('aria-busy');
    }
}

function createAlertCard(flag: GuidedPathwayFlagView): HTMLElement {
    const card = document.createElement('article');
    card.className = `admin-guided-alert-card admin-guided-alert-card--${flag.status}`;

    const header = document.createElement('div');
    header.className = 'admin-guided-alert-card__header';
    const title = document.createElement('h2');
    title.textContent = flag.pathwayTitle;
    const status = document.createElement('span');
    status.className = `admin-guided-alert-card__status admin-guided-alert-card__status--${flag.status}`;
    status.textContent = statusLabel(flag.status);
    header.append(title, status);

    const metadata = document.createElement('div');
    metadata.className = 'admin-guided-alert-card__metadata';
    metadata.append(
        metadataItem('Course', flag.courseName),
        metadataItem('Triggered', formatDate(flag.triggeredAt))
    );
    if (flag.decidedAt) metadata.append(metadataItem('Decision', formatDate(flag.decidedAt)));
    if (flag.decidedByName) metadata.append(metadataItem('Decision by', flag.decidedByName));
    if (flag.adminReviewedAt) metadata.append(metadataItem('Admin review', formatDate(flag.adminReviewedAt)));
    if (flag.adminReviewedByName) metadata.append(metadataItem('Reviewed by', flag.adminReviewedByName));

    const messageLabel = document.createElement('h3');
    messageLabel.textContent = 'Student message';
    const message = document.createElement('p');
    message.className = 'admin-guided-alert-card__message';
    message.textContent = flag.messageText;

    card.append(header, metadata, messageLabel, message);

    if (flag.status === 'escalated') {
        card.appendChild(createRevealControl(flag));
        if (!flag.adminReviewedAt) {
            const actions = document.createElement('div');
            actions.className = 'admin-guided-alert-card__actions';
            const review = document.createElement('button');
            review.type = 'button';
            review.textContent = 'Mark reviewed';
            review.addEventListener('click', () => void markReviewed(flag, review));
            actions.appendChild(review);
            card.appendChild(actions);
        }
    }

    return card;
}

function renderQueue(errorMessage?: string): void {
    const list = byId('admin-guided-alerts-list');
    if (!list) return;
    list.replaceChildren();
    const items = pageData?.items ?? [];
    if (errorMessage) {
        const error = document.createElement('p');
        error.className = 'admin-guided-alerts__empty admin-guided-alerts__empty--error';
        error.textContent = errorMessage;
        list.appendChild(error);
    } else if (items.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'admin-guided-alerts__empty';
        empty.textContent = 'No Guided Pathway alerts match these filters.';
        list.appendChild(empty);
    } else {
        items.forEach((item) => list.appendChild(createAlertCard(item)));
    }

    const page = pageData?.page ?? currentPage;
    const total = pageData?.total ?? 0;
    const pageSize = pageData?.pageSize ?? PAGE_SIZE;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const summary = byId('admin-guided-alerts-page-summary');
    const previous = byId<HTMLButtonElement>('admin-guided-alerts-previous');
    const next = byId<HTMLButtonElement>('admin-guided-alerts-next');
    if (summary) summary.textContent = `Page ${page} of ${totalPages}`;
    if (previous) previous.disabled = page <= 1;
    if (next) next.disabled = page >= totalPages;
}

function clearFilters(): void {
    const form = byId<HTMLFormElement>('admin-guided-alert-filters');
    form?.reset();
    populateCourseOptions();
    currentPage = 1;
    void loadQueue();
}

function bindControls(): void {
    byId('admin-guided-alerts-refresh')?.addEventListener('click', () => {
        void Promise.all([loadQueue(), refreshAwaitingReviewCount()]);
    });
    byId<HTMLSelectElement>('admin-guided-alert-period')?.addEventListener('change', () => {
        const course = byId<HTMLSelectElement>('admin-guided-alert-course');
        if (course) course.value = '';
        populateCourseOptions();
    });
    byId<HTMLSelectElement>('admin-guided-alert-review-state')?.addEventListener('change', (event) => {
        const reviewState = (event.currentTarget as HTMLSelectElement).value;
        const status = byId<HTMLSelectElement>('admin-guided-alert-status-filter');
        if (reviewState !== 'all' && status) status.value = 'escalated';
    });
    byId<HTMLSelectElement>('admin-guided-alert-status-filter')?.addEventListener('change', (event) => {
        const status = (event.currentTarget as HTMLSelectElement).value;
        const reviewState = byId<HTMLSelectElement>('admin-guided-alert-review-state');
        if (status !== 'escalated' && reviewState) reviewState.value = 'all';
    });
    byId<HTMLFormElement>('admin-guided-alert-filters')?.addEventListener('submit', (event) => {
        event.preventDefault();
        currentPage = 1;
        void loadQueue();
    });
    byId('admin-guided-alert-filters-clear')?.addEventListener('click', clearFilters);
    byId('admin-guided-alerts-previous')?.addEventListener('click', () => {
        if (currentPage <= 1) return;
        currentPage -= 1;
        void loadQueue();
    });
    byId('admin-guided-alerts-next')?.addEventListener('click', () => {
        currentPage += 1;
        void loadQueue();
    });
}

/** Initialize the embedded admin queue, its course filters, and awaiting-review count. */
export async function initializeAdminGuidedPathwayFlags(): Promise<void> {
    currentPage = 1;
    pageData = null;
    queueLoaded = false;

    try {
        const context = await loadAdminQueueContext();
        periods = context.periods.map((period) => ({
            id: period.id,
            title: period.title,
            courses: period.courses.map((course) => ({
                id: course.id,
                courseName: course.courseName,
            })),
        }));
        setAwaitingReviewCount(context.guidedPathwayEscalationsAwaitingReview ?? 0);
    } catch (error) {
        periods = [];
        setAwaitingReviewCount(0);
        setQueueStatus(error instanceof Error ? error.message : 'Unable to load course filters.');
    }

    populatePeriodOptions();
    const controlsRoot = byId<HTMLFormElement>('admin-guided-alert-filters');
    if (controlsRoot && controlsRoot !== boundControlsRoot) {
        bindControls();
        boundControlsRoot = controlsRoot;
    }
    renderQueue();
}

/** Load the global queue the first time an administrator opens its Flags tab. */
export function activateAdminGuidedPathwayFlags(): void {
    if (queueLoaded) return;
    queueLoaded = true;
    void loadQueue();
}
