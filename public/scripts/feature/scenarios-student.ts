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
} from '../types.js';
import {
    fetchPublishedScenarioQuestions,
    fetchScenarioQuestion,
    checkScenarioAnswer,
    fetchScenarioSolution,
    submitScenarioExam,
} from '../api/scenario-questions-api.js';
import { renderFeatherIcons } from '../api/api.js';
import { closeModal, showCustomModal, showWarningModal } from '../ui/modal-overlay.js';
import { showErrorToast } from '../ui/toast-notification.js';
import { flashcardToneIndex, parseAnswerKeyToFlashcards, SUB_QUESTION_TYPE_LABELS } from './scenario-answer-flashcard.js';
import { RenderChat } from './render-chat.js';
import { renderLatexInHtmlContent } from './chat.js';

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

/**
 * initializeScenariosStudent
 *
 * @param course activeCourse
 */
export async function initializeScenariosStudent(course: activeCourse): Promise<void> {
    currentCourse = course;
    stopExamTimer();
    statusFilter = 'all';
    activeQuestion = null;
    activeMode = null;

    uiAbort?.abort();
    uiAbort = new AbortController();

    showListView();
    syncFilterPills();
    attachListListeners();
    attachWorkspaceListeners();
    await refreshQuestionList();
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

function showListView(): void {
    stopExamTimer();
    const listView = document.getElementById('sg-student-list-view');
    const workspace = document.getElementById('sg-student-workspace-view');
    if (listView) listView.style.display = '';
    if (workspace) workspace.style.display = 'none';
    activeQuestion = null;
    activeMode = null;
    expandStudentSidebar();
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

async function startWorkspace(listItem: StudentQuestionView, mode: ScenarioMode): Promise<void> {
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
    flashcardIndexByPart.clear();
    flashcardNavDirByPart.clear();

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
    }

    renderParts(question, mode);
    setupTimerForMode(mode, question.expectedTimeMinutes);
    showWorkspaceView();
    collapseStudentSidebar();
    renderFeatherIcons();
}

function collapseStudentSidebar(): void {
    document.querySelector('.sidebar')?.classList.add('collapsed');
}

function renderParts(question: StudentQuestionView, mode: ScenarioMode): void {
    const container = document.getElementById('sg-student-parts');
    if (!container) return;

    container.innerHTML = question.parts
        .map((part, index) => {
            const typeLabel = SUB_QUESTION_TYPE_LABELS[part.subQuestionType] ?? part.subQuestionType;
            const practiceBlock =
                mode === 'practice'
                    ? `
            <div class="sg-student-part-actions">
                <button type="button" class="sg-student-ai-btn" data-sub-question-id="${escapeHtml(part.id)}">Get AI Feedback</button>
                <button type="button" class="sg-student-answer-btn" data-sub-question-id="${escapeHtml(part.id)}">See the Answer</button>
            </div>
            <div class="sg-student-part-outcomes">
                <div class="sg-student-ai-feedback" data-sub-question-id="${escapeHtml(part.id)}" hidden>
                    <div class="sg-student-ai-feedback-header">
                        <i data-feather="message-circle" aria-hidden="true"></i>
                        <span>AI Feedback</span>
                    </div>
                    <div class="sg-student-ai-feedback-body"></div>
                </div>
                <div class="sg-student-answer-panel" data-sub-question-id="${escapeHtml(part.id)}" hidden></div>
            </div>`
                    : '';

            return `
        <section class="sg-student-part" data-sub-question-id="${escapeHtml(part.id)}">
            <div class="sg-student-part-header">
                <div class="sg-part-title-group">
                    <h3 class="sg-part-title">Part ${index + 1}</h3>
                    <span class="sg-part-type-badge sg-part-type-${part.subQuestionType}">${escapeHtml(typeLabel)}</span>
                </div>
            </div>
            <div class="sg-student-part-prompt message-content" data-sub-question-id="${escapeHtml(part.id)}"></div>
            <textarea
                class="sg-student-answer-input"
                data-sub-question-id="${escapeHtml(part.id)}"
                rows="5"
                placeholder="Type your answer here..."
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
    if (timeUpEl) timeUpEl.style.display = 'none';
    if (display) display.textContent = formatTime(examSecondsLeft);

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
        panel.hidden = false;
        panel.innerHTML = `<p class="sg-student-flashcard-empty">No answer key available for this part.</p>`;
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

    panel.hidden = false;
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
        activeMode === 'practice' ? partId : undefined
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

            if (activeMode !== 'practice') return;

            const aiBtn = target.closest('.sg-student-ai-btn') as HTMLButtonElement | null;
            if (aiBtn) {
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
                void (async () => {
                    aiBtn.disabled = true;
                    try {
                        const feedback = await checkScenarioAnswer(
                            currentCourse!.id,
                            activeQuestion!.id,
                            part.id,
                            answer,
                            'practice'
                        );
                        const panel = document.querySelector<HTMLElement>(
                            `.sg-student-ai-feedback[data-sub-question-id="${part.id}"]`
                        );
                        const body = panel?.querySelector<HTMLElement>('.sg-student-ai-feedback-body');
                        if (panel && body) {
                            body.innerHTML = `<p class="sg-student-grade-feedback">${escapeHtml(feedback.feedback)}</p>`;
                            panel.hidden = false;
                            renderFeatherIcons();
                        }
                    } catch (error) {
                        showErrorToast(error instanceof Error ? error.message : 'Feedback failed.');
                    } finally {
                        aiBtn.disabled = false;
                    }
                })();
                return;
            }

            const answerBtn = target.closest('.sg-student-answer-btn') as HTMLButtonElement | null;
            if (answerBtn) {
                const partId = answerBtn.dataset.subQuestionId;
                const part = activeQuestion.parts.find((p) => p.id === partId);
                if (!part) return;
                void (async () => {
                    answerBtn.disabled = true;
                    try {
                        const textarea = document.querySelector<HTMLTextAreaElement>(
                            `.sg-student-answer-input[data-sub-question-id="${part.id}"]`
                        );
                        const answer = textarea?.value?.trim() || '';
                        const feedbackPanel = document.querySelector<HTMLElement>(
                            `.sg-student-ai-feedback[data-sub-question-id="${part.id}"]`
                        );
                        const hasFeedback = !!feedbackPanel && !feedbackPanel.hidden;

                        if (!hasFeedback) {
                            if (!answer) {
                                showErrorToast('Enter an answer before viewing the solution.');
                                return;
                            }
                            await checkScenarioAnswer(
                                currentCourse!.id,
                                activeQuestion!.id,
                                part.id,
                                answer,
                                'practice'
                            );
                        }

                        const ok = await unlockPartSolution(part.id);
                        if (!ok) return;
                        flashcardIndexByPart.set(part.id, flashcardIndexByPart.get(part.id) ?? 0);
                        showAnswerFlashcard(part);
                    } catch (error) {
                        showErrorToast(error instanceof Error ? error.message : 'Could not load the answer.');
                    } finally {
                        answerBtn.disabled = false;
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
            submitBtn.textContent = 'Submitted';
            submitBtn.removeAttribute('aria-busy');
        }
        renderExamResults(result.overallGrade, result.results, localAnswers);
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

function renderExamResults(
    overallGrade: number,
    results: ScenarioExamPartResult[],
    localAnswers: Map<string, string>
): void {
    if (!activeQuestion) return;
    const partsHost = document.getElementById('sg-student-parts');
    const timerBlock = document.getElementById('sg-student-timer-block');
    if (timerBlock) timerBlock.style.display = 'none';
    if (!partsHost) return;

    const resultById = new Map(results.map((r) => [r.subQuestionId, r]));
    const cards = activeQuestion.parts
        .map((part, index) => {
            const graded = resultById.get(part.id);
            const answer = localAnswers.get(part.id) || '';
            return `
            <section class="sg-student-exam-part-result" data-sub-question-id="${escapeHtml(part.id)}">
                <div class="sg-student-exam-part-result-header">
                    <h3 class="sg-part-title">Part ${index + 1}</h3>
                    ${graded ? renderGradeBadge(graded.grade) : ''}
                </div>
                <div class="sg-student-exam-submitted-answer">
                    <span class="sg-student-meta-label">Your answer</span>
                    <p>${escapeHtml(answer)}</p>
                </div>
                <p class="sg-student-grade-feedback">${escapeHtml(graded?.feedback || '')}</p>
            </section>`;
        })
        .join('');

    partsHost.innerHTML = `
        <div id="sg-student-exam-results" class="sg-student-exam-results">
            <div class="sg-student-exam-summary">
                <h2 class="sg-student-exam-summary-title">Exam Results</h2>
                <p class="sg-student-exam-overall">Exam grade: <strong>${overallGrade.toFixed(1)} / 10</strong></p>
                <button type="button" id="sg-student-view-solutions-btn" class="sg-student-submit-btn">View solutions</button>
            </div>
            ${cards}
        </div>`;

    document.getElementById('sg-student-view-solutions-btn')?.addEventListener('click', () => {
        void (async () => {
            const ok = await unlockSolutionAnswers();
            if (!ok || !activeQuestion) return;
            // Restore part sections so flashcard panels exist, then reveal answers
            renderParts(activeQuestion, 'exam');
            document.querySelectorAll<HTMLTextAreaElement>('.sg-student-answer-input').forEach((el) => {
                const id = el.dataset.subQuestionId;
                if (id && localAnswers.has(id)) el.value = localAnswers.get(id) || '';
                el.disabled = true;
            });
            for (const part of activeQuestion.parts) {
                flashcardIndexByPart.set(part.id, 0);
                showAnswerFlashcard(part);
            }
            renderFeatherIcons();
        })();
    });
}
