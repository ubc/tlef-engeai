// public/scripts/feature/scenario-questions-instructor.ts

/**
 * scenario-questions-instructor.ts
 *
 * Instructor Scenario Generation: topic grid, question list, generation form, and
 * editor/review views. Wired to `/api/courses/:courseId/scenario-questions` via
 * scenario-questions-api.ts.
 */

import {
    activeCourse,
    ScenarioSubQuestionType,
    ScenarioDifficulty,
    ScenarioQuestion,
    ScenarioQuestionExtended,
    ScenarioLearningObjectiveSnapshot,
    ScenarioLearningObjectiveOption,
    ScenarioSubQuestion,
    ScenarioMode,
    ScenarioInstructorStudentResponseRow,
} from '../types.js';
import {
    fetchScenarioQuestions,
    fetchScenarioQuestion,
    fetchInstructorStudentResponses,
    INSTRUCTOR_RESPONSES_FETCH_BATCH_SIZE,
    updateScenarioQuestion,
    patchScenarioQuestionStatus,
    deleteScenarioQuestion,
    generateScenarioQuestions,
    fetchScenarioLearningObjectives,
    validatePublish,
    expectedMinutesFromSeconds,
    expectedSecondsFromMinutes,
    formatExpectedTime
} from '../api/scenario-questions-api.js';
import { renderFeatherIcons } from '../api/api.js';
import { showSuccessToast, showErrorToast } from '../ui/toast-notification.js';
import { showConfirmModal, showContentLoadingModal, closeModal } from '../ui/modal-overlay.js';
import { RenderChat } from './render-chat.js';
import { renderLatexInHtmlContent } from './chat.js';
import {
    flashcardToneIndex,
    parseAnswerKeyFlashcardsDetailed,
    parseAnswerKeyToFlashcards,
    SUB_QUESTION_TYPE_LABELS
} from './scenario-answer-flashcard.js';
import {
    getPageSlice,
    getTotalPages,
    INSTRUCTOR_RESPONSES_DISPLAY_PAGE_SIZE,
    needsFetch,
    shouldPrefetch,
} from '../utils/instructor-response-carousel.js';
import {
    getScenarioQuestionsParamsFromURL,
    navigateToScenarioQuestions,
    type ScenarioQuestionsUrlOptions,
} from '../utils/url-parser.js';

const ALL_TYPES: ScenarioSubQuestionType[] = ['calculation', 'troubleshoot', 'action', 'corrective'];
const DEFAULT_SELECTED_TYPES: ScenarioSubQuestionType[] = ['calculation', 'troubleshoot', 'action'];
const AUTO_SAVE_MS = 5000;

interface PartResponseState {
    buffer: ScenarioInstructorStudentResponseRow[];
    currentPage: number;
    total: number;
    loading: boolean;
    prefetching: boolean;
    error?: string;
}

const partResponseState = new Map<string, PartResponseState>();
const partResponseCollapsed = new Map<string, boolean>();
const partResponseDownloading = new Set<string>();
/** Student-response panels start collapsed so the editor stays scannable. */
const PART_RESPONSES_DEFAULT_COLLAPSED = true;

const INSTRUCTOR_RESPONSES_DOWNLOAD_BATCH_SIZE = 50;

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
/** Home browse mode: topic/week cards vs flat question list. */
let browseMode: 'topics' | 'questions' = 'topics';
/** Where the editor was opened from — controls back navigation. */
let editorReturnTo: 'topic-detail' | 'browse' = 'topic-detail';
let cachedQuestions: ScenarioQuestionExtended[] = [];
let editorQuestionId: string | null = null;
let editorQuestion: ScenarioQuestionExtended | null = null;
let isDirty = false;
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

/** Selected types in order for generate view. */
let selectedTypes: ScenarioSubQuestionType[] = [...DEFAULT_SELECTED_TYPES];
let selectedDifficulty: ScenarioDifficulty = 'medium';

/** Per-part prompt view mode in editor: raw markdown editor vs rendered preview. */
const partPromptModes = new Map<string, 'edit' | 'preview'>();

/** Per-part flashcard step index. */
const partFlashcardIndex = new Map<string, number>();

/** Last nav direction per part — drives enter animation class. */
const partFlashcardNavDir = new Map<string, 'prev' | 'next'>();

/** Base question pane: raw markdown editor vs rendered preview (mutually exclusive). */
let questionBodyViewMode: 'edit' | 'preview' = 'edit';

/** Draft LO selection while the manage modal is open. */
let loModalDraftSelection: ScenarioLearningObjectiveSnapshot[] = [];

/** Draft duration (seconds) while the expected-time modal is open. */
let timeModalDraftSeconds = 25 * 60;

const MAX_EXPECTED_TIME_SECONDS = 90 * 60;
const TIME_MODAL_STEP_SECONDS = 5 * 60;

let uiAbort: AbortController | null = null;
/** Aborts question-row listeners from the previous list render. */
let questionListAbort: AbortController | null = null;

const VIEW_PARTIALS = ['grid', 'topic', 'generate', 'editor'] as const;
type ViewPartial = (typeof VIEW_PARTIALS)[number];
const mountedPartials = new Set<ViewPartial>();
let suppressUrlSync = false;
let scenarioMounted = false;

async function loadScenarioPartial(name: ViewPartial): Promise<void> {
    if (mountedPartials.has(name)) return;
    const root = document.getElementById('sg-instructor-view-root');
    if (!root) throw new Error('Scenario view root missing');
    const res = await fetch(`/components/scenarios/scenario-questions-${name}.html`);
    if (!res.ok) throw new Error(`Failed to load scenario view: ${name}`);
    root.insertAdjacentHTML('beforeend', await res.text());
    mountedPartials.add(name);
}

async function ensureViewPartialsLoaded(names: readonly ViewPartial[] = VIEW_PARTIALS): Promise<void> {
    await Promise.all(names.map(loadScenarioPartial));
}

function syncScenarioUrl(options: ScenarioQuestionsUrlOptions = {}, replace = false): void {
    if (suppressUrlSync) return;
    navigateToScenarioQuestions(options, replace);
}

function isValidTopicId(id: string): boolean {
    if (id === '__uncategorized__') return true;
    return !!currentCourse?.topicOrWeekInstances?.some((t) => t.id === id);
}

/** True while the scenario-questions component is mounted and initialized. */
export function isScenarioQuestionsMounted(): boolean {
    return scenarioMounted;
}

/** Restore sub-view from URL without full component reload (browser back/forward). */
export async function syncScenarioQuestionsFromURL(fromPopstate = false): Promise<void> {
    if (!scenarioMounted || !currentCourse) return;
    await restoreFromURL(fromPopstate);
}

async function restoreFromURL(fromPopstate = false): Promise<void> {
    const params = getScenarioQuestionsParamsFromURL();

    if (editorQuestionId && isDirty && fromPopstate) {
        await persistEditor(false);
    }

    suppressUrlSync = true;
    browseMode = params.browse;
    syncBrowsePills();
    await refreshQuestions();

    if (params.questionId) {
        editorReturnTo = 'topic-detail';
        await openEditorView(params.questionId, true);
    } else if (params.generate && params.topicOrWeekId) {
        if (!isValidTopicId(params.topicOrWeekId)) {
            showErrorToast('Topic not found.');
            activeTopicId = null;
            editorQuestionId = null;
            showGridView();
            await renderBrowseHome();
            navigateToScenarioQuestions(browseMode === 'questions' ? { browse: 'questions' } : {}, true);
            suppressUrlSync = false;
            return;
        }
        activeTopicId = params.topicOrWeekId;
        editorReturnTo = 'topic-detail';
        await openGenerateView(true);
    } else if (params.topicOrWeekId) {
        if (!isValidTopicId(params.topicOrWeekId)) {
            showErrorToast('Topic not found.');
            activeTopicId = null;
            editorQuestionId = null;
            showGridView();
            await renderBrowseHome();
            navigateToScenarioQuestions(browseMode === 'questions' ? { browse: 'questions' } : {}, true);
            suppressUrlSync = false;
            return;
        }
        activeTopicId = params.topicOrWeekId;
        editorReturnTo = 'topic-detail';
        await refreshQuestions(activeTopicId);
        showTopicDetailView();
        renderTopicDetail();
    } else {
        editorQuestionId = null;
        editorQuestion = null;
        activeTopicId = null;
        showGridView();
        await renderBrowseHome();
    }
    suppressUrlSync = false;
}

/** Copyable answer-key template shown in the flashcard help modal. */
const FLASHCARD_ANSWER_TEMPLATE = `# Compute heat duty
Calculate $Q = \\dot{m} c_p \\Delta T$ for the cold stream. Keep units consistent (kW vs W).

# Find LMTD
Use the four terminal temperatures for counter-current flow.

$$\\text{LMTD} = \\frac{\\Delta T_1 - \\Delta T_2}{\\ln(\\Delta T_1 / \\Delta T_2)}$$

# Solve for area
$A = Q / (U \\cdot \\text{LMTD})$. Report the result in m².`;

/** Cached LO catalog for the current topic/week (editor + generate). */
let loCatalog: ScenarioLearningObjectiveOption[] = [];
let generateSelectedLoIds: string[] = [];

