// public/scripts/api/scenario-questions-api.ts

/**
 * scenario-questions-api.ts
 *
 * @author: @gatahcha
 * @date: 2026-07-03
 * @description: Thin client for Practice Scenarios / Scenario Questions. Feature modules
 * (`scenarios-student.ts`, `scenario-questions.ts`) call only this file — never the mock or fetch
 * directly — so the P2 backend cutover to real `/api/courses/:courseId/scenario-questions*`
 * endpoints only changes function bodies here, not call sites.
 */

import type {
    ScenarioQuestion,
    ScenarioQuestionForStudent,
    ScenarioQuestionStatus,
    ScenarioPartId,
    ScenarioPartFeedbackResponse,
    ScenarioGenerateRequest,
    ScenarioGenerateResponse,
} from '../types.js';

function apiBase(courseId: string): string {
    return `/api/courses/${courseId}/scenario-questions`;
}

async function parseJsonOrThrow(response: Response): Promise<any> {
    let data: any = null;
    try {
        data = await response.json();
    } catch {
        // Non-JSON error body (e.g. proxy/502) — fall through to status-based error below.
    }
    if (!response.ok) {
        throw new Error(data?.error || `Request failed with status ${response.status}`);
    }
    if (data && data.success === false) {
        throw new Error(data.error || 'Request failed');
    }
    return data;
}

/** Instructor list — all statuses; optional `status` / `topicOrWeekId` filters. */
export async function fetchScenarioQuestions(
    courseId: string,
    filters?: { status?: ScenarioQuestionStatus; topicOrWeekId?: string }
): Promise<ScenarioQuestion[]> {
    const params = new URLSearchParams();
    if (filters?.status) params.set('status', filters.status);
    if (filters?.topicOrWeekId) params.set('topicOrWeekId', filters.topicOrWeekId);
    const query = params.toString();
    const response = await fetch(`${apiBase(courseId)}${query ? `?${query}` : ''}`, {
        method: 'GET',
        credentials: 'same-origin',
    });
    const data = await parseJsonOrThrow(response);
    return (data.data ?? []) as ScenarioQuestion[];
}

/** Student list — published only, optionally scoped to one chapter. */
export async function fetchPublishedScenarioQuestions(
    courseId: string,
    topicOrWeekId?: string
): Promise<ScenarioQuestionForStudent[]> {
    const params = new URLSearchParams();
    if (topicOrWeekId) params.set('topicOrWeekId', topicOrWeekId);
    const query = params.toString();
    const response = await fetch(`${apiBase(courseId)}${query ? `?${query}` : ''}`, {
        method: 'GET',
        credentials: 'same-origin',
    });
    const data = await parseJsonOrThrow(response);
    return (data.data ?? []) as ScenarioQuestionForStudent[];
}

/**
 * Fetches one question by id. Returns `null` on 404 (draft hidden from students, or deleted) —
 * callers render a "not found" state instead of throwing.
 */
export async function fetchScenarioQuestion(
    courseId: string,
    questionId: string
): Promise<ScenarioQuestion | ScenarioQuestionForStudent | null> {
    const response = await fetch(`${apiBase(courseId)}/${questionId}`, {
        method: 'GET',
        credentials: 'same-origin',
    });
    if (response.status === 404) {
        return null;
    }
    const data = await parseJsonOrThrow(response);
    return data.data as ScenarioQuestion | ScenarioQuestionForStudent;
}

export async function createScenarioQuestion(
    courseId: string,
    input: Partial<ScenarioQuestion>
): Promise<ScenarioQuestion> {
    const response = await fetch(apiBase(courseId), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
    });
    const data = await parseJsonOrThrow(response);
    return data.data as ScenarioQuestion;
}

export async function updateScenarioQuestion(
    courseId: string,
    questionId: string,
    patch: Partial<ScenarioQuestion>
): Promise<ScenarioQuestion> {
    const response = await fetch(`${apiBase(courseId)}/${questionId}`, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
    });
    const data = await parseJsonOrThrow(response);
    return data.data as ScenarioQuestion;
}

export async function patchScenarioQuestionStatus(
    courseId: string,
    questionId: string,
    status: ScenarioQuestionStatus
): Promise<ScenarioQuestion> {
    const response = await fetch(`${apiBase(courseId)}/${questionId}/status`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
    });
    const data = await parseJsonOrThrow(response);
    return data.data as ScenarioQuestion;
}

export async function deleteScenarioQuestion(courseId: string, questionId: string): Promise<void> {
    const response = await fetch(`${apiBase(courseId)}/${questionId}`, {
        method: 'DELETE',
        credentials: 'same-origin',
    });
    await parseJsonOrThrow(response);
}

export async function generateScenarioQuestions(
    courseId: string,
    request: ScenarioGenerateRequest
): Promise<ScenarioGenerateResponse> {
    const response = await fetch(`${apiBase(courseId)}/generate`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
    });
    const data = await parseJsonOrThrow(response);
    return data as ScenarioGenerateResponse;
}

export async function checkScenarioAnswer(
    courseId: string,
    questionId: string,
    partId: ScenarioPartId,
    studentAnswer: string
): Promise<ScenarioPartFeedbackResponse> {
    const response = await fetch(`${apiBase(courseId)}/${questionId}/check-answer`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partId, studentAnswer }),
    });
    const data = await parseJsonOrThrow(response);
    return data as ScenarioPartFeedbackResponse;
}

/** Gated reveal — resolves `null` when the server has not unlocked the solution yet (still 200 with `unlocked: false`). */
export async function fetchScenarioSolution(
    courseId: string,
    questionId: string
): Promise<{ questionBody: string; solutionBody: string; subQuestions: ScenarioQuestion['subQuestions'] } | null> {
    const response = await fetch(`${apiBase(courseId)}/${questionId}/solution`, {
        method: 'GET',
        credentials: 'same-origin',
    });
    if (response.status === 403) {
        return null;
    }
    const data = await parseJsonOrThrow(response);
    return data.unlocked === false ? null : (data.data as any);
}
