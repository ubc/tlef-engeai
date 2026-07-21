// public/scripts/feature/scenarios-student.ts

/**
 * scenarios-student.ts
 *
 * Student Practice Scenarios: published question list, Practice/Exam workspace,
 * per-part check-answer (AI feedback), and gated solution flashcards.
 *
 * @author: EngE-AI Team
 * @date: 2026-07-13
 * @version: 3.0.0
 * @description: Student Practice Scenarios UI wired to scenario-questions-api.
 */

import {
    activeCourse,
    ScenarioQuestion,
    ScenarioQuestionForStudent,
    ScenarioSubQuestion,
    ScenarioSubQuestionType,
    ScenarioExamPartResult,
    ScenarioLearningObjectiveSnapshot,
    ScenarioPartFeedbackResponse,
} from '../types.js';
import {
    fetchPublishedScenarioQuestions,
    fetchScenarioQuestion,
    checkScenarioAnswer,
    fetchScenarioResponseHistory,
    fetchScenarioSolution,
    submitScenarioExam,
} from '../api/scenario-questions-api.js';
import { renderFeatherIcons } from '../api/api.js';
import { closeModal, showConfirmModal, showCustomModal, showWarningModal } from '../ui/modal-overlay.js';
import { showErrorToast } from '../ui/toast-notification.js';
import { flashcardToneIndex, parseAnswerKeyToFlashcards, SUB_QUESTION_TYPE_LABELS } from './scenario-answer-flashcard.js';
import { RenderChat } from './render-chat.js';
import { renderLatexInHtmlContent } from './chat.js';
import {
    getStudentScenariosParamsFromURL,
    navigateToStudentScenarios,
    type StudentScenariosUrlOptions,
} from '../utils/url-parser.js';

const renderChat = new RenderChat();

type ScenarioMode = 'practice' | 'exam';
type StatusFilter = 'all' | 'attempted' | 'unsolved';

interface StudentPartView {
    id: string;
    subQuestionType: ScenarioSubQuestionType;
    prompt: string;
    modelAnswer: string;
}

interface StudentQuestionView {
    id: string;
    title: string;
    chapter: string;
    topics: string[];
    date: string;
    attempted: boolean;
    narrative: string;
    topicLabel: string;
    learningObjectives: string[];
    expectedTimeMinutes: number;
    parts: StudentPartView[];
}

const EXAM_SECONDS_FALLBACK = 25 * 60;
const PRACTICE_DAILY_MAX_ATTEMPTS = 6;
const PRACTICE_COOLDOWN_MS = 30_000;
const PRACTICE_DAY_TIMEZONE = 'America/Vancouver';

let currentCourse: activeCourse | null = null;
let cachedList: StudentQuestionView[] = [];
/** Session-local attempted ids (no list progress API yet). */
const attemptedIds = new Set<string>();

let statusFilter: StatusFilter = 'all';
let activeQuestion: StudentQuestionView | null = null;
let activeMode: ScenarioMode | null = null;
let examSecondsLeft = EXAM_SECONDS_FALLBACK;
let examTimerId: ReturnType<typeof setInterval> | null = null;
let uiAbort: AbortController | null = null;
const flashcardIndexByPart = new Map<string, number>();
const flashcardNavDirByPart = new Map<string, 'prev' | 'next'>();
/** Today's practice attempt count per sub-question (from server history). */
const todayAttemptCountByPart = new Map<string, number>();
/** Cooldown expiry (ms since epoch) per sub-question. */
const cooldownUntilByPart = new Map<string, number>();
/** Daily limit reset (ms since epoch) per sub-question. */
const dailyLimitUntilByPart = new Map<string, number>();
/** Last persisted feedback time today per part — client-side cooldown hint. */
const lastFeedbackAtByPart = new Map<string, number>();
const cooldownTimerIdsByPart = new Map<string, ReturnType<typeof setTimeout>>();

interface ExamSubmittedState {
    overallGrade: number;
    results: ScenarioExamPartResult[];
    localAnswers: Map<string, string>;
}

interface RenderPartsOptions {
    submitted?: ExamSubmittedState | null;
}

/** Snapshot of the latest successful exam submit — used for View solutions re-render. */
let lastExamSubmission: ExamSubmittedState | null = null;

function getPracticeDayKey(date: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: PRACTICE_DAY_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(date);
}

function clearPracticeLimitTimers(): void {
    for (const id of cooldownTimerIdsByPart.values()) {
        clearTimeout(id);
    }
    cooldownTimerIdsByPart.clear();
    todayAttemptCountByPart.clear();
    cooldownUntilByPart.clear();
    dailyLimitUntilByPart.clear();
    lastFeedbackAtByPart.clear();
}

function buildScenarioChatPrefill(
    question: StudentQuestionView,
    part: StudentPartView,
    studentAnswer: string,
    answerKey: string
): string {
    const partIndex = question.parts.findIndex((p) => p.id === part.id);
    const partLabel = partIndex >= 0 ? `Part ${partIndex + 1}` : 'this part';
    const answerText = studentAnswer.trim() || '(not entered yet)';
    const answerKeyText = answerKey.trim() || '(not available)';
    return [
        "I'm working on a practice scenario and would like help thinking through this part.",
        '',
        '**Scenario**',
        question.narrative.trim(),
        '',
        `**${partLabel}**`,
        part.prompt.trim(),
        '',
        '**Answer Key**',
        answerKeyText,
        '',
        '**My answer**',
        answerText,
        '',
        'Please help me work through this step by step.',
    ].join('\n');
}

async function resolvePartAnswerKey(part: StudentPartView): Promise<string> {
    if (part.modelAnswer.trim()) return part.modelAnswer;
    if (!currentCourse || !activeQuestion || activeMode !== 'practice') return '';

    try {
        const solution = await fetchScenarioSolution(
            currentCourse.id,
            activeQuestion.id,
            'practice',
            part.id
        );
        if (!solution?.subQuestions?.length) return '';

        const modelAnswer = solution.subQuestions[0]?.modelAnswer?.trim() ?? '';
        if (modelAnswer) {
            part.modelAnswer = modelAnswer;
        }
        return modelAnswer;
    } catch {
        return '';
    }
}