function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/** Render markdown + LaTeX into a preview container (matches student practice / chat). */
function renderMarkdownInto(element: HTMLElement, markdown: string, idPrefix: string): void {
    element.innerHTML = renderChat.render(markdown, idPrefix);
    renderLatexInHtmlContent(element);
    element.querySelectorAll('.artefact-button').forEach(btn => {
        btn.classList.add('artefact-button--scenario');
    });
    renderFeatherIcons();
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

/** Stable DOM / API key for a sub-question (subQuestionId preferred). */
function subQuestionKey(sq: Pick<ScenarioSubQuestion, 'subQuestionId' | 'partId'>, index = 0): string {
    return sq.subQuestionId?.trim() || sq.partId || `part-${index}`;
}

function displayPartLabel(sq: Pick<ScenarioSubQuestion, 'subQuestionId' | 'partId'>, index: number): string {
    if (sq.partId) return sq.partId.toUpperCase();
    return String(index + 1);
}

function loSnapshotText(lo: ScenarioLearningObjectiveSnapshot | string): string {
    if (typeof lo === 'string') return lo;
    return lo.text;
}

function normalizeLearningObjectives(
    objectives: Array<ScenarioLearningObjectiveSnapshot | string> | undefined
): ScenarioLearningObjectiveSnapshot[] {
    if (!Array.isArray(objectives)) return [];
    return objectives
        .map((item): ScenarioLearningObjectiveSnapshot | null => {
            if (typeof item === 'string') {
                const text = item.trim();
                if (!text) return null;
                const fromCatalog = loCatalog.find((o) => o.text === text || o.objectiveId === text);
                return {
                    objectiveId: fromCatalog?.objectiveId || `legacy-${text.slice(0, 24)}`,
                    text: fromCatalog?.text || text,
                    sourceTopicOrWeekId: fromCatalog?.topicOrWeekId || '',
                    sourceItemId: fromCatalog?.itemId || '',
                };
            }
            if (item?.objectiveId && item?.text) return item;
            return null;
        })
        .filter((x): x is ScenarioLearningObjectiveSnapshot => x !== null);
}

async function loadLoCatalog(topicOrWeekId: string): Promise<void> {
    if (!currentCourse || !topicOrWeekId) {
        loCatalog = [];
        return;
    }
    try {
        loCatalog = await fetchScenarioLearningObjectives(currentCourse.id, topicOrWeekId);
    } catch {
        loCatalog = [];
    }
}

const SQ_MODAL_TRANSITION_MS = 300;

/**
 * initializeScenarioQuestionsInstructor
 *
 * @param course activeCourse
 */
export async function initializeScenarioQuestionsInstructor(course: activeCourse): Promise<void> {
    scenarioMounted = false;
    mountedPartials.clear();

    const urlParams = getScenarioQuestionsParamsFromURL();
    currentCourse = course;
    activeTopicId = null;
    browseMode = urlParams.browse;
    editorReturnTo = 'topic-detail';
    cachedQuestions = [];
    editorQuestionId = null;
    editorQuestion = null;
    isDirty = false;
    clearAutoSaveTimer();

    uiAbort?.abort();
    uiAbort = new AbortController();
    questionListAbort?.abort();
    questionListAbort = null;

    await ensureViewPartialsLoaded();
    hideAllViews();
    attachStaticListeners();
    scenarioMounted = true;

    await restoreFromURL();
}

function hideAllViews(): void {
    ['sg-instructor-grid-view', 'sg-instructor-topic-detail-view', 'sg-instructor-generate-view', 'sg-instructor-editor-view'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
}

function showGridView(): void {
    hideAllViews();
    const el = document.getElementById('sg-instructor-grid-view');
    if (el) el.style.display = '';
}

function showTopicDetailView(): void {
    hideAllViews();
    const el = document.getElementById('sg-instructor-topic-detail-view');
    if (el) el.style.display = '';
}

function showGenerateView(): void {
    hideAllViews();
    const el = document.getElementById('sg-instructor-generate-view');
    if (el) el.style.display = '';
}

function showEditorView(): void {
    hideAllViews();
    const el = document.getElementById('sg-instructor-editor-view');
    if (el) el.style.display = '';
}

function attachStaticListeners(): void {
    const signal = uiAbort?.signal;

    document.getElementById('sg-instructor-topic-detail-back-btn')?.addEventListener('click', () => {
        activeTopicId = null;
        showGridView();
        void renderBrowseHome();
        syncScenarioUrl(browseMode === 'questions' ? { browse: 'questions' } : {});
    }, { signal });

    document.querySelector('.sg-instructor-view-toggles')?.addEventListener('click', (e: Event) => {
        const btn = (e.target as HTMLElement).closest('.sg-instructor-view-pill') as HTMLButtonElement | null;
        const mode = btn?.dataset.browse as 'topics' | 'questions' | undefined;
        if (!mode || mode === browseMode) return;
        browseMode = mode;
        activeTopicId = null;
        syncBrowsePills();
        showGridView();
        void renderBrowseHome();
        syncScenarioUrl(mode === 'questions' ? { browse: 'questions' } : {});
    }, { signal });

    document.getElementById('sg-instructor-topic-detail-generate-btn')?.addEventListener('click', () => {
        void openGenerateView();
    }, { signal });

    document.getElementById('sg-instructor-generate-back-btn')?.addEventListener('click', () => {
        if (activeTopicId) {
            showTopicDetailView();
            renderTopicDetail();
            syncScenarioUrl({ topicOrWeekId: activeTopicId });
        }
    }, { signal });

    document.getElementById('sg-instructor-generate-submit-btn')?.addEventListener('click', handleGenerateSubmit, { signal });
    document.getElementById('sg-instructor-type-add-btn')?.addEventListener('click', toggleTypePopover, { signal });
    document.getElementById('sg-instructor-difficulty-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDifficultyMenu();
    }, { signal });

    document.querySelectorAll<HTMLButtonElement>('#sg-instructor-generate-view .sg-instructor-difficulty-option').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const d = btn.dataset.difficulty as ScenarioDifficulty;
            if (d) setDifficulty(d);
            closeDifficultyMenu();
        }, { signal });
    });

    document.getElementById('sg-instructor-editor-back-btn')?.addEventListener('click', async () => {
        if (isDirty) await persistEditor(false);
        editorQuestionId = null;
        if (editorReturnTo === 'browse') {
            activeTopicId = null;
            showGridView();
            await renderBrowseHome();
            syncScenarioUrl(browseMode === 'questions' ? { browse: 'questions' } : {});
        } else {
            showTopicDetailView();
            await refreshQuestions(activeTopicId);
            renderTopicDetail();
            if (activeTopicId) syncScenarioUrl({ topicOrWeekId: activeTopicId });
        }
    }, { signal });

    document.getElementById('sg-instructor-editor-title-edit-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        beginInlineTitleEdit();
    }, { signal });
    document.getElementById('sg-instructor-editor-title-display')?.addEventListener('click', () => beginInlineTitleEdit(), { signal });
    wireInlineTitleInput(signal);

    document.getElementById('sg-instructor-editor-save-btn')?.addEventListener('click', () => persistEditor(true), { signal });
    document.getElementById('sg-instructor-editor-status-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleEditorStatusMenu();
    }, { signal });
    document.querySelectorAll<HTMLButtonElement>('#sg-instructor-editor-status-menu .sg-instructor-status-menu-option').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const status = btn.dataset.status as ScenarioPublishableStatus;
            if (status) await setEditorQuestionStatus(status);
        }, { signal });
    });
    document.getElementById('sg-instructor-editor-lo-manage-btn')?.addEventListener('click', openLearningObjectivesModal, { signal });
    document.getElementById('sg-instructor-editor-lo-list')?.addEventListener('dblclick', openLearningObjectivesModal, { signal });
    document.getElementById('sg-instructor-editor-expected-time-btn')?.addEventListener('click', openExpectedTimeModal, { signal });
    document.getElementById('sg-instructor-time-modal-close-btn')?.addEventListener('click', closeExpectedTimeModal, { signal });
    document.getElementById('sg-instructor-time-modal-cancel-btn')?.addEventListener('click', closeExpectedTimeModal, { signal });
    document.getElementById('sg-instructor-time-modal-save-btn')?.addEventListener('click', saveExpectedTimeModal, { signal });
    document.getElementById('sg-instructor-time-modal-decrease-btn')?.addEventListener('click', () => adjustTimeModalDraft(-5), { signal });
    document.getElementById('sg-instructor-time-modal-increase-btn')?.addEventListener('click', () => adjustTimeModalDraft(5), { signal });
    document.getElementById('sg-instructor-time-modal-overlay')?.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeExpectedTimeModal();
    }, { signal });
    document.getElementById('sg-instructor-time-modal-minutes')?.addEventListener('input', clearTimeModalInputInvalid, { signal });
    document.getElementById('sg-instructor-time-modal-seconds')?.addEventListener('input', clearTimeModalInputInvalid, { signal });
    document.getElementById('sg-instructor-editor-delete-btn')?.addEventListener('click', () => {
        if (editorQuestionId) void confirmAndDeleteQuestion(editorQuestionId, true);
    }, { signal });
    document.getElementById('sg-instructor-lo-modal-close-btn')?.addEventListener('click', closeLearningObjectivesModal, { signal });
    document.getElementById('sg-instructor-lo-modal-cancel-btn')?.addEventListener('click', closeLearningObjectivesModal, { signal });
    document.getElementById('sg-instructor-lo-modal-save-btn')?.addEventListener('click', saveLearningObjectivesModal, { signal });
    document.getElementById('sg-instructor-lo-modal-overlay')?.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeLearningObjectivesModal();
    }, { signal });

    document.getElementById('sg-instructor-flashcard-help-btn')?.addEventListener('click', openFlashcardHelpModal, { signal });
    document.getElementById('sg-instructor-flashcard-help-close-btn')?.addEventListener('click', closeFlashcardHelpModal, { signal });
    document.getElementById('sg-instructor-flashcard-help-done-btn')?.addEventListener('click', closeFlashcardHelpModal, { signal });
    document.getElementById('sg-instructor-flashcard-help-copy-btn')?.addEventListener('click', copyFlashcardHelpTemplate, { signal });
    document.getElementById('sg-instructor-flashcard-help-overlay')?.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeFlashcardHelpModal();
    }, { signal });

    document.getElementById('sg-instructor-type-help-btn')?.addEventListener('click', openTypeHelpModal, { signal });
    document.getElementById('sg-instructor-type-help-close-btn')?.addEventListener('click', closeTypeHelpModal, { signal });
    document.getElementById('sg-instructor-type-help-done-btn')?.addEventListener('click', closeTypeHelpModal, { signal });
    document.getElementById('sg-instructor-type-help-overlay')?.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeTypeHelpModal();
    }, { signal });

    // Parts host is re-rendered — delegate clicks (student responses, answer-key help)
    document.getElementById('sg-instructor-editor-parts')?.addEventListener('click', (e) => {
        handleEditorPartsClick(e);
        const btn = (e.target as HTMLElement).closest('.sg-instructor-answer-key-help-btn');
        if (btn) openFlashcardHelpModal();
    }, { signal });

    document.querySelectorAll<HTMLButtonElement>('.sg-instructor-base-question-toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.dataset.mode as 'edit' | 'preview' | undefined;
            if (mode) setQuestionBodyViewMode(mode);
        }, { signal });
    });

    document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (!target.closest('.sg-instructor-type-add-wrap')) closeTypePopover();
        if (!target.closest('.sg-instructor-difficulty-wrap')) closeDifficultyMenu();
        if (!target.closest('.sg-instructor-status-wrap')) closeAllStatusMenus();
    }, { signal });
}

