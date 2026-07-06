// public/scripts/feature/scenarios-student.ts

/**
 * scenarios-student.ts
 *
 * @description: Student "Practice Scenarios" feature. Chapter accordion (grouped by
 * TopicOrWeekInstance) listing published scenario questions, and a one-part-at-a-time practice
 * view with flexible-order check-answer and a gated model-solution reveal. Calls the real
 * `/api/courses/:courseId/scenario-questions*` endpoints via `scenario-questions-api.ts`.
 */

import {
    activeCourse,
    TopicOrWeekInstance,
    ScenarioQuestion,
    ScenarioQuestionForStudent,
    ScenarioPartId
} from '../types.js';
import {
    fetchPublishedScenarioQuestions,
    fetchScenarioQuestion,
    checkScenarioAnswer,
    fetchScenarioSolution
} from '../api/scenario-questions-api.js';
import { RenderChat } from './render-chat.js';
import { renderLatexInHtmlContent } from './chat.js';
import { renderFeatherIcons } from '../api/api.js';

type StudentQuestion = ScenarioQuestion | ScenarioQuestionForStudent;

const ALL_PART_IDS: ScenarioPartId[] = ['a', 'b', 'c', 'd'];
const REQUIRED_PART_IDS: ScenarioPartId[] = ['a', 'b', 'c'];

let currentCourse: activeCourse | null = null;
let currentQuestion: StudentQuestion | null = null;
let currentPartId: ScenarioPartId | null = null;
/** Parts checked at least once during this browsing session — mirrors the server-side gate locally so
 * the "View model solution" button appears without a dedicated progress-fetch endpoint. */
let checkedPartIds: Set<ScenarioPartId> = new Set();
const expandedChapterIds: Set<string> = new Set();
const renderChat = new RenderChat();

/** Aborts listeners from a previous mount when the component HTML is reloaded. */
let uiAbort: AbortController | null = null;

function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * initializeScenariosStudent
 *
 * @param course activeCourse — current student's course (provides topicOrWeekInstances for chapters)
 * @returns Promise<void>
 * Entry point called by student-mode.ts when the "scenarios" component is loaded.
 */
export async function initializeScenariosStudent(course: activeCourse): Promise<void> {
    currentCourse = course;
    currentQuestion = null;
    currentPartId = null;
    checkedPartIds = new Set();

    uiAbort?.abort();
    uiAbort = new AbortController();

    if (expandedChapterIds.size === 0 && (course.topicOrWeekInstances || []).length > 0) {
        expandedChapterIds.add(course.topicOrWeekInstances[0].id);
    }

    showListView();
    await renderChapterList();
    attachBackButtonListener();
}

function attachBackButtonListener(): void {
    const backBtn = document.getElementById('scenarios-back-btn');
    backBtn?.addEventListener('click', () => {
        showListView();
    }, { signal: uiAbort?.signal });
}

function showListView(): void {
    const listView = document.getElementById('scenarios-list-view');
    const practiceView = document.getElementById('scenarios-practice-view');
    if (listView) listView.style.display = '';
    if (practiceView) practiceView.style.display = 'none';
}

function showPracticeView(): void {
    const listView = document.getElementById('scenarios-list-view');
    const practiceView = document.getElementById('scenarios-practice-view');
    if (listView) listView.style.display = 'none';
    if (practiceView) practiceView.style.display = '';
}

/**
 * renderChapterList
 *
 * @returns Promise<void>
 * Renders the chapter accordion: one section per TopicOrWeekInstance, listing published questions
 * with a "Start" button each. Chapters with zero published questions show an empty-state message.
 */
async function renderChapterList(): Promise<void> {
    const container = document.getElementById('scenarios-chapter-list');
    if (!container || !currentCourse) return;

    const chapters = currentCourse.topicOrWeekInstances || [];
    if (chapters.length === 0) {
        container.innerHTML = `<p class="scenarios-empty-state">No chapters have been set up for this course yet.</p>`;
        return;
    }

    let allPublished: ScenarioQuestionForStudent[] = [];
    try {
        allPublished = await fetchPublishedScenarioQuestions(currentCourse.id);
    } catch (error) {
        container.innerHTML = `<p class="scenarios-empty-state">${escapeHtml(errorMessage(error, 'Could not load scenario questions.'))}</p>`;
        return;
    }

    container.innerHTML = chapters.map(chapter => renderChapterSection(chapter, allPublished)).join('');
    renderFeatherIcons();
    attachChapterListeners();
}