async function openConversationForPart(part: StudentPartView): Promise<void> {
    if (!currentCourse || !activeQuestion) return;
    const textarea = document.querySelector<HTMLTextAreaElement>(
        `.sg-student-answer-input[data-sub-question-id="${part.id}"]`
    );
    const answer = textarea?.value?.trim() || '';
    const answerKey = await resolvePartAnswerKey(part);
    const draft = buildScenarioChatPrefill(activeQuestion, part, answer, answerKey);
    window.dispatchEvent(
        new CustomEvent('engeai-student-open-chat-draft', {
            detail: { courseId: currentCourse.id, text: draft },
        })
    );
}

async function loadPracticeResponseHistory(questionId: string): Promise<void> {
    if (!currentCourse) return;
    todayAttemptCountByPart.clear();
    lastFeedbackAtByPart.clear();
    try {
        const history = await fetchScenarioResponseHistory(currentCourse.id, questionId);
        const todayKey = getPracticeDayKey(new Date());
        const now = Date.now();
        for (const entry of history) {
            if (entry.mode !== 'practice') continue;
            if (getPracticeDayKey(new Date(entry.submittedAt)) !== todayKey) continue;
            const prev = todayAttemptCountByPart.get(entry.subQuestionId) ?? 0;
            todayAttemptCountByPart.set(entry.subQuestionId, prev + 1);
            const submittedMs = new Date(entry.submittedAt).getTime();
            const priorLast = lastFeedbackAtByPart.get(entry.subQuestionId) ?? 0;
            if (submittedMs > priorLast) {
                lastFeedbackAtByPart.set(entry.subQuestionId, submittedMs);
            }
        }
        for (const [partId, lastAt] of lastFeedbackAtByPart.entries()) {
            const elapsed = now - lastAt;
            if (elapsed < PRACTICE_COOLDOWN_MS) {
                cooldownUntilByPart.set(partId, lastAt + PRACTICE_COOLDOWN_MS);
                schedulePracticeButtonRefresh(partId, PRACTICE_COOLDOWN_MS - elapsed + 50);
            }
        }
    } catch {
        // ponytail: limits still enforced server-side if history load fails
    }
}

function schedulePracticeButtonRefresh(partId: string, delayMs: number): void {
    const existing = cooldownTimerIdsByPart.get(partId);
    if (existing) clearTimeout(existing);
    const timerId = setTimeout(() => {
        cooldownTimerIdsByPart.delete(partId);
        cooldownUntilByPart.delete(partId);
    }, delayMs);
    cooldownTimerIdsByPart.set(partId, timerId);
}

function isPracticeCooldownActive(partId: string): boolean {
    const until = cooldownUntilByPart.get(partId);
    return !!until && until > Date.now();
}

function isPracticeDailyLimitReached(partId: string): boolean {
    const todayCount = todayAttemptCountByPart.get(partId) ?? 0;
    return todayCount >= PRACTICE_DAILY_MAX_ATTEMPTS;
}

function revealStudentPanel(panel: HTMLElement): void {
    panel.hidden = false;
    panel.classList.remove('sg-student-panel--enter');
    // Force reflow so repeated reveals re-trigger the animation
    void panel.offsetWidth;
    panel.classList.add('sg-student-panel--enter');
    panel.addEventListener(
        'animationend',
        () => {
            panel.classList.remove('sg-student-panel--enter');
        },
        { once: true }
    );
}

function setAiFeedbackButtonLoading(partId: string, loading: boolean): void {
    const btn = document.querySelector<HTMLButtonElement>(
        `.sg-student-ai-btn[data-sub-question-id="${partId}"]`
    );
    if (!btn) return;
    btn.classList.toggle('is-loading', loading);
    btn.setAttribute('aria-busy', loading ? 'true' : 'false');
}

function showPracticeFeedbackLoading(partId: string): void {
    const panel = document.querySelector<HTMLElement>(`.sg-student-ai-feedback[data-sub-question-id="${partId}"]`);
    const body = panel?.querySelector<HTMLElement>('.sg-student-ai-feedback-body');
    if (!panel || !body) return;
    body.innerHTML = `
        <div class="sg-student-feedback-loading" role="status" aria-live="polite">
            <div class="sg-student-spinner" aria-hidden="true"></div>
            <span>Getting feedback…</span>
        </div>`;
    revealStudentPanel(panel);
    renderFeatherIcons();
}

function renderFeedbackMarkdown(body: HTMLElement, feedback: string, partId: string): void {
    body.classList.add('message-content');
    body.innerHTML = renderChat.render(feedback, `sg-student-feedback-${partId}-${Date.now()}`);
    renderLatexInHtmlContent(body);
}

function showPracticeGateFeedback(partId: string, gate: 'cooldown' | 'daily_limit'): void {
    const panel = document.querySelector<HTMLElement>(`.sg-student-ai-feedback[data-sub-question-id="${partId}"]`);
    const body = panel?.querySelector<HTMLElement>('.sg-student-ai-feedback-body');
    if (!panel || !body) return;

    if (gate === 'cooldown') {
        body.innerHTML =
            '<p class="sg-student-practice-gate-note">Take a moment with your answer—you may want to revise it before asking for feedback again.</p>';
    } else {
        body.innerHTML = `<p class="sg-student-practice-gate-note">You have been asking for feedback on this part quite often. Would you like to work through it in a <button type="button" class="sg-student-chat-cta" data-sub-question-id="${escapeHtml(partId)}">conversation</button> instead?</p>`;
    }
    revealStudentPanel(panel);
    renderFeatherIcons();
}

function showPartFeedback(partId: string, feedback: string): void {
    const panel = document.querySelector<HTMLElement>(`.sg-student-ai-feedback[data-sub-question-id="${partId}"]`);
    const body = panel?.querySelector<HTMLElement>('.sg-student-ai-feedback-body');
    if (panel && body) {
        renderFeedbackMarkdown(body, feedback, partId);
        revealStudentPanel(panel);
        renderFeatherIcons();
    }
}

function showExamPartFeedback(partId: string, feedback: string): void {
    const headerLabel = document.querySelector<HTMLElement>(
        `.sg-student-ai-feedback[data-sub-question-id="${partId}"] .sg-student-ai-feedback-header span`
    );
    if (headerLabel) headerLabel.textContent = 'AI Grading';
    showPartFeedback(partId, feedback);
}

