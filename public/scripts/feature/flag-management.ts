// public/scripts/feature/flag-management.ts

/**
 * Unified instructor Flag Management orchestrator.
 *
 * Merges manual flags and course-scoped Guided Pathway alerts into one list.
 *
 * @author EngE-AI Team
 * @date 2026-08-25
 * @version 1.0.0
 * @description Fetch, filter, render, and mutate unified course flag workflows.
 */

import {
    escalateManualFlag,
    fetchManualFlagsWithNames,
    updateManualFlagResponse,
    updateManualFlagStatus,
} from '../api/flag-api.js';
import { listPathways } from '../api/pathways-api.js';
import { decideGuidedPathwayFlag, listCourseGuidedPathwayFlags } from '../api/guided-pathway-flags-api.js';
import type {
    FlagManagementFilters,
    FlagReport,
    FlagWorkflowStatus,
    GuidedPathway,
    GuidedPathwayFlagDecision,
    GuidedPathwayFlagView,
    ManualFlagType,
    UnifiedFlagListItem,
} from '../types.js';
import { showErrorToast, showSuccessToast } from '../ui/toast-notification.js';
import {
    ALL_MANUAL_FLAG_TYPES,
    applyFlagFilters,
    countActiveAdvancedFilters,
    countByWorkflow,
    defaultFlagManagementFilters,
    defaultGuidedCategorySet,
    GUIDED_CATEGORY_OTHERS,
    normalizeGuidedFlag,
    normalizeManualFlag,
} from './flag-list-model.js';

const GP_FETCH_PAGE_SIZE = 200;

let activeCourseId = '';
let canAccessGuidedPathway = false;
let courseCreatedAt: Date | undefined;
let allItems: UnifiedFlagListItem[] = [];
let filters: FlagManagementFilters = defaultFlagManagementFilters();
let libraryPathwayIds = new Set<string>();
let listenersBound = false;

function getCourseIdFromContext(): string | null {
    if (activeCourseId) return activeCourseId;
    if (typeof window !== 'undefined' && (window as any).currentClass?.id) {
        return (window as any).currentClass.id as string;
    }
    return null;
}

