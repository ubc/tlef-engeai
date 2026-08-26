// public/scripts/feature/admin-guided-pathway-flags.ts

/**
 * Platform-admin Guided Pathway alert queue
 *
 * Mounts the same anonymous cross-course queue inside any supplied root. Each
 * controller owns its filters, pagination, listeners, and load sequencing so
 * the Flags page and dashboard modal can coexist without document-id collisions.
 *
 * @author EngE-AI Team
 * @date 2026-08-09
 * @version 2.0.0
 * @description Reusable admin alert queue with audited reveal and review actions.
 */

import type {
    GuidedPathwayFlagFacets,
    GuidedPathwayFlagListPage,
    GuidedPathwayFlagReviewState,
    GuidedPathwayFlagStatus,
    GuidedPathwayFlagView,
    ManualFlagEscalationView,
    AdminEscalationSource,
} from '../types.js';
import {
    listAdminGuidedPathwayFlags,
    revealAdminGuidedPathwayFlagIdentity,
    reviewAdminGuidedPathwayFlag,
    type AdminGuidedPathwayFlagFilters,
} from '../api/guided-pathway-flags-api.js';
import {
    listAdminManualFlagEscalations,
    reviewAdminManualFlag,
    type AdminManualFlagFilters,
} from '../api/flag-api.js';
import { showConfirmModal, showErrorModal } from '../ui/modal-overlay.js';

const PAGE_SIZE = 20;
const STATUS_LABELS: Record<GuidedPathwayFlagStatus, string> = {
    pending: 'Pending instructor decision',
    escalated: 'Escalated to LTIC',
    dismissed: 'Dismissed',
};

export interface AdminGuidedPathwayPeriodOption {
    id: string;
    title: string;
    courses: Array<{ id: string; courseName: string }>;
}

interface AdminGuidedPathwayContextPayload {
    periods: AdminGuidedPathwayPeriodOption[];
    guidedPathwayEscalationsAwaitingReview: number;
}

/** Configuration for one independently mounted administrator alert queue. */
export interface AdminGuidedPathwayFlagsOptions {
    periods?: AdminGuidedPathwayPeriodOption[];
    initialAwaitingReviewCount?: number;
    initialFilters?: Pick<AdminGuidedPathwayFlagFilters, 'status' | 'reviewState'>;
    showMobileMenuButton?: boolean;
    onAwaitingReviewCountChange?: (count: number) => void;
}

function formatDate(value: string | undefined): string {
    if (!value) return 'Not recorded';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Not recorded';
    return date.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    });
}

function replaceFeatherIcons(): void {
    const feather = (window as any).feather;
    if (typeof feather?.replace === 'function') feather.replace();
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
    select: HTMLSelectElement,
    firstLabel: string,
    options: Array<{ value: string; label: string }>
): void {
    const selected = select.value;
    const selectedLabel = select.selectedOptions[0]?.textContent?.trim() || selected;
    select.replaceChildren();

    const first = document.createElement('option');
    first.value = '';
    first.textContent = firstLabel;
    select.appendChild(first);

    for (const { value, label } of options) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        select.appendChild(option);
    }

    // Keep an active filter visible if its course/pathway was removed between requests.
    if (selected && ![...select.options].some((option) => option.value === selected)) {
        const preserved = document.createElement('option');
        preserved.value = selected;
        preserved.textContent = selectedLabel;
        select.appendChild(preserved);
    }
    if (selected) select.value = selected;
}