function applyPracticeFeedbackResponse(partId: string, result: ScenarioPartFeedbackResponse): void {
    if (result.blockReason === 'cooldown') {
        showPracticeGateFeedback(partId, 'cooldown');
    } else if (result.blockReason === 'daily_limit') {
        showPracticeGateFeedback(partId, 'daily_limit');
    } else {
        showPartFeedback(partId, result.feedback);
    }

    if (result.attemptNumber != null && result.feedbackSource === 'llm') {
        todayAttemptCountByPart.set(partId, result.attemptNumber);
        lastFeedbackAtByPart.set(partId, Date.now());
    } else if (result.blockReason === 'daily_limit' && result.attemptNumber != null) {
        todayAttemptCountByPart.set(partId, result.attemptNumber);
    }

    if (result.blockReason === 'cooldown' && result.retryAfterSeconds) {
        cooldownUntilByPart.set(partId, Date.now() + result.retryAfterSeconds * 1000);
        schedulePracticeButtonRefresh(partId, result.retryAfterSeconds * 1000 + 50);
    }

    if (result.blockReason === 'daily_limit' && result.resetsAt) {
        dailyLimitUntilByPart.set(partId, new Date(result.resetsAt).getTime());
        const delay = Math.max(0, new Date(result.resetsAt).getTime() - Date.now());
        schedulePracticeButtonRefresh(partId, delay + 50);
    }
}

async function requestPracticeFeedback(part: StudentPartView, answer: string): Promise<void> {
    const partId = part.id;
    if (isPracticeDailyLimitReached(partId)) {
        showPracticeGateFeedback(partId, 'daily_limit');
        return;
    }
    if (isPracticeCooldownActive(partId)) {
        showPracticeGateFeedback(partId, 'cooldown');
        return;
    }

    if (!currentCourse || !activeQuestion) return;

    setAiFeedbackButtonLoading(partId, true);
    showPracticeFeedbackLoading(partId);
    try {
        const feedback = await checkScenarioAnswer(
            currentCourse.id,
            activeQuestion.id,
            part.id,
            answer,
            'practice'
        );
        applyPracticeFeedbackResponse(part.id, feedback);
    } catch (error) {
        showErrorToast(error instanceof Error ? error.message : 'Feedback failed.');
    } finally {
        setAiFeedbackButtonLoading(partId, false);
    }
}

async function confirmEmptyAnswerReveal(): Promise<boolean> {
    const result = await showConfirmModal(
        'View the answer?',
        'You have not entered an answer yet. Seeing the solution now may reduce the benefit of working through this part on your own. Do you want to continue?',
        'Show answer',
        'Go back'
    );
    return result.action === 'show-answer';
}

async function handlePracticeSeeTheAnswer(part: StudentPartView): Promise<void> {
    const textarea = document.querySelector<HTMLTextAreaElement>(
        `.sg-student-answer-input[data-sub-question-id="${part.id}"]`
    );
    const answer = textarea?.value?.trim() || '';
    if (!answer) {
        const proceed = await confirmEmptyAnswerReveal();
        if (!proceed) return;
    }

    const ok = await unlockPartSolution(part.id);
    if (!ok) return;
    flashcardIndexByPart.set(part.id, flashcardIndexByPart.get(part.id) ?? 0);
    showAnswerFlashcard(part);
}

let suppressUrlSync = false;
let scenariosMounted = false;

function syncStudentScenariosUrl(options: StudentScenariosUrlOptions = {}, replace = false): void {
    if (suppressUrlSync) return;
    navigateToStudentScenarios(options, replace);
}

export function isScenariosStudentMounted(): boolean {
    return scenariosMounted;
}

export async function syncStudentScenariosFromURL(fromPopstate = false): Promise<void> {
    if (!scenariosMounted || !currentCourse) return;
    if (fromPopstate && activeMode) {
        const ok = await confirmLeaveScenarioWorkspace();
        if (!ok) {
            suppressUrlSync = true;
            if (activeQuestion && activeMode) {
                navigateToStudentScenarios({ questionId: activeQuestion.id, mode: activeMode }, true);
            }
            suppressUrlSync = false;
            return;
        }
    }
    await restoreStudentFromURL();
}

async function restoreStudentFromURL(): Promise<void> {
    const params = getStudentScenariosParamsFromURL();
    suppressUrlSync = true;

    if (params.questionId && params.mode) {
        const listItem = cachedList.find((q) => q.id === params.questionId);
        if (listItem) {
            await startWorkspace(listItem, params.mode, true);
        } else {
            try {
                const detail = await fetchScenarioQuestion(currentCourse!.id, params.questionId);
                if (detail) {
                    await startWorkspace(toWorkspaceQuestion(detail), params.mode, true);
                } else {
                    showErrorToast('Scenario not found.');
                    showListView(true);
                }
            } catch {
                showErrorToast('Scenario not found.');
                showListView(true);
            }
        }
    } else {
        showListView(true);
    }

    suppressUrlSync = false;
}

function topicTitle(topicOrWeekId: string): string {
    const topic = currentCourse?.topicOrWeekInstances?.find((t) => t.id === topicOrWeekId);
    return topic?.title?.trim() || 'Topic/Week';
}

function formatListDate(value: string | Date | undefined | null): string {
    if (!value) return '—';
    const d = typeof value === 'string' ? new Date(value) : value;
    if (Number.isNaN(d.getTime())) return '—';
    return d.toISOString().slice(0, 10);
}

function loTexts(objectives: Array<ScenarioLearningObjectiveSnapshot | string> | undefined): string[] {
    if (!Array.isArray(objectives)) return [];
    return objectives.map((lo) => (typeof lo === 'string' ? lo : lo.text)).filter(Boolean);
}

function subKey(sub: { subQuestionId?: string; partId?: string }, index: number): string {
    return sub.subQuestionId?.trim() || sub.partId || `part-${index}`;
}

function toListCard(q: ScenarioQuestionForStudent): StudentQuestionView {
    const topic = topicTitle(q.topicOrWeekId);
    return {
        id: q.id,
        title: q.title,
        chapter: topic,
        topics: [topic],
        date: formatListDate(q.publishedAt ?? q.updatedAt),
        attempted: attemptedIds.has(q.id),
        narrative: q.questionBody,
        topicLabel: topic,
        learningObjectives: loTexts(q.learningObjectives as any),
        expectedTimeMinutes: q.expectedTimeMinutes ?? 25,
        parts: (q.subQuestions ?? []).map((sub, index) => ({
            id: subKey(sub, index),
            subQuestionType: sub.subQuestionType ?? 'calculation',
            prompt: sub.prompt,
            modelAnswer: '',
        })),
    };
}

