// public/scripts/feature/guided-pathway-flags.ts

/**
 * Instructor Guided Pathway Alerts tab.
 * Keeps automatic anonymous alerts isolated from identity-enriched manual flags.
 *
 * @author EngE-AI Team
 * @date 2026-08-09
 * @version 1.1.0
 * @description Shared Flags tab with course-scoped instructor and cross-course admin alert views.
 */

import type {
    GuidedPathwayFlagDecision,
    GuidedPathwayFlagListPage,
    GuidedPathwayFlagStatus,
    GuidedPathwayFlagView,
} from '../types.js';
import {
    decideGuidedPathwayFlag,
    listCourseGuidedPathwayFlags,
} from '../api/guided-pathway-flags-api.js';
import {
    activateAdminGuidedPathwayFlags,
    initializeAdminGuidedPathwayFlags,
} from './admin-guided-pathway-flags.js';
import { showErrorToast, showSuccessToast } from '../ui/toast-notification.js';

const PAGE_SIZE = 20;

let activeCourseId = '';
let activeStatus: GuidedPathwayFlagStatus = 'pending';
let activePage = 1;
let currentPage: GuidedPathwayFlagListPage | null = null;
let hasLoadedGuidedAlerts = false;
let usesAdminQueue = false;

function formatDate(value: string | undefined): string {
    if (!value) return 'Unknown time';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unknown time';
    return new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(date);
}

function statusLabel(status: GuidedPathwayFlagStatus): string {
    if (status === 'escalated') return 'Escalated to LTIC';
    if (status === 'dismissed') return 'Dismissed';
    return 'Pending review';
}

function setDomainTab(domain: 'manual' | 'guided'): void {
    const manualTab = document.getElementById('manual-flags-tab');
    const guidedTab = document.getElementById('guided-pathway-alerts-tab');
    const manualPanel = document.getElementById('manual-flags-panel');
    const guidedPanel = document.getElementById('guided-pathway-alerts-panel');
    const guidedActive = domain === 'guided';

    manualTab?.setAttribute('aria-selected', String(!guidedActive));
    guidedTab?.setAttribute('aria-selected', String(guidedActive));
    if (manualTab instanceof HTMLButtonElement) manualTab.tabIndex = guidedActive ? -1 : 0;
    if (guidedTab instanceof HTMLButtonElement) guidedTab.tabIndex = guidedActive ? 0 : -1;
    if (manualPanel) manualPanel.hidden = guidedActive;
    if (guidedPanel) guidedPanel.hidden = !guidedActive;

    if (guidedActive) {
        if (usesAdminQueue) {
            activateAdminGuidedPathwayFlags();
        } else if (!hasLoadedGuidedAlerts) {
            hasLoadedGuidedAlerts = true;
            void loadGuidedAlerts();
        }
    }
}

function updateStatusControls(): void {
    document.querySelectorAll<HTMLButtonElement>('[data-guided-alert-status]').forEach((button) => {
        const selected = button.dataset.guidedAlertStatus === activeStatus;
        button.setAttribute('aria-pressed', String(selected));
    });
}

function setListStatus(message: string): void {
    const status = document.getElementById('guided-pathway-alerts-status');
    if (status) status.textContent = message;
}

function setListBusy(busy: boolean): void {
    const list = document.getElementById('guided-pathway-alerts-list');
    list?.setAttribute('aria-busy', String(busy));
    document.querySelectorAll<HTMLButtonElement>('[data-guided-alert-status]').forEach((button) => {
        button.disabled = busy;
    });
}

async function loadGuidedAlerts(): Promise<void> {
    if (!activeCourseId) return;
    setListBusy(true);
    setListStatus('Loading Guided Pathway alerts...');
    try {
        currentPage = await listCourseGuidedPathwayFlags(activeCourseId, {
            status: activeStatus,
            page: activePage,
            pageSize: PAGE_SIZE,
        });
        renderGuidedAlerts();
        setListStatus('');
    } catch (error) {
        currentPage = null;
        renderGuidedAlerts();
        setListStatus(error instanceof Error ? error.message : 'Unable to load Guided Pathway alerts.');
    } finally {
        setListBusy(false);
    }
}