function queueMarkup(showMobileMenuButton: boolean): string {
    const menuButton = showMobileMenuButton
        ? `<button class="instructor-mobile-hamburger-btn icon-btn" type="button" title="Open menu" aria-label="Open menu">
                <i data-feather="menu"></i>
           </button>`
        : '';

    return `
        <header class="admin-guided-alerts__header mobile-header-bar">
            <div class="admin-guided-alerts__heading-row">
                ${menuButton}
                <div class="admin-guided-alerts__title-group">
                    <h1>Flag Escalations</h1>
                    <span class="admin-guided-alerts__scope">All courses</span>
                </div>
            </div>
            <button type="button" data-admin-guided-role="refresh" class="admin-guided-alerts__refresh">
                <i data-feather="refresh-cw"></i>
                Refresh
            </button>
        </header>

        <aside class="admin-guided-alerts__notices" aria-label="Important alert information">
            <p class="admin-guided-alerts__notice">
                <i data-feather="shield"></i>
                <span>Messages are anonymous by default. Student-written text may still include identifying details.</span>
            </p>
            <p class="admin-guided-alerts__notice">
                <i data-feather="info"></i>
                <span>Escalation records a decision only; EngE-AI does not notify LTIC.</span>
            </p>
        </aside>

        <form data-admin-guided-role="filters" class="admin-guided-alert-filters">
            <div class="admin-guided-alert-filters__heading">
                <i data-feather="filter"></i>
                <h2>Filters</h2>
            </div>
            <label>Source
                <select data-admin-guided-role="source">
                    <option value="both">Manual and Guided Pathway</option>
                    <option value="guided-pathway">Guided Pathway only</option>
                    <option value="manual">Manual only</option>
                </select>
            </label>
            <label>Academic period
                <select data-admin-guided-role="period"><option value="">All periods</option></select>
            </label>
            <label>Course
                <select data-admin-guided-role="course"><option value="">All courses</option></select>
            </label>
            <label>Pathway
                <select data-admin-guided-role="pathway"><option value="">All pathways</option></select>
            </label>
            <label>Decision
                <select data-admin-guided-role="status-filter">
                    <option value="">All decisions</option>
                    <option value="pending">Pending</option>
                    <option value="escalated">Escalated</option>
                    <option value="dismissed">Dismissed</option>
                </select>
            </label>
            <label>Admin review
                <select data-admin-guided-role="review-state">
                    <option value="all">All</option>
                    <option value="needs-review">Needs review</option>
                    <option value="reviewed">Reviewed</option>
                </select>
            </label>
            <label>Reviewer
                <select data-admin-guided-role="reviewer"><option value="">All reviewers</option></select>
            </label>
            <label>From
                <input type="date" data-admin-guided-role="date-from">
            </label>
            <label>To
                <input type="date" data-admin-guided-role="date-to">
            </label>
            <div class="admin-guided-alert-filters__actions">
                <button type="button" data-admin-guided-role="clear">Clear</button>
                <button type="submit">Apply filters</button>
            </div>
        </form>

        <p data-admin-guided-role="status" class="admin-guided-alerts__status" role="status" aria-live="polite"></p>
        <div data-admin-guided-role="list" class="admin-guided-alerts__list" aria-live="polite"></div>
        <nav class="admin-guided-alerts__pagination" aria-label="Admin Guided Pathway alert pages">
            <button type="button" data-admin-guided-role="previous">Previous</button>
            <span data-admin-guided-role="page-summary">Page 1 of 1</span>
            <button type="button" data-admin-guided-role="next">Next</button>
        </nav>
    `;
}

/** Owns one root-scoped administrator escalation queue instance. */
export class AdminGuidedPathwayFlagsController {
    private periods: AdminGuidedPathwayPeriodOption[] = [];
    private currentPage = 1;
    private pageData: GuidedPathwayFlagListPage | null = null;
    private manualItems: ManualFlagEscalationView[] = [];
    private combinedTotal = 0;
    private queueEntries: Array<
        | { type: 'guided'; flag: GuidedPathwayFlagView }
        | { type: 'manual'; flag: ManualFlagEscalationView }
    > = [];
    private queueLoaded = false;
    private loadGeneration = 0;
    private readonly listeners = new AbortController();

    constructor(
        private readonly root: HTMLElement,
        private readonly options: AdminGuidedPathwayFlagsOptions = {}
    ) {}

    private element<T extends HTMLElement>(role: string): T {
        const element = this.root.querySelector<T>(`[data-admin-guided-role="${role}"]`);
        if (!element) throw new Error(`Missing Guided Pathway queue control: ${role}`);
        return element;
    }