async function refreshQuestions(topicOrWeekId?: string | null): Promise<void> {
    if (!currentCourse) return;
    const scoped =
        topicOrWeekId && topicOrWeekId !== '__uncategorized__'
            ? { topicOrWeekId }
            : undefined;
    cachedQuestions = await fetchScenarioQuestions(currentCourse.id, scoped);
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

function formatResponseTimestamp(isoDate: string): string {
    const date = new Date(isoDate);
    if (Number.isNaN(date.getTime())) return '';
    return lastEditedDateFmt.format(date);
}

function renderModeBadge(mode: ScenarioMode): string {
    const label = mode === 'practice' ? 'Practice' : 'Exam';
    return `<span class="sg-mode-badge sg-mode-badge--${mode}">${escapeHtml(label)}</span>`;
}

function getSubQuestionResponseCount(sq: ScenarioSubQuestion): number {
    if (typeof sq.studentResponseCount === 'number') return sq.studentResponseCount;
    return sq.studentResponses?.length ?? 0;
}

function renderResponseCardHtml(row: ScenarioInstructorStudentResponseRow): string {
    const feedbackId = `sg-instructor-feedback-${row.id}`;
    return `
        <article class="sg-instructor-response-card sg-instructor-response-card--${row.mode}" data-response-id="${escapeHtml(row.id)}">
            <div class="sg-instructor-response-card-header">
                ${renderModeBadge(row.mode)}
                <span class="sg-instructor-response-student">${escapeHtml(row.studentName)}</span>
                <time class="sg-instructor-response-time" datetime="${escapeHtml(row.submittedAt)}">${escapeHtml(formatResponseTimestamp(row.submittedAt))}</time>
            </div>
            <div class="sg-instructor-response-answer-label">Answer</div>
            <div class="sg-instructor-response-answer">${escapeHtml(row.studentAnswer)}</div>
            <div class="sg-instructor-response-feedback-label">Feedback</div>
            <div class="sg-instructor-response-feedback sg-instructor-response-feedback--${row.mode} message-content" id="${escapeHtml(feedbackId)}"></div>
        </article>
    `;
}

function paintResponseFeedbackBodies(list: HTMLElement, items: ScenarioInstructorStudentResponseRow[]): void {
    items.forEach((row) => {
        const el = list.querySelector<HTMLElement>(`#sg-instructor-feedback-${row.id}`);
        if (el) renderMarkdownInto(el, row.feedback, `sg-instructor-response-${row.id}`);
    });
}

function studentResponsesBodyId(partKey: string): string {
    return `sg-instructor-responses-body-${partKey}`;
}

function renderStudentResponsePagerHtml(subQuestionId: string, placement: 'header' | 'footer'): string {
    const placementClass =
        placement === 'footer'
            ? ' sg-instructor-response-pager--footer'
            : ' sg-instructor-response-pager--header';
    return `
        <div class="sg-instructor-response-pager${placementClass}" hidden>
            <button type="button" class="sg-instructor-response-pager-btn" data-action="prev" data-sub-question-id="${escapeHtml(subQuestionId)}" aria-label="Previous responses page">
                <i data-feather="chevron-left"></i>
            </button>
            <span class="sg-instructor-response-page-label">Page 1 of 1</span>
            <button type="button" class="sg-instructor-response-pager-btn" data-action="next" data-sub-question-id="${escapeHtml(subQuestionId)}" aria-label="Next responses page">
                <i data-feather="chevron-right"></i>
            </button>
        </div>
    `;
}

function removeFooterPager(section: HTMLElement): void {
    section.querySelector('.sg-instructor-response-pager--footer')?.remove();
}

function syncResponsePagers(section: HTMLElement, subQuestionId: string, state: PartResponseState): void {
    const showPagers = state.total > 0 && getTotalPages(state.total) > 1;
    const headerPager = section.querySelector<HTMLElement>('.sg-instructor-response-pager--header');
    const body = section.querySelector<HTMLElement>('.sg-instructor-student-responses-body');

    if (headerPager) {
        headerPager.hidden = !showPagers;
        headerPager.classList.toggle('sg-instructor-response-pager--visible', showPagers);
    }

    let footerPager = section.querySelector<HTMLElement>('.sg-instructor-response-pager--footer');
    if (!showPagers) {
        footerPager?.remove();
        return;
    }

    if (body && !footerPager) {
        body.insertAdjacentHTML('beforeend', renderStudentResponsePagerHtml(subQuestionId, 'footer'));
        footerPager = section.querySelector<HTMLElement>('.sg-instructor-response-pager--footer');
        if (footerPager) {
            requestAnimationFrame(() => {
                footerPager?.classList.add('sg-instructor-response-pager--visible');
            });
        }
    }
    if (footerPager) {
        footerPager.hidden = false;
        footerPager.classList.add('sg-instructor-response-pager--visible');
    }

    const totalPages = getTotalPages(state.total);
    const pageText = `Page ${state.currentPage + 1} of ${totalPages}`;
    const onLastPage = state.currentPage >= totalPages - 1;
    section.querySelectorAll<HTMLElement>('.sg-instructor-response-page-label').forEach((label) => {
        label.textContent = pageText;
    });
    section.querySelectorAll<HTMLButtonElement>('.sg-instructor-response-pager-btn[data-action="prev"]').forEach((btn) => {
        btn.disabled = state.currentPage === 0 || state.loading;
    });
    section.querySelectorAll<HTMLButtonElement>('.sg-instructor-response-pager-btn[data-action="next"]').forEach((btn) => {
        btn.disabled = onLastPage || state.loading || state.prefetching;
        btn.setAttribute('aria-busy', String(state.loading || state.prefetching));
    });
}

function expandPartStudentResponses(subQuestionId: string): void {
    partResponseCollapsed.set(subQuestionId, false);
    paintPartStudentResponses(subQuestionId);
    const state = partResponseState.get(subQuestionId);
    if (state && state.total > 0 && !state.buffer.length && !state.loading && !state.prefetching) {
        void loadInitialPartResponses(subQuestionId);
    }
}

function collapsePartStudentResponses(subQuestionId: string): void {
    partResponseCollapsed.set(subQuestionId, true);
    paintPartStudentResponses(subQuestionId);
}

function handleEditorPartsClick(event: Event): void {
    const target = event.target as HTMLElement;

    const collapsedBar = target.closest<HTMLButtonElement>('.sg-instructor-student-responses-collapsed-bar');
    if (collapsedBar?.dataset.subQuestionId) {
        expandPartStudentResponses(collapsedBar.dataset.subQuestionId);
        return;
    }

    const headerStart = target.closest<HTMLButtonElement>('.sg-instructor-student-responses-header-start');
    if (headerStart?.dataset.subQuestionId) {
        collapsePartStudentResponses(headerStart.dataset.subQuestionId);
        return;
    }

    const downloadBtn = target.closest<HTMLButtonElement>('.sg-instructor-student-responses-download-btn');
    if (downloadBtn?.dataset.subQuestionId) {
        void downloadPartStudentResponsesJson(
            downloadBtn.dataset.subQuestionId,
            downloadBtn.dataset.partLabel ?? 'part'
        );
        return;
    }

    const btn = target.closest<HTMLButtonElement>('.sg-instructor-response-pager-btn');
    if (!btn?.dataset.subQuestionId || !btn.dataset.action) return;
    const subQuestionId = btn.dataset.subQuestionId;
    const state = partResponseState.get(subQuestionId);
    if (!state) return;
    if (btn.dataset.action === 'prev') {
        void goToResponsePage(subQuestionId, state.currentPage - 1);
    } else if (btn.dataset.action === 'next') {
        void goToResponsePage(subQuestionId, state.currentPage + 1);
    }
}

function paintPartStudentResponses(subQuestionId: string): void {
    const section = document.querySelector<HTMLElement>(
        `.sg-instructor-student-responses[data-sub-question-id="${subQuestionId}"]`
    );
    if (!section) return;

    const state = partResponseState.get(subQuestionId) ?? {
        buffer: [],
        currentPage: 0,
        total: 0,
        loading: false,
        prefetching: false,
    };
    const collapsed = partResponseCollapsed.get(subQuestionId) ?? PART_RESPONSES_DEFAULT_COLLAPSED;
    const collapsedBar = section.querySelector<HTMLButtonElement>('.sg-instructor-student-responses-collapsed-bar');
    const collapsedHeader = section.querySelector<HTMLElement>('.sg-instructor-student-responses-collapsed-header');
    const expandedShell = section.querySelector<HTMLElement>('.sg-instructor-student-responses-expanded-shell');
    const expandedHeader = section.querySelector<HTMLElement>('.sg-instructor-student-responses-header');
    const body = section.querySelector<HTMLElement>('.sg-instructor-student-responses-body');
    const list = section.querySelector<HTMLElement>('.sg-instructor-response-list');
    const countEl = section.querySelector<HTMLElement>('.sg-instructor-student-responses-count');
    const headerStartBtn = section.querySelector<HTMLButtonElement>('.sg-instructor-student-responses-header-start');
    const downloadBtn = section.querySelector<HTMLButtonElement>('.sg-instructor-student-responses-download-btn');

    section.classList.toggle('sg-instructor-student-responses--expanded', !collapsed);

    if (collapsed) {
        if (collapsedBar) {
            collapsedBar.setAttribute('aria-expanded', 'false');
            collapsedBar.removeAttribute('aria-hidden');
        }
        if (collapsedHeader) collapsedHeader.removeAttribute('aria-hidden');
        if (expandedHeader) expandedHeader.setAttribute('aria-hidden', 'true');
        if (expandedShell) expandedShell.setAttribute('aria-hidden', 'true');
        if (body) body.setAttribute('aria-hidden', 'true');
        removeFooterPager(section);
        return;
    }

    if (collapsedBar) {
        collapsedBar.setAttribute('aria-expanded', 'true');
        collapsedBar.setAttribute('aria-hidden', 'true');
    }
    if (collapsedHeader) collapsedHeader.setAttribute('aria-hidden', 'true');
    if (expandedHeader) expandedHeader.removeAttribute('aria-hidden');
    if (expandedShell) expandedShell.removeAttribute('aria-hidden');
    if (body) body.removeAttribute('aria-hidden');
    if (headerStartBtn) {
        headerStartBtn.setAttribute('aria-expanded', 'true');
        headerStartBtn.setAttribute('aria-label', 'Collapse student responses');
    }
    if (downloadBtn) {
        const busy = partResponseDownloading.has(subQuestionId);
        downloadBtn.disabled = busy || state.total === 0 || (state.loading && !state.buffer.length);
        downloadBtn.setAttribute('aria-busy', String(busy));
    }
    if (countEl) {
        const label = state.total === 1 ? '1 response' : `${state.total} responses`;
        countEl.textContent = state.loading && !state.buffer.length ? 'Loading…' : label;
    }

    if (!list) return;

    if (state.loading && !state.buffer.length) {
        list.innerHTML = '<p class="sg-instructor-response-loading">Loading student responses…</p>';
        syncResponsePagers(section, subQuestionId, state);
        renderFeatherIcons();
        return;
    }

    if (state.error && !state.buffer.length) {
        list.innerHTML = `<p class="sg-instructor-response-error">${escapeHtml(state.error)}</p>`;
        syncResponsePagers(section, subQuestionId, state);
        renderFeatherIcons();
        return;
    }

    if (!state.total) {
        list.innerHTML = '<p class="sg-instructor-response-empty">No student responses yet.</p>';
        syncResponsePagers(section, subQuestionId, state);
        renderFeatherIcons();
        return;
    }

    const visibleItems = getPageSlice(state.buffer, state.currentPage);
    if (!visibleItems.length && state.loading) {
        list.innerHTML = '<p class="sg-instructor-response-loading">Loading student responses…</p>';
    } else if (!visibleItems.length) {
        list.innerHTML = state.total > 0
            ? '<p class="sg-instructor-response-loading">Loading student responses…</p>'
            : '<p class="sg-instructor-response-empty">No student responses yet.</p>';
    } else {
        list.innerHTML = visibleItems.map((row) => renderResponseCardHtml(row)).join('');
        paintResponseFeedbackBodies(list, visibleItems);
    }

    syncResponsePagers(section, subQuestionId, state);
    renderFeatherIcons();
}

type ResponseFetchMode = 'initial' | 'append' | 'prefetch';

async function fetchResponseBatch(
    subQuestionId: string,
    offset: number,
    mode: ResponseFetchMode
): Promise<void> {
    if (!currentCourse || !editorQuestionId) return;

    const prior = partResponseState.get(subQuestionId);
    if (!prior) return;
    if (prior.loading || (mode === 'prefetch' && prior.prefetching)) return;

    partResponseState.set(subQuestionId, {
        ...prior,
        buffer: mode === 'initial' ? [] : prior.buffer,
        loading: mode !== 'prefetch',
        prefetching: mode === 'prefetch',
        error: undefined,
    });
    paintPartStudentResponses(subQuestionId);

    try {
        const page = await fetchInstructorStudentResponses(
            currentCourse.id,
            editorQuestionId,
            subQuestionId,
            { limit: INSTRUCTOR_RESPONSES_FETCH_BATCH_SIZE, offset }
        );
        const current = partResponseState.get(subQuestionId);
        if (!current) return;

        const buffer = mode === 'initial' ? page.items : [...current.buffer, ...page.items];
        partResponseState.set(subQuestionId, {
            ...current,
            buffer,
            total: page.total,
            loading: false,
            prefetching: false,
        });
    } catch (error) {
        const current = partResponseState.get(subQuestionId);
        if (!current) return;
        partResponseState.set(subQuestionId, {
            ...current,
            loading: false,
            prefetching: false,
            error: errorMessage(error, 'Could not load student responses.'),
        });
    }

    paintPartStudentResponses(subQuestionId);
}

async function prefetchAhead(subQuestionId: string): Promise<void> {
    const state = partResponseState.get(subQuestionId);
    if (!state || state.prefetching || state.loading) return;
    if (!shouldPrefetch(state.buffer.length, state.currentPage, state.total)) return;
    await fetchResponseBatch(subQuestionId, state.buffer.length, 'prefetch');
}

async function goToResponsePage(subQuestionId: string, page: number): Promise<void> {
    const prior = partResponseState.get(subQuestionId);
    if (!prior || prior.loading) return;

    const totalPages = getTotalPages(prior.total);
    const nextPage = Math.max(0, Math.min(page, Math.max(totalPages - 1, 0)));
    if (nextPage === prior.currentPage) return;

    partResponseState.set(subQuestionId, { ...prior, currentPage: nextPage });
    paintPartStudentResponses(subQuestionId);

    const updated = partResponseState.get(subQuestionId);
    if (!updated) return;

    const pageStart = nextPage * INSTRUCTOR_RESPONSES_DISPLAY_PAGE_SIZE;
    if (needsFetch(updated.buffer.length, pageStart, updated.total)) {
        await fetchResponseBatch(subQuestionId, updated.buffer.length, 'append');
    }
    void prefetchAhead(subQuestionId);
}

async function loadInitialPartResponses(subQuestionId: string): Promise<void> {
    await fetchResponseBatch(subQuestionId, 0, 'initial');
    void prefetchAhead(subQuestionId);
}

function seedPartStudentResponseState(question: ScenarioQuestionExtended): void {
    partResponseState.clear();
    partResponseCollapsed.clear();
    partResponseDownloading.clear();
    question.subQuestions.forEach((sq, index) => {
        const subQuestionId = sq.subQuestionId || subQuestionKey(sq, index);
        const count = getSubQuestionResponseCount(sq);
        partResponseState.set(subQuestionId, {
            buffer: [],
            currentPage: 0,
            total: count,
            loading: false,
            prefetching: false,
        });
        paintPartStudentResponses(subQuestionId);
    });
}

function sanitizeDownloadFilenamePart(value: string): string {
    return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'part';
}

async function downloadPartStudentResponsesJson(subQuestionId: string, partLabel: string): Promise<void> {
    if (!currentCourse || !editorQuestionId || partResponseDownloading.has(subQuestionId)) return;

    const state = partResponseState.get(subQuestionId);
    if (!state?.total) {
        showErrorToast('No student responses to download.');
        return;
    }

    partResponseDownloading.add(subQuestionId);
    paintPartStudentResponses(subQuestionId);

    try {
        const responses: ScenarioInstructorStudentResponseRow[] = [];
        let offset = 0;
        let total = state.total;

        while (responses.length < total) {
            const page = await fetchInstructorStudentResponses(
                currentCourse.id,
                editorQuestionId,
                subQuestionId,
                { limit: INSTRUCTOR_RESPONSES_DOWNLOAD_BATCH_SIZE, offset }
            );
            total = page.total;
            if (!page.items.length) break;
            responses.push(...page.items);
            offset += page.items.length;
        }

        const payload = {
            questionId: editorQuestionId,
            subQuestionId,
            partLabel,
            exportedAt: new Date().toISOString(),
            total: responses.length,
            responses,
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `student-responses-${sanitizeDownloadFilenamePart(partLabel)}-${editorQuestionId}.json`;
        anchor.click();
        URL.revokeObjectURL(url);
        showSuccessToast('Student responses downloaded.');
    } catch (error) {
        showErrorToast(errorMessage(error, 'Could not download student responses.'));
    } finally {
        partResponseDownloading.delete(subQuestionId);
        paintPartStudentResponses(subQuestionId);
    }
}

function getTopicTitle(topicOrWeekId: string): string {
    if (topicOrWeekId === '__uncategorized__') return 'Uncategorized';
    return currentCourse?.topicOrWeekInstances?.find(c => c.id === topicOrWeekId)?.title ?? 'Topic';
}

async function renderBrowseHome(): Promise<void> {
    if (browseMode === 'questions') await renderQuestionsList();
    else await renderTopicGrid();
}

function syncBrowsePills(): void {
    document.querySelectorAll<HTMLButtonElement>('.sg-instructor-view-pill[data-browse]').forEach(btn => {
        btn.setAttribute('aria-pressed', String(btn.dataset.browse === browseMode));
    });
}

function isTopicDetailVisible(): boolean {
    const el = document.getElementById('sg-instructor-topic-detail-view');
    return !!el && el.style.display !== 'none';
}

async function refreshVisibleQuestionList(): Promise<void> {
    const scope = isTopicDetailVisible() ? activeTopicId : null;
    await refreshQuestions(scope);
    if (isTopicDetailVisible() && activeTopicId) renderTopicDetail();
    else await renderBrowseHome();
}

async function renderTopicGrid(): Promise<void> {
    const container = document.getElementById('sg-instructor-list');
    if (!container || !currentCourse) return;

    container.className = 'sg-instructor-topic-grid';
    container.setAttribute('aria-label', 'Topics and weeks');

    try {
        await refreshQuestions();
    } catch (error) {
        container.innerHTML = `<p class="sg-instructor-empty-state sg-instructor-empty-state--full">${escapeHtml(errorMessage(error, 'Could not load questions.'))}</p>`;
        return;
    }

    const chapters = currentCourse.topicOrWeekInstances || [];
    if (!chapters.length) {
        container.innerHTML = `<p class="sg-instructor-empty-state sg-instructor-empty-state--full">No topics or weeks have been set up for this course yet.</p>`;
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

async function renderQuestionsList(): Promise<void> {
    const container = document.getElementById('sg-instructor-list');
    if (!container || !currentCourse) return;

    container.className = 'sg-instructor-question-row-list';
    container.setAttribute('aria-label', 'All scenario questions');

    try {
        await refreshQuestions();
    } catch (error) {
        container.innerHTML = `<p class="sg-instructor-empty-state sg-instructor-empty-state--full">${escapeHtml(errorMessage(error, 'Could not load questions.'))}</p>`;
        return;
    }

    if (!cachedQuestions.length) {
        container.innerHTML = `<p class="sg-instructor-empty-state sg-instructor-empty-state--full">No scenario questions yet. Open a week/topic and use New question to create one.</p>`;
        return;
    }

    const sorted = [...cachedQuestions].sort((a, b) => {
        const topicCmp = (a.topicOrWeekId || '').localeCompare(b.topicOrWeekId || '');
        if (topicCmp !== 0) return topicCmp;
        return a.sortOrder - b.sortOrder;
    });

    container.innerHTML = sorted.map(q => renderQuestionRow(q, true)).join('');
    renderFeatherIcons();
    attachQuestionRowListeners(container, 'browse');
}

function renderTopicProjectCard(topicOrWeekId: string, title: string, count: number, lastUpdatedAt: string | null): string {
    const questionLabel = `${count} question${count === 1 ? '' : 's'}`;
    return `
        <button type="button" class="sg-instructor-project-card" data-topic-id="${escapeHtml(topicOrWeekId)}" data-topic-title="${escapeHtml(title)}">
            <span class="sg-instructor-project-card-title">${escapeHtml(title)}</span>
            <span class="sg-instructor-project-card-footer">
                <span class="sg-instructor-project-card-updated">${escapeHtml(formatLastEditedLabel(lastUpdatedAt))}</span>
                <span class="sg-instructor-project-card-count">${escapeHtml(questionLabel)}</span>
            </span>
        </button>
    `;
}

function attachTopicCardListeners(): void {
    document.querySelectorAll<HTMLButtonElement>('.sg-instructor-project-card').forEach(card => {
        card.addEventListener('click', () => {
            void (async () => {
                activeTopicId = card.dataset.topicId || null;
                editorReturnTo = 'topic-detail';
                showTopicDetailView();
                await refreshQuestions(activeTopicId);
                renderTopicDetail();
                if (activeTopicId) syncScenarioUrl({ topicOrWeekId: activeTopicId });
            })();
        }, { signal: uiAbort?.signal });
    });
}

function renderTopicDetail(): void {
    if (!currentCourse || !activeTopicId) return;

    const titleEl = document.getElementById('sg-instructor-topic-detail-title');
    const subtitleEl = document.getElementById('sg-instructor-topic-detail-subtitle');
    const listEl = document.getElementById('sg-instructor-topic-detail-list');
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
        listEl.innerHTML = `<p class="sg-instructor-empty-state">No scenario questions in this topic yet. Use New question to create one.</p>`;
        return;
    }

    listEl.innerHTML = topicQuestions.map(q => renderQuestionRow(q, false)).join('');
    renderFeatherIcons();
    attachQuestionRowListeners(listEl, 'topic-detail');
}

function renderQuestionRow(question: ScenarioQuestionExtended, showTopic: boolean): string {
    const lastEdited = formatLastEditedLabel(question.updatedAt ? String(question.updatedAt) : null);
    const topicLine = showTopic
        ? `<p class="sg-instructor-question-row-topic">${escapeHtml(formatTopicSubtitle(question.topicOrWeekId, getTopicTitle(question.topicOrWeekId)))}</p>`
        : '';
    const typeBadges = question.subQuestions.map(sq => {
        const label = SUB_QUESTION_TYPE_LABELS[sq.subQuestionType] ?? sq.subQuestionType;
        return `<span class="sg-part-type-badge sg-part-type-${sq.subQuestionType}">${escapeHtml(label)}</span>`;
    }).join('');

    return `
        <div class="sg-instructor-question-row" data-question-id="${escapeHtml(question.id)}" data-topic-id="${escapeHtml(question.topicOrWeekId)}">
            <button type="button" class="sg-instructor-question-row-main-btn">
                <div class="sg-instructor-question-row-main">
                    <div class="sg-instructor-question-row-title-line">
                        <span class="sg-instructor-question-row-title">${escapeHtml(question.title)}</span>
                        <span class="sg-instructor-question-row-types">${typeBadges}</span>
                    </div>
                    ${topicLine}
                    <p class="sg-instructor-question-row-updated">${escapeHtml(lastEdited)}</p>
                </div>
            </button>
            <div class="sg-instructor-question-row-badges">
                <span class="sg-instructor-difficulty-badge sg-instructor-difficulty-${question.difficulty}">${capitalize(question.difficulty)}</span>
                ${renderRowStatusControl(question)}
                <button type="button" class="sg-instructor-question-row-delete-btn" data-question-id="${escapeHtml(question.id)}" aria-label="Delete ${escapeHtml(question.title)}">
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
        <div class="sg-instructor-status-wrap sg-instructor-row-status-wrap" data-question-id="${qid}">
            <button type="button" class="sg-instructor-status-pill sg-instructor-status-pill-${current} sg-instructor-status-menu-btn sg-instructor-row-status-btn" data-question-id="${qid}" aria-haspopup="listbox" aria-expanded="false">
                <span>${capitalize(current)}</span>
            </button>
            <div class="sg-instructor-status-menu sg-instructor-row-status-menu" data-question-id="${qid}" style="display: none;" role="listbox">
                ${PUBLISHABLE_STATUSES.map(status => `
                    <button type="button" class="sg-instructor-status-menu-option sg-instructor-status-menu-option-${status}${status === current ? ' sg-instructor-status-menu-option--active' : ''}" data-status="${status}" data-question-id="${qid}">${capitalize(status)}</button>
                `).join('')}
            </div>
        </div>
    `;
}

function attachQuestionRowListeners(root: ParentNode, returnTo: 'topic-detail' | 'browse'): void {
    questionListAbort?.abort();
    questionListAbort = new AbortController();
    const signal = questionListAbort.signal;

    root.querySelectorAll<HTMLButtonElement>('.sg-instructor-question-row-main-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const row = btn.closest('.sg-instructor-question-row') as HTMLElement | null;
            const id = row?.dataset.questionId;
            const topicId = row?.dataset.topicId;
            if (!id) return;
            editorReturnTo = returnTo;
            if (topicId) activeTopicId = topicId;
            await openEditorView(id);
        }, { signal });
    });

    root.querySelectorAll<HTMLButtonElement>('.sg-instructor-row-status-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const questionId = btn.dataset.questionId;
            if (questionId) toggleRowStatusMenu(questionId);
        }, { signal });
    });

    root.querySelectorAll<HTMLButtonElement>('.sg-instructor-row-status-menu .sg-instructor-status-menu-option').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const questionId = btn.dataset.questionId;
            const status = btn.dataset.status as ScenarioPublishableStatus;
            if (questionId && status) await setQuestionStatus(questionId, status);
        }, { signal });
    });

    root.querySelectorAll<HTMLButtonElement>('.sg-instructor-question-row-delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const questionId = btn.dataset.questionId;
            if (questionId) void confirmAndDeleteQuestion(questionId, false);
        }, { signal });
    });
}

