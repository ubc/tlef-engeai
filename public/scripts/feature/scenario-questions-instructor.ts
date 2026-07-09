// public/scripts/feature/scenario-questions-instructor.ts

/**
 * scenario-questions-instructor.ts
 *
 * Instructor Scenario Generation: topic grid, question list, generation form, and
 * editor/review views. Mock-only phase — uses scenario-questions-mock.ts (no API calls).
 */

import {
    activeCourse,
    ScenarioSubQuestionType,
    ScenarioDifficulty,
    ScenarioQuestionExtended
} from '../types.js';
import {
    initMockStore,
    listQuestions,
    getQuestion,
    updateQuestion,
    patchStatus,
    deleteQuestion,
    generateQuestion,
    validatePublish,
    formatExpectedTime
} from '../api/scenario-questions-mock.js';
import { renderFeatherIcons } from '../api/api.js';
import { showSuccessToast, showErrorToast } from '../ui/toast-notification.js';
import { showConfirmModal } from '../ui/modal-overlay.js';
import { RenderChat } from './render-chat.js';
import { renderLatexInHtmlContent } from './chat.js';
import {
    parseAnswerKeyToFlashcards,
    SUB_QUESTION_TYPE_LABELS
} from './scenario-answer-flashcard.js';

const ALL_TYPES: ScenarioSubQuestionType[] = ['calculation', 'troubleshoot', 'action', 'corrective'];
const DEFAULT_SELECTED_TYPES: ScenarioSubQuestionType[] = ['calculation', 'troubleshoot', 'action'];
const AUTO_SAVE_MS = 5000;

const lastEditedDateFmt = new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
});

const renderChat = new RenderChat();

let currentCourse: activeCourse | null = null;
let activeTopicId: string | null = null;
let cachedQuestions: ScenarioQuestionExtended[] = [];
let editorQuestionId: string | null = null;
let editorQuestion: ScenarioQuestionExtended | null = null;
let isDirty = false;
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

/** Draft title while composing a new question in the generate view. */
let generateDraftTitle = 'Untitled';

/** Selected types in order for generate view. */
let selectedTypes: ScenarioSubQuestionType[] = [...DEFAULT_SELECTED_TYPES];
let selectedDifficulty: ScenarioDifficulty = 'medium';

/** Per-part prompt view mode in editor: raw markdown editor vs rendered preview. */
const partPromptModes = new Map<string, 'edit' | 'preview'>();

/** Per-part answer view mode in editor: text (markdown preview) or flashcard. */
const partAnswerModes = new Map<string, 'text' | 'flashcard'>();
/** Per-part flashcard step index. */
const partFlashcardIndex = new Map<string, number>();

/** Base question pane: raw markdown editor vs rendered preview (mutually exclusive). */
let questionBodyViewMode: 'edit' | 'preview' = 'edit';

/** Draft LO selection while the manage modal is open. */
let loModalDraftSelection: string[] = [];

/** Draft minutes while the expected-time modal is open. */
let timeModalDraftMinutes = 25;

/** ponytail: mock catalog until course-document LO API exists. */
const MOCK_DOCUMENT_LEARNING_OBJECTIVES: { code: string; description: string }[] = [
    { code: 'LO-10-1', description: 'Apply steady-state mass balances to process units.' },
    { code: 'LO-10-2', description: 'Interpret P&ID symbols for valve and pump failures.' },
    { code: 'LO-10-3', description: 'Troubleshoot deviations using first-principles reasoning.' },
    { code: 'LO-11-1', description: 'Select appropriate corrective actions under operational constraints.' },
    { code: 'LO-11-2', description: 'Communicate engineering recommendations with units and assumptions.' },
    { code: 'LO-12-1', description: 'Evaluate safety and environmental impacts of process changes.' },
];

let uiAbort: AbortController | null = null;

function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/** Render markdown + LaTeX into a preview container (matches student practice / chat). */
function renderMarkdownInto(element: HTMLElement, markdown: string, idPrefix: string): void {
    element.innerHTML = renderChat.render(markdown, idPrefix);
    renderLatexInHtmlContent(element);
}

function errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error && error.message ? error.message : fallback;
}

function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

type ScenarioPublishableStatus = 'draft' | 'published';

const PUBLISHABLE_STATUSES: ScenarioPublishableStatus[] = ['draft', 'published'];

function normalizedPublishableStatus(status: ScenarioQuestionExtended['status']): ScenarioPublishableStatus {
    return status === 'published' ? 'published' : 'draft';
}

function learningObjectiveDescription(stored: string): string {
    const match = MOCK_DOCUMENT_LEARNING_OBJECTIVES.find(lo => lo.code === stored || lo.description === stored);
    return match?.description ?? stored;
}

function normalizeLearningObjectives(objectives: string[]): string[] {
    return objectives.map(learningObjectiveDescription);
}

const SQ_MODAL_TRANSITION_MS = 300;

/**
 * initializeScenarioQuestionsInstructor
 *
 * @param course activeCourse
 */
export async function initializeScenarioQuestionsInstructor(course: activeCourse): Promise<void> {
    currentCourse = course;
    activeTopicId = null;
    cachedQuestions = [];
    editorQuestionId = null;
    isDirty = false;
    clearAutoSaveTimer();

    uiAbort?.abort();
    uiAbort = new AbortController();

    const topicIds = (course.topicOrWeekInstances || []).map(t => t.id);
    initMockStore(course.id, topicIds, course.courseName);

    hideAllViews();
    showGridView();
    await renderTopicGrid();
    attachStaticListeners();
}