function toWorkspaceQuestion(
    q: ScenarioQuestion | ScenarioQuestionForStudent,
    prior?: StudentQuestionView
): StudentQuestionView {
    const base = toListCard(q as ScenarioQuestionForStudent);
    return {
        ...base,
        attempted: prior?.attempted ?? attemptedIds.has(q.id),
        parts: (q.subQuestions ?? []).map(
            (sub: Omit<ScenarioSubQuestion, 'modelAnswer'> & { modelAnswer?: string }, index: number) => ({
                id: subKey(sub, index),
                subQuestionType: sub.subQuestionType ?? 'calculation',
                prompt: sub.prompt,
                modelAnswer: sub.modelAnswer ?? '',
            })
        ),
    };
}

function renderGradeBadge(grade: number): string {
    const g = Math.round(grade);
    return `<span class="sg-student-grade-badge" aria-label="Grade ${g} out of 10">${g} / 10</span>`;
}

function renderPartTitleGroup(index: number, part: StudentPartView, grade?: number): string {
    const typeLabel = SUB_QUESTION_TYPE_LABELS[part.subQuestionType] ?? part.subQuestionType;
    return `
                <div class="sg-part-title-group">
                    <h3 class="sg-part-title">Part ${index + 1}</h3>
                    <span class="sg-part-type-badge sg-part-type-${part.subQuestionType}">${escapeHtml(typeLabel)}</span>
                    ${grade != null ? renderGradeBadge(grade) : ''}
                </div>`;
}

function renderPartOutcomesShell(partId: string, headerLabel: string): string {
    return `
            <div class="sg-student-part-outcomes">
                <div class="sg-student-ai-feedback" data-sub-question-id="${escapeHtml(partId)}" hidden>
                    <div class="sg-student-ai-feedback-header">
                        <i data-feather="message-circle" aria-hidden="true"></i>
                        <span>${escapeHtml(headerLabel)}</span>
                    </div>
                    <div class="sg-student-ai-feedback-body"></div>
                </div>
                <div class="sg-student-answer-panel" data-sub-question-id="${escapeHtml(partId)}" hidden></div>
            </div>`;
}

/**
 * initializeScenariosStudent
 *
 * @param course activeCourse
 */
export async function initializeScenariosStudent(course: activeCourse): Promise<void> {
    scenariosMounted = false;

    currentCourse = course;
    stopExamTimer();
    statusFilter = 'all';
    activeQuestion = null;
    activeMode = null;
    lastExamSubmission = null;

    uiAbort?.abort();
    uiAbort = new AbortController();

    attachListListeners();
    attachWorkspaceListeners();
    await refreshQuestionList();
    scenariosMounted = true;
    await restoreStudentFromURL();
    renderFeatherIcons();
}

async function refreshQuestionList(): Promise<void> {
    if (!currentCourse) return;
    try {
        const published = await fetchPublishedScenarioQuestions(currentCourse.id);
        cachedList = published.map(toListCard);
        renderQuestionList();
    } catch (error) {
        cachedList = [];
        renderQuestionList();
        showErrorToast(error instanceof Error ? error.message : 'Could not load scenarios.');
    }
}

function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showListView(skipUrlSync = false): void {
    stopExamTimer();
    const listView = document.getElementById('sg-student-list-view');
    const workspace = document.getElementById('sg-student-workspace-view');
    if (listView) listView.style.display = '';
    if (workspace) workspace.style.display = 'none';
    activeQuestion = null;
    activeMode = null;
    lastExamSubmission = null;
    syncFilterPills();
    expandStudentSidebar();
    if (!skipUrlSync) syncStudentScenariosUrl({});
}

export function isScenarioWorkspaceActive(): boolean {
    return activeMode !== null;
}

export function expandStudentSidebar(): void {
    document.querySelector('.sidebar')?.classList.remove('collapsed');
}

export async function confirmLeaveScenarioWorkspace(): Promise<boolean> {
    if (!activeMode) {
        expandStudentSidebar();
        return true;
    }

    const modeLabel = activeMode === 'exam' ? 'exam' : 'practice';
    const result = await showWarningModal(
        'Leave this session?',
        `Are you sure you want to leave this ${modeLabel}? Your current attempt may be lost.`,
        [
            { text: 'Stay', type: 'secondary', closeOnClick: true },
            { text: 'Leave', type: 'danger', closeOnClick: true }
        ]
    );

    if (result.action !== 'leave') return false;
    showListView();
    return true;
}

async function confirmLeaveWorkspace(): Promise<void> {
    if (!activeMode) {
        showListView();
        return;
    }
    await confirmLeaveScenarioWorkspace();
}

function showWorkspaceView(): void {
    const listView = document.getElementById('sg-student-list-view');
    const workspace = document.getElementById('sg-student-workspace-view');
    if (listView) listView.style.display = 'none';
    if (workspace) workspace.style.display = '';
}

function filteredQuestions(): StudentQuestionView[] {
    if (statusFilter === 'attempted') return cachedList.filter((q) => q.attempted || attemptedIds.has(q.id));
    if (statusFilter === 'unsolved') return cachedList.filter((q) => !(q.attempted || attemptedIds.has(q.id)));
    return cachedList;
}

function syncFilterPills(): void {
    document.querySelectorAll<HTMLButtonElement>('.sg-student-filter-pill[data-filter]').forEach((btn) => {
        const key = btn.dataset.filter;
        if (key === 'chapter' || key === 'topic') return;
        btn.setAttribute('aria-pressed', key === statusFilter ? 'true' : 'false');
    });
}

function renderQuestionList(): void {
    const container = document.getElementById('sg-student-question-list');
    if (!container) return;

    const questions = filteredQuestions();

    if (questions.length === 0) {
        container.innerHTML = `<p class="sg-student-empty-state">No published scenarios yet.</p>`;
        return;
    }

    container.innerHTML = questions
        .map((q) => {
            const attempted = q.attempted || attemptedIds.has(q.id);
            return `
        <button type="button" class="sg-student-question-card" data-question-id="${escapeHtml(q.id)}" role="listitem">
            <div class="sg-student-card-top">
                <div class="sg-student-card-title-row">
                    <h3 class="sg-student-card-title">${escapeHtml(q.title)}</h3>
                    <span class="sg-student-card-chapter">${escapeHtml(q.chapter)}</span>
                </div>
                <span class="sg-student-card-status${attempted ? ' attempted' : ''}">
                    ${attempted ? 'Attempted' : 'Unsolved'}
                </span>
            </div>
            <div class="sg-student-card-meta">
                <span class="sg-student-card-topics">
                    Covered Topic:
                    ${q.topics.map((t) => `<span class="sg-student-topic-pill">${escapeHtml(t)}</span>`).join('')}
                </span>
                <span>Date: ${escapeHtml(q.date)}</span>
            </div>
        </button>`;
        })
        .join('');
}