function renderChapterSection(chapter: TopicOrWeekInstance, allPublished: ScenarioQuestionForStudent[]): string {
    const questions = allPublished
        .filter(q => q.topicOrWeekId === chapter.id)
        .sort((a, b) => a.sortOrder - b.sortOrder);
    const isExpanded = expandedChapterIds.has(chapter.id);

    const rows = questions.length > 0
        ? questions.map(q => `
            <li class="scenario-row">
                <span class="scenario-row-title">${escapeHtml(q.title)}</span>
                <button class="scenario-start-btn" data-question-id="${escapeHtml(q.id)}">
                    <span>Start</span>
                    <i data-feather="arrow-right"></i>
                </button>
            </li>
        `).join('')
        : `<li class="scenario-row-empty">No published scenarios for this chapter yet.</li>`;

    return `
        <div class="scenario-chapter${isExpanded ? ' expanded' : ''}" data-chapter-id="${escapeHtml(chapter.id)}">
            <button class="scenario-chapter-header" data-chapter-id="${escapeHtml(chapter.id)}">
                <i data-feather="${isExpanded ? 'chevron-down' : 'chevron-right'}"></i>
                <span class="scenario-chapter-title">${escapeHtml(chapter.title)}</span>
                <span class="scenario-chapter-count">(${questions.length} question${questions.length === 1 ? '' : 's'})</span>
            </button>
            <ul class="scenario-chapter-body" style="display: ${isExpanded ? '' : 'none'};">
                ${rows}
            </ul>
        </div>
    `;
}

function attachChapterListeners(): void {
    const container = document.getElementById('scenarios-chapter-list');
    if (!container) return;

    container.querySelectorAll<HTMLButtonElement>('.scenario-chapter-header').forEach(header => {
        header.addEventListener('click', () => {
            const chapterId = header.dataset.chapterId;
            if (!chapterId) return;
            if (expandedChapterIds.has(chapterId)) {
                expandedChapterIds.delete(chapterId);
            } else {
                expandedChapterIds.add(chapterId);
            }
            renderChapterList();
        }, { signal: uiAbort?.signal });
    });

    container.querySelectorAll<HTMLButtonElement>('.scenario-start-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const questionId = btn.dataset.questionId;
            if (questionId) startPractice(questionId);
        }, { signal: uiAbort?.signal });
    });
}

/**
 * startPractice
 *
 * @param questionId string
 * @returns Promise<void>
 * Loads the question (server returns 404 for drafts — never leaked to students), resets local
 * practice state, renders the narrative, and shows the first part.
 */
async function startPractice(questionId: string): Promise<void> {
    if (!currentCourse) return;

    let question: StudentQuestion | null;
    try {
        question = await fetchScenarioQuestion(currentCourse.id, questionId);
    } catch (error) {
        console.error('[SCENARIOS-STUDENT] Error loading question:', error);
        return;
    }
    if (!question) return; // draft/missing questions are 404 for students — stay on list

    currentQuestion = question;
    checkedPartIds = new Set();
    currentPartId = firstAvailablePart(question);

    renderPracticeHeader();
    renderNarrative();
    renderProgressDots();
    renderActivePart();
    hideFeedbackPanel();
    hideSolutionPanel();
    updateContinueAndSolutionButtons();
    attachPracticeListeners();

    showPracticeView();
}

function firstAvailablePart(question: StudentQuestion): ScenarioPartId {
    const availableIds = ALL_PART_IDS.filter(id => question.subQuestions.some(sq => sq.partId === id));
    return availableIds[0] || 'a';
}

function renderPracticeHeader(): void {
    const titleEl = document.getElementById('practice-question-title');
    if (titleEl && currentQuestion) titleEl.textContent = currentQuestion.title;
}