function hideAllViews(): void {
    ['sq-grid-view', 'sq-topic-detail-view', 'sq-generate-view', 'sq-editor-view'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
}

function showGridView(): void {
    hideAllViews();
    const el = document.getElementById('sq-grid-view');
    if (el) el.style.display = '';
}

function showTopicDetailView(): void {
    hideAllViews();
    const el = document.getElementById('sq-topic-detail-view');
    if (el) el.style.display = '';
}

function showGenerateView(): void {
    hideAllViews();
    const el = document.getElementById('sq-generate-view');
    if (el) el.style.display = '';
}

function showEditorView(): void {
    hideAllViews();
    const el = document.getElementById('sq-editor-view');
    if (el) el.style.display = '';
}

function attachStaticListeners(): void {
    const signal = uiAbort?.signal;

    document.getElementById('sq-topic-detail-back-btn')?.addEventListener('click', () => {
        activeTopicId = null;
        showGridView();
        renderTopicGrid();
    }, { signal });

    document.getElementById('sq-topic-detail-generate-btn')?.addEventListener('click', () => {
        openGenerateView();
    }, { signal });

    document.getElementById('sq-generate-back-btn')?.addEventListener('click', () => {
        showTopicDetailView();
        renderTopicDetail();
    }, { signal });

    document.getElementById('sq-generate-title-edit-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        beginInlineTitleEdit('generate');
    }, { signal });
    document.getElementById('sq-generate-title-display')?.addEventListener('click', () => beginInlineTitleEdit('generate'), { signal });
    wireInlineTitleInput('generate', signal);

    document.getElementById('sq-generate-submit-btn')?.addEventListener('click', handleGenerateSubmit, { signal });
    document.getElementById('sq-type-add-btn')?.addEventListener('click', toggleTypePopover, { signal });
    document.getElementById('sq-difficulty-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDifficultyMenu();
    }, { signal });

    document.querySelectorAll<HTMLButtonElement>('#sq-generate-view .sq-difficulty-option').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const d = btn.dataset.difficulty as ScenarioDifficulty;
            if (d) setDifficulty(d);
            closeDifficultyMenu();
        }, { signal });
    });

    document.getElementById('sq-editor-back-btn')?.addEventListener('click', async () => {
        if (isDirty) await persistEditor(false);
        editorQuestionId = null;
        showTopicDetailView();
        await refreshQuestions();
        renderTopicDetail();
    }, { signal });

    document.getElementById('sq-editor-title-edit-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        beginInlineTitleEdit('editor');
    }, { signal });
    document.getElementById('sq-editor-title-display')?.addEventListener('click', () => beginInlineTitleEdit('editor'), { signal });
    wireInlineTitleInput('editor', signal);

    document.getElementById('sq-editor-save-btn')?.addEventListener('click', () => persistEditor(true), { signal });
    document.getElementById('sq-editor-status-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleEditorStatusMenu();
    }, { signal });
    document.querySelectorAll<HTMLButtonElement>('#sq-editor-status-menu .sq-status-menu-option').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const status = btn.dataset.status as ScenarioPublishableStatus;
            if (status) await setEditorQuestionStatus(status);
        }, { signal });
    });
    document.getElementById('sq-editor-lo-manage-btn')?.addEventListener('click', openLearningObjectivesModal, { signal });
    document.getElementById('sq-editor-lo-list')?.addEventListener('dblclick', openLearningObjectivesModal, { signal });
    document.getElementById('sq-editor-expected-time-btn')?.addEventListener('click', openExpectedTimeModal, { signal });
    document.getElementById('sq-time-modal-close-btn')?.addEventListener('click', closeExpectedTimeModal, { signal });
    document.getElementById('sq-time-modal-cancel-btn')?.addEventListener('click', closeExpectedTimeModal, { signal });
    document.getElementById('sq-time-modal-save-btn')?.addEventListener('click', saveExpectedTimeModal, { signal });
    document.getElementById('sq-time-modal-decrease-btn')?.addEventListener('click', () => adjustTimeModalDraft(-5), { signal });
    document.getElementById('sq-time-modal-increase-btn')?.addEventListener('click', () => adjustTimeModalDraft(5), { signal });
    document.getElementById('sq-time-modal-overlay')?.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeExpectedTimeModal();
    }, { signal });
    document.getElementById('sq-time-modal-input')?.addEventListener('input', () => {
        document.getElementById('sq-time-modal-input')?.classList.remove('sq-time-modal-input--invalid');
    }, { signal });
    document.getElementById('sq-editor-delete-btn')?.addEventListener('click', () => {
        if (editorQuestionId) void confirmAndDeleteQuestion(editorQuestionId, true);
    }, { signal });
    document.getElementById('sq-lo-modal-close-btn')?.addEventListener('click', closeLearningObjectivesModal, { signal });
    document.getElementById('sq-lo-modal-cancel-btn')?.addEventListener('click', closeLearningObjectivesModal, { signal });
    document.getElementById('sq-lo-modal-save-btn')?.addEventListener('click', saveLearningObjectivesModal, { signal });
    document.getElementById('sq-lo-modal-overlay')?.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeLearningObjectivesModal();
    }, { signal });

    document.querySelectorAll<HTMLButtonElement>('.sq-base-question-toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.dataset.mode as 'edit' | 'preview' | undefined;
            if (mode) setQuestionBodyViewMode(mode);
        }, { signal });
    });

    document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (!target.closest('.sq-type-add-wrap')) closeTypePopover();
        if (!target.closest('.sq-difficulty-wrap')) closeDifficultyMenu();
        if (!target.closest('.sq-status-wrap')) closeAllStatusMenus();
    }, { signal });
}

async function refreshQuestions(): Promise<void> {
    if (!currentCourse) return;
    cachedQuestions = await listQuestions(currentCourse.id);
}

function formatTopicSubtitle(topicOrWeekId: string, title: string): string {
    if (topicOrWeekId === '__uncategorized__') return 'Uncategorized';
    const chapters = currentCourse?.topicOrWeekInstances || [];
    const index = chapters.findIndex(c => c.id === topicOrWeekId);
    const weekLabel = index >= 0 ? `Topic/Week ${index + 1}` : 'Topic/Week';
    return `${weekLabel}: ${title}`;
}

function topicLabelForEditor(topicOrWeekId: string): string {
    const chapters = currentCourse?.topicOrWeekInstances || [];
    const index = chapters.findIndex(c => c.id === topicOrWeekId);
    const title = chapters.find(c => c.id === topicOrWeekId)?.title ?? 'Topic';
    return index >= 0 ? `Topic ${index + 1}: ${title}` : title;
}

function questionsForTopic(topicOrWeekId: string): ScenarioQuestionExtended[] {
    return cachedQuestions
        .filter(q => q.topicOrWeekId === topicOrWeekId)
        .sort((a, b) => a.sortOrder - b.sortOrder);
}

function statsFromQuestions(questions: ScenarioQuestionExtended[]): { count: number; lastUpdatedAt: string | null } {
    if (!questions.length) return { count: 0, lastUpdatedAt: null };
    const lastUpdatedAt = questions.reduce<string | null>((latest, q) => {
        const c = q.updatedAt ? String(q.updatedAt) : null;
        if (!c) return latest;
        return !latest || new Date(c) > new Date(latest) ? c : latest;
    }, null);
    return { count: questions.length, lastUpdatedAt };
}

function topicStats(topicOrWeekId: string): { count: number; lastUpdatedAt: string | null } {
    return statsFromQuestions(questionsForTopic(topicOrWeekId));
}

function formatLastEditedLabel(isoDate: string | null): string {
    if (!isoDate) return 'Last edited: Not updated yet';
    const date = new Date(isoDate);
    if (Number.isNaN(date.getTime())) return 'Last edited: Not updated yet';
    return `Last edited: ${lastEditedDateFmt.format(date)}`;
}

function getTopicTitle(topicOrWeekId: string): string {
    if (topicOrWeekId === '__uncategorized__') return 'Uncategorized';
    return currentCourse?.topicOrWeekInstances?.find(c => c.id === topicOrWeekId)?.title ?? 'Topic';
}