async function confirmAndDeleteQuestion(questionId: string, fromEditor: boolean): Promise<void> {
    if (!currentCourse) return;

    let title = 'this question';
    try {
        const question = await fetchScenarioQuestion(currentCourse.id, questionId);
        title = question?.title?.trim() || title;
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
        await deleteScenarioQuestion(currentCourse.id, questionId);
        showSuccessToast('Question deleted.');

        if (fromEditor) {
            editorQuestionId = null;
            editorQuestion = null;
            isDirty = false;
            clearAutoSaveTimer();
            if (editorReturnTo === 'browse') {
                activeTopicId = null;
                showGridView();
                syncScenarioUrl(browseMode === 'questions' ? { browse: 'questions' } : {});
            } else {
                showTopicDetailView();
                if (activeTopicId) syncScenarioUrl({ topicOrWeekId: activeTopicId });
            }
        }

        await refreshVisibleQuestionList();
    } catch (error) {
        showErrorToast(errorMessage(error, 'Could not delete question.'));
    }
}

async function setQuestionStatus(questionId: string, status: ScenarioPublishableStatus): Promise<void> {
    if (!currentCourse) return;

    try {
        if (status === 'published') {
            const question = await fetchScenarioQuestion(currentCourse.id, questionId);
            if (!question || !('solutionBody' in question)) {
                showErrorToast('Question not found.');
                return;
            }
            const err = validatePublish(question as ScenarioQuestion);
            if (err) {
                showErrorToast(err);
                return;
            }
        }
        await patchScenarioQuestionStatus(currentCourse.id, questionId, status);
        closeAllStatusMenus();
        await refreshVisibleQuestionList();
        showSuccessToast(status === 'published' ? 'Question published.' : 'Question moved to draft.');
    } catch (error) {
        showErrorToast(errorMessage(error, 'Could not update status.'));
    }
}