function renderNarrative(): void {
    const narrativeEl = document.getElementById('practice-narrative');
    if (!narrativeEl || !currentQuestion) return;
    narrativeEl.innerHTML = renderChat.render(currentQuestion.questionBody, `scenario-${currentQuestion.id}`);
    renderLatexInHtmlContent(narrativeEl);
    renderFeatherIcons();
}

function renderProgressDots(): void {
    const progressEl = document.getElementById('practice-progress');
    if (!progressEl || !currentQuestion) return;

    const availableParts = ALL_PART_IDS.filter(id => currentQuestion!.subQuestions.some(sq => sq.partId === id));
    progressEl.innerHTML = availableParts.map(partId => {
        const isChecked = checkedPartIds.has(partId);
        const isActive = partId === currentPartId;
        const classes = ['practice-progress-dot'];
        if (isChecked) classes.push('checked');
        if (isActive) classes.push('active');
        return `<span class="${classes.join(' ')}" data-part-id="${partId}" title="Part (${partId})">${isChecked ? '✓' : ''} (${partId})</span>`;
    }).join('');
}

function renderActivePart(): void {
    const labelEl = document.getElementById('practice-part-label');
    const promptEl = document.getElementById('practice-part-prompt');
    const inputEl = document.getElementById('practice-answer-input') as HTMLTextAreaElement | null;
    if (!labelEl || !promptEl || !inputEl || !currentQuestion || !currentPartId) return;

    const part = currentQuestion.subQuestions.find(sq => sq.partId === currentPartId);
    labelEl.textContent = `Part (${currentPartId})`;
    promptEl.textContent = part?.prompt || '';
    inputEl.value = '';
    inputEl.disabled = false;

    const checkBtn = document.getElementById('practice-check-btn') as HTMLButtonElement | null;
    if (checkBtn) checkBtn.disabled = false;
}

function hideFeedbackPanel(): void {
    const panel = document.getElementById('practice-feedback-panel');
    if (panel) {
        panel.style.display = 'none';
        panel.innerHTML = '';
    }
}

function hideSolutionPanel(): void {
    const panel = document.getElementById('practice-solution-panel');
    if (panel) {
        panel.style.display = 'none';
        panel.innerHTML = '';
    }
}

function updateContinueAndSolutionButtons(): void {
    const continueBtn = document.getElementById('practice-continue-btn') as HTMLButtonElement | null;
    const solutionBtn = document.getElementById('practice-solution-btn') as HTMLButtonElement | null;
    if (!currentQuestion || !currentPartId) return;

    const availableParts = ALL_PART_IDS.filter(id => currentQuestion!.subQuestions.some(sq => sq.partId === id));
    const currentIndex = availableParts.indexOf(currentPartId);
    const hasNextPart = currentIndex >= 0 && currentIndex < availableParts.length - 1;
    const currentPartChecked = checkedPartIds.has(currentPartId);

    if (continueBtn) {
        continueBtn.style.display = hasNextPart ? '' : 'none';
        continueBtn.disabled = !currentPartChecked;
        continueBtn.textContent = hasNextPart ? `Continue to part (${availableParts[currentIndex + 1]}) →` : 'Continue →';
    }

    const allRequiredChecked = REQUIRED_PART_IDS.every(p => checkedPartIds.has(p));
    if (solutionBtn) {
        solutionBtn.style.display = allRequiredChecked ? '' : 'none';
    }
}

function attachPracticeListeners(): void {
    const checkBtn = document.getElementById('practice-check-btn');
    const continueBtn = document.getElementById('practice-continue-btn');
    const solutionBtn = document.getElementById('practice-solution-btn');
    const progressEl = document.getElementById('practice-progress');

    checkBtn?.addEventListener('click', handleCheckAnswer, { signal: uiAbort?.signal });
    continueBtn?.addEventListener('click', handleContinue, { signal: uiAbort?.signal });
    solutionBtn?.addEventListener('click', handleViewSolution, { signal: uiAbort?.signal });

    progressEl?.addEventListener('click', (e: MouseEvent) => {
        const target = (e.target as HTMLElement).closest('.practice-progress-dot') as HTMLElement | null;
        const partId = target?.dataset.partId as ScenarioPartId | undefined;
        if (partId && currentQuestion?.subQuestions.some(sq => sq.partId === partId)) {
            currentPartId = partId;
            renderProgressDots();
            renderActivePart();
            hideFeedbackPanel();
            updateContinueAndSolutionButtons();
        }
    }, { signal: uiAbort?.signal });
}