async function renderTopicGrid(): Promise<void> {
    const container = document.getElementById('sq-list');
    if (!container || !currentCourse) return;

    try {
        await refreshQuestions();
    } catch (error) {
        container.innerHTML = `<p class="sq-empty-state sq-empty-state--full">${escapeHtml(errorMessage(error, 'Could not load questions.'))}</p>`;
        return;
    }

    const chapters = currentCourse.topicOrWeekInstances || [];
    if (!chapters.length) {
        container.innerHTML = `<p class="sq-empty-state sq-empty-state--full">No topics or weeks have been set up for this course yet.</p>`;
        return;
    }

    const cardsHtml = chapters.map(ch => {
        const stats = topicStats(ch.id);
        return renderTopicProjectCard(ch.id, ch.title, stats.count, stats.lastUpdatedAt);
    }).join('');

    const knownIds = new Set(chapters.map(c => c.id));
    const orphans = cachedQuestions.filter(q => !knownIds.has(q.topicOrWeekId));
    const orphanHtml = orphans.length
        ? renderTopicProjectCard('__uncategorized__', 'Uncategorized', statsFromQuestions(orphans).count, statsFromQuestions(orphans).lastUpdatedAt)
        : '';

    container.innerHTML = cardsHtml + orphanHtml;
    attachTopicCardListeners();
    renderFeatherIcons();
}

function renderTopicProjectCard(topicOrWeekId: string, title: string, count: number, lastUpdatedAt: string | null): string {
    const questionLabel = `${count} question${count === 1 ? '' : 's'}`;
    return `
        <button type="button" class="sq-project-card" data-topic-id="${escapeHtml(topicOrWeekId)}" data-topic-title="${escapeHtml(title)}">
            <span class="sq-project-card-title">${escapeHtml(title)}</span>
            <span class="sq-project-card-footer">
                <span class="sq-project-card-updated">${escapeHtml(formatLastEditedLabel(lastUpdatedAt))}</span>
                <span class="sq-project-card-count">${escapeHtml(questionLabel)}</span>
            </span>
        </button>
    `;
}

function attachTopicCardListeners(): void {
    document.querySelectorAll<HTMLButtonElement>('.sq-project-card').forEach(card => {
        card.addEventListener('click', () => {
            activeTopicId = card.dataset.topicId || null;
            showTopicDetailView();
            renderTopicDetail();
        }, { signal: uiAbort?.signal });
    });
}

function renderTopicDetail(): void {
    if (!currentCourse || !activeTopicId) return;

    const titleEl = document.getElementById('sq-topic-detail-title');
    const subtitleEl = document.getElementById('sq-topic-detail-subtitle');
    const listEl = document.getElementById('sq-topic-detail-list');
    if (!titleEl || !subtitleEl || !listEl) return;

    const chapters = currentCourse.topicOrWeekInstances || [];
    const knownIds = new Set(chapters.map(c => c.id));
    const title = getTopicTitle(activeTopicId);

    const topicQuestions = activeTopicId === '__uncategorized__'
        ? cachedQuestions.filter(q => !knownIds.has(q.topicOrWeekId)).sort((a, b) => a.sortOrder - b.sortOrder)
        : questionsForTopic(activeTopicId);

    titleEl.textContent = title;
    subtitleEl.textContent = formatLastEditedLabel(statsFromQuestions(topicQuestions).lastUpdatedAt);

    if (!topicQuestions.length) {
        listEl.innerHTML = `<p class="sq-empty-state">No scenario questions in this topic yet. Use New question to create one.</p>`;
        return;
    }

    listEl.innerHTML = topicQuestions.map(renderQuestionRow).join('');
    renderFeatherIcons();
    attachQuestionRowListeners();
}

function renderQuestionRow(question: ScenarioQuestionExtended): string {
    const partCount = question.subQuestions.length;
    const lastEdited = formatLastEditedLabel(question.updatedAt ? String(question.updatedAt) : null);

    return `
        <div class="sq-question-row" data-question-id="${escapeHtml(question.id)}">
            <button type="button" class="sq-question-row-main-btn">
                <div class="sq-question-row-main">
                    <p class="sq-question-row-title-line">
                        <span class="sq-question-row-label">Question Title:</span>
                        <span class="sq-question-row-title">${escapeHtml(question.title)}</span>
                    </p>
                    <p class="sq-question-row-sub">Sub questions: ${partCount}</p>
                    <p class="sq-question-row-updated">${escapeHtml(lastEdited)}</p>
                </div>
            </button>
            <div class="sq-question-row-badges">
                <span class="sq-difficulty-badge sq-difficulty-${question.difficulty}">${capitalize(question.difficulty)}</span>
                ${renderRowStatusControl(question)}
                <button type="button" class="sq-question-row-delete-btn" data-question-id="${escapeHtml(question.id)}" aria-label="Delete ${escapeHtml(question.title)}">
                    <i data-feather="trash-2"></i>
                </button>
            </div>
        </div>
    `;
}

function renderRowStatusControl(question: ScenarioQuestionExtended): string {
    const qid = escapeHtml(question.id);
    const current = normalizedPublishableStatus(question.status);
    return `
        <div class="sq-status-wrap sq-row-status-wrap" data-question-id="${qid}">
            <button type="button" class="sq-status-pill sq-status-pill-${current} sq-status-menu-btn sq-row-status-btn" data-question-id="${qid}" aria-haspopup="listbox" aria-expanded="false">
                <i data-feather="chevron-right"></i>
                <span>${capitalize(current)}</span>
            </button>
            <div class="sq-status-menu sq-row-status-menu" data-question-id="${qid}" style="display: none;" role="listbox">
                ${PUBLISHABLE_STATUSES.map(status => `
                    <button type="button" class="sq-status-menu-option sq-status-menu-option-${status}${status === current ? ' sq-status-menu-option--active' : ''}" data-status="${status}" data-question-id="${qid}">${capitalize(status)}</button>
                `).join('')}
            </div>
        </div>
    `;
}

function attachQuestionRowListeners(): void {
    document.querySelectorAll<HTMLButtonElement>('.sq-question-row-main-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const row = btn.closest('.sq-question-row') as HTMLElement | null;
            const id = row?.dataset.questionId;
            if (id) await openEditorView(id);
        }, { signal: uiAbort?.signal });
    });

    document.querySelectorAll<HTMLButtonElement>('.sq-row-status-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const questionId = btn.dataset.questionId;
            if (questionId) toggleRowStatusMenu(questionId);
        }, { signal: uiAbort?.signal });
    });

    document.querySelectorAll<HTMLButtonElement>('.sq-row-status-menu .sq-status-menu-option').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const questionId = btn.dataset.questionId;
            const status = btn.dataset.status as ScenarioPublishableStatus;
            if (questionId && status) await setQuestionStatus(questionId, status);
        }, { signal: uiAbort?.signal });
    });

    document.querySelectorAll<HTMLButtonElement>('.sq-question-row-delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const questionId = btn.dataset.questionId;
            if (questionId) void confirmAndDeleteQuestion(questionId, false);
        }, { signal: uiAbort?.signal });
    });
}

async function confirmAndDeleteQuestion(questionId: string, fromEditor: boolean): Promise<void> {
    if (!currentCourse) return;

    let title = 'this question';
    try {
        const question = await getQuestion(currentCourse.id, questionId);
        title = question.title?.trim() || title;
    } catch {
        // Proceed with generic label if lookup fails.
    }

    const result = await showConfirmModal(
        'Delete question?',
        `"${title}" will be permanently removed from this topic.`,
        'Delete question',
        'Cancel',
        'danger'
    );
    if (result.action !== 'delete-question') return;

    try {
        await deleteQuestion(currentCourse.id, questionId);
        showSuccessToast('Question deleted.');
        await refreshQuestions();

        if (fromEditor) {
            editorQuestionId = null;
            editorQuestion = null;
            isDirty = false;
            clearAutoSaveTimer();
            showTopicDetailView();
        }

        renderTopicDetail();
    } catch (error) {
        showErrorToast(errorMessage(error, 'Could not delete question.'));
    }
}