    /**
     * initialize - Renders controls and loads filter context without fetching queue rows.
     *
     * @returns When period/course choices and the initial awaiting-review count are ready
     */
    public async initialize(): Promise<void> {
        this.root.classList.add('admin-guided-alerts');
        this.root.innerHTML = queueMarkup(this.options.showMobileMenuButton === true);
        this.bindControls();

        let context: AdminGuidedPathwayContextPayload | undefined;
        if (!this.options.periods || this.options.initialAwaitingReviewCount === undefined) {
            try {
                context = await loadAdminQueueContext();
            } catch (error) {
                this.setQueueStatus(error instanceof Error ? error.message : 'Unable to load course filters.');
            }
        }

        const sourcePeriods = this.options.periods ?? context?.periods ?? [];
        this.periods = sourcePeriods.map((period) => ({
            id: period.id,
            title: period.title,
            courses: period.courses.map(({ id, courseName }) => ({ id, courseName })),
        }));
        this.populatePeriodOptions();
        this.applyInitialFilters();
        this.renderQueue();

        const initialCount = this.options.initialAwaitingReviewCount
            ?? context?.guidedPathwayEscalationsAwaitingReview;
        if (initialCount !== undefined) this.publishAwaitingReviewCount(initialCount);
        replaceFeatherIcons();
    }

    /** Loads the queue once when its tab or modal first becomes visible. */
    public async activate(): Promise<void> {
        if (this.queueLoaded) return;
        this.queueLoaded = true;
        await this.loadQueue();
    }

    /** Reloads queue rows and the external awaiting-review badge. */
    public async refresh(): Promise<void> {
        await Promise.all([this.loadQueue(), this.refreshAwaitingReviewCount()]);
    }

    /** Detaches persistent control listeners and invalidates in-flight queue renders. */
    public destroy(): void {
        this.loadGeneration += 1;
        this.listeners.abort();
    }

    private applyInitialFilters(): void {
        const filters = this.options.initialFilters;
        if (!filters) return;
        if (filters.status) this.element<HTMLSelectElement>('status-filter').value = filters.status;
        if (filters.reviewState) this.element<HTMLSelectElement>('review-state').value = filters.reviewState;
    }

    private setQueueStatus(message: string): void {
        this.element('status').textContent = message;
    }

    private setQueueBusy(busy: boolean): void {
        this.element('list').setAttribute('aria-busy', String(busy));
        this.root.querySelectorAll<HTMLButtonElement | HTMLSelectElement | HTMLInputElement>(
            'button, select, input'
        ).forEach((control) => {
            control.disabled = busy;
        });
        if (!busy) this.renderPagination();
    }

    private publishAwaitingReviewCount(count: number): void {
        const safeCount = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
        this.options.onAwaitingReviewCountChange?.(safeCount);
    }

    private populatePeriodOptions(): void {
        replaceSelectOptions(
            this.element<HTMLSelectElement>('period'),
            'All periods',
            this.periods.map((period) => ({ value: period.id, label: period.title }))
        );
        this.populateCourseOptions();
    }

    private populateCourseOptions(): void {
        const periodId = this.element<HTMLSelectElement>('period').value;
        const visiblePeriods = periodId
            ? this.periods.filter((period) => period.id === periodId)
            : this.periods;
        const courses: Array<{ id: string; courseName: string }> = [];
        for (const period of visiblePeriods) {
            for (const course of period.courses) {
                courses.push(course);
            }
        }
        const uniqueCourses = courses
            .filter((course, index, all) => all.findIndex((candidate) => candidate.id === course.id) === index)
            .sort((a, b) => a.courseName.localeCompare(b.courseName));
        replaceSelectOptions(
            this.element<HTMLSelectElement>('course'),
            'All courses',
            uniqueCourses.map((course) => ({ value: course.id, label: course.courseName }))
        );
    }

    private refreshFacetOptions(facets: GuidedPathwayFlagFacets | undefined): void {
        if (!facets) return;
        replaceSelectOptions(
            this.element<HTMLSelectElement>('pathway'),
            'All pathways',
            facets.pathways
                .map((pathway) => ({ value: pathway.pathwayId, label: pathway.pathwayTitle }))
                .sort((a, b) => a.label.localeCompare(b.label))
        );
        replaceSelectOptions(
            this.element<HTMLSelectElement>('reviewer'),
            'All reviewers',
            [...facets.reviewers].sort().map((name) => ({ value: name, label: name }))
        );
    }

