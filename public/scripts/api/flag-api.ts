// public/scripts/api/flag-api.ts

/**
 * Manual flag API helpers for instructor Flag Management.
 *
 * @author EngE-AI Team
 * @date 2026-08-25
 * @version 1.0.0
 * @description Client helpers for course-scoped manual flag list and lifecycle APIs.
 */

import type {
    FlagReport,
    ManualFlagEscalationListPage,
    ManualFlagStatus,
} from '../types.js';

interface ApiEnvelope<T> {
    success?: boolean;
    data?: T;
    error?: string;
}

async function parseData<T>(response: Response): Promise<T> {
    const body = (await response.json().catch(() => ({}))) as ApiEnvelope<T> & Record<string, unknown>;
    if (!response.ok || body.success === false || body.data === undefined) {
        throw new Error(body.error || `Request failed (${response.status})`);
    }
    return body.data;
}

/** Load all manual flags for a course with roster display names. */
export async function fetchManualFlagsWithNames(courseId: string): Promise<FlagReport[]> {
    const response = await fetch(`/api/courses/${encodeURIComponent(courseId)}/flags/with-names`, {
        credentials: 'same-origin',
    });
    return parseData<FlagReport[]>(response);
}

/** Resolve or reopen a manual flag. */
export async function updateManualFlagStatus(
    courseId: string,
    flagId: string,
    status: Extract<ManualFlagStatus, 'unresolved' | 'resolved'>,
    response?: string
): Promise<FlagReport> {
    const apiResponse = await fetch(`/api/courses/${encodeURIComponent(courseId)}/flags/${encodeURIComponent(flagId)}`, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, response: response || undefined }),
    });
    return parseData<FlagReport>(apiResponse);
}

/** Escalate an unresolved manual flag to platform administrators. */
export async function escalateManualFlag(courseId: string, flagId: string): Promise<FlagReport> {
    const response = await fetch(
        `/api/courses/${encodeURIComponent(courseId)}/flags/${encodeURIComponent(flagId)}/escalate`,
        {
            method: 'PATCH',
            credentials: 'same-origin',
        }
    );
    return parseData<FlagReport>(response);
}

/** Edit the instructor response on a resolved manual flag. */
export async function updateManualFlagResponse(
    courseId: string,
    flagId: string,
    response: string
): Promise<FlagReport> {
    const apiResponse = await fetch(
        `/api/courses/${encodeURIComponent(courseId)}/flags/${encodeURIComponent(flagId)}/response`,
        {
            method: 'PATCH',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ response }),
        }
    );
    return parseData<FlagReport>(apiResponse);
}

export interface AdminManualFlagFilters {
    page?: number;
    pageSize?: number;
    reviewState?: 'needs-review' | 'reviewed' | 'all';
    academicPeriodId?: string;
    courseId?: string;
    dateFrom?: string;
    dateTo?: string;
}

/** Load the platform-admin escalated manual flag queue. */
export async function listAdminManualFlagEscalations(
    filters: AdminManualFlagFilters = {}
): Promise<ManualFlagEscalationListPage> {
    const params = new URLSearchParams();
    params.set('page', String(filters.page ?? 1));
    params.set('pageSize', String(filters.pageSize ?? 20));
    if (filters.reviewState && filters.reviewState !== 'all') {
        params.set('reviewState', filters.reviewState);
    }
    if (filters.academicPeriodId) params.set('academicPeriodId', filters.academicPeriodId);
    if (filters.courseId) params.set('courseId', filters.courseId);
    if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) params.set('dateTo', filters.dateTo);
    const response = await fetch(`/api/admin/manual-flags?${params.toString()}`, {
        credentials: 'same-origin',
    });
    return parseData<ManualFlagEscalationListPage>(response);
}

/** Mark one escalated manual flag reviewed by the current platform administrator. */
export async function reviewAdminManualFlag(courseId: string, flagId: string): Promise<FlagReport> {
    const response = await fetch(
        `/api/admin/manual-flags/${encodeURIComponent(courseId)}/${encodeURIComponent(flagId)}/review`,
        {
            method: 'PATCH',
            credentials: 'same-origin',
        }
    );
    return parseData<FlagReport>(response);
}