async function setQuestionStatus(questionId: string, status: ScenarioPublishableStatus): Promise<void> {
    if (!currentCourse) return;

    try {
        if (status === 'published') {
            const question = await getQuestion(currentCourse.id, questionId);
            const err = validatePublish(question);
            if (err) {
                showErrorToast(err);
                return;
            }
        }
        await patchStatus(currentCourse.id, questionId, status);
        closeAllStatusMenus();
        await refreshQuestions();
        renderTopicDetail();
        showSuccessToast(status === 'published' ? 'Question published.' : 'Question moved to draft.');
    } catch (error) {
        showErrorToast(errorMessage(error, 'Could not update status.'));
    }
}

function closeRowStatusMenus(): void {
    document.querySelectorAll<HTMLElement>('.sq-row-status-menu').forEach(menu => {
        menu.style.display = 'none';
    });
    document.querySelectorAll<HTMLButtonElement>('.sq-row-status-btn').forEach(btn => {
        btn.setAttribute('aria-expanded', 'false');
    });
}

function closeEditorStatusMenu(): void {
    const menu = document.getElementById('sq-editor-status-menu');
    const btn = document.getElementById('sq-editor-status-btn');
    if (menu) menu.style.display = 'none';
    if (btn) btn.setAttribute('aria-expanded', 'false');
}

function closeAllStatusMenus(): void {
    closeRowStatusMenus();
    closeEditorStatusMenu();
}

function toggleRowStatusMenu(questionId: string): void {
    const menu = document.querySelector<HTMLElement>(`.sq-row-status-menu[data-question-id="${questionId}"]`);
    const btn = document.querySelector<HTMLButtonElement>(`.sq-row-status-btn[data-question-id="${questionId}"]`);
    if (!menu || !btn) return;

    const willOpen = menu.style.display === 'none';
    closeAllStatusMenus();
    closeDifficultyMenu();
    if (willOpen) {
        menu.style.display = '';
        btn.setAttribute('aria-expanded', 'true');
    }
}

function toggleEditorStatusMenu(): void {
    const menu = document.getElementById('sq-editor-status-menu');
    const btn = document.getElementById('sq-editor-status-btn');
    if (!menu || !btn) return;

    const willOpen = menu.style.display === 'none';
    closeAllStatusMenus();
    if (willOpen) {
        menu.style.display = '';
        btn.setAttribute('aria-expanded', 'true');
    }
}

function updateEditorStatusButton(status: ScenarioQuestionExtended['status']): void {
    const normalized = normalizedPublishableStatus(status);
    const btn = document.getElementById('sq-editor-status-btn');
    const label = document.getElementById('sq-editor-status-label');
    if (label) label.textContent = capitalize(normalized);
    if (btn) {
        btn.classList.remove('sq-status-pill-draft', 'sq-status-pill-published', 'sq-status-pill-rejected');
        btn.classList.add(`sq-status-pill-${normalized}`);
    }
    document.querySelectorAll<HTMLButtonElement>('#sq-editor-status-menu .sq-status-menu-option').forEach(option => {
        option.classList.toggle('sq-status-menu-option--active', option.dataset.status === normalized);
    });
}

async function setEditorQuestionStatus(status: ScenarioPublishableStatus): Promise<void> {
    if (!currentCourse || !editorQuestionId) return;
    const errorEl = document.getElementById('sq-editor-error');

    if (isDirty) await persistEditor(false);

    if (status === 'published') {
        const question = await getQuestion(currentCourse.id, editorQuestionId);
        const err = validatePublish({ ...question, ...collectEditorPatch() } as ScenarioQuestionExtended);
        if (err) {
            if (errorEl) {
                errorEl.textContent = err;
                errorEl.style.display = '';
            }
            return;
        }
        try {
            await updateQuestion(currentCourse.id, editorQuestionId, collectEditorPatch());
            await patchStatus(currentCourse.id, editorQuestionId, 'published');
            editorQuestion = await getQuestion(currentCourse.id, editorQuestionId);
            updateEditorStatusButton(editorQuestion.status);
            if (errorEl) errorEl.style.display = 'none';
            showSuccessToast('Question published.');
        } catch (error) {
            showErrorToast(errorMessage(error, 'Could not publish.'));
        }
    } else {
        try {
            await patchStatus(currentCourse.id, editorQuestionId, 'draft');
            editorQuestion = await getQuestion(currentCourse.id, editorQuestionId);
            updateEditorStatusButton(editorQuestion.status);
            if (errorEl) errorEl.style.display = 'none';
            showSuccessToast('Question moved to draft.');
        } catch (error) {
            showErrorToast(errorMessage(error, 'Could not update status.'));
        }
    }

    closeEditorStatusMenu();
    await refreshQuestions();
}

// --- Generate view ---

function openGenerateView(): void {
    if (!activeTopicId || activeTopicId === '__uncategorized__') {
        showErrorToast('Select a topic with a valid chapter first.');
        return;
    }

    selectedTypes = [...DEFAULT_SELECTED_TYPES];
    selectedDifficulty = 'medium';
    generateDraftTitle = 'Untitled';

    const promptEl = document.getElementById('sq-generate-prompt') as HTMLTextAreaElement | null;
    if (promptEl) promptEl.value = '';

    const errorEl = document.getElementById('sq-generate-error');
    if (errorEl) errorEl.style.display = 'none';

    const backLabel = document.getElementById('sq-generate-back-label');
    if (backLabel && activeTopicId) backLabel.textContent = getTopicTitle(activeTopicId);

    const titleDisplay = document.getElementById('sq-generate-title-display');
    if (titleDisplay) titleDisplay.textContent = generateDraftTitle;

    renderTypePills();
    renderTypePopover();
    setDifficulty('medium');
    showGenerateView();
    renderFeatherIcons();
}

function renderTypePills(): void {
    const container = document.getElementById('sq-type-pills');
    if (!container) return;

    container.innerHTML = selectedTypes.map((type, i) => `
        <button type="button" class="sq-type-pill sq-type-pill--active" data-type="${type}" data-index="${i}">
            ${escapeHtml(SUB_QUESTION_TYPE_LABELS[type])}
            <span class="sq-type-pill-remove" data-index="${i}" aria-label="Remove ${escapeHtml(SUB_QUESTION_TYPE_LABELS[type])}">×</span>
        </button>
    `).join('');

    container.querySelectorAll<HTMLButtonElement>('.sq-type-pill').forEach(pill => {
        pill.addEventListener('click', (e) => {
            const remove = (e.target as HTMLElement).closest('.sq-type-pill-remove');
            if (remove) {
                e.stopPropagation();
                const index = parseInt((remove as HTMLElement).dataset.index ?? '-1', 10);
                if (index >= 0) removeTypeAtIndex(index);
            }
        }, { signal: uiAbort?.signal });
    });
}