function closeRowStatusMenus(): void {
    document.querySelectorAll<HTMLElement>('.sg-instructor-row-status-menu').forEach(menu => {
        menu.style.display = 'none';
    });
    document.querySelectorAll<HTMLButtonElement>('.sg-instructor-row-status-btn').forEach(btn => {
        btn.setAttribute('aria-expanded', 'false');
    });
}

function closeEditorStatusMenu(): void {
    const menu = document.getElementById('sg-instructor-editor-status-menu');
    const btn = document.getElementById('sg-instructor-editor-status-btn');
    if (menu) menu.style.display = 'none';
    if (btn) btn.setAttribute('aria-expanded', 'false');
}

function closeAllStatusMenus(): void {
    closeRowStatusMenus();
    closeEditorStatusMenu();
}

function toggleRowStatusMenu(questionId: string): void {
    const menu = document.querySelector<HTMLElement>(`.sg-instructor-row-status-menu[data-question-id="${questionId}"]`);
    const btn = document.querySelector<HTMLButtonElement>(`.sg-instructor-row-status-btn[data-question-id="${questionId}"]`);
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
    const menu = document.getElementById('sg-instructor-editor-status-menu');
    const btn = document.getElementById('sg-instructor-editor-status-btn');
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
    const btn = document.getElementById('sg-instructor-editor-status-btn');
    const label = document.getElementById('sg-instructor-editor-status-label');
    if (label) label.textContent = capitalize(normalized);
    if (btn) {
        btn.classList.remove('sg-instructor-status-pill-draft', 'sg-instructor-status-pill-published', 'sg-instructor-status-pill-rejected');
        btn.classList.add(`sg-instructor-status-pill-${normalized}`);
    }
    document.querySelectorAll<HTMLButtonElement>('#sg-instructor-editor-status-menu .sg-instructor-status-menu-option').forEach(option => {
        option.classList.toggle('sg-instructor-status-menu-option--active', option.dataset.status === normalized);
    });
}

async function setEditorQuestionStatus(status: ScenarioPublishableStatus): Promise<void> {
    if (!currentCourse || !editorQuestionId) return;
    const errorEl = document.getElementById('sg-instructor-editor-error');

    if (isDirty) await persistEditor(false);

    if (status === 'published') {
        const question = await fetchScenarioQuestion(currentCourse.id, editorQuestionId);
        if (!question || !('solutionBody' in question)) {
            showErrorToast('Question not found.');
            return;
        }
        const err = validatePublish({ ...question, ...collectEditorPatch() } as ScenarioQuestionExtended);
        if (err) {
            if (errorEl) {
                errorEl.textContent = err;
                errorEl.style.display = '';
            }
            return;
        }
        const los = normalizeLearningObjectives(
            (collectEditorPatch().learningObjectives as ScenarioLearningObjectiveSnapshot[] | undefined) ??
                (question as ScenarioQuestion).learningObjectives
        );
        if (!los.length) {
            const confirmed = await showConfirmModal(
                'Publish without learning objectives?',
                'This question has no learning objectives mapped. Publish anyway?',
                'Publish',
                'Cancel'
            );
            if (confirmed.action !== 'publish') return;
        }
        try {
            await updateScenarioQuestion(currentCourse.id, editorQuestionId, collectEditorPatch());
            await patchScenarioQuestionStatus(currentCourse.id, editorQuestionId, 'published');
            editorQuestion = (await fetchScenarioQuestion(currentCourse.id, editorQuestionId)) as ScenarioQuestionExtended | null;
            if (!editorQuestion || !('solutionBody' in editorQuestion)) throw new Error('Question not found.');
            updateEditorStatusButton(editorQuestion.status);
            if (errorEl) errorEl.style.display = 'none';
            showSuccessToast('Question published.');
        } catch (error) {
            showErrorToast(errorMessage(error, 'Could not publish.'));
        }
    } else {
        try {
            await patchScenarioQuestionStatus(currentCourse.id, editorQuestionId, 'draft');
            editorQuestion = (await fetchScenarioQuestion(currentCourse.id, editorQuestionId)) as ScenarioQuestionExtended | null;
            if (!editorQuestion || !('solutionBody' in editorQuestion)) throw new Error('Question not found.');
            updateEditorStatusButton(editorQuestion.status);
            if (errorEl) errorEl.style.display = 'none';
            showSuccessToast('Question moved to draft.');
        } catch (error) {
            showErrorToast(errorMessage(error, 'Could not update status.'));
        }
    }

    closeEditorStatusMenu();
    await refreshQuestions(editorQuestion?.topicOrWeekId ?? activeTopicId);
}

// --- Generate view ---

async function openGenerateView(skipUrlSync = false): Promise<void> {
    if (!activeTopicId || activeTopicId === '__uncategorized__') {
        showErrorToast('Select a topic with a valid chapter first.');
        return;
    }

    selectedTypes = [...DEFAULT_SELECTED_TYPES];
    selectedDifficulty = 'medium';
    generateSelectedLoIds = [];

    const promptEl = document.getElementById('sg-instructor-generate-prompt') as HTMLTextAreaElement | null;
    if (promptEl) promptEl.value = '';

    const errorEl = document.getElementById('sg-instructor-generate-error');
    if (errorEl) errorEl.style.display = 'none';

    const backLabel = document.getElementById('sg-instructor-generate-back-label');
    if (backLabel && activeTopicId) backLabel.textContent = getTopicTitle(activeTopicId);

    await loadLoCatalog(activeTopicId);
    renderGenerateLoCatalog();
    renderTypePills();
    renderTypePopover();
    setDifficulty('medium');
    showGenerateView();
    renderFeatherIcons();
    if (!skipUrlSync && activeTopicId) {
        syncScenarioUrl({ topicOrWeekId: activeTopicId, generate: true });
    }
}

function renderGenerateLoCatalog(): void {
    const catalog = document.getElementById('sg-instructor-generate-lo-catalog');
    if (!catalog) return;
    if (!loCatalog.length) {
        catalog.innerHTML = `<p class="sg-instructor-lo-empty">No learning objectives for this topic/week.</p>`;
        return;
    }
    catalog.innerHTML = loCatalog
        .map(
            (lo) => `
        <label class="sg-instructor-lo-catalog-item">
            <input type="checkbox" class="sg-instructor-generate-lo-checkbox" value="${escapeHtml(lo.objectiveId)}" ${generateSelectedLoIds.includes(lo.objectiveId) ? 'checked' : ''} />
            <span class="sg-instructor-lo-catalog-text">${escapeHtml(lo.text)}</span>
        </label>`
        )
        .join('');
    catalog.querySelectorAll<HTMLInputElement>('.sg-instructor-generate-lo-checkbox').forEach((box) => {
        box.addEventListener(
            'change',
            () => {
                if (box.checked) {
                    if (!generateSelectedLoIds.includes(box.value)) generateSelectedLoIds.push(box.value);
                } else {
                    generateSelectedLoIds = generateSelectedLoIds.filter((id) => id !== box.value);
                }
            },
            { signal: uiAbort?.signal }
        );
    });
}

function renderTypePills(): void {
    const container = document.getElementById('sg-instructor-type-pills');
    if (!container) return;

    container.innerHTML = selectedTypes.map((type, i) => `
        <button type="button" class="sg-instructor-type-pill sg-part-type-badge sg-part-type-${type}" data-type="${type}" data-index="${i}">
            ${escapeHtml(SUB_QUESTION_TYPE_LABELS[type])}
            <span class="sg-instructor-type-pill-remove" data-index="${i}" aria-label="Remove ${escapeHtml(SUB_QUESTION_TYPE_LABELS[type])}">×</span>
        </button>
    `).join('');

    container.querySelectorAll<HTMLButtonElement>('.sg-instructor-type-pill').forEach(pill => {
        pill.addEventListener('click', (e) => {
            const remove = (e.target as HTMLElement).closest('.sg-instructor-type-pill-remove');
            if (remove) {
                e.stopPropagation();
                const index = parseInt((remove as HTMLElement).dataset.index ?? '-1', 10);
                if (index >= 0) removeTypeAtIndex(index);
            }
        }, { signal: uiAbort?.signal });
    });
}