/**
 * handleCheckAnswer
 *
 * @returns Promise<void>
 * Flexible check order (critical note 1): any visible part may be checked, at any time, any number
 * of times. Sends { partId, studentAnswer } and renders the returned verdict + Socratic guidance.
 */
async function handleCheckAnswer(): Promise<void> {
    if (!currentCourse || !currentQuestion || !currentPartId) return;
    const inputEl = document.getElementById('practice-answer-input') as HTMLTextAreaElement | null;
    const checkBtn = document.getElementById('practice-check-btn') as HTMLButtonElement | null;
    if (!inputEl) return;

    const studentAnswer = inputEl.value;
    if (checkBtn) checkBtn.disabled = true;

    try {
        const response = await checkScenarioAnswer(currentCourse.id, currentQuestion.id, currentPartId, studentAnswer);
        checkedPartIds.add(currentPartId);
        renderFeedbackPanel(response.verdict, response.guidance);
        renderProgressDots();
        updateContinueAndSolutionButtons();
    } catch (error) {
        renderFeedbackPanel(undefined, undefined, errorMessage(error, 'Could not check your answer. Please try again.'));
    } finally {
        if (checkBtn) checkBtn.disabled = false;
    }
}

function renderFeedbackPanel(verdict?: 'correct' | 'needs_improvement', guidance?: string, error?: string): void {
    const panel = document.getElementById('practice-feedback-panel');
    if (!panel) return;

    if (error || !verdict) {
        panel.innerHTML = `<p class="feedback-error">${escapeHtml(error || 'Something went wrong.')}</p>`;
        panel.style.display = '';
        return;
    }

    if (verdict === 'correct') {
        panel.innerHTML = `<p class="feedback-correct"><i data-feather="check-circle"></i> Correct — well done.</p>`;
    } else {
        const bullets = (guidance || '').split(/\n+/).filter(Boolean);
        panel.innerHTML = `
            <p class="feedback-needs-improvement"><i data-feather="refresh-cw"></i> Needs improvement</p>
            <ul class="feedback-guidance-list">
                ${bullets.map(b => `<li>${escapeHtml(b)}</li>`).join('')}
            </ul>
        `;
    }
    panel.style.display = '';
    renderFeatherIcons();
}

function handleContinue(): void {
    if (!currentQuestion || !currentPartId) return;
    const availableParts = ALL_PART_IDS.filter(id => currentQuestion!.subQuestions.some(sq => sq.partId === id));
    const currentIndex = availableParts.indexOf(currentPartId);
    if (currentIndex >= 0 && currentIndex < availableParts.length - 1) {
        currentPartId = availableParts[currentIndex + 1];
        renderProgressDots();
        renderActivePart();
        hideFeedbackPanel();
        updateContinueAndSolutionButtons();
    }
}

/**
 * handleViewSolution
 *
 * @returns Promise<void>
 * Gated (D — critical note 1): server only returns the solution once parts a, b, c have each been
 * checked at least once (403 otherwise, surfaced here as a thrown error).
 */
async function handleViewSolution(): Promise<void> {
    if (!currentCourse || !currentQuestion) return;
    const panel = document.getElementById('practice-solution-panel');
    if (!panel) return;

    try {
        const solution = await fetchScenarioSolution(currentCourse.id, currentQuestion.id);
        if (!solution) {
            panel.innerHTML = `<p class="feedback-error">Check all required parts (a, b, c) before viewing the solution.</p>`;
            panel.style.display = '';
            return;
        }
        panel.innerHTML = renderChat.render(solution.solutionBody, `scenario-solution-${currentQuestion.id}`);
        renderLatexInHtmlContent(panel);
        panel.style.display = '';
        renderFeatherIcons();
    } catch (error) {
        panel.innerHTML = `<p class="feedback-error">${escapeHtml(errorMessage(error, 'Solution not available yet.'))}</p>`;
        panel.style.display = '';
    }
}