function renderTypePopover(): void {
    const popover = document.getElementById('sq-type-popover');
    if (!popover) return;

    popover.innerHTML = ALL_TYPES.map(type => `
        <button type="button" class="sq-type-popover-item" data-type="${type}" role="menuitem">
            ${escapeHtml(SUB_QUESTION_TYPE_LABELS[type])}
        </button>
    `).join('');

    popover.querySelectorAll<HTMLButtonElement>('.sq-type-popover-item').forEach(btn => {
        btn.addEventListener('click', () => {
            addType(btn.dataset.type as ScenarioSubQuestionType);
            closeTypePopover();
        }, { signal: uiAbort?.signal });
    });
}

function addType(type: ScenarioSubQuestionType): void {
    selectedTypes.push(type);
    renderTypePills();
}

function removeTypeAtIndex(index: number): void {
    if (selectedTypes.length <= 1) {
        showErrorToast('At least one subquestion type is required.');
        return;
    }
    selectedTypes = selectedTypes.filter((_, i) => i !== index);
    renderTypePills();
}

function toggleTypePopover(): void {
    const popover = document.getElementById('sq-type-popover');
    const btn = document.getElementById('sq-type-add-btn');
    if (!popover || !btn) return;
    const open = popover.style.display === 'none';
    popover.style.display = open ? '' : 'none';
    btn.setAttribute('aria-expanded', String(open));
}

function closeTypePopover(): void {
    const popover = document.getElementById('sq-type-popover');
    const btn = document.getElementById('sq-type-add-btn');
    if (popover) popover.style.display = 'none';
    if (btn) btn.setAttribute('aria-expanded', 'false');
}

function setDifficulty(d: ScenarioDifficulty): void {
    selectedDifficulty = d;
    const label = document.getElementById('sq-difficulty-label');
    if (label) label.textContent = capitalize(d);

    document.querySelectorAll<HTMLButtonElement>('#sq-generate-view .sq-difficulty-option').forEach(btn => {
        const isActive = btn.dataset.difficulty === d;
        btn.classList.toggle('sq-difficulty-option--active', isActive);
    });

    const diffBtn = document.getElementById('sq-difficulty-btn');
    if (diffBtn) {
        diffBtn.classList.remove('sq-difficulty-btn-easy', 'sq-difficulty-btn-medium', 'sq-difficulty-btn-hard');
        diffBtn.classList.add(`sq-difficulty-btn-${d}`);
    }
}

function toggleDifficultyMenu(): void {
    const menu = document.getElementById('sq-difficulty-menu');
    const btn = document.getElementById('sq-difficulty-btn');
    if (!menu || !btn) return;
    const willOpen = menu.style.display === 'none';
    closeAllStatusMenus();
    menu.style.display = willOpen ? '' : 'none';
    btn.setAttribute('aria-expanded', String(willOpen));
}

function closeDifficultyMenu(): void {
    const menu = document.getElementById('sq-difficulty-menu');
    const btn = document.getElementById('sq-difficulty-btn');
    if (menu) menu.style.display = 'none';
    if (btn) btn.setAttribute('aria-expanded', 'false');
}

type InlineTitleContext = 'editor' | 'generate';

function titleElements(context: InlineTitleContext): {
    display: HTMLElement | null;
    input: HTMLInputElement | null;
    editBtn: HTMLElement | null;
} {
    const prefix = context === 'editor' ? 'sq-editor' : 'sq-generate';
    return {
        display: document.getElementById(`${prefix}-title-display`),
        input: document.getElementById(`${prefix}-title-input`) as HTMLInputElement | null,
        editBtn: document.getElementById(`${prefix}-title-edit-btn`),
    };
}

function getInlineTitleValue(context: InlineTitleContext): string {
    if (context === 'generate') return generateDraftTitle;
    const display = document.getElementById('sq-editor-title-display');
    return display?.textContent?.trim() || editorQuestion?.title || 'Untitled';
}

function setInlineTitleValue(context: InlineTitleContext, value: string): void {
    const trimmed = value.trim() || 'Untitled';
    if (context === 'generate') {
        generateDraftTitle = trimmed;
        return;
    }
    if (editorQuestion) editorQuestion = { ...editorQuestion, title: trimmed };
}

function beginInlineTitleEdit(context: InlineTitleContext): void {
    const { display, input, editBtn } = titleElements(context);
    if (!display || !input) return;

    input.value = getInlineTitleValue(context);
    display.style.display = 'none';
    if (editBtn) editBtn.style.display = 'none';
    input.style.display = '';
    input.focus();
    input.select();
}

function commitInlineTitleEdit(context: InlineTitleContext): void {
    const { display, input, editBtn } = titleElements(context);
    if (!display || !input) return;

    const next = input.value.trim();
    if (next) setInlineTitleValue(context, next);
    display.textContent = getInlineTitleValue(context);
    display.style.display = '';
    if (editBtn) editBtn.style.display = '';
    input.style.display = 'none';
    if (context === 'editor') markDirty();
}

function cancelInlineTitleEdit(context: InlineTitleContext): void {
    const { display, input, editBtn } = titleElements(context);
    if (!display || !input) return;

    display.style.display = '';
    if (editBtn) editBtn.style.display = '';
    input.style.display = 'none';
}

function wireInlineTitleInput(context: InlineTitleContext, signal?: AbortSignal): void {
    const input = titleElements(context).input;
    if (!input) return;

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            commitInlineTitleEdit(context);
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            cancelInlineTitleEdit(context);
        }
    }, { signal });

    input.addEventListener('blur', () => commitInlineTitleEdit(context), { signal });
}

function setQuestionBodyViewMode(mode: 'edit' | 'preview'): void {
    questionBodyViewMode = mode;
    const textarea = document.getElementById('sq-editor-question-body') as HTMLTextAreaElement | null;
    const rendered = document.getElementById('sq-editor-question-rendered');

    document.querySelectorAll<HTMLButtonElement>('.sq-base-question-toggle-btn').forEach(btn => {
        btn.classList.toggle('sq-view-toggle-btn--active', btn.dataset.mode === mode);
    });

    if (!textarea || !rendered) return;

    if (mode === 'edit') {
        textarea.hidden = false;
        rendered.hidden = true;
    } else {
        textarea.hidden = true;
        rendered.hidden = false;
        renderMarkdownInto(rendered, textarea.value, 'sq-question-body');
    }
}