function renderTypePopover(): void {
    const popover = document.getElementById('sg-instructor-type-popover');
    if (!popover) return;

    popover.innerHTML = ALL_TYPES.map(type => `
        <button type="button" class="sg-instructor-type-popover-item" data-type="${type}" role="menuitem">
            ${escapeHtml(SUB_QUESTION_TYPE_LABELS[type])}
        </button>
    `).join('');

    popover.querySelectorAll<HTMLButtonElement>('.sg-instructor-type-popover-item').forEach(btn => {
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
    const popover = document.getElementById('sg-instructor-type-popover');
    const btn = document.getElementById('sg-instructor-type-add-btn');
    if (!popover || !btn) return;
    const open = popover.style.display === 'none';
    popover.style.display = open ? '' : 'none';
    btn.setAttribute('aria-expanded', String(open));
}

function closeTypePopover(): void {
    const popover = document.getElementById('sg-instructor-type-popover');
    const btn = document.getElementById('sg-instructor-type-add-btn');
    if (popover) popover.style.display = 'none';
    if (btn) btn.setAttribute('aria-expanded', 'false');
}

function setDifficulty(d: ScenarioDifficulty): void {
    selectedDifficulty = d;
    const label = document.getElementById('sg-instructor-difficulty-label');
    if (label) label.textContent = capitalize(d);

    document.querySelectorAll<HTMLButtonElement>('#sg-instructor-generate-view .sg-instructor-difficulty-option').forEach(btn => {
        const isActive = btn.dataset.difficulty === d;
        btn.classList.toggle('sg-instructor-difficulty-option--active', isActive);
    });

    const diffBtn = document.getElementById('sg-instructor-difficulty-btn');
    if (diffBtn) {
        diffBtn.classList.remove('sg-instructor-difficulty-btn-easy', 'sg-instructor-difficulty-btn-medium', 'sg-instructor-difficulty-btn-hard');
        diffBtn.classList.add(`sg-instructor-difficulty-btn-${d}`);
    }
}

function toggleDifficultyMenu(): void {
    const menu = document.getElementById('sg-instructor-difficulty-menu');
    const btn = document.getElementById('sg-instructor-difficulty-btn');
    if (!menu || !btn) return;
    const willOpen = menu.style.display === 'none';
    closeAllStatusMenus();
    menu.style.display = willOpen ? '' : 'none';
    btn.setAttribute('aria-expanded', String(willOpen));
}

function closeDifficultyMenu(): void {
    const menu = document.getElementById('sg-instructor-difficulty-menu');
    const btn = document.getElementById('sg-instructor-difficulty-btn');
    if (menu) menu.style.display = 'none';
    if (btn) btn.setAttribute('aria-expanded', 'false');
}

function editorTitleElements(): {
    display: HTMLElement | null;
    input: HTMLInputElement | null;
    editBtn: HTMLElement | null;
} {
    return {
        display: document.getElementById('sg-instructor-editor-title-display'),
        input: document.getElementById('sg-instructor-editor-title-input') as HTMLInputElement | null,
        editBtn: document.getElementById('sg-instructor-editor-title-edit-btn'),
    };
}

function getEditorTitleValue(): string {
    const display = document.getElementById('sg-instructor-editor-title-display');
    return display?.textContent?.trim() || editorQuestion?.title || 'Untitled';
}

function setEditorTitleValue(value: string): void {
    const trimmed = value.trim() || 'Untitled';
    if (editorQuestion) editorQuestion = { ...editorQuestion, title: trimmed };
}

function beginInlineTitleEdit(): void {
    const { display, input, editBtn } = editorTitleElements();
    if (!display || !input) return;

    input.value = getEditorTitleValue();
    display.style.display = 'none';
    if (editBtn) editBtn.style.display = 'none';
    input.style.display = '';
    input.focus();
    input.select();
}

function commitInlineTitleEdit(): void {
    const { display, input, editBtn } = editorTitleElements();
    if (!display || !input) return;

    const next = input.value.trim();
    if (next) setEditorTitleValue(next);
    display.textContent = getEditorTitleValue();
    display.style.display = '';
    if (editBtn) editBtn.style.display = '';
    input.style.display = 'none';
    markDirty();
}

function cancelInlineTitleEdit(): void {
    const { display, input, editBtn } = editorTitleElements();
    if (!display || !input) return;

    display.style.display = '';
    if (editBtn) editBtn.style.display = '';
    input.style.display = 'none';
}

function wireInlineTitleInput(signal?: AbortSignal): void {
    const input = editorTitleElements().input;
    if (!input) return;

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            commitInlineTitleEdit();
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            cancelInlineTitleEdit();
        }
    }, { signal });

    input.addEventListener('blur', () => commitInlineTitleEdit(), { signal });
}

function setQuestionBodyViewMode(mode: 'edit' | 'preview'): void {
    questionBodyViewMode = mode;
    const textarea = document.getElementById('sg-instructor-editor-question-body') as HTMLTextAreaElement | null;
    const rendered = document.getElementById('sg-instructor-editor-question-rendered');

    document.querySelectorAll<HTMLButtonElement>('.sg-instructor-base-question-toggle-btn').forEach(btn => {
        btn.classList.toggle('sg-instructor-view-toggle-btn--active', btn.dataset.mode === mode);
    });

    if (!textarea || !rendered) return;

    if (mode === 'edit') {
        textarea.hidden = false;
        rendered.hidden = true;
    } else {
        textarea.hidden = true;
        rendered.hidden = false;
        renderMarkdownInto(rendered, textarea.value, 'sg-instructor-question-body');
    }
}

