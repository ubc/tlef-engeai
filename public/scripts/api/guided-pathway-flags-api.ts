// public/scripts/api/guided-pathway-flags-api.ts

/**
 * Anonymous Guided Pathway alert API helpers for course staff and platform admins.
 *
 * @author EngE-AI Team
 * @date 2026-08-08
 * @version 1.0.0
 * @description Safe client helpers for Guided Pathway alert list and review APIs.
 */

import type {
    GuidedPathwayFlagDecision,
    GuidedPathwayFlagListPage,
    GuidedPathwayFlagReviewState,
    GuidedPathwayFlagStatus,
    GuidedPathwayFlagView,
} from '../types.js';

interface ApiEnvelope<T> {
    success?: boolean;
    data?: T;
    error?: string;
}

export interface AdminGuidedPathwayFlagFilters {
    page?: number;
    pageSize?: number;
    reviewState?: GuidedPathwayFlagReviewState;
    status?: GuidedPathwayFlagStatus;
    academicPeriodId?: string;
    courseId?: string;
    pathwayId?: string;
    reviewer?: string;
    dateFrom?: string;
    dateTo?: string;
}

export interface RevealedGuidedPathwayIdentity {
    studentName: string;
}

async function parseData<T>(response: Response): Promise<T> {
    const body = (await response.json().catch(() => ({}))) as ApiEnvelope<T> & Record<string, unknown>;
    if (!response.ok || body.success === false || body.data === undefined) {
        throw new Error(body.error || `Request failed (${response.status})`);
    }
    return body.data;
}

function setOptionalParam(params: URLSearchParams, key: string, value: unknown): void {
    if (value === undefined || value === null || value === '' || value === 'all') return;
    params.set(key, String(value));
}

/** Load one anonymous, course-scoped Guided Pathway alert page. */
export async function listCourseGuidedPathwayFlags(
    courseId: string,
    options: {
        status?: GuidedPathwayFlagStatus;
        page?: number;
        pageSize?: number;
    } = {}
): Promise<GuidedPathwayFlagListPage> {
    const params = new URLSearchParams();
    setOptionalParam(params, 'status', options.status);
    params.set('page', String(options.page ?? 1));
    params.set('pageSize', String(options.pageSize ?? 20));
    const response = await fetch(
        `/api/courses/${encodeURIComponent(courseId)}/guided-pathway-flags?${params.toString()}`,
        { credentials: 'same-origin' }
    );
    return parseData<GuidedPathwayFlagListPage>(response);
}

/** Persist an instructor decision without deleting the alert. */
export async function decideGuidedPathwayFlag(
    courseId: string,
    flagId: string,
    decision: GuidedPathwayFlagDecision
): Promise<GuidedPathwayFlagView> {
    const response = await fetch(
        `/api/courses/${encodeURIComponent(courseId)}/guided-pathway-flags/${encodeURIComponent(flagId)}/decision`,
        {
            method: 'PATCH',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ decision }),
        }
    );
    return parseData<GuidedPathwayFlagView>(response);
}

/** Load the platform-admin, cross-course anonymous alert queue. */
export async function listAdminGuidedPathwayFlags(
    filters: AdminGuidedPathwayFlagFilters = {}
): Promise<GuidedPathwayFlagListPage> {
    const params = new URLSearchParams();
    params.set('page', String(filters.page ?? 1));
    params.set('pageSize', String(filters.pageSize ?? 20));
    setOptionalParam(params, 'reviewState', filters.reviewState);
    setOptionalParam(params, 'status', filters.status);
    setOptionalParam(params, 'academicPeriodId', filters.academicPeriodId);
    setOptionalParam(params, 'courseId', filters.courseId);
    setOptionalParam(params, 'pathwayId', filters.pathwayId);
    setOptionalParam(params, 'reviewer', filters.reviewer);
    setOptionalParam(params, 'dateFrom', filters.dateFrom);
    setOptionalParam(params, 'dateTo', filters.dateTo);

    const response = await fetch(`/api/admin/guided-pathway-flags?${params.toString()}`, {
        credentials: 'same-origin',
    });
    return parseData<GuidedPathwayFlagListPage>(response);
}

/** Mark an escalated alert as reviewed by the current platform administrator. */
export async function reviewAdminGuidedPathwayFlag(flagId: string): Promise<GuidedPathwayFlagView> {
    const response = await fetch(
        `/api/admin/guided-pathway-flags/${encodeURIComponent(flagId)}/review`,
        {
            method: 'PATCH',
            credentials: 'same-origin',
        }
    );
    return parseData<GuidedPathwayFlagView>(response);
}

/**
 * Reveal one escalated alert's student name after the server records the audit event.
 * The returned name is intentionally not part of any list DTO.
 */
export async function revealAdminGuidedPathwayFlagIdentity(
    flagId: string
): Promise<RevealedGuidedPathwayIdentity> {
    const response = await fetch(
        `/api/admin/guided-pathway-flags/${encodeURIComponent(flagId)}/reveal-identity`,
        {
            method: 'POST',
            credentials: 'same-origin',
        }
    );
    const data = await parseData<Record<string, unknown>>(response);
    const studentName = data.studentName ?? data.displayName ?? data.name;
    if (typeof studentName !== 'string' || studentName.trim() === '') {
        throw new Error('The server did not return a student name.');
    }
    return { studentName };
}