async function handleGenerateSubmit(): Promise<void> {
    if (!currentCourse || !activeTopicId) return;

    const errorEl = document.getElementById('sq-generate-error');
    const submitBtn = document.getElementById('sq-generate-submit-btn') as HTMLButtonElement | null;
    const sourcePrompt = (document.getElementById('sq-generate-prompt') as HTMLTextAreaElement | null)?.value.trim() || '';

    if (!sourcePrompt) {
        if (errorEl) {
            errorEl.textContent = 'Write a base question before generating.';
            errorEl.style.display = '';
        }
        return;
    }

    if (submitBtn) submitBtn.disabled = true;
    if (errorEl) errorEl.style.display = 'none';

    try {
        const created = await generateQuestion(currentCourse.id, currentCourse.courseName, {
            topicOrWeekId: activeTopicId,
            sourcePrompt,
            selectedTypes: [...selectedTypes],
            difficulty: selectedDifficulty,
            title: generateDraftTitle.trim() || 'Untitled'
        });
        showSuccessToast('Generated draft — review and edit before publishing.');
        await refreshQuestions();
        await openEditorView(created.id);
    } catch (error) {
        if (errorEl) {
            errorEl.textContent = errorMessage(error, 'Generation failed.');
            errorEl.style.display = '';
        }
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
}

// --- Editor view ---

async function openEditorView(questionId: string): Promise<void> {
    if (!currentCourse) return;

    let question: ScenarioQuestionExtended;
    try {
        question = await getQuestion(currentCourse.id, questionId);
    } catch (error) {
        showErrorToast(errorMessage(error, 'Could not load question.'));
        return;
    }

    editorQuestionId = questionId;
    editorQuestion = question;
    isDirty = false;
    clearAutoSaveTimer();
    updateSaveButton();

    const backLabel = document.getElementById('sq-editor-back-label');
    if (backLabel) backLabel.textContent = getTopicTitle(question.topicOrWeekId);

    const titleDisplay = document.getElementById('sq-editor-title-display');
    if (titleDisplay) titleDisplay.textContent = question.title;

    const bodyEl = document.getElementById('sq-editor-question-body') as HTMLTextAreaElement | null;
    if (bodyEl) bodyEl.value = question.questionBody;

    const topicLabel = document.getElementById('sq-editor-topic-label');
    if (topicLabel) topicLabel.textContent = topicLabelForEditor(question.topicOrWeekId);

    updateExpectedTimeDisplay(question.expectedTimeMinutes);
    renderLearningObjectives(normalizeLearningObjectives(question.learningObjectives));
    renderEditorParts(question);
    setQuestionBodyViewMode('edit');
    updateEditorStatusButton(question.status);

    const errorEl = document.getElementById('sq-editor-error');
    if (errorEl) errorEl.style.display = 'none';

    showEditorView();
    attachEditorInputListeners();
    renderFeatherIcons();
}

function renderEditorParts(question: ScenarioQuestionExtended): void {
    const container = document.getElementById('sq-editor-parts');
    if (!container) return;

    container.innerHTML = question.subQuestions.map(sq => {
        const partKey = sq.partId;
        if (!partAnswerModes.has(partKey)) partAnswerModes.set(partKey, 'text');
        if (!partPromptModes.has(partKey)) partPromptModes.set(partKey, 'edit');
        const mode = partAnswerModes.get(partKey) ?? 'text';
        const promptMode = partPromptModes.get(partKey) ?? 'edit';

        const typeLabel = SUB_QUESTION_TYPE_LABELS[sq.subQuestionType] ?? sq.subQuestionType;

        return `
            <div class="sq-editor-part-card" data-part-id="${sq.partId}">
                <div class="sq-editor-part-header">
                    <div class="sq-editor-part-title-group">
                        <h3 class="sq-editor-part-title">Part (${sq.partId})</h3>
                        <span class="sq-part-type-badge sq-part-type-${sq.subQuestionType}">${escapeHtml(typeLabel)}</span>
                    </div>
                    <div class="sq-view-toggle sq-part-prompt-toggle" role="group" aria-label="Part (${sq.partId}) prompt view mode">
                        <button type="button" class="sq-view-toggle-btn sq-part-prompt-toggle-btn ${promptMode === 'edit' ? 'sq-view-toggle-btn--active' : ''}" data-mode="edit" data-part-id="${sq.partId}">Edit</button>
                        <button type="button" class="sq-view-toggle-btn sq-part-prompt-toggle-btn ${promptMode === 'preview' ? 'sq-view-toggle-btn--active' : ''}" data-mode="preview" data-part-id="${sq.partId}">Preview</button>
                    </div>
                </div>
                <div class="sq-part-prompt-body">
                    <label class="sq-sr-only" for="sq-part-prompt-${sq.partId}">Part (${sq.partId}) prompt</label>
                    <textarea id="sq-part-prompt-${sq.partId}" class="sq-editor-textarea sq-part-prompt" data-part-id="${sq.partId}" rows="3" ${promptMode === 'preview' ? 'hidden' : ''}>${escapeHtml(sq.prompt)}</textarea>
                    <div class="sq-part-prompt-preview sq-markdown-preview message-content" data-part-id="${sq.partId}" ${promptMode === 'edit' ? 'hidden' : ''}></div>
                </div>
                <div class="sq-answer-key-header">
                    <span class="sq-editor-section-label">Answer key</span>
                    <div class="sq-answer-toggle" role="group" aria-label="Answer key view mode">
                        <button type="button" class="sq-answer-toggle-btn ${mode === 'text' ? 'sq-answer-toggle-btn--active' : ''}" data-mode="text" data-part-id="${sq.partId}">Text</button>
                        <button type="button" class="sq-answer-toggle-btn ${mode === 'flashcard' ? 'sq-answer-toggle-btn--active' : ''}" data-mode="flashcard" data-part-id="${sq.partId}">flashcard</button>
                    </div>
                </div>
                <div class="sq-part-answer-body">
                    <textarea class="sq-editor-textarea sq-part-answer sq-part-answer-edit" data-part-id="${sq.partId}" rows="6">${escapeHtml(sq.modelAnswer)}</textarea>
                    <div class="sq-part-answer-preview sq-markdown-preview message-content" data-part-id="${sq.partId}"></div>
                    <div class="sq-flashcard-panel" data-part-id="${sq.partId}" style="display: none;"></div>
                </div>
            </div>
        `;
    }).join('');

    question.subQuestions.forEach(sq => {
        updatePartPromptDisplay(sq.partId);
        updatePartAnswerDisplay(sq.partId);
    });
}

function attachEditorInputListeners(): void {
    const signal = uiAbort?.signal;

    document.getElementById('sq-editor-question-body')?.addEventListener('input', () => {
        markDirty();
        if (questionBodyViewMode === 'preview') {
            const rendered = document.getElementById('sq-editor-question-rendered');
            const body = (document.getElementById('sq-editor-question-body') as HTMLTextAreaElement | null)?.value ?? '';
            if (rendered) renderMarkdownInto(rendered, body, 'sq-question-body');
        }
    }, { signal });

    document.querySelectorAll<HTMLTextAreaElement>('.sq-part-prompt, .sq-part-answer').forEach(el => {
        el.addEventListener('input', () => {
            markDirty();
            const partId = el.dataset.partId;
            if (partId && el.classList.contains('sq-part-answer')) {
                debouncePartPreview(partId);
            }
        }, { signal });
    });

    document.querySelectorAll<HTMLButtonElement>('.sq-part-prompt-toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const partId = btn.dataset.partId;
            const mode = btn.dataset.mode as 'edit' | 'preview' | undefined;
            if (partId && mode) {
                partPromptModes.set(partId, mode);
                updatePartPromptDisplay(partId);
            }
        }, { signal });
    });

    document.querySelectorAll<HTMLButtonElement>('.sq-answer-toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const partId = btn.dataset.partId;
            const mode = btn.dataset.mode as 'text' | 'flashcard';
            if (partId && mode) {
                partAnswerModes.set(partId, mode);
                partFlashcardIndex.set(partId, 0);
                updatePartAnswerDisplay(partId);
            }
        }, { signal });
    });
}