function createMetadata(label: string, value: string): HTMLElement {
    const item = document.createElement('span');
    item.className = 'guided-pathway-alert-card__metadata-item';
    const key = document.createElement('strong');
    key.textContent = `${label}: `;
    item.append(key, document.createTextNode(value));
    return item;
}

function createDecisionButton(
    flag: GuidedPathwayFlagView,
    decision: GuidedPathwayFlagDecision,
    label: string,
    modifier: string
): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `guided-pathway-alert-card__action ${modifier}`;
    button.textContent = label;
    button.addEventListener('click', () => void submitDecision(flag, decision, button));
    return button;
}

function createGuidedAlertCard(flag: GuidedPathwayFlagView): HTMLElement {
    const card = document.createElement('article');
    card.className = 'guided-pathway-alert-card';
    card.dataset.flagId = flag.id;

    const header = document.createElement('div');
    header.className = 'guided-pathway-alert-card__header';
    const title = document.createElement('h3');
    title.className = 'guided-pathway-alert-card__title';
    title.textContent = flag.pathwayTitle;
    const status = document.createElement('span');
    status.className = `guided-pathway-alert-card__status guided-pathway-alert-card__status--${flag.status}`;
    status.textContent = statusLabel(flag.status);
    header.append(title, status);

    const metadata = document.createElement('div');
    metadata.className = 'guided-pathway-alert-card__metadata';
    metadata.append(createMetadata('Triggered', formatDate(flag.triggeredAt)));
    if (flag.decidedAt) metadata.append(createMetadata('Decision recorded', formatDate(flag.decidedAt)));

    const messageLabel = document.createElement('h4');
    messageLabel.className = 'guided-pathway-alert-card__message-label';
    messageLabel.textContent = 'Student message';
    const message = document.createElement('p');
    message.className = 'guided-pathway-alert-card__message';
    message.textContent = flag.messageText;

    card.append(header, metadata, messageLabel, message);

    if (flag.status === 'pending') {
        const actions = document.createElement('div');
        actions.className = 'guided-pathway-alert-card__actions';
        actions.append(
            createDecisionButton(
                flag,
                'dismiss',
                'Dismiss',
                'guided-pathway-alert-card__action--secondary'
            ),
            createDecisionButton(
                flag,
                'escalate',
                'Escalate to LTIC',
                'guided-pathway-alert-card__action--primary'
            )
        );
        card.appendChild(actions);
    }

    return card;
}

async function submitDecision(
    flag: GuidedPathwayFlagView,
    decision: GuidedPathwayFlagDecision,
    clickedButton: HTMLButtonElement
): Promise<void> {
    const card = clickedButton.closest('.guided-pathway-alert-card');
    const buttons = card?.querySelectorAll<HTMLButtonElement>('button') ?? [];
    buttons.forEach((button) => {
        button.disabled = true;
    });
    clickedButton.setAttribute('aria-busy', 'true');

    try {
        await decideGuidedPathwayFlag(activeCourseId, flag.id, decision);
        showSuccessToast(decision === 'escalate' ? 'Escalation decision recorded.' : 'Alert dismissed.');
        await loadGuidedAlerts();
    } catch (error) {
        showErrorToast(error instanceof Error ? error.message : 'Unable to save this decision.');
        buttons.forEach((button) => {
            button.disabled = false;
        });
    } finally {
        clickedButton.removeAttribute('aria-busy');
    }
}

function renderPagination(): void {
    const summary = document.getElementById('guided-pathway-alerts-page-summary');
    const previous = document.getElementById('guided-pathway-alerts-previous') as HTMLButtonElement | null;
    const next = document.getElementById('guided-pathway-alerts-next') as HTMLButtonElement | null;
    const page = currentPage?.page ?? activePage;
    const total = currentPage?.total ?? 0;
    const pageSize = currentPage?.pageSize ?? PAGE_SIZE;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    if (summary) summary.textContent = `Page ${page} of ${totalPages}`;
    if (previous) previous.disabled = page <= 1;
    if (next) next.disabled = page >= totalPages;
}

function renderGuidedAlerts(): void {
    const list = document.getElementById('guided-pathway-alerts-list');
    if (!list) return;
    list.replaceChildren();

    const items = currentPage?.items ?? [];
    if (items.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'guided-pathway-alerts__empty';
        empty.textContent = `No ${statusLabel(activeStatus).toLowerCase()} Guided Pathway alerts.`;
        list.appendChild(empty);
    } else {
        items.forEach((flag) => list.appendChild(createGuidedAlertCard(flag)));
    }
    renderPagination();
}