    private currentSource(): AdminEscalationSource {
        const value = this.element<HTMLSelectElement>('source').value;
        if (value === 'manual' || value === 'guided-pathway') return value;
        return 'both';
    }

    private sharedDateFilters(): Pick<AdminManualFlagFilters, 'academicPeriodId' | 'courseId' | 'dateFrom' | 'dateTo' | 'reviewState'> {
        const status = this.element<HTMLSelectElement>('status-filter').value;
        const reviewState = this.element<HTMLSelectElement>('review-state').value;
        return {
            reviewState: (reviewState || 'all') as GuidedPathwayFlagReviewState,
            academicPeriodId: this.element<HTMLSelectElement>('period').value || undefined,
            courseId: this.element<HTMLSelectElement>('course').value || undefined,
            dateFrom: this.element<HTMLInputElement>('date-from').value || undefined,
            dateTo: this.element<HTMLInputElement>('date-to').value || undefined,
            ...(status ? {} : {}),
        };
    }

    private currentFilters(): AdminGuidedPathwayFlagFilters {
        const status = this.element<HTMLSelectElement>('status-filter').value;
        const reviewState = this.element<HTMLSelectElement>('review-state').value;
        return {
            page: this.currentPage,
            pageSize: PAGE_SIZE,
            status: status ? status as GuidedPathwayFlagStatus : undefined,
            reviewState: (reviewState || 'all') as GuidedPathwayFlagReviewState,
            academicPeriodId: this.element<HTMLSelectElement>('period').value || undefined,
            courseId: this.element<HTMLSelectElement>('course').value || undefined,
            pathwayId: this.element<HTMLSelectElement>('pathway').value || undefined,
            reviewer: this.element<HTMLSelectElement>('reviewer').value || undefined,
            dateFrom: this.element<HTMLInputElement>('date-from').value || undefined,
            dateTo: this.element<HTMLInputElement>('date-to').value || undefined,
        };
    }

    private currentManualFilters(): AdminManualFlagFilters {
        const shared = this.sharedDateFilters();
        return {
            page: this.currentPage,
            pageSize: PAGE_SIZE,
            reviewState: shared.reviewState,
            academicPeriodId: shared.academicPeriodId,
            courseId: shared.courseId,
            dateFrom: shared.dateFrom,
            dateTo: shared.dateTo,
        };
    }