const previewDebounce = new Map<string, ReturnType<typeof setTimeout>>();

function debouncePartPreview(partId: string): void {
    const existing = previewDebounce.get(partId);
    if (existing) clearTimeout(existing);
    previewDebounce.set(partId, setTimeout(() => updatePartAnswerDisplay(partId), 300));
}

function updatePartPromptDisplay(partId: string): void {
    const mode = partPromptModes.get(partId) ?? 'edit';
    const promptEl = document.querySelector<HTMLTextAreaElement>(`.sq-part-prompt[data-part-id="${partId}"]`);
    const previewEl = document.querySelector<HTMLElement>(`.sq-part-prompt-preview[data-part-id="${partId}"]`);
    const card = document.querySelector(`.sq-editor-part-card[data-part-id="${partId}"]`);

    if (!promptEl || !previewEl || !card) return;

    card.querySelectorAll<HTMLButtonElement>('.sq-part-prompt-toggle-btn').forEach(btn => {
        btn.classList.toggle('sq-view-toggle-btn--active', btn.dataset.mode === mode);
    });

    if (mode === 'edit') {
        promptEl.hidden = false;
        previewEl.hidden = true;
    } else {
        promptEl.hidden = true;
        previewEl.hidden = false;
        renderMarkdownInto(previewEl, promptEl.value, `sq-part-prompt-${partId}`);
    }
}

function updatePartAnswerDisplay(partId: string): void {
    const mode = partAnswerModes.get(partId) ?? 'text';
    const answerEl = document.querySelector<HTMLTextAreaElement>(`.sq-part-answer[data-part-id="${partId}"]`);
    const previewEl = document.querySelector<HTMLElement>(`.sq-part-answer-preview[data-part-id="${partId}"]`);
    const flashcardEl = document.querySelector<HTMLElement>(`.sq-flashcard-panel[data-part-id="${partId}"]`);
    const card = document.querySelector(`.sq-editor-part-card[data-part-id="${partId}"]`);

    if (!answerEl || !previewEl || !flashcardEl || !card) return;

    const markdown = answerEl.value;

    card.querySelectorAll<HTMLButtonElement>('.sq-answer-toggle-btn').forEach(btn => {
        btn.classList.toggle('sq-answer-toggle-btn--active', btn.dataset.mode === mode);
    });

    if (mode === 'text') {
        answerEl.style.display = '';
        previewEl.style.display = '';
        flashcardEl.style.display = 'none';
        answerEl.classList.remove('sq-part-answer--hidden');
        renderMarkdownInto(previewEl, markdown, `sq-part-${partId}`);
    } else {
        answerEl.style.display = 'none';
        previewEl.style.display = 'none';
        flashcardEl.style.display = '';
        renderFlashcardPanel(partId, markdown, flashcardEl);
    }
}

function renderFlashcardPanel(partId: string, markdown: string, container: HTMLElement): void {
    const steps = parseAnswerKeyToFlashcards(markdown);
    if (!steps.length) {
        container.innerHTML = `<p class="sq-flashcard-empty">No steps detected. Use numbered lists or ## Step headings in the answer key.</p>`;
        return;
    }

    let idx = partFlashcardIndex.get(partId) ?? 0;
    if (idx >= steps.length) idx = steps.length - 1;
    partFlashcardIndex.set(partId, idx);

    const step = steps[idx];
    const bodyHost = document.createElement('div');
    bodyHost.className = 'sq-flashcard-body sq-markdown-preview message-content';
    renderMarkdownInto(bodyHost, step.bodyMarkdown, `sq-fc-${partId}-${idx}`);
    container.innerHTML = `
        <div class="sq-flashcard">
            <div class="sq-flashcard-header">
                <span class="sq-flashcard-step-label">Step ${idx + 1} of ${steps.length}</span>
                <span class="sq-flashcard-title">${escapeHtml(step.title)}</span>
            </div>
            <div class="sq-flashcard-nav">
                <button type="button" class="sq-flashcard-nav-btn" data-action="prev" data-part-id="${partId}" ${idx === 0 ? 'disabled' : ''} aria-label="Previous step">
                    <i data-feather="chevron-left"></i>
                </button>
                <button type="button" class="sq-flashcard-nav-btn" data-action="next" data-part-id="${partId}" ${idx >= steps.length - 1 ? 'disabled' : ''} aria-label="Next step">
                    <i data-feather="chevron-right"></i>
                </button>
            </div>
        </div>
    `;
    const flashcardEl = container.querySelector('.sq-flashcard');
    const navEl = container.querySelector('.sq-flashcard-nav');
    if (flashcardEl && navEl) flashcardEl.insertBefore(bodyHost, navEl);
    renderFeatherIcons();

    container.querySelectorAll<HTMLButtonElement>('.sq-flashcard-nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.dataset.action;
            const pid = btn.dataset.partId;
            if (!pid) return;
            const current = partFlashcardIndex.get(pid) ?? 0;
            const allSteps = parseAnswerKeyToFlashcards(
                document.querySelector<HTMLTextAreaElement>(`.sq-part-answer[data-part-id="${pid}"]`)?.value ?? ''
            );
            if (action === 'prev' && current > 0) partFlashcardIndex.set(pid, current - 1);
            if (action === 'next' && current < allSteps.length - 1) partFlashcardIndex.set(pid, current + 1);
            const answerMd = document.querySelector<HTMLTextAreaElement>(`.sq-part-answer[data-part-id="${pid}"]`)?.value ?? '';
            renderFlashcardPanel(pid, answerMd, container);
        }, { signal: uiAbort?.signal, once: true });
    });
}

function renderLearningObjectives(objectives: string[]): void {
    const list = document.getElementById('sq-editor-lo-list');
    if (!list) return;

    if (!objectives.length) {
        list.innerHTML = `<span class="sq-lo-empty">No objectives selected</span>`;
        return;
    }

    list.innerHTML = objectives.map(lo => `
        <span class="sq-lo-pill">${escapeHtml(learningObjectiveDescription(lo))}</span>
    `).join('');
}

function openLearningObjectivesModal(): void {
    const overlay = document.getElementById('sq-lo-modal-overlay');
    if (!overlay) return;

    loModalDraftSelection = normalizeLearningObjectives(editorQuestion?.learningObjectives ?? []);
    renderLearningObjectivesCatalog();
    overlay.style.display = 'flex';
    overlay.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => overlay.classList.add('sq-modal-overlay--visible'));
}

function closeLearningObjectivesModal(): void {
    const overlay = document.getElementById('sq-lo-modal-overlay');
    if (!overlay) return;

    overlay.classList.remove('sq-modal-overlay--visible');
    overlay.setAttribute('aria-hidden', 'true');

    window.setTimeout(() => {
        if (!overlay.classList.contains('sq-modal-overlay--visible')) {
            overlay.style.display = 'none';
        }
    }, SQ_MODAL_TRANSITION_MS);
}

