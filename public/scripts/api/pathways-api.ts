// public/scripts/api/pathways-api.ts

/**
 * Pathways API — instructor Guided Pathway Library client helpers.
 */

import type { GuidedPathway, PathwayCta, PathwayEvaluationPromptConfig } from '../types.js';

function apiBase(courseId: string): string {
    return `/api/courses/${courseId}/pathways`;
}

async function parseJson(response: Response): Promise<any> {
    const json = await response.json().catch(() => ({}));
    if (!response.ok || json?.success === false) {
        throw new Error(json?.error || `Request failed (${response.status})`);
    }
    return json;
}

export async function listPathways(courseId: string): Promise<GuidedPathway[]> {
    const response = await fetch(apiBase(courseId), { credentials: 'include' });
    const json = await parseJson(response);
    return (json.data ?? []) as GuidedPathway[];
}

export async function createPathway(
    courseId: string,
    body: Partial<GuidedPathway> = {}
): Promise<GuidedPathway> {
    const response = await fetch(apiBase(courseId), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    const json = await parseJson(response);
    return json.data as GuidedPathway;
}

export async function updatePathway(
    courseId: string,
    pathwayId: string,
    body: {
        title?: string;
        triggerDescription?: string;
        assistantResponse?: string;
        enabled?: boolean;
        notifyInstructorOnTrigger?: boolean;
        ctas?: PathwayCta[];
    }
): Promise<GuidedPathway> {
    const response = await fetch(`${apiBase(courseId)}/${encodeURIComponent(pathwayId)}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    const json = await parseJson(response);
    return json.data as GuidedPathway;
}

export async function deletePathway(courseId: string, pathwayId: string): Promise<void> {
    const response = await fetch(`${apiBase(courseId)}/${encodeURIComponent(pathwayId)}`, {
        method: 'DELETE',
        credentials: 'include',
    });
    await parseJson(response);
}

export async function reorderPathways(courseId: string, orderedIds: string[]): Promise<GuidedPathway[]> {
    const response = await fetch(`${apiBase(courseId)}/reorder`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds }),
    });
    const json = await parseJson(response);
    return (json.data ?? []) as GuidedPathway[];
}

export async function resetPathways(courseId: string): Promise<GuidedPathway[]> {
    const response = await fetch(`${apiBase(courseId)}/reset`, {
        method: 'POST',
        credentials: 'include',
    });
    const json = await parseJson(response);
    return (json.data ?? []) as GuidedPathway[];
}

export async function getPathwayEvaluationPrompt(
    courseId: string
): Promise<PathwayEvaluationPromptConfig> {
    const response = await fetch(`${apiBase(courseId)}/evaluation-prompt`, {
        credentials: 'include',
    });
    const json = await parseJson(response);
    return json.data as PathwayEvaluationPromptConfig;
}

export async function updatePathwayEvaluationPrompt(
    courseId: string,
    body: string
): Promise<PathwayEvaluationPromptConfig> {
    const response = await fetch(`${apiBase(courseId)}/evaluation-prompt`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
    });
    const json = await parseJson(response);
    return json.data as PathwayEvaluationPromptConfig;
}

export async function resetPathwayEvaluationPrompt(
    courseId: string
): Promise<PathwayEvaluationPromptConfig> {
    const response = await fetch(`${apiBase(courseId)}/evaluation-prompt/reset`, {
        method: 'POST',
        credentials: 'include',
    });
    const json = await parseJson(response);
    return json.data as PathwayEvaluationPromptConfig;
}