    private async loadQueue(): Promise<void> {
        const generation = ++this.loadGeneration;
        this.setQueueBusy(true);
        this.setQueueStatus('Loading escalations...');
        const source = this.currentSource();
        try {
            const guidedPromise =
                source === 'manual'
                    ? Promise.resolve({ items: [], page: 1, pageSize: PAGE_SIZE, total: 0 } as GuidedPathwayFlagListPage)
                    : listAdminGuidedPathwayFlags({
                          ...this.currentFilters(),
                          page: source === 'both' ? 1 : this.currentPage,
                          pageSize: source === 'both' ? 200 : PAGE_SIZE,
                      });
            const manualPromise =
                source === 'guided-pathway'
                    ? Promise.resolve({ items: [], page: 1, pageSize: PAGE_SIZE, total: 0 })
                    : listAdminManualFlagEscalations({
                          ...this.currentManualFilters(),
                          page: source === 'both' ? 1 : this.currentPage,
                          pageSize: source === 'both' ? 200 : PAGE_SIZE,
                      });

            const [guidedPage, manualPage] = await Promise.all([guidedPromise, manualPromise]);
            if (generation !== this.loadGeneration) return;

            if (source === 'both') {
                const merged = [
                    ...guidedPage.items.map((flag) => ({
                        type: 'guided' as const,
                        sortAt: new Date(flag.triggeredAt).getTime(),
                        flag,
                    })),
                    ...manualPage.items.map((flag) => ({
                        type: 'manual' as const,
                        sortAt: new Date(flag.escalatedAt).getTime(),
                        flag,
                    })),
                ].sort((a, b) => b.sortAt - a.sortAt);
                this.combinedTotal = merged.length;
                const start = (this.currentPage - 1) * PAGE_SIZE;
                this.queueEntries = merged.slice(start, start + PAGE_SIZE).map((row) =>
                    row.type === 'guided'
                        ? { type: 'guided' as const, flag: row.flag }
                        : { type: 'manual' as const, flag: row.flag }
                );
                this.pageData = guidedPage;
                this.manualItems = [];
                this.refreshFacetOptions(guidedPage.facets);
            } else if (source === 'manual') {
                this.pageData = null;
                this.manualItems = manualPage.items;
                this.queueEntries = manualPage.items.map((flag) => ({ type: 'manual', flag }));
                this.combinedTotal = manualPage.total;
            } else {
                this.pageData = guidedPage;
                this.manualItems = [];
                this.queueEntries = guidedPage.items.map((flag) => ({ type: 'guided', flag }));
                this.combinedTotal = guidedPage.total;
                this.refreshFacetOptions(guidedPage.facets);
            }

            this.renderQueue();
            this.setQueueStatus(`${this.combinedTotal} ${this.combinedTotal === 1 ? 'escalation' : 'escalations'}`);
        } catch (error) {
            if (generation !== this.loadGeneration) return;
            this.pageData = null;
            this.manualItems = [];
            this.queueEntries = [];
            this.combinedTotal = 0;
            this.renderQueue('Escalations could not be loaded. Use Refresh to try again.');
            this.setQueueStatus(error instanceof Error ? error.message : 'Unable to load escalations.');
        } finally {
            if (generation === this.loadGeneration) this.setQueueBusy(false);
        }
    }

    private async refreshAwaitingReviewCount(): Promise<void> {
        try {
            const [guidedPage, manualPage] = await Promise.all([
                listAdminGuidedPathwayFlags({
                    page: 1,
                    pageSize: 1,
                    status: 'escalated',
                    reviewState: 'needs-review',
                }),
                listAdminManualFlagEscalations({
                    page: 1,
                    pageSize: 1,
                    reviewState: 'needs-review',
                }),
            ]);
            this.publishAwaitingReviewCount(guidedPage.total + manualPage.total);
        } catch {
            // Keep the last known badge value; the queue reports actionable request failures.
        }
    }

    private metadataItem(label: string, value: string): HTMLElement {
        const item = document.createElement('span');
        const strong = document.createElement('strong');
        strong.textContent = `${label}: `;
        item.append(strong, document.createTextNode(value));
        return item;
    }