async function handleGenerateSubmit(): Promise<void> {
    if (!currentCourse || !activeTopicId) return;

    const errorEl = document.getElementById('sg-instructor-generate-error');
    const submitBtn = document.getElementById('sg-instructor-generate-submit-btn') as HTMLButtonElement | null;
    const sourcePrompt = (document.getElementById('sg-instructor-generate-prompt') as HTMLTextAreaElement | null)?.value.trim() || '';

    if (!sourcePrompt) {
        if (errorEl) {
            errorEl.textContent = 'Write a base question before generating.';
            errorEl.style.display = '';
        }
        return;
    }

    if (submitBtn) submitBtn.disabled = true;
    if (errorEl) errorEl.style.display = 'none';

    // Block the UI for the full RAG + LLM round-trip (same pattern as document upload).
    void showContentLoadingModal({
        title: 'Generating question',
        line1: 'Building your scenario draft…',
        line2: 'Retrieving course context and running the model. This may take a moment.'
    });

    try {
        const result = await generateScenarioQuestions(currentCourse.id, {
            mode: 'single',
            topicOrWeekId: activeTopicId,
            sourcePrompt,
            subQuestionTypes: [...selectedTypes],
            difficulty: selectedDifficulty,
            learningObjectiveIds: generateSelectedLoIds.length ? [...generateSelectedLoIds] : undefined,
        });
        if (!result.success || !result.data?.length) {
            throw new Error(result.error || 'Generation failed.');
        }
        const created = result.data[0];
        await refreshQuestions(activeTopicId);

        closeModal('success');
        showSuccessToast('Generated draft — review and edit before publishing.');
        await openEditorView(created.id);
    } catch (error) {
        closeModal('error');
        if (errorEl) {
            errorEl.textContent = errorMessage(error, 'Generation failed.');
            errorEl.style.display = '';
        }
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
}

// --- Editor view ---

async function openEditorView(questionId: string, skipUrlSync = false): Promise<void> {
    if (!currentCourse) return;

    let question: ScenarioQuestionExtended | null;
    try {
        question = await fetchScenarioQuestion(currentCourse.id, questionId) as ScenarioQuestionExtended | null;
    } catch (error) {
        showErrorToast(errorMessage(error, 'Could not load question.'));
        return;
    }
    if (!question) {
        showErrorToast('Question not found.');
        return;
    }

    editorQuestionId = questionId;
    editorQuestion = question;
    isDirty = false;
    clearAutoSaveTimer();
    updateSaveButton();

    const backLabel = document.getElementById('sg-instructor-editor-back-label');
    if (backLabel) backLabel.textContent = getTopicTitle(question.topicOrWeekId);

    const titleDisplay = document.getElementById('sg-instructor-editor-title-display');
    if (titleDisplay) titleDisplay.textContent = question.title;

    const bodyEl = document.getElementById('sg-instructor-editor-question-body') as HTMLTextAreaElement | null;
    if (bodyEl) bodyEl.value = question.questionBody;

    const topicLabel = document.getElementById('sg-instructor-editor-topic-label');
    if (topicLabel) topicLabel.textContent = topicLabelForEditor(question.topicOrWeekId);

    await loadLoCatalog(question.topicOrWeekId);
    updateExpectedTimeDisplay(expectedSecondsFromMinutes(question.expectedTimeMinutes ?? 25));
    renderLearningObjectives(normalizeLearningObjectives(question.learningObjectives));
    renderEditorParts(question);
    seedPartStudentResponseState(question);
    setQuestionBodyViewMode('edit');
    updateEditorStatusButton(question.status);

    const errorEl = document.getElementById('sg-instructor-editor-error');
    if (errorEl) errorEl.style.display = 'none';

    if (question.topicOrWeekId) activeTopicId = question.topicOrWeekId;
    showEditorView();
    attachEditorInputListeners();
    renderFeatherIcons();
    if (!skipUrlSync) syncScenarioUrl({ questionId });
}

function renderEditorParts(question: ScenarioQuestionExtended): void {
    const container = document.getElementById('sg-instructor-editor-parts');
    if (!container) return;

    container.innerHTML = question.subQuestions.map((sq, index) => {
        const partKey = subQuestionKey(sq, index);
        const partLabel = displayPartLabel(sq, index);
        if (!partPromptModes.has(partKey)) partPromptModes.set(partKey, 'edit');
        const promptMode = partPromptModes.get(partKey) ?? 'edit';

        const typeLabel = SUB_QUESTION_TYPE_LABELS[sq.subQuestionType] ?? sq.subQuestionType;
        const subQuestionId = sq.subQuestionId || partKey;
        const responsesBodyId = studentResponsesBodyId(partKey);

        return `
            <div class="sg-instructor-part-card" data-part-id="${escapeHtml(partKey)}">
                <div class="sg-instructor-part-header">
                    <div class="sg-part-title-group">
                        <h3 class="sg-part-title">Part ${escapeHtml(partLabel)}</h3>
                        <span class="sg-part-type-badge sg-part-type-${sq.subQuestionType}">${escapeHtml(typeLabel)}</span>
                    </div>
                    <div class="sg-instructor-view-toggle sg-instructor-part-prompt-toggle" role="group" aria-label="Part ${escapeHtml(partLabel)} prompt view mode">
                        <button type="button" class="sg-instructor-view-toggle-btn sg-instructor-part-prompt-toggle-btn ${promptMode === 'edit' ? 'sg-instructor-view-toggle-btn--active' : ''}" data-mode="edit" data-part-id="${escapeHtml(partKey)}">Edit</button>
                        <button type="button" class="sg-instructor-view-toggle-btn sg-instructor-part-prompt-toggle-btn ${promptMode === 'preview' ? 'sg-instructor-view-toggle-btn--active' : ''}" data-mode="preview" data-part-id="${escapeHtml(partKey)}">Preview</button>
                    </div>
                </div>
                <div class="sg-instructor-part-prompt-body">
                    <label class="sg-instructor-sr-only" for="sg-instructor-part-prompt-${escapeHtml(partKey)}">Part ${escapeHtml(partLabel)} prompt</label>
                    <textarea id="sg-instructor-part-prompt-${escapeHtml(partKey)}" class="sg-instructor-editor-textarea sg-instructor-part-prompt" data-part-id="${escapeHtml(partKey)}" rows="3" ${promptMode === 'preview' ? 'hidden' : ''}>${escapeHtml(sq.prompt)}</textarea>
                    <div class="sg-instructor-part-prompt-preview sg-instructor-markdown-preview message-content" data-part-id="${escapeHtml(partKey)}" ${promptMode === 'edit' ? 'hidden' : ''}></div>
                </div>
                <div class="sg-instructor-answer-key-header">
                    <span class="sg-instructor-editor-section-label">Answer key</span>
                    <button type="button" class="sg-instructor-answer-key-help-btn" aria-label="How answer cards work" title="How answer cards work">
                        <i data-feather="info"></i>
                    </button>
                </div>
                <div class="sg-instructor-part-answer-body">
                    <textarea class="sg-instructor-editor-textarea sg-instructor-part-answer sg-instructor-part-answer-edit" data-part-id="${escapeHtml(partKey)}" rows="6">${escapeHtml(sq.modelAnswer)}</textarea>
                    <div class="sg-instructor-flashcard-panel" data-part-id="${escapeHtml(partKey)}"></div>
                </div>
                <section class="sg-instructor-student-responses" data-sub-question-id="${escapeHtml(subQuestionId)}" aria-label="Student responses for Part ${escapeHtml(partLabel)}">
                    <div class="sg-instructor-student-responses-collapsed-header">
                        <button type="button" class="sg-instructor-student-responses-collapsed-bar" data-sub-question-id="${escapeHtml(subQuestionId)}" aria-expanded="false" aria-controls="${escapeHtml(responsesBodyId)}" aria-label="Expand student responses">
                            <i data-feather="chevron-right"></i>
                            <span class="sg-instructor-editor-section-label">Student responses</span>
                        </button>
                    </div>
                    <div class="sg-instructor-student-responses-expanded-shell" aria-hidden="true">
                        <div class="sg-instructor-student-responses-expanded-shell-inner">
                            <div class="sg-instructor-student-responses-header">
                                <button type="button" class="sg-instructor-student-responses-header-start" data-sub-question-id="${escapeHtml(subQuestionId)}" aria-expanded="true" aria-controls="${escapeHtml(responsesBodyId)}" aria-label="Collapse student responses">
                                    <i data-feather="chevron-down"></i>
                                    <span class="sg-instructor-editor-section-label">Student responses</span>
                                    <span class="sg-instructor-student-responses-count"></span>
                                </button>
                                <div class="sg-instructor-student-responses-header-actions">
                                    ${renderStudentResponsePagerHtml(subQuestionId, 'header')}
                                    <button type="button" class="sg-instructor-student-responses-download-btn" data-sub-question-id="${escapeHtml(subQuestionId)}" data-part-label="${escapeHtml(partLabel)}" aria-label="Download student responses as JSON" title="Download JSON">
                                        <i data-feather="download"></i>
                                        <span class="sg-instructor-student-responses-download-label">JSON</span>
                                    </button>
                                </div>
                            </div>
                            <div class="sg-instructor-student-responses-body" id="${escapeHtml(responsesBodyId)}">
                                <div class="sg-instructor-response-list"></div>
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        `;
    }).join('');

    question.subQuestions.forEach((sq, index) => {
        const partKey = subQuestionKey(sq, index);
        updatePartPromptDisplay(partKey);
        updatePartAnswerDisplay(partKey);
    });
    renderFeatherIcons();
}

function attachEditorInputListeners(): void {
    const signal = uiAbort?.signal;

    document.getElementById('sg-instructor-editor-question-body')?.addEventListener('input', () => {
        markDirty();
        if (questionBodyViewMode === 'preview') {
            const rendered = document.getElementById('sg-instructor-editor-question-rendered');
            const body = (document.getElementById('sg-instructor-editor-question-body') as HTMLTextAreaElement | null)?.value ?? '';
            if (rendered) renderMarkdownInto(rendered, body, 'sg-instructor-question-body');
        }
    }, { signal });

    document.querySelectorAll<HTMLTextAreaElement>('.sg-instructor-part-prompt, .sg-instructor-part-answer').forEach(el => {
        el.addEventListener('input', () => {
            markDirty();
            const partId = el.dataset.partId;
            if (partId && el.classList.contains('sg-instructor-part-answer')) {
                debouncePartPreview(partId);
            }
        }, { signal });
    });

    document.querySelectorAll<HTMLButtonElement>('.sg-instructor-part-prompt-toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const partId = btn.dataset.partId;
            const mode = btn.dataset.mode as 'edit' | 'preview' | undefined;
            if (partId && mode) {
                partPromptModes.set(partId, mode);
                updatePartPromptDisplay(partId);
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
    const promptEl = document.querySelector<HTMLTextAreaElement>(`.sg-instructor-part-prompt[data-part-id="${partId}"]`);
    const previewEl = document.querySelector<HTMLElement>(`.sg-instructor-part-prompt-preview[data-part-id="${partId}"]`);
    const card = document.querySelector(`.sg-instructor-part-card[data-part-id="${partId}"]`);

    if (!promptEl || !previewEl || !card) return;

    card.querySelectorAll<HTMLButtonElement>('.sg-instructor-part-prompt-toggle-btn').forEach(btn => {
        btn.classList.toggle('sg-instructor-view-toggle-btn--active', btn.dataset.mode === mode);
    });

    if (mode === 'edit') {
        promptEl.hidden = false;
        previewEl.hidden = true;
    } else {
        promptEl.hidden = true;
        previewEl.hidden = false;
        renderMarkdownInto(previewEl, promptEl.value, `sg-instructor-part-prompt-${partId}`);
    }
}

function updatePartAnswerDisplay(partId: string): void {
    const answerEl = document.querySelector<HTMLTextAreaElement>(`.sg-instructor-part-answer[data-part-id="${partId}"]`);
    const flashcardEl = document.querySelector<HTMLElement>(`.sg-instructor-flashcard-panel[data-part-id="${partId}"]`);
    if (!answerEl || !flashcardEl) return;
    renderFlashcardPanel(partId, answerEl.value, flashcardEl);
}

function renderFlashcardPanel(partId: string, markdown: string, container: HTMLElement): void {
    const { steps, error } = parseAnswerKeyFlashcardsDetailed(markdown);
    if (!steps.length) {
        const tip = 'Start each step with a <code># Title</code> line; body text (and LaTeX) goes underneath.';
        if (error) {
            const excerpt = error.excerpt
                ? ` — line ${error.line}: “${escapeHtml(error.excerpt)}”`
                : '';
            container.innerHTML = `<p class="sg-instructor-flashcard-empty sg-instructor-flashcard-error">Cannot render cards${excerpt} — ${escapeHtml(error.reason)}. ${tip}</p>`;
        } else {
            container.innerHTML = `<p class="sg-instructor-flashcard-empty">No cards yet. ${tip}</p>`;
        }
        return;
    }

    let idx = partFlashcardIndex.get(partId) ?? 0;
    if (idx >= steps.length) idx = steps.length - 1;
    partFlashcardIndex.set(partId, idx);

    const step = steps[idx];
    const tone = flashcardToneIndex(idx);
    const navDir = partFlashcardNavDir.get(partId);
    partFlashcardNavDir.delete(partId);
    const enterClass = navDir === 'prev'
        ? ' sg-instructor-flashcard--enter-prev'
        : navDir === 'next'
            ? ' sg-instructor-flashcard--enter-next'
            : '';

    const bodyHost = document.createElement('div');
    bodyHost.className = 'sg-instructor-flashcard-body sg-instructor-markdown-preview message-content';
    renderMarkdownInto(bodyHost, step.bodyMarkdown, `sg-instructor-fc-${partId}-${idx}`);
    const stepLabel =
        steps.length > 1
            ? `<span class="sg-instructor-flashcard-step-label">Step ${idx + 1} of ${steps.length}</span>`
            : '';
    const navHtml =
        steps.length > 1
            ? `<div class="sg-instructor-flashcard-nav">
                <button type="button" class="sg-instructor-flashcard-nav-btn" data-action="prev" data-part-id="${partId}" ${idx === 0 ? 'disabled' : ''} aria-label="Previous step">
                    <i data-feather="chevron-left"></i>
                </button>
                <button type="button" class="sg-instructor-flashcard-nav-btn" data-action="next" data-part-id="${partId}" ${idx >= steps.length - 1 ? 'disabled' : ''} aria-label="Next step">
                    <i data-feather="chevron-right"></i>
                </button>
            </div>`
            : '';
    container.innerHTML = `
        <div class="sg-instructor-flashcard sg-instructor-flashcard--tone-${tone}${enterClass}">
            <div class="sg-instructor-flashcard-header">
                ${stepLabel}
                <span class="sg-instructor-flashcard-title">${escapeHtml(step.title)}</span>
            </div>
            ${navHtml}
        </div>
    `;
    const flashcardEl = container.querySelector('.sg-instructor-flashcard');
    const navEl = container.querySelector('.sg-instructor-flashcard-nav');
    if (flashcardEl) {
        if (navEl) flashcardEl.insertBefore(bodyHost, navEl);
        else flashcardEl.appendChild(bodyHost);
    }
    renderFeatherIcons();

    // Drop enter class after animation so re-renders from typing don't re-trigger
    if (enterClass && flashcardEl) {
        flashcardEl.addEventListener('animationend', () => {
            flashcardEl.classList.remove('sg-instructor-flashcard--enter-prev', 'sg-instructor-flashcard--enter-next');
        }, { once: true });
    }

    container.querySelectorAll<HTMLButtonElement>('.sg-instructor-flashcard-nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.dataset.action;
            const pid = btn.dataset.partId;
            if (!pid || (action !== 'prev' && action !== 'next')) return;
            const current = partFlashcardIndex.get(pid) ?? 0;
            const allSteps = parseAnswerKeyToFlashcards(
                document.querySelector<HTMLTextAreaElement>(`.sg-instructor-part-answer[data-part-id="${pid}"]`)?.value ?? ''
            );
            if (action === 'prev' && current > 0) {
                partFlashcardIndex.set(pid, current - 1);
                partFlashcardNavDir.set(pid, 'prev');
            }
            if (action === 'next' && current < allSteps.length - 1) {
                partFlashcardIndex.set(pid, current + 1);
                partFlashcardNavDir.set(pid, 'next');
            }
            const answerMd = document.querySelector<HTMLTextAreaElement>(`.sg-instructor-part-answer[data-part-id="${pid}"]`)?.value ?? '';
            renderFlashcardPanel(pid, answerMd, container);
        }, { signal: uiAbort?.signal, once: true });
    });
}

function renderLearningObjectives(objectives: ScenarioLearningObjectiveSnapshot[]): void {
    const list = document.getElementById('sg-instructor-editor-lo-list');
    if (!list) return;

    if (!objectives.length) {
        list.innerHTML = `<span class="sg-instructor-lo-empty">No objectives selected</span>`;
        return;
    }

    list.innerHTML = objectives.map(lo => `
        <span class="sg-instructor-lo-pill">${escapeHtml(loSnapshotText(lo))}</span>
    `).join('');
}

async function openLearningObjectivesModal(): Promise<void> {
    const overlay = document.getElementById('sg-instructor-lo-modal-overlay');
    if (!overlay || !editorQuestion) return;

    await loadLoCatalog(editorQuestion.topicOrWeekId);
    loModalDraftSelection = normalizeLearningObjectives(editorQuestion.learningObjectives);
    renderLearningObjectivesCatalog();
    overlay.style.display = 'flex';
    overlay.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => overlay.classList.add('sg-instructor-modal-overlay--visible'));
}

function closeLearningObjectivesModal(): void {
    const overlay = document.getElementById('sg-instructor-lo-modal-overlay');
    if (!overlay) return;

    overlay.classList.remove('sg-instructor-modal-overlay--visible');
    overlay.setAttribute('aria-hidden', 'true');

    window.setTimeout(() => {
        if (!overlay.classList.contains('sg-instructor-modal-overlay--visible')) {
            overlay.style.display = 'none';
        }
    }, SQ_MODAL_TRANSITION_MS);
}

function openFlashcardHelpModal(): void {
    const overlay = document.getElementById('sg-instructor-flashcard-help-overlay');
    const templateEl = document.getElementById('sg-instructor-flashcard-help-template');
    if (!overlay) return;

    if (templateEl) templateEl.textContent = FLASHCARD_ANSWER_TEMPLATE;
    const copyLabel = document.getElementById('sg-instructor-flashcard-help-copy-label');
    if (copyLabel) copyLabel.textContent = 'Copy';

    overlay.style.display = 'flex';
    overlay.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => overlay.classList.add('sg-instructor-modal-overlay--visible'));
    renderFeatherIcons();
}

function closeFlashcardHelpModal(): void {
    const overlay = document.getElementById('sg-instructor-flashcard-help-overlay');
    if (!overlay) return;

    overlay.classList.remove('sg-instructor-modal-overlay--visible');
    overlay.setAttribute('aria-hidden', 'true');

    window.setTimeout(() => {
        if (!overlay.classList.contains('sg-instructor-modal-overlay--visible')) {
            overlay.style.display = 'none';
        }
    }, SQ_MODAL_TRANSITION_MS);
}