function saveLearningObjectivesModal(): void {
    if (editorQuestion) {
        editorQuestion = { ...editorQuestion, learningObjectives: [...loModalDraftSelection] };
        renderLearningObjectives(loModalDraftSelection);
        markDirty();
    }
    closeLearningObjectivesModal();
}

function renderLearningObjectivesCatalog(): void {
    const catalog = document.getElementById('sq-lo-modal-catalog');
    if (!catalog) return;

    catalog.innerHTML = MOCK_DOCUMENT_LEARNING_OBJECTIVES.map(lo => {
        const checked = loModalDraftSelection.includes(lo.description);
        return `
            <label class="sq-lo-catalog-item">
                <input type="checkbox" class="sq-lo-catalog-checkbox" value="${escapeHtml(lo.description)}" ${checked ? 'checked' : ''} />
                <span class="sq-lo-catalog-text">${escapeHtml(lo.description)}</span>
            </label>
        `;
    }).join('');

    catalog.querySelectorAll<HTMLInputElement>('.sq-lo-catalog-checkbox').forEach(box => {
        box.addEventListener('change', () => {
            const description = box.value;
            if (box.checked) {
                if (!loModalDraftSelection.includes(description)) loModalDraftSelection.push(description);
            } else {
                loModalDraftSelection = loModalDraftSelection.filter(c => c !== description);
            }
        }, { signal: uiAbort?.signal });
    });
}

function updateExpectedTimeDisplay(minutes: number): void {
    const el = document.getElementById('sq-editor-expected-time');
    if (el) el.textContent = formatExpectedTime(minutes);
    el?.setAttribute('data-minutes', String(minutes));
}

function clampExpectedTimeMinutes(minutes: number): number {
    return Math.max(5, Math.min(120, Math.round(minutes)));
}

function parseExpectedTimeInput(raw: string): number | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;

    const colonMatch = /^(\d+)\s*:\s*(\d{1,2})$/.exec(trimmed);
    if (colonMatch) {
        return clampExpectedTimeMinutes(parseInt(colonMatch[1], 10));
    }

    const numericMatch = /^(\d+)$/.exec(trimmed);
    if (numericMatch) {
        return clampExpectedTimeMinutes(parseInt(numericMatch[1], 10));
    }

    return null;
}

function syncTimeModalInput(minutes: number): void {
    const input = document.getElementById('sq-time-modal-input') as HTMLInputElement | null;
    if (input) {
        input.value = formatExpectedTime(minutes);
        input.classList.remove('sq-time-modal-input--invalid');
    }
}

function openExpectedTimeModal(): void {
    const overlay = document.getElementById('sq-time-modal-overlay');
    if (!overlay) return;

    const current = parseInt(
        document.getElementById('sq-editor-expected-time')?.getAttribute('data-minutes') ?? '25',
        10
    );
    timeModalDraftMinutes = clampExpectedTimeMinutes(current);
    syncTimeModalInput(timeModalDraftMinutes);

    overlay.style.display = 'flex';
    overlay.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => overlay.classList.add('sq-modal-overlay--visible'));

    const input = document.getElementById('sq-time-modal-input') as HTMLInputElement | null;
    input?.focus();
    input?.select();
}

function closeExpectedTimeModal(): void {
    const overlay = document.getElementById('sq-time-modal-overlay');
    if (!overlay) return;

    overlay.classList.remove('sq-modal-overlay--visible');
    overlay.setAttribute('aria-hidden', 'true');

    window.setTimeout(() => {
        if (!overlay.classList.contains('sq-modal-overlay--visible')) {
            overlay.style.display = 'none';
        }
    }, SQ_MODAL_TRANSITION_MS);
}

function adjustTimeModalDraft(delta: number): void {
    timeModalDraftMinutes = clampExpectedTimeMinutes(timeModalDraftMinutes + delta);
    syncTimeModalInput(timeModalDraftMinutes);
}

function saveExpectedTimeModal(): void {
    const input = document.getElementById('sq-time-modal-input') as HTMLInputElement | null;
    const parsed = parseExpectedTimeInput(input?.value ?? '');

    if (parsed === null) {
        input?.classList.add('sq-time-modal-input--invalid');
        input?.focus();
        return;
    }

    timeModalDraftMinutes = parsed;
    updateExpectedTimeDisplay(parsed);
    markDirty();
    closeExpectedTimeModal();
}

function markDirty(): void {
    isDirty = true;
    updateSaveButton();
    scheduleAutoSave();
}

function updateSaveButton(): void {
    const btn = document.getElementById('sq-editor-save-btn') as HTMLButtonElement | null;
    if (btn) btn.disabled = !isDirty;
}

function clearAutoSaveTimer(): void {
    if (autoSaveTimer) {
        clearTimeout(autoSaveTimer);
        autoSaveTimer = null;
    }
}

function scheduleAutoSave(): void {
    clearAutoSaveTimer();
    autoSaveTimer = setTimeout(() => {
        if (isDirty) persistEditor(false);
    }, AUTO_SAVE_MS);
}

function collectEditorPatch(): Partial<ScenarioQuestionExtended> {
    const questionBody = (document.getElementById('sq-editor-question-body') as HTMLTextAreaElement | null)?.value ?? '';
    const minutes = parseInt(document.getElementById('sq-editor-expected-time')?.getAttribute('data-minutes') ?? '25', 10);

    const learningObjectives = normalizeLearningObjectives(editorQuestion?.learningObjectives ?? []);

    const subQuestions = (editorQuestion?.subQuestions ?? []).map(sq => {
        const partId = sq.partId;
        const prompt = document.querySelector<HTMLTextAreaElement>(`.sq-part-prompt[data-part-id="${partId}"]`)?.value ?? sq.prompt;
        const modelAnswer = document.querySelector<HTMLTextAreaElement>(`.sq-part-answer[data-part-id="${partId}"]`)?.value ?? sq.modelAnswer;
        return { partId, subQuestionType: sq.subQuestionType, prompt, modelAnswer };
    });

    const titleDisplay = document.getElementById('sq-editor-title-display');
    const title = titleDisplay?.textContent?.trim() || editorQuestion?.title || 'Untitled';

    return {
        title,
        questionBody,
        learningObjectives,
        expectedTimeMinutes: minutes,
        subQuestions,
        solutionBody: subQuestions.map(sq => sq.modelAnswer).join('\n\n---\n\n')
    };
}

async function persistEditor(showToast: boolean): Promise<void> {
    if (!currentCourse || !editorQuestionId) return;
    if (!isDirty) return;

    clearAutoSaveTimer();

    try {
        const patch = collectEditorPatch();
        editorQuestion = await updateQuestion(currentCourse.id, editorQuestionId, patch);
        isDirty = false;
        updateSaveButton();
        await refreshQuestions();
        showSuccessToast(showToast ? 'Draft saved.' : 'Changes saved automatically.');
    } catch (error) {
        showErrorToast(errorMessage(error, 'Could not save.'));
    }
}
