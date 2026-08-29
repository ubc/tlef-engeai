// public/scripts/feature/flag-list-model.ts

/**
 * Unified instructor flag list view model.
 *
 * Normalizes manual flags and Guided Pathway alerts into one filterable list shape.
 *
 * @author EngE-AI Team
 * @date 2026-08-25
 * @version 1.0.0
 * @description Pure normalizers and client-side filter pipeline for Flag Management.
 */

import type {
    FlagManagementFilters,
    FlagReport,
    FlagSource,
    FlagWorkflowStatus,
    GuidedPathwayFlagView,
    ManualFlagType,
    UnifiedFlagListItem,
} from '../types.js';

export const ALL_MANUAL_FLAG_TYPES: ManualFlagType[] = [
    'innacurate_response',
    'harassment',
    'inappropriate',
    'dishonesty',
    'interface bug',
    'other',
];

/** Filter bucket for GP flags whose pathwayId is missing or not in the current library. */
export const GUIDED_CATEGORY_OTHERS = 'others';

/**
 * Resolve a GP flag's filter category from its persisted pathway id and the current library.
 * Classification is id membership only — never title or keyword inference.
 */
export function guidedCategoryKey(
    pathwayId: string | undefined,
    libraryIds: ReadonlySet<string>
): string {
    if (!pathwayId?.trim()) return GUIDED_CATEGORY_OTHERS;
    return libraryIds.has(pathwayId) ? pathwayId : GUIDED_CATEGORY_OTHERS;
}

/** Default GP category selection: every library pathway id plus Others. */
export function defaultGuidedCategorySet(libraryPathwayIds: Iterable<string> = []): Set<string> {
    const categories = new Set<string>();
    for (const id of libraryPathwayIds) {
        if (id.trim()) categories.add(id);
    }
    categories.add(GUIDED_CATEGORY_OTHERS);
    return categories;
}

function setsEqual(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
    if (a.size !== b.size) return false;
    for (const value of a) {
        if (!b.has(value)) return false;
    }
    return true;
}

export function defaultFlagManagementFilters(libraryPathwayIds: Iterable<string> = []): FlagManagementFilters {
    return {
        workflowStatus: 'unresolved',
        sources: new Set<FlagSource>(['manual', 'guided-pathway']),
        manualCategories: new Set(ALL_MANUAL_FLAG_TYPES),
        guidedCategories: defaultGuidedCategorySet(libraryPathwayIds),
        period: {},
    };
}