function openTypeHelpModal(): void {
    const overlay = document.getElementById('sg-instructor-type-help-overlay');
    if (!overlay) return;

    overlay.style.display = 'flex';
    overlay.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => overlay.classList.add('sg-instructor-modal-overlay--visible'));
    renderFeatherIcons();
}

function closeTypeHelpModal(): void {
    const overlay = document.getElementById('sg-instructor-type-help-overlay');
    if (!overlay) return;

    overlay.classList.remove('sg-instructor-modal-overlay--visible');
    overlay.setAttribute('aria-hidden', 'true');

    window.setTimeout(() => {
        if (!overlay.classList.contains('sg-instructor-modal-overlay--visible')) {
            overlay.style.display = 'none';
        }
    }, SQ_MODAL_TRANSITION_MS);
}

async function copyFlashcardHelpTemplate(): Promise<void> {
    const label = document.getElementById('sg-instructor-flashcard-help-copy-label');
    try {
        await navigator.clipboard.writeText(FLASHCARD_ANSWER_TEMPLATE);
        if (label) label.textContent = 'Copied';
        window.setTimeout(() => {
            if (label) label.textContent = 'Copy';
        }, 1500);
    } catch {
        if (label) label.textContent = 'Failed';
        window.setTimeout(() => {
            if (label) label.textContent = 'Copy';
        }, 1500);
    }
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
    const catalog = document.getElementById('sg-instructor-lo-modal-catalog');
    if (!catalog) return;

    if (!loCatalog.length) {
        catalog.innerHTML = `<p class="sg-instructor-lo-empty">No learning objectives found for this topic/week.</p>`;
        return;
    }

    const selectedIds = new Set(loModalDraftSelection.map((lo) => lo.objectiveId));
    catalog.innerHTML = loCatalog.map(lo => {
        const checked = selectedIds.has(lo.objectiveId);
        return `
            <label class="sg-instructor-lo-catalog-item">
                <input type="checkbox" class="sg-instructor-lo-catalog-checkbox" value="${escapeHtml(lo.objectiveId)}" ${checked ? 'checked' : ''} />
                <span class="sg-instructor-lo-catalog-text">${escapeHtml(lo.text)}</span>
            </label>
        `;
    }).join('');

    catalog.querySelectorAll<HTMLInputElement>('.sg-instructor-lo-catalog-checkbox').forEach(box => {
        box.addEventListener('change', () => {
            const option = loCatalog.find((o) => o.objectiveId === box.value);
            if (!option) return;
            if (box.checked) {
                if (!loModalDraftSelection.some((s) => s.objectiveId === option.objectiveId)) {
                    loModalDraftSelection.push({
                        objectiveId: option.objectiveId,
                        text: option.text,
                        sourceTopicOrWeekId: option.topicOrWeekId,
                        sourceItemId: option.itemId,
                    });
                }
            } else {
                loModalDraftSelection = loModalDraftSelection.filter((s) => s.objectiveId !== option.objectiveId);
            }
        }, { signal: uiAbort?.signal });
    });
}

function updateExpectedTimeDisplay(totalSeconds: number): void {
    const el = document.getElementById('sg-instructor-editor-expected-time');
    if (el) el.textContent = formatExpectedTime(totalSeconds);
    el?.setAttribute('data-seconds', String(Math.max(0, Math.round(totalSeconds))));
}

function clampExpectedTimeSeconds(totalSeconds: number): number {
    return Math.max(0, Math.min(MAX_EXPECTED_TIME_SECONDS, Math.round(totalSeconds)));
}

function timeModalMinutesInput(): HTMLInputElement | null {
    return document.getElementById('sg-instructor-time-modal-minutes') as HTMLInputElement | null;
}

function timeModalSecondsInput(): HTMLInputElement | null {
    return document.getElementById('sg-instructor-time-modal-seconds') as HTMLInputElement | null;
}

function clearTimeModalInputInvalid(): void {
    timeModalMinutesInput()?.classList.remove('sg-instructor-time-modal-input--invalid');
    timeModalSecondsInput()?.classList.remove('sg-instructor-time-modal-input--invalid');
    hideTimeModalWarning();
}

function showTimeModalWarning(kind: 'max' | 'zero'): void {
    const warning = document.getElementById('sg-instructor-time-modal-warning');
    if (!warning) return;
    warning.textContent =
        kind === 'max' ? 'Maximum time is 90 minutes.' : 'Time cannot go below zero.';
    warning.hidden = false;
}

function hideTimeModalWarning(): void {
    const warning = document.getElementById('sg-instructor-time-modal-warning');
    if (!warning) return;
    warning.textContent = '';
    warning.hidden = true;
}

function shakeTimeModalControls(): void {
    const controls = document.getElementById('sg-instructor-time-modal-controls');
    if (!controls) return;
    controls.classList.remove('sg-instructor-time-modal-controls--shake');
    // Force reflow so repeated shakes retrigger
    void controls.offsetWidth;
    controls.classList.add('sg-instructor-time-modal-controls--shake');
    controls.addEventListener(
        'animationend',
        () => controls.classList.remove('sg-instructor-time-modal-controls--shake'),
        { once: true }
    );
}

function syncTimeModalInputs(totalSeconds: number): void {
    const clamped = clampExpectedTimeSeconds(totalSeconds);
    const minutes = Math.floor(clamped / 60);
    const seconds = clamped % 60;
    const formatted = formatExpectedTime(clamped);
    const [, secondsText] = formatted.split(':');
    const minutesEl = timeModalMinutesInput();
    const secondsEl = timeModalSecondsInput();
    if (minutesEl) minutesEl.value = String(minutes);
    if (secondsEl && secondsText) secondsEl.value = secondsText;
    clearTimeModalInputInvalid();
}

function parseTimeModalInputs(): { totalSeconds: number } | { error: 'invalid' | 'max' } {
    const minutesRaw = timeModalMinutesInput()?.value.trim() ?? '';
    const secondsRaw = timeModalSecondsInput()?.value.trim() ?? '';
    if (!/^\d+$/.test(minutesRaw) || !/^\d+$/.test(secondsRaw)) {
        return { error: 'invalid' };
    }

    const minutes = parseInt(minutesRaw, 10);
    const seconds = parseInt(secondsRaw, 10);
    if (seconds > 59) {
        return { error: 'invalid' };
    }

    const totalSeconds = minutes * 60 + seconds;
    if (totalSeconds > MAX_EXPECTED_TIME_SECONDS) {
        return { error: 'max' };
    }

    return { totalSeconds };
}

function openExpectedTimeModal(): void {
    const overlay = document.getElementById('sg-instructor-time-modal-overlay');
    if (!overlay) return;

    const current = parseInt(
        document.getElementById('sg-instructor-editor-expected-time')?.getAttribute('data-seconds') ?? '1500',
        10
    );
    timeModalDraftSeconds = clampExpectedTimeSeconds(current);
    syncTimeModalInputs(timeModalDraftSeconds);
    hideTimeModalWarning();

    overlay.style.display = 'flex';
    overlay.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => overlay.classList.add('sg-instructor-modal-overlay--visible'));

    timeModalMinutesInput()?.focus();
    timeModalMinutesInput()?.select();
}

function closeExpectedTimeModal(): void {
    const overlay = document.getElementById('sg-instructor-time-modal-overlay');
    if (!overlay) return;

    overlay.classList.remove('sg-instructor-modal-overlay--visible');
    overlay.setAttribute('aria-hidden', 'true');
    hideTimeModalWarning();

    window.setTimeout(() => {
        if (!overlay.classList.contains('sg-instructor-modal-overlay--visible')) {
            overlay.style.display = 'none';
        }
    }, SQ_MODAL_TRANSITION_MS);
}

function adjustTimeModalDraft(deltaMinutes: number): void {
    const parsed = parseTimeModalInputs();
    if ('totalSeconds' in parsed) {
        timeModalDraftSeconds = parsed.totalSeconds;
    }

    const deltaSeconds = deltaMinutes * 60;

    if (deltaSeconds < 0) {
        if (timeModalDraftSeconds === 0) {
            showTimeModalWarning('zero');
            shakeTimeModalControls();
            return;
        }
        timeModalDraftSeconds = Math.max(0, timeModalDraftSeconds + deltaSeconds);
        hideTimeModalWarning();
        syncTimeModalInputs(timeModalDraftSeconds);
        return;
    }

    if (timeModalDraftSeconds >= MAX_EXPECTED_TIME_SECONDS) {
        showTimeModalWarning('max');
        shakeTimeModalControls();
        return;
    }

    const next = Math.min(MAX_EXPECTED_TIME_SECONDS, timeModalDraftSeconds + deltaSeconds);
    const hitMax = timeModalDraftSeconds + deltaSeconds > MAX_EXPECTED_TIME_SECONDS;
    timeModalDraftSeconds = next;
    syncTimeModalInputs(timeModalDraftSeconds);
    hideTimeModalWarning();

    if (hitMax) {
        showTimeModalWarning('max');
        shakeTimeModalControls();
    }
}

function saveExpectedTimeModal(): void {
    const parsed = parseTimeModalInputs();

    if ('error' in parsed) {
        timeModalMinutesInput()?.classList.add('sg-instructor-time-modal-input--invalid');
        timeModalSecondsInput()?.classList.add('sg-instructor-time-modal-input--invalid');
        if (parsed.error === 'max') {
            showTimeModalWarning('max');
            shakeTimeModalControls();
        }
        timeModalMinutesInput()?.focus();
        return;
    }

    timeModalDraftSeconds = parsed.totalSeconds;
    updateExpectedTimeDisplay(parsed.totalSeconds);
    markDirty();
    closeExpectedTimeModal();
}

function markDirty(): void {
    isDirty = true;
    updateSaveButton();
    scheduleAutoSave();
}

function updateSaveButton(): void {
    const btn = document.getElementById('sg-instructor-editor-save-btn') as HTMLButtonElement | null;
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
    const questionBody = (document.getElementById('sg-instructor-editor-question-body') as HTMLTextAreaElement | null)?.value ?? '';
    const totalSeconds = parseInt(
        document.getElementById('sg-instructor-editor-expected-time')?.getAttribute('data-seconds') ?? '1500',
        10
    );

    const learningObjectives = normalizeLearningObjectives(editorQuestion?.learningObjectives ?? []);

    const subQuestions = (editorQuestion?.subQuestions ?? []).map((sq, index) => {
        const partKey = subQuestionKey(sq, index);
        const prompt = document.querySelector<HTMLTextAreaElement>(`.sg-instructor-part-prompt[data-part-id="${partKey}"]`)?.value ?? sq.prompt;
        const modelAnswer = document.querySelector<HTMLTextAreaElement>(`.sg-instructor-part-answer[data-part-id="${partKey}"]`)?.value ?? sq.modelAnswer;
        return {
            subQuestionId: sq.subQuestionId || partKey,
            partId: sq.partId,
            subQuestionType: sq.subQuestionType,
            prompt,
            modelAnswer,
        };
    });

    const titleDisplay = document.getElementById('sg-instructor-editor-title-display');
    const title = titleDisplay?.textContent?.trim() || editorQuestion?.title || 'Untitled';

    return {
        title,
        questionBody,
        learningObjectives,
        expectedTimeMinutes: expectedMinutesFromSeconds(totalSeconds),
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
        editorQuestion = await updateScenarioQuestion(currentCourse.id, editorQuestionId, patch);
        isDirty = false;
        updateSaveButton();
        await refreshQuestions(editorQuestion?.topicOrWeekId ?? activeTopicId);
        showSuccessToast(showToast ? 'Draft saved.' : 'Changes saved automatically.');
    } catch (error) {
        showErrorToast(errorMessage(error, 'Could not save.'));
    }
}
