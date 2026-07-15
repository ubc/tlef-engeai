// public/scripts/api/scenario-questions-api.ts

/**
 * scenario-questions-api.ts
 *
 * Thin client for Practice Scenarios / Scenario Questions. Feature modules
 * (`scenarios-student.ts`, `scenario-questions-instructor.ts`) call only this file.
 *
 * @author: @gatahcha
 * @date: 2026-07-03
 * @version: 2.0.0
 * @description: Client API for scenario questions CRUD, generate, check-answer, submit-exam.
 */

import type {
    ScenarioQuestion,
    ScenarioQuestionForStudent,
    ScenarioQuestionStatus,
    ScenarioPartFeedbackResponse,
    ScenarioGenerateRequest,
    ScenarioGenerateResponse,
    ScenarioDifficulty,
    ScenarioMode,
    ScenarioExamAnswerInput,
    ScenarioExamSubmitResponse,
    ScenarioLearningObjectiveOption,
    ScenarioStudentResponse,
} from '../types.js';
import { defaultExpectedTimeMinutes } from '../types.js';

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
 * Fetches one question by id. Returns `null` on 404 (draft hidden from students, or deleted).
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

/** Topic-scoped learning objective catalog for instructor selectors. */
export async function fetchScenarioLearningObjectives(
    courseId: string,
    topicOrWeekId: string
): Promise<ScenarioLearningObjectiveOption[]> {
    const params = new URLSearchParams({ topicOrWeekId });
    const response = await fetch(`${apiBase(courseId)}/learning-objectives?${params}`, {
        method: 'GET',
        credentials: 'same-origin',
    });
    const data = await parseJsonOrThrow(response);
    return (data.data ?? []) as ScenarioLearningObjectiveOption[];
}

export async function checkScenarioAnswer(
    courseId: string,
    questionId: string,
    subQuestionId: string,
    studentAnswer: string,
    mode: ScenarioMode = 'practice'
): Promise<ScenarioPartFeedbackResponse> {
    const response = await fetch(`${apiBase(courseId)}/${questionId}/check-answer`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subQuestionId, studentAnswer, mode }),
    });
    const data = await parseJsonOrThrow(response);
    return data as ScenarioPartFeedbackResponse;
}

export async function submitScenarioExam(
    courseId: string,
    questionId: string,
    answers: ScenarioExamAnswerInput[]
): Promise<ScenarioExamSubmitResponse> {
    const response = await fetch(`${apiBase(courseId)}/${questionId}/submit-exam`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
    });
    const data = await parseJsonOrThrow(response);
    return data as ScenarioExamSubmitResponse;
}

export async function fetchScenarioResponseHistory(
    courseId: string,
    questionId: string
): Promise<Array<ScenarioStudentResponse & { subQuestionId: string }>> {
    const response = await fetch(`${apiBase(courseId)}/${questionId}/responses`, {
        method: 'GET',
        credentials: 'same-origin',
    });
    const data = await parseJsonOrThrow(response);
    return (data.data ?? []) as Array<ScenarioStudentResponse & { subQuestionId: string }>;
}

/** Gated reveal — `null` on 403 (solution not unlocked yet). Optional `subQuestionId` for practice per-part reveal. */
export async function fetchScenarioSolution(
    courseId: string,
    questionId: string,
    mode: ScenarioMode = 'practice',
    subQuestionId?: string
): Promise<{ questionBody: string; solutionBody: string; subQuestions: ScenarioQuestion['subQuestions'] } | null> {
    const params = new URLSearchParams({ mode });
    if (subQuestionId?.trim()) params.set('subQuestionId', subQuestionId.trim());
    const response = await fetch(`${apiBase(courseId)}/${questionId}/solution?${params}`, {
        method: 'GET',
        credentials: 'same-origin',
    });
    if (response.status === 403) {
        return null;
    }
    const data = await parseJsonOrThrow(response);
    return data.data as {
        questionBody: string;
        solutionBody: string;
        subQuestions: ScenarioQuestion['subQuestions'];
    };
}

/** Client-side publish pre-check (server re-validates on PATCH status). */
export function validatePublish(question: Pick<ScenarioQuestion, 'questionBody' | 'subQuestions'>): string | null {
    if (!question.questionBody?.trim()) return 'Base question narrative is required.';
    if (!question.subQuestions?.length) return 'At least one subquestion is required.';
    for (const sq of question.subQuestions) {
        const label = sq.subQuestionId || sq.partId || '?';
        if (!sq.prompt?.trim() || !sq.modelAnswer?.trim()) {
            return `Part (${label}) needs both prompt and answer key.`;
        }
    }
    return null;
}

/** Format a duration as MM:SS from total seconds. */
export function formatExpectedTime(totalSeconds: number): string {
    const sec = Math.max(0, Math.round(totalSeconds));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function expectedSecondsFromMinutes(minutes: number): number {
    return Math.max(0, Math.round(minutes * 60));
}

export function expectedMinutesFromSeconds(totalSeconds: number): number {
    return Math.max(0, totalSeconds) / 60;
}

export { defaultExpectedTimeMinutes };
export type { ScenarioDifficulty };