/** Mount the role-appropriate Guided Pathway Alerts view inside the shared Flags tab. */
export async function initializeGuidedPathwayFlags(options: {
    courseId: string;
    canAccess: boolean;
    isAdmin?: boolean;
}): Promise<void> {
    activeCourseId = options.courseId;
    activeStatus = 'pending';
    activePage = 1;
    currentPage = null;
    hasLoadedGuidedAlerts = false;
    usesAdminQueue = options.isAdmin === true;

    const tabs = document.getElementById('flag-management-tabs');
    const guidedTab = document.getElementById('guided-pathway-alerts-tab');
    const manualPanel = document.getElementById('manual-flags-panel');
    const guidedPanel = document.getElementById('guided-pathway-alerts-panel');
    const courseContent = document.getElementById('course-guided-pathway-alerts-content');
    const adminContent = document.getElementById('admin-guided-pathway-alerts-content');
    const adminCount = document.getElementById('admin-guided-alert-count');

    if (!options.canAccess) {
        if (tabs) tabs.hidden = true;
        if (guidedTab) guidedTab.hidden = true;
        if (manualPanel) manualPanel.hidden = false;
        if (guidedPanel) guidedPanel.hidden = true;
        if (courseContent) courseContent.hidden = false;
        if (adminContent) adminContent.hidden = true;
        if (adminCount) adminCount.hidden = true;
        manualPanel?.removeAttribute('role');
        manualPanel?.removeAttribute('aria-labelledby');
        return;
    }

    manualPanel?.setAttribute('role', 'tabpanel');
    manualPanel?.setAttribute('aria-labelledby', 'manual-flags-tab');
    if (courseContent) courseContent.hidden = usesAdminQueue;
    if (adminContent) adminContent.hidden = !usesAdminQueue;
    if (adminCount) adminCount.hidden = !usesAdminQueue;
    if (usesAdminQueue) {
        await initializeAdminGuidedPathwayFlags();
    }

    if (tabs) tabs.hidden = false;
    if (guidedTab) guidedTab.hidden = false;
    setDomainTab('manual');

    document.getElementById('manual-flags-tab')?.addEventListener('click', () => setDomainTab('manual'));
    guidedTab?.addEventListener('click', () => setDomainTab('guided'));
    tabs?.addEventListener('keydown', (event) => {
        if (!(event instanceof KeyboardEvent)) return;
        const tabButtons = [
            document.getElementById('manual-flags-tab'),
            document.getElementById('guided-pathway-alerts-tab'),
        ].filter((element): element is HTMLButtonElement => element instanceof HTMLButtonElement);
        const currentIndex = tabButtons.indexOf(document.activeElement as HTMLButtonElement);
        if (currentIndex < 0) return;

        let nextIndex: number | null = null;
        if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabButtons.length;
        if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabButtons.length) % tabButtons.length;
        if (event.key === 'Home') nextIndex = 0;
        if (event.key === 'End') nextIndex = tabButtons.length - 1;
        if (nextIndex === null) return;

        event.preventDefault();
        const nextTab = tabButtons[nextIndex];
        nextTab.focus();
        setDomainTab(nextTab.id === 'guided-pathway-alerts-tab' ? 'guided' : 'manual');
    });

    document.querySelectorAll<HTMLButtonElement>('[data-guided-alert-status]').forEach((button) => {
        button.addEventListener('click', () => {
            const status = button.dataset.guidedAlertStatus as GuidedPathwayFlagStatus | undefined;
            if (!status || status === activeStatus) return;
            activeStatus = status;
            activePage = 1;
            updateStatusControls();
            void loadGuidedAlerts();
        });
    });

    document.getElementById('guided-pathway-alerts-previous')?.addEventListener('click', () => {
        if (activePage <= 1) return;
        activePage -= 1;
        void loadGuidedAlerts();
    });
    document.getElementById('guided-pathway-alerts-next')?.addEventListener('click', () => {
        activePage += 1;
        void loadGuidedAlerts();
    });
    updateStatusControls();
    renderGuidedAlerts();
}