    private createRevealControl(flag: GuidedPathwayFlagView): HTMLElement {
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
                const identity = await revealAdminGuidedPathwayFlagIdentity(flag.courseId, flag.id);
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
        }, { signal: this.listeners.signal });
        return wrapper;
    }

    private async markReviewed(flag: GuidedPathwayFlagView, button: HTMLButtonElement): Promise<void> {
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        try {
            await reviewAdminGuidedPathwayFlag(flag.courseId, flag.id);
            await Promise.all([this.loadQueue(), this.refreshAwaitingReviewCount()]);
        } catch (error) {
            if (button.isConnected) button.disabled = false;
            await showErrorModal(
                'Unable to mark alert reviewed',
                error instanceof Error ? error.message : 'The review could not be saved.'
            );
        } finally {
            button.removeAttribute('aria-busy');
        }
    }

    private async markManualReviewed(flag: ManualFlagEscalationView, button: HTMLButtonElement): Promise<void> {
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        try {
            await reviewAdminManualFlag(flag.courseId, flag.id);
            await Promise.all([this.loadQueue(), this.refreshAwaitingReviewCount()]);
        } catch (error) {
            if (button.isConnected) button.disabled = false;
            await showErrorModal(
                'Unable to mark escalation reviewed',
                error instanceof Error ? error.message : 'The review could not be saved.'
            );
        } finally {
            button.removeAttribute('aria-busy');
        }
    }

    private createManualEscalationCard(flag: ManualFlagEscalationView): HTMLElement {
        const card = document.createElement('article');
        card.className = 'admin-guided-alert-card admin-guided-alert-card--manual admin-guided-alert-card--escalated';

        const header = document.createElement('div');
        header.className = 'admin-guided-alert-card__header';
        const title = document.createElement('h2');
        title.textContent = `USER's FLAG: ${flag.reportType}`;
        const sourceBadge = document.createElement('span');
        sourceBadge.className = 'admin-guided-alert-card__source-badge admin-guided-alert-card__source-badge--manual';
        sourceBadge.textContent = 'Manual';
        const status = document.createElement('span');
        status.className = 'admin-guided-alert-card__status admin-guided-alert-card__status--escalated';
        status.textContent = 'Escalated to LTIC';
        header.append(title, sourceBadge, status);

        const metadata = document.createElement('div');
        metadata.className = 'admin-guided-alert-card__metadata';
        metadata.append(
            this.metadataItem('Course', flag.courseName),
            this.metadataItem('Escalated', formatDate(flag.escalatedAt))
        );
        if (flag.escalatedByName) metadata.append(this.metadataItem('Escalated by', flag.escalatedByName));
        if (flag.adminReviewedAt) metadata.append(this.metadataItem('Admin review', formatDate(flag.adminReviewedAt)));
        if (flag.adminReviewedByName) metadata.append(this.metadataItem('Reviewed by', flag.adminReviewedByName));

        const messageLabel = document.createElement('h3');
        messageLabel.textContent = 'Flagged chat content';
        const message = document.createElement('p');
        message.className = 'admin-guided-alert-card__message';
        message.textContent = flag.chatContent;
        card.append(header, metadata, messageLabel, message);

        if (!flag.adminReviewedAt) {
            const actions = document.createElement('div');
            actions.className = 'admin-guided-alert-card__actions';
            const review = document.createElement('button');
            review.type = 'button';
            review.textContent = 'Mark reviewed';
            review.addEventListener('click', () => void this.markManualReviewed(flag, review), {
                signal: this.listeners.signal,
            });
            actions.appendChild(review);
            card.appendChild(actions);
        }
        return card;
    }

    private createAlertCard(flag: GuidedPathwayFlagView): HTMLElement {
        const card = document.createElement('article');
        card.className = `admin-guided-alert-card admin-guided-alert-card--${flag.status}`;

        const header = document.createElement('div');
        header.className = 'admin-guided-alert-card__header';
        const title = document.createElement('h2');
        title.textContent = flag.pathwayTitle;
        const sourceBadge = document.createElement('span');
        sourceBadge.className = 'admin-guided-alert-card__source-badge admin-guided-alert-card__source-badge--guided';
        sourceBadge.textContent = 'Guided Pathway';
        const status = document.createElement('span');
        status.className = `admin-guided-alert-card__status admin-guided-alert-card__status--${flag.status}`;
        status.textContent = STATUS_LABELS[flag.status];
        header.append(title, sourceBadge, status);

        const metadata = document.createElement('div');
        metadata.className = 'admin-guided-alert-card__metadata';
        metadata.append(
            this.metadataItem('Course', flag.courseName),
            this.metadataItem('Triggered', formatDate(flag.triggeredAt))
        );
        if (flag.decidedAt) metadata.append(this.metadataItem('Decision', formatDate(flag.decidedAt)));
        if (flag.decidedByName) metadata.append(this.metadataItem('Decision by', flag.decidedByName));
        if (flag.adminReviewedAt) metadata.append(this.metadataItem('Admin review', formatDate(flag.adminReviewedAt)));
        if (flag.adminReviewedByName) metadata.append(this.metadataItem('Reviewed by', flag.adminReviewedByName));

        const messageLabel = document.createElement('h3');
        messageLabel.textContent = 'Student message';
        const message = document.createElement('p');
        message.className = 'admin-guided-alert-card__message';
        message.textContent = flag.messageText;
        card.append(header, metadata, messageLabel, message);

        if (flag.status === 'escalated') {
            card.appendChild(this.createRevealControl(flag));
            if (!flag.adminReviewedAt) {
                const actions = document.createElement('div');
                actions.className = 'admin-guided-alert-card__actions';
                const review = document.createElement('button');
                review.type = 'button';
                review.textContent = 'Mark reviewed';
                review.addEventListener('click', () => void this.markReviewed(flag, review), {
                    signal: this.listeners.signal
                });
                actions.appendChild(review);
                card.appendChild(actions);
            }
        }

        return card;
    }

    private renderQueue(errorMessage?: string): void {
        const list = this.element('list');
        list.replaceChildren();
        if (errorMessage) {
            const error = document.createElement('p');
            error.className = 'admin-guided-alerts__empty admin-guided-alerts__empty--error';
            error.textContent = errorMessage;
            list.appendChild(error);
        } else if (this.queueEntries.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'admin-guided-alerts__empty';
            empty.textContent = 'No escalations match these filters.';
            list.appendChild(empty);
        } else {
            for (const entry of this.queueEntries) {
                list.appendChild(
                    entry.type === 'guided'
                        ? this.createAlertCard(entry.flag)
                        : this.createManualEscalationCard(entry.flag)
                );
            }
        }
        this.renderPagination();
        replaceFeatherIcons();
    }

    private renderPagination(): void {
        const page = this.currentPage;
        const total = this.combinedTotal;
        const pageSize = PAGE_SIZE;
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        this.element('page-summary').textContent = `Page ${page} of ${totalPages}`;
        this.element<HTMLButtonElement>('previous').disabled = page <= 1;
        this.element<HTMLButtonElement>('next').disabled = page >= totalPages;
    }

    private clearFilters(): void {
        this.element<HTMLFormElement>('filters').reset();
        this.populateCourseOptions();
        this.currentPage = 1;
        void this.loadQueue();
    }

    private bindControls(): void {
        const signal = this.listeners.signal;
        this.element('refresh').addEventListener('click', () => void this.refresh(), { signal });
        this.element<HTMLSelectElement>('period').addEventListener('change', () => {
            this.element<HTMLSelectElement>('course').value = '';
            this.populateCourseOptions();
        }, { signal });
        this.element<HTMLSelectElement>('review-state').addEventListener('change', (event) => {
            const reviewState = (event.currentTarget as HTMLSelectElement).value;
            if (reviewState !== 'all') this.element<HTMLSelectElement>('status-filter').value = 'escalated';
        }, { signal });
        this.element<HTMLSelectElement>('status-filter').addEventListener('change', (event) => {
            const status = (event.currentTarget as HTMLSelectElement).value;
            if (status !== 'escalated') this.element<HTMLSelectElement>('review-state').value = 'all';
        }, { signal });
        this.element<HTMLFormElement>('filters').addEventListener('submit', (event) => {
            event.preventDefault();
            this.currentPage = 1;
            void this.loadQueue();
        }, { signal });
        this.element('clear').addEventListener('click', () => this.clearFilters(), { signal });
        this.element('previous').addEventListener('click', () => {
            if (this.currentPage <= 1) return;
            this.currentPage -= 1;
            void this.loadQueue();
        }, { signal });
        this.element('next').addEventListener('click', () => {
            this.currentPage += 1;
            void this.loadQueue();
        }, { signal });
    }
}

let embeddedController: AdminGuidedPathwayFlagsController | null = null;

function updateEmbeddedAwaitingReviewCount(count: number): void {
    const badge = document.getElementById('admin-guided-alert-count');
    if (!badge) return;
    badge.textContent = String(count);
    badge.setAttribute('aria-label', `${count} awaiting review`);
}

/** Initialize the reusable queue inside the existing shared Flags tab. */
export async function initializeAdminGuidedPathwayFlags(): Promise<void> {
    const root = document.getElementById('admin-guided-pathway-alerts-content');
    if (!root) return;
    embeddedController?.destroy();
    embeddedController = new AdminGuidedPathwayFlagsController(root, {
        showMobileMenuButton: true,
        onAwaitingReviewCountChange: updateEmbeddedAwaitingReviewCount,
    });
    await embeddedController.initialize();
}

/** Load the embedded queue the first time an administrator opens its Flags tab. */
export function activateAdminGuidedPathwayFlags(): void {
    void embeddedController?.activate();
}