function formatTimestamp(date: Date): string {
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) {
        return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    }
    if (diffDays === 1) {
        return `Yesterday, ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
    }
    if (diffDays < 7) {
        return date.toLocaleDateString('en-US', {
            weekday: 'long',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
        });
    }
    return date.toLocaleDateString('en-US', {
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

function setStatusMessage(message: string): void {
    const status = document.getElementById('flag-management-status');
    if (status) status.textContent = message;
}

function findItem(flagId: string, source?: string): UnifiedFlagListItem | undefined {
    return allItems.find((item) => item.id === flagId && (!source || item.source === source));
}

function filterOptions() {
    return { libraryPathwayIds };
}

function renderGuidedCategoryCheckboxes(pathways: GuidedPathway[]): void {
    const container = document.getElementById('flag-guided-category-checkboxes');
    const fieldset = document.getElementById('flag-guided-categories-fieldset');
    if (!container || !fieldset) return;

    container.replaceChildren();
    for (const pathway of pathways) {
        const label = document.createElement('label');
        label.className = 'filter-checkbox';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.dataset.guidedCategory = pathway.id;
        input.checked = filters.guidedCategories.has(pathway.id);
        const text = document.createElement('span');
        text.className = 'filter-text';
        text.textContent = pathway.title;
        label.append(input, text);
        container.appendChild(label);
    }

    const othersLabel = document.createElement('label');
    othersLabel.className = 'filter-checkbox';
    const othersInput = document.createElement('input');
    othersInput.type = 'checkbox';
    othersInput.dataset.guidedCategory = GUIDED_CATEGORY_OTHERS;
    othersInput.checked = filters.guidedCategories.has(GUIDED_CATEGORY_OTHERS);
    const othersText = document.createElement('span');
    othersText.className = 'filter-text';
    othersText.textContent = 'Others';
    othersLabel.append(othersInput, othersText);
    container.appendChild(othersLabel);

    updateGuidedCategoryFieldsetVisibility();
}

function updateGuidedCategoryFieldsetVisibility(): void {
    const fieldset = document.getElementById('flag-guided-categories-fieldset');
    const guidedSource = document.getElementById('flag-source-guided') as HTMLInputElement | null;
    if (!fieldset) return;
    const show = canAccessGuidedPathway;
    fieldset.hidden = !show;
    if (!show) return;
    const guidedChecked = guidedSource?.checked ?? false;
    fieldset.toggleAttribute('disabled', !guidedChecked);
}

async function loadPathwayLibrary(): Promise<void> {
    const courseId = getCourseIdFromContext();
    if (!canAccessGuidedPathway || !courseId) {
        libraryPathwayIds = new Set();
        return;
    }

    try {
        const pathways = await listPathways(courseId);
        libraryPathwayIds = new Set(pathways.map((pathway) => pathway.id));
        renderGuidedCategoryCheckboxes(pathways);
    } catch (error) {
        libraryPathwayIds = new Set();
        renderGuidedCategoryCheckboxes([]);
        showErrorToast(
            error instanceof Error
                ? error.message
                : 'Unable to load Pathway Library categories. Guided Pathway flags are grouped under Others.'
        );
    }
}

async function loadAllFlags(): Promise<void> {
    const courseId = getCourseIdFromContext();
    if (!courseId) throw new Error('Unable to determine course context');

    const list = document.getElementById('flags-list');
    list?.setAttribute('aria-busy', 'true');
    setStatusMessage('Loading flags...');

    const manualPromise = fetchManualFlagsWithNames(courseId);
    const guidedPromise = canAccessGuidedPathway
        ? listCourseGuidedPathwayFlags(courseId, { page: 1, pageSize: GP_FETCH_PAGE_SIZE })
        : Promise.resolve({ items: [], page: 1, pageSize: GP_FETCH_PAGE_SIZE, total: 0 });

    const [manualFlags, guidedPage] = await Promise.all([
        manualPromise,
        guidedPromise.catch((error: unknown) => {
            showErrorToast(
                error instanceof Error ? error.message : 'Unable to load Guided Pathway alerts. Showing manual flags only.'
            );
            return { items: [], page: 1, pageSize: GP_FETCH_PAGE_SIZE, total: 0 };
        }),
    ]);

    const manualItems = manualFlags.map((flag) => {
        const createdAt = new Date(flag.createdAt || flag.date);
        return normalizeManualFlag(
            {
                ...flag,
                date: createdAt,
                createdAt,
                updatedAt: new Date(flag.updatedAt || flag.createdAt || createdAt),
            },
            formatTimestamp(createdAt)
        );
    });

    const guidedItems = guidedPage.items.map((flag) => normalizeGuidedFlag(flag));
    allItems = [...manualItems, ...guidedItems];
    list?.setAttribute('aria-busy', 'false');
    setStatusMessage('');
}

function updateFilterBadge(): void {
    const badge = document.getElementById('flag-filter-badge');
    const count = countActiveAdvancedFilters(filters, canAccessGuidedPathway, libraryPathwayIds);
    if (!badge) return;
    if (count > 0) {
        badge.textContent = String(count);
        badge.hidden = false;
    } else {
        badge.hidden = true;
    }
}

function setFilterPanelExpanded(expanded: boolean): void {
    const panel = document.getElementById('flag-filters-panel');
    const content = document.getElementById('flag-filters-panel-content');
    const toggle = document.getElementById('flag-filter-toggle-btn') as HTMLButtonElement | null;
    if (!panel || !content || !toggle) return;

    panel.classList.toggle('flag-filters-panel--collapsed', !expanded);
    panel.classList.toggle('flag-filters-panel--expanded', expanded);
    content.hidden = !expanded;
    toggle.setAttribute('aria-expanded', String(expanded));
    const label = expanded ? 'Hide filters' : 'Show filters';
    toggle.title = label;
    toggle.setAttribute('aria-label', label);
}

function bindFilterPanelToggle(): void {
    const toggle = document.getElementById('flag-filter-toggle-btn');
    toggle?.addEventListener('click', () => {
        const panel = document.getElementById('flag-filters-panel');
        const expanded = panel?.classList.contains('flag-filters-panel--expanded') ?? false;
        setFilterPanelExpanded(!expanded);
    });
}

function updateNavCounts(): void {
    const { workflowStatus: _omit, ...advanced } = filters;
    const counts = countByWorkflow(allItems, advanced, filterOptions());
    const unresolved = document.getElementById('unresolved-flags-count');
    const resolved = document.getElementById('resolved-flags-count');
    const escalated = document.getElementById('escalated-flags-count');
    if (unresolved) unresolved.textContent = String(counts.unresolved);
    if (resolved) resolved.textContent = String(counts.resolved);
    if (escalated) escalated.textContent = String(counts.escalated);
}

function updateNavTiles(): void {
    document.querySelectorAll<HTMLButtonElement>('.nav-tile[data-workflow]').forEach((tile) => {
        const selected = tile.dataset.workflow === filters.workflowStatus;
        tile.classList.toggle('active', selected);
        tile.setAttribute('aria-pressed', String(selected));
    });
}

function workflowEmptyMessage(): string {
    const label =
        filters.workflowStatus === 'unresolved'
            ? 'unresolved'
            : filters.workflowStatus === 'resolved'
              ? 'resolved'
              : 'escalated';
    if (filters.sources.size === 0) return 'Select at least one flag source in advanced filters.';
    return `No ${label} flags match your filters.`;
}

function createUnifiedFlagCard(item: UnifiedFlagListItem): HTMLElement {
    const card = document.createElement('div');
    card.className = item.collapsed ? 'flag-card' : 'flag-card expanded';
    card.classList.add(`flag-card--${item.source}`);
    card.dataset.flagId = item.id;
    card.dataset.source = item.source;

    const headerRow = document.createElement('div');
    headerRow.className = 'flag-header-row';
    const timeDiv = document.createElement('div');
    timeDiv.className = 'flag-time';
    timeDiv.textContent = formatTimestamp(item.sortDate);
    const titleDiv = document.createElement('div');
    titleDiv.className = `flag-card__title flag-card__source--${item.source === 'manual' ? 'manual' : 'guided'}`;
    const prefix = document.createElement('span');
    prefix.className = 'flag-card__title-prefix';
    prefix.textContent = `${item.titlePrefix}: `;
    const detail = document.createElement('span');
    detail.className = 'flag-card__title-detail';
    detail.textContent = item.titleDetail;
    titleDiv.append(prefix, detail);
    headerRow.append(timeDiv, titleDiv);

    const chatDiv = document.createElement('div');
    chatDiv.className = item.collapsed ? 'chat-content collapsed' : 'chat-content';
    chatDiv.textContent = `Chat: ${item.previewText}`;

    const footer = document.createElement('div');
    footer.className = 'flag-footer';
    const footerLabel = document.createElement('div');
    footerLabel.className = 'student-name';
    footerLabel.textContent = item.footerLabel;
    const statusBadge = document.createElement('div');
    statusBadge.className = 'status-badge';
    statusBadge.textContent = ` ${item.statusBadge}`;
    const expandArrow = document.createElement('div');
    expandArrow.className = 'expand-arrow';
    expandArrow.textContent = item.collapsed ? '▼' : '▲';
    footer.append(footerLabel, statusBadge, expandArrow);

    const expandedContent = document.createElement('div');
    expandedContent.className = 'expanded-content';
    expandedContent.appendChild(buildExpandedSection(item));

    card.append(headerRow, chatDiv, footer, expandedContent);
    return card;
}

function buildExpandedSection(item: UnifiedFlagListItem): HTMLElement {
    if (item.source === 'manual') {
        return buildManualExpandedSection(item);
    }
    return buildGuidedExpandedSection(item);
}

function buildManualExpandedSection(item: UnifiedFlagListItem): HTMLElement {
    const flag = item.raw as FlagReport;
    const section = document.createElement('div');
    section.className = 'response-section';

    if (flag.status === 'escalated') {
        const meta = document.createElement('div');
        meta.className = 'flag-escalation-meta';
        const escalatedAt = flag.escalatedAt ? new Date(flag.escalatedAt) : null;
        meta.textContent = `Escalated${flag.escalatedBy?.name ? ` by ${flag.escalatedBy.name}` : ''}${
            escalatedAt ? ` on ${formatTimestamp(escalatedAt)}` : ''
        }.${flag.adminReviewedAt ? ' Reviewed by platform administrators.' : ' Awaiting platform administrator review.'}`;
        section.appendChild(meta);
        return section;
    }

    const responseHeader = document.createElement('div');
    responseHeader.className = 'response-header';
    responseHeader.textContent = 'Response:';
    const responseTextarea = document.createElement('textarea');
    responseTextarea.className = 'response-textarea';
    responseTextarea.placeholder =
        flag.status === 'unresolved' ? 'Write your response to this flag...' : 'Response from instructor...';
    responseTextarea.value = flag.response || '';
    responseTextarea.readOnly = flag.status === 'resolved' && !item.editing;

    const responseActions = document.createElement('div');
    responseActions.className = 'response-actions';

    if (flag.status === 'unresolved') {
        const resolveButton = document.createElement('button');
        resolveButton.type = 'button';
        resolveButton.className = 'resolve-button';
        resolveButton.textContent = 'Resolve';
        resolveButton.dataset.flagId = flag.id;
        resolveButton.dataset.action = 'resolve';

        const escalateButton = document.createElement('button');
        escalateButton.type = 'button';
        escalateButton.className = 'escalate-button';
        escalateButton.textContent = 'Escalate to Admins';
        escalateButton.dataset.flagId = flag.id;
        escalateButton.dataset.action = 'escalate';

        responseActions.append(resolveButton, escalateButton);
    } else {
        const resolveButton = document.createElement('button');
        resolveButton.type = 'button';
        resolveButton.className = 'resolve-button';
        resolveButton.textContent = 'Unresolved';
        resolveButton.dataset.flagId = flag.id;
        resolveButton.dataset.action = 'reopen';
        responseActions.appendChild(resolveButton);

        const editButton = document.createElement('button');
        editButton.type = 'button';
        editButton.className = `edit-button ${item.editing ? 'editing' : ''}`;
        editButton.textContent = item.editing ? 'Save' : 'Edit';
        editButton.dataset.flagId = flag.id;
        editButton.dataset.action = item.editing ? 'save-edit' : 'edit';
        responseActions.appendChild(editButton);
    }

    section.append(responseHeader, responseTextarea, responseActions);
    return section;
}

function buildGuidedExpandedSection(item: UnifiedFlagListItem): HTMLElement {
    const flag = item.raw as GuidedPathwayFlagView;
    const section = document.createElement('div');
    section.className = 'response-section guided-pathway-expanded';

    const meta = document.createElement('div');
    meta.className = 'flag-escalation-meta';
    meta.textContent = `Pathway: ${flag.pathwayTitle}${
        flag.decidedAt ? ` · Decision recorded ${formatTimestamp(new Date(flag.decidedAt))}` : ''
    }`;
    section.appendChild(meta);

    if (flag.status === 'pending') {
        const actions = document.createElement('div');
        actions.className = 'response-actions';
        const dismissButton = document.createElement('button');
        dismissButton.type = 'button';
        dismissButton.className = 'guided-dismiss-button';
        dismissButton.textContent = 'Dismiss';
        dismissButton.dataset.flagId = flag.id;
        dismissButton.dataset.action = 'gp-dismiss';
        const escalateButton = document.createElement('button');
        escalateButton.type = 'button';
        escalateButton.className = 'escalate-button';
        escalateButton.textContent = 'Escalate to Admins';
        escalateButton.dataset.flagId = flag.id;
        escalateButton.dataset.action = 'gp-escalate';
        actions.append(dismissButton, escalateButton);
        section.appendChild(actions);
    }
    return section;
}

function renderUnifiedFlags(): void {
    const list = document.getElementById('flags-list');
    if (!list) return;

    const visible = applyFlagFilters(allItems, filters, filterOptions());
    list.replaceChildren();
    updateNavCounts();
    updateNavTiles();
    updateFilterBadge();

    if (visible.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'flags-list-empty';
        empty.textContent = workflowEmptyMessage();
        list.appendChild(empty);
        replaceFeatherIcons();
        return;
    }

    visible.forEach((item) => list.appendChild(createUnifiedFlagCard(item)));
    replaceFeatherIcons();
}

function toggleCollapse(flagId: string, source: string): void {
    const item = findItem(flagId, source);
    if (!item) return;
    item.collapsed = !item.collapsed;
    renderUnifiedFlags();
}

function readFiltersFromForm(): FlagManagementFilters {
    const next = defaultFlagManagementFilters(courseCreatedAt, libraryPathwayIds);
    next.workflowStatus = filters.workflowStatus;
    next.sources.clear();
    if ((document.getElementById('flag-source-manual') as HTMLInputElement | null)?.checked) {
        next.sources.add('manual');
    }
    if (canAccessGuidedPathway && (document.getElementById('flag-source-guided') as HTMLInputElement | null)?.checked) {
        next.sources.add('guided-pathway');
    }
    next.manualCategories.clear();
    document.querySelectorAll<HTMLInputElement>('#flag-filter-checkboxes input[data-filter]').forEach((input) => {
        const category = input.dataset.filter as ManualFlagType | undefined;
        if (category && input.checked) next.manualCategories.add(category);
    });
    next.guidedCategories.clear();
    document
        .querySelectorAll<HTMLInputElement>('#flag-guided-category-checkboxes input[data-guided-category]')
        .forEach((input) => {
            const category = input.dataset.guidedCategory;
            if (category && input.checked) next.guidedCategories.add(category);
        });
    const preset = (document.getElementById('flag-period-preset') as HTMLSelectElement | null)?.value as FlagManagementFilters['period']['preset'];
    next.period.preset = preset ?? 'all';
    if (preset === 'custom') {
        const fromValue = (document.getElementById('flag-period-from') as HTMLInputElement | null)?.value;
        const toValue = (document.getElementById('flag-period-to') as HTMLInputElement | null)?.value;
        next.period.from = fromValue ? new Date(`${fromValue}T00:00:00`) : undefined;
        next.period.to = toValue ? new Date(`${toValue}T23:59:59`) : undefined;
    }
    next.period.courseCreatedAt = courseCreatedAt;
    return next;
}

function syncFiltersToForm(): void {
    const manualSource = document.getElementById('flag-source-manual') as HTMLInputElement | null;
    const guidedSource = document.getElementById('flag-source-guided') as HTMLInputElement | null;
    if (manualSource) manualSource.checked = filters.sources.has('manual');
    if (guidedSource) guidedSource.checked = filters.sources.has('guided-pathway');
    document.querySelectorAll<HTMLInputElement>('#flag-filter-checkboxes input[data-filter]').forEach((input) => {
        const category = input.dataset.filter as ManualFlagType | undefined;
        if (category) input.checked = filters.manualCategories.has(category);
    });
    document
        .querySelectorAll<HTMLInputElement>('#flag-guided-category-checkboxes input[data-guided-category]')
        .forEach((input) => {
            const category = input.dataset.guidedCategory;
            if (category) input.checked = filters.guidedCategories.has(category);
        });
    const manualFieldset = document.getElementById('flag-manual-categories-fieldset');
    if (manualFieldset) manualFieldset.toggleAttribute('disabled', !filters.sources.has('manual'));
    updateGuidedCategoryFieldsetVisibility();
    const presetSelect = document.getElementById('flag-period-preset') as HTMLSelectElement | null;
    if (presetSelect) presetSelect.value = filters.period.preset;
    const customWrap = document.getElementById('flag-period-custom');
    if (customWrap) customWrap.hidden = filters.period.preset !== 'custom';
}

async function handleManualResolve(flagId: string, response?: string): Promise<void> {
    const courseId = getCourseIdFromContext();
    if (!courseId) throw new Error('Unable to determine course context');
    await updateManualFlagStatus(courseId, flagId, 'resolved', response);
    showSuccessToast('Flag resolved successfully.');
}

async function handleManualReopen(flagId: string): Promise<void> {
    const courseId = getCourseIdFromContext();
    if (!courseId) throw new Error('Unable to determine course context');
    await updateManualFlagStatus(courseId, flagId, 'unresolved');
    showSuccessToast('Flag reopened.');
}

async function handleManualEscalate(flagId: string): Promise<void> {
    const courseId = getCourseIdFromContext();
    if (!courseId) throw new Error('Unable to determine course context');
    await escalateManualFlag(courseId, flagId);
    showSuccessToast('Flag escalated to administrators.');
}

async function handleManualSaveEdit(flagId: string, response: string): Promise<void> {
    const courseId = getCourseIdFromContext();
    if (!courseId) throw new Error('Unable to determine course context');
    await updateManualFlagResponse(courseId, flagId, response);
    showSuccessToast('Response saved.');
}

async function handleGuidedDecision(flagId: string, decision: GuidedPathwayFlagDecision): Promise<void> {
    const courseId = getCourseIdFromContext();
    if (!courseId) throw new Error('Unable to determine course context');
    await decideGuidedPathwayFlag(courseId, flagId, decision);
    showSuccessToast(decision === 'escalate' ? 'Escalation decision recorded.' : 'Alert dismissed.');
}

async function handleCardAction(button: HTMLButtonElement): Promise<void> {
    const flagId = button.dataset.flagId;
    const action = button.dataset.action;
    const card = button.closest('.flag-card') as HTMLElement | null;
    const source = card?.dataset.source;
    if (!flagId || !action || !source) return;

    const item = findItem(flagId, source);
    if (!item) return;

    button.disabled = true;
    try {
        if (action === 'resolve') {
            const textarea = card?.querySelector('.response-textarea') as HTMLTextAreaElement | null;
            await handleManualResolve(flagId, textarea?.value?.trim() || undefined);
        } else if (action === 'reopen') {
            await handleManualReopen(flagId);
        } else if (action === 'escalate') {
            await handleManualEscalate(flagId);
        } else if (action === 'edit') {
            item.editing = true;
            item.collapsed = false;
            renderUnifiedFlags();
            return;
        } else if (action === 'save-edit') {
            const textarea = card?.querySelector('.response-textarea') as HTMLTextAreaElement | null;
            await handleManualSaveEdit(flagId, textarea?.value?.trim() || '');
            item.editing = false;
        } else if (action === 'gp-dismiss') {
            await handleGuidedDecision(flagId, 'dismiss');
        } else if (action === 'gp-escalate') {
            await handleGuidedDecision(flagId, 'escalate');
        }
        await loadAllFlags();
        renderUnifiedFlags();
    } catch (error) {
        showErrorToast(error instanceof Error ? error.message : 'Unable to save this change.');
    } finally {
        button.disabled = false;
    }
}

function handleListClick(event: Event): void {
    const target = event.target as HTMLElement;
    const actionButton = target.closest('button[data-action]') as HTMLButtonElement | null;
    if (actionButton) {
        event.preventDefault();
        void handleCardAction(actionButton);
        return;
    }
    if (target.closest('.response-section')) return;
    const card = target.closest('.flag-card') as HTMLElement | null;
    if (!card?.dataset.flagId || !card.dataset.source) return;
    toggleCollapse(card.dataset.flagId, card.dataset.source);
}

function bindListeners(): void {
    if (listenersBound) return;
    listenersBound = true;

    document.querySelectorAll<HTMLButtonElement>('.nav-tile[data-workflow]').forEach((tile) => {
        tile.addEventListener('click', () => {
            const workflow = tile.dataset.workflow as FlagWorkflowStatus | undefined;
            if (!workflow || workflow === filters.workflowStatus) return;
            filters.workflowStatus = workflow;
            renderUnifiedFlags();
        });
    });

    bindFilterPanelToggle();

    document.getElementById('flag-filter-apply-btn')?.addEventListener('click', () => {
        filters = readFiltersFromForm();
        renderUnifiedFlags();
        setFilterPanelExpanded(false);
    });
    document.getElementById('flag-filter-clear-btn')?.addEventListener('click', () => {
        filters = defaultFlagManagementFilters(courseCreatedAt, libraryPathwayIds);
        if (!canAccessGuidedPathway) {
            filters.sources = new Set(['manual']);
        }
        syncFiltersToForm();
        renderUnifiedFlags();
    });

    document.getElementById('flag-period-preset')?.addEventListener('change', (event) => {
        const value = (event.target as HTMLSelectElement).value;
        const customWrap = document.getElementById('flag-period-custom');
        if (customWrap) customWrap.hidden = value !== 'custom';
    });

    document.getElementById('flag-source-manual')?.addEventListener('change', () => {
        const fieldset = document.getElementById('flag-manual-categories-fieldset');
        const manualChecked = (document.getElementById('flag-source-manual') as HTMLInputElement).checked;
        if (fieldset) fieldset.toggleAttribute('disabled', !manualChecked);
    });

    document.getElementById('flag-source-guided')?.addEventListener('change', () => {
        updateGuidedCategoryFieldsetVisibility();
    });

    document.getElementById('flags-list')?.addEventListener('click', handleListClick);
}

/** Initialize unified Flag Management for the active instructor course. */
export async function initializeFlagManagement(options: {
    courseId: string;
    canAccessGuidedPathway: boolean;
    courseCreatedAt?: string | Date;
}): Promise<void> {
    activeCourseId = options.courseId;
    canAccessGuidedPathway = options.canAccessGuidedPathway;
    courseCreatedAt = options.courseCreatedAt ? new Date(options.courseCreatedAt) : undefined;
    libraryPathwayIds = new Set();

    if (canAccessGuidedPathway) {
        await loadPathwayLibrary();
    }

    filters = defaultFlagManagementFilters(courseCreatedAt, libraryPathwayIds);
    if (!canAccessGuidedPathway) {
        filters.sources = new Set(['manual']);
        filters.guidedCategories = defaultGuidedCategorySet();
    }

    const guidedWrap = document.getElementById('flag-source-guided-wrap');
    if (guidedWrap) guidedWrap.hidden = !canAccessGuidedPathway;

    listenersBound = false;
    bindListeners();
    syncFiltersToForm();
    setFilterPanelExpanded(false);
    replaceFeatherIcons();

    try {
        await loadAllFlags();
        renderUnifiedFlags();
    } catch (error) {
        setStatusMessage('');
        showErrorToast(error instanceof Error ? error.message : 'Failed to load flags.');
    }
}