function attachListListeners(): void {
    const signal = uiAbort?.signal;

    document.querySelector('.sg-student-filters')?.addEventListener(
        'click',
        (e: Event) => {
            const btn = (e.target as HTMLElement).closest('.sg-student-filter-pill') as HTMLButtonElement | null;
            if (!btn || btn.disabled) return;
            const key = btn.dataset.filter as StatusFilter | undefined;
            if (!key || (key !== 'all' && key !== 'attempted' && key !== 'unsolved')) return;
            statusFilter = key;
            syncFilterPills();
            renderQuestionList();
        },
        { signal }
    );

    const list = document.getElementById('sg-student-question-list');
    list?.addEventListener(
        'click',
        (e: MouseEvent) => {
            const card = (e.target as HTMLElement).closest('.sg-student-question-card') as HTMLElement | null;
            const id = card?.dataset.questionId;
            if (!id) return;
            const question = cachedList.find((q) => q.id === id);
            if (question) void openModeModal(question);
        },
        { signal }
    );
}

async function openModeModal(question: StudentQuestionView): Promise<void> {
    let selectedMode: ScenarioMode | null = null;

    const body = document.createElement('div');
    body.className = 'sg-student-mode-modal-body';
    body.innerHTML = `
        <p class="sg-student-mode-modal-prompt">Choose how you want to work</p>
        <div class="sg-student-mode-cards" role="group" aria-label="Study mode">
            <button type="button" class="sg-student-mode-card" data-mode="practice" aria-pressed="false">
                <span class="sg-student-mode-card-title">Practice</span>
                <span class="sg-student-mode-card-desc">Immediate AI feedback, better for learning.</span>
            </button>
            <button type="button" class="sg-student-mode-card" data-mode="exam" aria-pressed="false">
                <span class="sg-student-mode-card-title">Exam</span>
                <span class="sg-student-mode-card-desc">Timed, exam-like, better for self-testing.</span>
            </button>
        </div>
        <div class="sg-student-mode-confirm" hidden>
            <p class="sg-student-mode-confirm-prompt">Are you ready?</p>
            <button type="button" class="sg-student-mode-start modal-btn modal-btn-primary" data-start>Start</button>
        </div>
    `;

    const cards = body.querySelectorAll<HTMLButtonElement>('.sg-student-mode-card');
    const confirmEl = body.querySelector<HTMLElement>('.sg-student-mode-confirm');
    const startBtn = body.querySelector<HTMLButtonElement>('[data-start]');

    const selectMode = (mode: ScenarioMode): void => {
        selectedMode = mode;
        cards.forEach((card) => {
            const on = card.dataset.mode === mode;
            card.classList.toggle('is-selected', on);
            card.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        if (confirmEl) confirmEl.hidden = false;
    };

    cards.forEach((card) => {
        card.addEventListener('click', () => {
            const mode = card.dataset.mode as ScenarioMode;
            if (mode === 'practice' || mode === 'exam') selectMode(mode);
        });
    });

    const resultPromise = showCustomModal({
        type: 'custom',
        title: question.title,
        content: body,
        maxWidth: '560px',
        customClass: 'sg-student-mode-modal',
        closeOnOverlayClick: true,
        buttons: [],
    });

    startBtn?.addEventListener('click', () => {
        if (!selectedMode) return;
        closeModal(selectedMode);
    });

    queueMicrotask(() => {
        body.querySelector<HTMLButtonElement>('[data-mode="practice"]')?.focus();
    });

    const result = await resultPromise;

    if (result.action === 'practice') await startWorkspace(question, 'practice');
    else if (result.action === 'exam') await startWorkspace(question, 'exam');
}

async function startWorkspace(listItem: StudentQuestionView, mode: ScenarioMode, skipUrlSync = false): Promise<void> {
    if (!currentCourse) return;

    let question = listItem;
    try {
        const detail = await fetchScenarioQuestion(currentCourse.id, listItem.id);
        if (!detail) {
            showErrorToast('This scenario is not available.');
            return;
        }
        question = toWorkspaceQuestion(detail, listItem);
    } catch (error) {
        showErrorToast(error instanceof Error ? error.message : 'Could not open scenario.');
        return;
    }

    attemptedIds.add(question.id);
    question.attempted = true;
    const cached = cachedList.find((q) => q.id === question.id);
    if (cached) cached.attempted = true;

    activeQuestion = question;
    activeMode = mode;
    lastExamSubmission = null;
    flashcardIndexByPart.clear();
    flashcardNavDirByPart.clear();
    clearPracticeLimitTimers();

    const titleEl = document.getElementById('sg-student-question-title');
    if (titleEl) {
        titleEl.textContent = question.title;
        titleEl.classList.toggle('is-practice', mode === 'practice');
        titleEl.classList.toggle('is-exam', mode === 'exam');
    }

    const narrativeEl = document.getElementById('sg-student-narrative');
    if (narrativeEl) {
        narrativeEl.classList.add('message-content');
        narrativeEl.innerHTML = renderChat.render(question.narrative, `sg-student-narrative-${question.id}`);
        renderLatexInHtmlContent(narrativeEl);
        narrativeEl.querySelectorAll('.artefact-button').forEach((btn) => {
            btn.classList.add('artefact-button--scenario');
        });
    }

    const topicEl = document.getElementById('sg-student-topic-label');
    if (topicEl) topicEl.textContent = question.topicLabel;

    const lloEl = document.getElementById('sg-student-llo-list');
    if (lloEl) {
        lloEl.innerHTML = question.learningObjectives.length
            ? question.learningObjectives.map((lo) => `<span class="sg-student-lo-pill">${escapeHtml(lo)}</span>`).join('')
            : `<span class="sg-student-lo-empty">No objectives selected</span>`;
    }

    const statusBadge = document.getElementById('sg-student-status-badge');
    if (statusBadge) {
        statusBadge.textContent = 'On Going';
        statusBadge.classList.remove('time-up', 'submitted');
    }

    const submitBtn = document.getElementById('sg-student-submit-btn') as HTMLButtonElement | null;
    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit';
        submitBtn.style.display = mode === 'exam' ? '' : 'none';
    }

    renderParts(question, mode);
    if (mode === 'practice') {
        await loadPracticeResponseHistory(question.id);
    }
    setupTimerForMode(mode, question.expectedTimeMinutes);
    showWorkspaceView();
    collapseStudentSidebar();
    renderFeatherIcons();
    if (!skipUrlSync) syncStudentScenariosUrl({ questionId: question.id, mode });
}

function collapseStudentSidebar(): void {
    document.querySelector('.sidebar')?.classList.add('collapsed');
}

function renderParts(question: StudentQuestionView, mode: ScenarioMode, options?: RenderPartsOptions): void {
    const container = document.getElementById('sg-student-parts');
    if (!container) return;

    const submitted = options?.submitted ?? null;
    const resultById = submitted ? new Map(submitted.results.map((r) => [r.subQuestionId, r])) : null;

    container.innerHTML = question.parts
        .map((part, index) => {
            const graded = resultById?.get(part.id);
            const practiceBlock =
                mode === 'practice'
                    ? `
            <div class="sg-student-part-actions">
                <button type="button" class="sg-student-ai-btn" data-sub-question-id="${escapeHtml(part.id)}">Get AI Feedback</button>
                <button type="button" class="sg-student-answer-btn" data-sub-question-id="${escapeHtml(part.id)}">See the Answer</button>
            </div>
            ${renderPartOutcomesShell(part.id, 'AI Feedback')}`
                    : mode === 'exam'
                      ? `
            ${submitted ? `<div class="sg-student-part-actions">
                <button type="button" class="sg-student-answer-btn" data-sub-question-id="${escapeHtml(part.id)}">View solution</button>
            </div>` : ''}
            ${renderPartOutcomesShell(part.id, 'AI Grading')}`
                      : '';

            return `
        <section class="sg-student-part" data-sub-question-id="${escapeHtml(part.id)}">
            <div class="sg-student-part-header">
                ${renderPartTitleGroup(index, part, graded?.grade)}
            </div>
            <div class="sg-student-part-prompt message-content" data-sub-question-id="${escapeHtml(part.id)}"></div>
            <textarea
                class="sg-student-answer-input"
                data-sub-question-id="${escapeHtml(part.id)}"
                rows="5"
                placeholder="Type your answer here..."
                ${submitted ? 'disabled' : ''}
            ></textarea>
            ${practiceBlock}
        </section>`;
        })
        .join('');

    for (const part of question.parts) {
        const promptEl = container.querySelector<HTMLElement>(
            `.sg-student-part-prompt[data-sub-question-id="${part.id}"]`
        );
        if (!promptEl) continue;
        promptEl.innerHTML = renderChat.render(part.prompt, `sg-student-prompt-${question.id}-${part.id}`);
        renderLatexInHtmlContent(promptEl);
        promptEl.querySelectorAll('.artefact-button').forEach((btn) => {
            btn.classList.add('artefact-button--scenario');
        });
    }

    if (submitted) {
        applyExamPartResults(question, submitted.results, submitted.localAnswers);
    }
}

function applyExamPartResults(
    question: StudentQuestionView,
    results: ScenarioExamPartResult[],
    localAnswers: Map<string, string>
): void {
    const resultById = new Map(results.map((r) => [r.subQuestionId, r]));
    for (const part of question.parts) {
        const graded = resultById.get(part.id);
        const section = document.querySelector<HTMLElement>(`.sg-student-part[data-sub-question-id="${part.id}"]`);
        if (!section) continue;

        const titleGroup = section.querySelector('.sg-part-title-group');
        if (titleGroup && graded && !titleGroup.querySelector('.sg-student-grade-badge')) {
            titleGroup.insertAdjacentHTML('beforeend', renderGradeBadge(graded.grade));
        }

        const textarea = section.querySelector<HTMLTextAreaElement>('.sg-student-answer-input');
        if (textarea) {
            textarea.disabled = true;
            if (localAnswers.has(part.id)) textarea.value = localAnswers.get(part.id) || '';
        }

        if (graded?.feedback) {
            showExamPartFeedback(part.id, graded.feedback);
        }
    }
    renderFeatherIcons();
}

function showExamScoreSidebar(overallGrade: number, partCount: number): void {
    const timerBlock = document.getElementById('sg-student-timer-block');
    const timerLabel = document.getElementById('sg-student-timer-label');
    const display = document.getElementById('sg-student-timer-display');
    const timeUpEl = document.getElementById('sg-student-time-up');
    const maxScore = Math.max(1, partCount) * 10;

    if (timerBlock) timerBlock.style.display = '';
    if (timerLabel) timerLabel.textContent = 'Exam Score';
    if (display) display.textContent = `${overallGrade} / ${maxScore}`;
    if (timeUpEl) timeUpEl.style.display = 'none';

    const submitBtn = document.getElementById('sg-student-submit-btn') as HTMLButtonElement | null;
    if (submitBtn) {
        submitBtn.style.display = 'none';
        submitBtn.removeAttribute('aria-busy');
    }
}

function applyExamResults(
    overallGrade: number,
    results: ScenarioExamPartResult[],
    localAnswers: Map<string, string>
): void {
    if (!activeQuestion) return;
    const submitted: ExamSubmittedState = { overallGrade, results, localAnswers };
    renderParts(activeQuestion, 'exam', { submitted });
    showExamScoreSidebar(overallGrade, activeQuestion.parts.length);
}

function setupTimerForMode(mode: ScenarioMode, expectedMinutes: number): void {
    stopExamTimer();
    const timerBlock = document.getElementById('sg-student-timer-block');
    const timeUpEl = document.getElementById('sg-student-time-up');
    const display = document.getElementById('sg-student-timer-display');

    if (mode !== 'exam') {
        if (timerBlock) timerBlock.style.display = 'none';
        return;
    }

    examSecondsLeft = Math.max(0, Math.round((expectedMinutes || 25) * 60));
    if (timerBlock) timerBlock.style.display = '';
    const timerLabel = document.getElementById('sg-student-timer-label');
    if (timerLabel) timerLabel.textContent = 'Time Remaining';
    if (timeUpEl) timeUpEl.style.display = 'none';
    if (display) display.textContent = formatTime(examSecondsLeft);
    const submitBtn = document.getElementById('sg-student-submit-btn') as HTMLButtonElement | null;
    if (submitBtn) submitBtn.style.display = '';

    examTimerId = setInterval(() => {
        examSecondsLeft -= 1;
        if (display) display.textContent = formatTime(Math.max(0, examSecondsLeft));
        if (examSecondsLeft <= 0) {
            stopExamTimer();
            lockExamInputs('Time’s up');
        }
    }, 1000);
}

function formatTime(totalSeconds: number): string {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function stopExamTimer(): void {
    if (examTimerId !== null) {
        clearInterval(examTimerId);
        examTimerId = null;
    }
}

function lockExamInputs(badgeLabel: string = 'Time’s up'): void {
    const statusBadge = document.getElementById('sg-student-status-badge');
    if (statusBadge) {
        statusBadge.textContent = badgeLabel;
        statusBadge.classList.toggle('time-up', badgeLabel === 'Time’s up');
        statusBadge.classList.toggle('submitted', badgeLabel === 'Submitted');
    }
    if (badgeLabel === 'Time’s up') {
        const timeUpEl = document.getElementById('sg-student-time-up');
        if (timeUpEl) timeUpEl.style.display = '';
    }

    document.querySelectorAll<HTMLTextAreaElement>('.sg-student-answer-input').forEach((el) => {
        el.disabled = true;
    });

    const submitBtn = document.getElementById('sg-student-submit-btn') as HTMLButtonElement | null;
    if (submitBtn) submitBtn.disabled = true;
}

function placeAnswerPanelBelowFeedback(partId: string): void {
    const feedback = document.querySelector<HTMLElement>(`.sg-student-ai-feedback[data-sub-question-id="${partId}"]`);
    const panel = document.querySelector<HTMLElement>(`.sg-student-answer-panel[data-sub-question-id="${partId}"]`);
    if (!panel) return;
    if (feedback?.parentElement) {
        feedback.insertAdjacentElement('afterend', panel);
    }
}

function showAnswerFlashcard(part: StudentPartView): void {
    placeAnswerPanelBelowFeedback(part.id);
    const panel = document.querySelector<HTMLElement>(`.sg-student-answer-panel[data-sub-question-id="${part.id}"]`);
    if (!panel) return;

    const steps = parseAnswerKeyToFlashcards(part.modelAnswer);
    if (!steps.length) {
        panel.innerHTML = `<p class="sg-student-flashcard-empty">No answer key available for this part.</p>`;
        revealStudentPanel(panel);
        return;
    }

    let idx = flashcardIndexByPart.get(part.id) ?? 0;
    idx = Math.max(0, Math.min(steps.length - 1, idx));
    flashcardIndexByPart.set(part.id, idx);
    const step = steps[idx];
    const tone = flashcardToneIndex(idx);
    const navDir = flashcardNavDirByPart.get(part.id);
    flashcardNavDirByPart.delete(part.id);
    const enterClass =
        navDir === 'prev' ? ' sg-student-flashcard--enter-prev' : navDir === 'next' ? ' sg-student-flashcard--enter-next' : '';

    const stepLabel =
        steps.length > 1
            ? `<span class="sg-student-flashcard-step-label">Step ${idx + 1} of ${steps.length}</span>`
            : '';
    const navHtml =
        steps.length > 1
            ? `<div class="sg-student-flashcard-nav">
                <button type="button" class="sg-student-flashcard-nav-btn" data-action="prev" data-sub-question-id="${part.id}" ${idx === 0 ? 'disabled' : ''} aria-label="Previous step">
                    <i data-feather="chevron-left"></i>
                </button>
                <button type="button" class="sg-student-flashcard-nav-btn" data-action="next" data-sub-question-id="${part.id}" ${idx >= steps.length - 1 ? 'disabled' : ''} aria-label="Next step">
                    <i data-feather="chevron-right"></i>
                </button>
            </div>`
            : '';

    panel.innerHTML = `
        <div class="sg-student-flashcard sg-student-flashcard--tone-${tone}${enterClass}">
            <div class="sg-student-flashcard-header">
                ${stepLabel}
                <span class="sg-student-flashcard-title">${escapeHtml(step.title)}</span>
            </div>
            ${navHtml}
        </div>`;

    const bodyHost = document.createElement('div');
    bodyHost.className = 'sg-student-flashcard-body message-content';
    bodyHost.innerHTML = renderChat.render(step.bodyMarkdown, `sg-student-flash-${part.id}-${idx}`);
    renderLatexInHtmlContent(bodyHost);

    const flashcardEl = panel.querySelector('.sg-student-flashcard');
    const navEl = panel.querySelector('.sg-student-flashcard-nav');
    if (flashcardEl) {
        if (navEl) flashcardEl.insertBefore(bodyHost, navEl);
        else flashcardEl.appendChild(bodyHost);
    }

    revealStudentPanel(panel);

    if (enterClass && flashcardEl) {
        flashcardEl.addEventListener('animationend', () => {
            flashcardEl.classList.remove('sg-student-flashcard--enter-prev', 'sg-student-flashcard--enter-next');
        }, { once: true });
    }
    renderFeatherIcons();
}

async function unlockPartSolution(partId: string): Promise<boolean> {
    if (!currentCourse || !activeQuestion || !activeMode) return false;
    const solution = await fetchScenarioSolution(
        currentCourse.id,
        activeQuestion.id,
        activeMode,
        partId
    );
    if (!solution) {
        showErrorToast('Submit an answer for this part before viewing the solution.');
        return false;
    }
    for (const [index, sub] of solution.subQuestions.entries()) {
        const id = subKey(sub, index);
        const part = activeQuestion.parts.find((p) => p.id === id);
        if (part) part.modelAnswer = sub.modelAnswer;
    }
    return true;
}

async function unlockSolutionAnswers(): Promise<boolean> {
    if (!currentCourse || !activeQuestion || !activeMode) return false;
    const solution = await fetchScenarioSolution(currentCourse.id, activeQuestion.id, activeMode);
    if (!solution) {
        showErrorToast(`Submit all parts in ${activeMode} mode before viewing the solution.`);
        return false;
    }
    for (const [index, sub] of solution.subQuestions.entries()) {
        const id = subKey(sub, index);
        const part = activeQuestion.parts.find((p) => p.id === id);
        if (part) part.modelAnswer = sub.modelAnswer;
    }
    return true;
}

async function revealAllAnswerFlashcards(): Promise<void> {
    if (!activeQuestion) return;
    const ok = await unlockSolutionAnswers();
    if (!ok) return;
    for (const part of activeQuestion.parts) {
        flashcardIndexByPart.set(part.id, 0);
        showAnswerFlashcard(part);
    }
}

function attachWorkspaceListeners(): void {
    const signal = uiAbort?.signal;

    document.getElementById('sg-student-back-btn')?.addEventListener(
        'click',
        () => {
            void confirmLeaveWorkspace();
        },
        { signal }
    );

    document.getElementById('sg-student-submit-btn')?.addEventListener(
        'click',
        () => {
            if (activeMode !== 'exam' || !activeQuestion || !currentCourse) return;
            void handleExamSubmit();
        },
        { signal }
    );

    const parts = document.getElementById('sg-student-parts');
    parts?.addEventListener(
        'click',
        (e: MouseEvent) => {
            if (!activeQuestion || !currentCourse) return;
            const target = e.target as HTMLElement;

            const navBtn = target.closest('.sg-student-flashcard-nav-btn') as HTMLButtonElement | null;
            if (navBtn) {
                const partId = navBtn.dataset.subQuestionId;
                const part = activeQuestion.parts.find((p) => p.id === partId);
                if (!part) return;
                const steps = parseAnswerKeyToFlashcards(part.modelAnswer);
                const cur = flashcardIndexByPart.get(part.id) ?? 0;
                const next = navBtn.dataset.action === 'next' ? cur + 1 : cur - 1;
                const clamped = Math.max(0, Math.min(steps.length - 1, next));
                if (clamped !== cur) {
                    flashcardNavDirByPart.set(part.id, navBtn.dataset.action === 'next' ? 'next' : 'prev');
                }
                flashcardIndexByPart.set(part.id, clamped);
                showAnswerFlashcard(part);
                return;
            }

            if (activeMode !== 'practice' && !(activeMode === 'exam' && lastExamSubmission)) return;

            const chatCta = target.closest('.sg-student-chat-cta') as HTMLButtonElement | null;
            if (chatCta) {
                if (activeMode !== 'practice') return;
                const partId = chatCta.dataset.subQuestionId;
                const part = activeQuestion.parts.find((p) => p.id === partId);
                if (part) void openConversationForPart(part);
                return;
            }

            const aiBtn = target.closest('.sg-student-ai-btn') as HTMLButtonElement | null;
            if (aiBtn) {
                if (activeMode !== 'practice') return;
                const partId = aiBtn.dataset.subQuestionId;
                const part = activeQuestion.parts.find((p) => p.id === partId);
                if (!part) return;
                const textarea = document.querySelector<HTMLTextAreaElement>(
                    `.sg-student-answer-input[data-sub-question-id="${part.id}"]`
                );
                const answer = textarea?.value?.trim() || '';
                if (!answer) {
                    showErrorToast('Enter an answer before requesting feedback.');
                    return;
                }
                void requestPracticeFeedback(part, answer);
                return;
            }

            const answerBtn = target.closest('.sg-student-answer-btn') as HTMLButtonElement | null;
            if (answerBtn) {
                const partId = answerBtn.dataset.subQuestionId;
                const part = activeQuestion.parts.find((p) => p.id === partId);
                if (!part) return;
                void (async () => {
                    try {
                        if (activeMode === 'exam' && lastExamSubmission) {
                            const ok = await unlockPartSolution(part.id);
                            if (!ok) return;
                            flashcardIndexByPart.set(part.id, flashcardIndexByPart.get(part.id) ?? 0);
                            showAnswerFlashcard(part);
                            return;
                        }

                        if (activeMode === 'practice') {
                            await handlePracticeSeeTheAnswer(part);
                            return;
                        }

                        const ok = await unlockPartSolution(part.id);
                        if (!ok) return;
                        flashcardIndexByPart.set(part.id, flashcardIndexByPart.get(part.id) ?? 0);
                        showAnswerFlashcard(part);
                    } catch (error) {
                        showErrorToast(error instanceof Error ? error.message : 'Could not load the answer.');
                    }
                })();
            }
        },
        { signal }
    );
}

async function handleExamSubmit(): Promise<void> {
    if (!currentCourse || !activeQuestion || activeMode !== 'exam') return;

    const answers = activeQuestion.parts.map((part) => {
        const textarea = document.querySelector<HTMLTextAreaElement>(
            `.sg-student-answer-input[data-sub-question-id="${part.id}"]`
        );
        return {
            subQuestionId: part.id,
            studentAnswer: textarea?.value?.trim() || '',
        };
    });

    if (answers.some((a) => !a.studentAnswer)) {
        showErrorToast('Answer every part before submitting the exam.');
        return;
    }

    const submitBtn = document.getElementById('sg-student-submit-btn') as HTMLButtonElement | null;
    const localAnswers = new Map(answers.map((a) => [a.subQuestionId, a.studentAnswer]));

    stopExamTimer();
    document.querySelectorAll<HTMLTextAreaElement>('.sg-student-answer-input').forEach((el) => {
        el.disabled = true;
    });
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting…';
        submitBtn.setAttribute('aria-busy', 'true');
    }

    try {
        const result = await submitScenarioExam(currentCourse.id, activeQuestion.id, answers);
        if (!result.success) {
            throw new Error(result.error || 'Exam submission failed.');
        }
        const statusBadge = document.getElementById('sg-student-status-badge');
        if (statusBadge) {
            statusBadge.textContent = 'Submitted';
            statusBadge.classList.add('submitted');
            statusBadge.classList.remove('time-up');
        }
        if (submitBtn) {
            submitBtn.removeAttribute('aria-busy');
        }
        lastExamSubmission = {
            overallGrade: result.overallGrade,
            results: result.results,
            localAnswers,
        };
        applyExamResults(result.overallGrade, result.results, localAnswers);
    } catch (error) {
        document.querySelectorAll<HTMLTextAreaElement>('.sg-student-answer-input').forEach((el) => {
            el.disabled = false;
        });
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit';
            submitBtn.removeAttribute('aria-busy');
        }
        showErrorToast(error instanceof Error ? error.message : 'Exam submission failed.');
    }
}