function parseDate(value: string | Date | undefined): Date {
    if (!value) return new Date(0);
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

export function manualWorkflowStatus(status: FlagReport['status']): FlagWorkflowStatus {
    if (status === 'escalated') return 'escalated';
    if (status === 'resolved') return 'resolved';
    return 'unresolved';
}

export function guidedWorkflowStatus(status: GuidedPathwayFlagView['status']): FlagWorkflowStatus {
    if (status === 'escalated') return 'escalated';
    if (status === 'dismissed') return 'resolved';
    return 'unresolved';
}

function manualStatusBadge(status: FlagReport['status']): string {
    if (status === 'escalated') return 'Escalated to Admins';
    if (status === 'resolved') return 'Resolved';
    return 'Unresolved';
}

function guidedStatusBadge(status: GuidedPathwayFlagView['status']): string {
    if (status === 'escalated') return 'Escalated to Admins';
    if (status === 'dismissed') return 'Dismissed';
    return 'Pending';
}

export function normalizeManualFlag(flag: FlagReport, timestamp?: string): UnifiedFlagListItem {
    const sortDate = parseDate(flag.createdAt || flag.date);
    return {
        id: flag.id,
        source: 'manual',
        workflowStatus: manualWorkflowStatus(flag.status),
        sortDate,
        titlePrefix: "USER's FLAG",
        titleDetail: flag.reportType,
        previewText: flag.chatContent,
        footerLabel: flag.userName || 'Unknown Student',
        statusBadge: manualStatusBadge(flag.status),
        collapsed: true,
        editing: false,
        raw: flag,
    };
}

export function normalizeGuidedFlag(flag: GuidedPathwayFlagView): UnifiedFlagListItem {
    const sortDate = parseDate(flag.triggeredAt);
    return {
        id: flag.id,
        source: 'guided-pathway',
        workflowStatus: guidedWorkflowStatus(flag.status),
        sortDate,
        titlePrefix: 'GUIDED PATHWAY',
        titleDetail: flag.pathwayTitle,
        previewText: flag.messageText,
        footerLabel: 'Anonymous',
        statusBadge: guidedStatusBadge(flag.status),
        collapsed: true,
        editing: false,
        raw: flag,
    };
}

function resolvePeriodBounds(filters: FlagManagementFilters): { from?: Date; to?: Date } {
    const { from, to } = filters.period;
    if (!from && !to) return {};
    return { from, to };
}

function isInPeriod(sortDate: Date, bounds: { from?: Date; to?: Date }): boolean {
    if (bounds.from && sortDate < bounds.from) return false;
    if (bounds.to) {
        const end = new Date(bounds.to);
        end.setHours(23, 59, 59, 999);
        if (sortDate > end) return false;
    }
    return true;
}

export interface ApplyFlagFiltersOptions {
    /** Current Pathway Library ids used to classify GP flags (including Others). */
    libraryPathwayIds?: ReadonlySet<string>;
}

/** Filter and sort unified flag rows for the active instructor view. */
export function applyFlagFilters(
    items: UnifiedFlagListItem[],
    filters: FlagManagementFilters,
    options: ApplyFlagFiltersOptions = {}
): UnifiedFlagListItem[] {
    if (filters.sources.size === 0) return [];

    const periodBounds = resolvePeriodBounds(filters);
    const includeManual = filters.sources.has('manual');
    const includeGuided = filters.sources.has('guided-pathway');
    const libraryIds = options.libraryPathwayIds;

    return items
        .filter((item) => item.workflowStatus === filters.workflowStatus)
        .filter((item) => filters.sources.has(item.source))
        .filter((item) => {
            if (item.source !== 'manual' || !includeManual) return true;
            const manual = item.raw as FlagReport;
            return filters.manualCategories.has(manual.flagType);
        })
        .filter((item) => {
            if (item.source !== 'guided-pathway' || !includeGuided || !libraryIds) return true;
            const guided = item.raw as GuidedPathwayFlagView;
            const key = guidedCategoryKey(guided.pathwayId, libraryIds);
            return filters.guidedCategories.has(key);
        })
        .filter((item) => isInPeriod(item.sortDate, periodBounds))
        .sort((a, b) => b.sortDate.getTime() - a.sortDate.getTime());
}

/** Count items per workflow tab after advanced filters (excluding workflow tab itself). */
export function countByWorkflow(
    items: UnifiedFlagListItem[],
    filters: Omit<FlagManagementFilters, 'workflowStatus'>,
    options: ApplyFlagFiltersOptions = {}
): Record<FlagWorkflowStatus, number> {
    const counts: Record<FlagWorkflowStatus, number> = {
        unresolved: 0,
        resolved: 0,
        escalated: 0,
    };
    for (const status of ['unresolved', 'resolved', 'escalated'] as FlagWorkflowStatus[]) {
        counts[status] = applyFlagFilters(items, { ...filters, workflowStatus: status }, options).length;
    }
    return counts;
}

export function countActiveAdvancedFilters(
    filters: FlagManagementFilters,
    canAccessGuidedPathway: boolean,
    libraryPathwayIds: ReadonlySet<string> = new Set()
): number {
    let count = 0;
    const defaultSources = canAccessGuidedPathway ? 2 : 1;
    if (filters.sources.size !== defaultSources) count += 1;
    if (filters.manualCategories.size !== ALL_MANUAL_FLAG_TYPES.length) count += 1;
    if (
        canAccessGuidedPathway &&
        !setsEqual(filters.guidedCategories, defaultGuidedCategorySet(libraryPathwayIds))
    ) {
        count += 1;
    }
    if (filters.period.from || filters.period.to) count += 1;
    return count;
}
