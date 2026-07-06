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
    generateQuestion,
    validatePublish,
    formatExpectedTime
} from '../api/scenario-questions-mock.js';
import { renderFeatherIcons } from '../api/api.js';
import { showSuccessToast, showErrorToast } from '../ui/toast-notification.js';
import { RenderChat } from './render-chat.js';
import { renderLatexInHtmlContent } from './chat.js';
import {
    parseAnswerKeyToFlashcards,
    formatPartHeader,
    SUB_QUESTION_TYPE_LABELS
} from './scenario-answer-flashcard.js';

const ALL_TYPES: ScenarioSubQuestionType[] = ['calculation', 'troubleshoot', 'action', 'corrective'];
const DEFAULT_SELECTED_TYPES: ScenarioSubQuestionType[] = ['calculation', 'troubleshoot', 'action'];
const AUTO_SAVE_MS = 5000;

const renderChat = new RenderChat();

let currentCourse: activeCourse | null = null;
let activeTopicId: string | null = null;
let cachedQuestions: ScenarioQuestionExtended[] = [];
let editorQuestionId: string | null = null;
let editorQuestion: ScenarioQuestionExtended | null = null;
let isDirty = false;
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

/** Selected types in order for generate view. */
let selectedTypes: ScenarioSubQuestionType[] = [...DEFAULT_SELECTED_TYPES];
let selectedDifficulty: ScenarioDifficulty = 'medium';

/** Per-part answer view mode in editor: text (markdown preview) or flashcard. */
const partAnswerModes = new Map<string, 'text' | 'flashcard'>();
/** Per-part flashcard step index. */
const partFlashcardIndex = new Map<string, number>();

let uiAbort: AbortController | null = null;

function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error && error.message ? error.message : fallback;
}

function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

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

    document.getElementById('sq-generate-submit-btn')?.addEventListener('click', handleGenerateSubmit, { signal });
    document.getElementById('sq-type-add-btn')?.addEventListener('click', toggleTypePopover, { signal });
    document.getElementById('sq-difficulty-btn')?.addEventListener('click', toggleDifficultyMenu, { signal });

    document.querySelectorAll<HTMLButtonElement>('.sq-difficulty-option').forEach(btn => {
        btn.addEventListener('click', () => {
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

    document.getElementById('sq-editor-save-btn')?.addEventListener('click', () => persistEditor(true), { signal });
    document.getElementById('sq-editor-publish-btn')?.addEventListener('click', handlePublish, { signal });
    document.getElementById('sq-editor-reject-btn')?.addEventListener('click', handleReject, { signal });
    document.getElementById('sq-editor-lo-add-btn')?.addEventListener('click', handleAddLearningObjective, { signal });
    document.getElementById('sq-time-decrease-btn')?.addEventListener('click', () => adjustExpectedTime(-5), { signal });
    document.getElementById('sq-time-increase-btn')?.addEventListener('click', () => adjustExpectedTime(5), { signal });

    document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (!target.closest('.sq-type-add-wrap')) closeTypePopover();
        if (!target.closest('.sq-difficulty-wrap')) closeDifficultyMenu();
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

function formatUpdatedLabel(isoDate: string | null): string {
    if (!isoDate) return 'Not updated yet';
    const date = new Date(isoDate);
    if (Number.isNaN(date.getTime())) return 'Not updated yet';
    return `Updated ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
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
                <span class="sq-project-card-updated">${escapeHtml(formatUpdatedLabel(lastUpdatedAt))}</span>
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

    const subtitleEl = document.getElementById('sq-topic-detail-subtitle');
    const listEl = document.getElementById('sq-topic-detail-list');
    if (!subtitleEl || !listEl) return;

    const chapters = currentCourse.topicOrWeekInstances || [];
    const knownIds = new Set(chapters.map(c => c.id));
    const title = activeTopicId === '__uncategorized__'
        ? 'Uncategorized'
        : chapters.find(c => c.id === activeTopicId)?.title || 'Topic';

    const topicQuestions = activeTopicId === '__uncategorized__'
        ? cachedQuestions.filter(q => !knownIds.has(q.topicOrWeekId)).sort((a, b) => a.sortOrder - b.sortOrder)
        : questionsForTopic(activeTopicId);

    subtitleEl.textContent = formatTopicSubtitle(activeTopicId, title);

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
    const difficulty = capitalize(question.difficulty);
    const statusLabel = capitalize(question.status);

    return `
        <button type="button" class="sq-question-row" data-question-id="${escapeHtml(question.id)}">
            <div class="sq-question-row-main">
                <p class="sq-question-row-title-line">
                    <span class="sq-question-row-label">Question Title:</span>
                    <span class="sq-question-row-title">${escapeHtml(question.title)}</span>
                </p>
                <p class="sq-question-row-sub">Sub questions: ${partCount}</p>
            </div>
            <div class="sq-question-row-badges">
                <span class="sq-difficulty-badge sq-difficulty-${question.difficulty}">${difficulty}</span>
                <span class="sq-status-pill sq-status-pill-${question.status}">
                    <i data-feather="chevron-right"></i>
                    <span>${escapeHtml(statusLabel)}</span>
                </span>
            </div>
        </button>
    `;
}

function attachQuestionRowListeners(): void {
    document.querySelectorAll<HTMLButtonElement>('.sq-question-row').forEach(row => {
        row.addEventListener('click', async () => {
            const id = row.dataset.questionId;
            if (id) await openEditorView(id);
        }, { signal: uiAbort?.signal });
    });
}

// --- Generate view ---

function openGenerateView(): void {
    if (!activeTopicId || activeTopicId === '__uncategorized__') {
        showErrorToast('Select a topic with a valid chapter first.');
        return;
    }

    selectedTypes = [...DEFAULT_SELECTED_TYPES];
    selectedDifficulty = 'medium';

    const promptEl = document.getElementById('sq-generate-prompt') as HTMLTextAreaElement | null;
    if (promptEl) promptEl.value = '';

    const errorEl = document.getElementById('sq-generate-error');
    if (errorEl) errorEl.style.display = 'none';

    const chapters = currentCourse?.topicOrWeekInstances || [];
    const title = chapters.find(c => c.id === activeTopicId)?.title || 'Topic';
    const subtitleEl = document.getElementById('sq-generate-subtitle');
    if (subtitleEl) subtitleEl.textContent = formatTopicSubtitle(activeTopicId, title);

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
            <span class="sq-type-pill-remove" data-type="${type}" aria-label="Remove ${escapeHtml(SUB_QUESTION_TYPE_LABELS[type])}">×</span>
        </button>
    `).join('');

    container.querySelectorAll<HTMLButtonElement>('.sq-type-pill').forEach(pill => {
        pill.addEventListener('click', (e) => {
            const remove = (e.target as HTMLElement).closest('.sq-type-pill-remove');
            if (remove) {
                e.stopPropagation();
                removeType((remove as HTMLElement).dataset.type as ScenarioSubQuestionType);
            }
        }, { signal: uiAbort?.signal });
    });
}

function renderTypePopover(): void {
    const popover = document.getElementById('sq-type-popover');
    if (!popover) return;

    const available = ALL_TYPES.filter(t => !selectedTypes.includes(t));
    if (!available.length) {
        popover.innerHTML = `<p class="sq-type-popover-empty">All types selected</p>`;
        return;
    }

    popover.innerHTML = available.map(type => `
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
    if (!selectedTypes.includes(type)) {
        selectedTypes.push(type);
        renderTypePills();
        renderTypePopover();
    }
}

function removeType(type: ScenarioSubQuestionType): void {
    if (selectedTypes.length <= 1) {
        showErrorToast('At least one subquestion type is required.');
        return;
    }
    selectedTypes = selectedTypes.filter(t => t !== type);
    renderTypePills();
    renderTypePopover();
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

    document.querySelectorAll<HTMLButtonElement>('.sq-difficulty-option').forEach(btn => {
        btn.classList.toggle('sq-difficulty-option--active', btn.dataset.difficulty === d);
    });
}

function toggleDifficultyMenu(): void {
    const menu = document.getElementById('sq-difficulty-menu');
    const btn = document.getElementById('sq-difficulty-btn');
    if (!menu || !btn) return;
    const open = menu.style.display === 'none';
    menu.style.display = open ? '' : 'none';
    btn.setAttribute('aria-expanded', String(open));
}

function closeDifficultyMenu(): void {
    const menu = document.getElementById('sq-difficulty-menu');
    const btn = document.getElementById('sq-difficulty-btn');
    if (menu) menu.style.display = 'none';
    if (btn) btn.setAttribute('aria-expanded', 'false');
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
            difficulty: selectedDifficulty
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

    const breadcrumb = document.getElementById('sq-editor-breadcrumb');
    if (breadcrumb) breadcrumb.textContent = `Scenario Generation / ${question.title}`;

    const bodyEl = document.getElementById('sq-editor-question-body') as HTMLTextAreaElement | null;
    if (bodyEl) bodyEl.value = question.questionBody;

    const topicLabel = document.getElementById('sq-editor-topic-label');
    if (topicLabel) topicLabel.textContent = topicLabelForEditor(question.topicOrWeekId);

    updateExpectedTimeDisplay(question.expectedTimeMinutes);
    renderLearningObjectives(question.learningObjectives);
    renderEditorParts(question);

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
        const mode = partAnswerModes.get(partKey) ?? 'text';

        return `
            <div class="sq-editor-part-card" data-part-id="${sq.partId}">
                <h3 class="sq-editor-part-title">${escapeHtml(formatPartHeader(sq.partId, sq.subQuestionType))}</h3>
                <label class="sq-editor-section-label">Student prompt</label>
                <textarea class="sq-editor-textarea sq-part-prompt" data-part-id="${sq.partId}" rows="3">${escapeHtml(sq.prompt)}</textarea>
                <div class="sq-answer-key-header">
                    <span class="sq-editor-section-label">Answer key</span>
                    <div class="sq-answer-toggle" role="group" aria-label="Answer key view mode">
                        <button type="button" class="sq-answer-toggle-btn ${mode === 'text' ? 'sq-answer-toggle-btn--active' : ''}" data-mode="text" data-part-id="${sq.partId}">Text</button>
                        <button type="button" class="sq-answer-toggle-btn ${mode === 'flashcard' ? 'sq-answer-toggle-btn--active' : ''}" data-mode="flashcard" data-part-id="${sq.partId}">flashcard</button>
                    </div>
                </div>
                <textarea class="sq-editor-textarea sq-part-answer sq-part-answer-edit" data-part-id="${sq.partId}" rows="6">${escapeHtml(sq.modelAnswer)}</textarea>
                <div class="sq-part-answer-preview" data-part-id="${sq.partId}" style="display: none;"></div>
                <div class="sq-flashcard-panel" data-part-id="${sq.partId}" style="display: none;"></div>
            </div>
        `;
    }).join('');

    question.subQuestions.forEach(sq => updatePartAnswerDisplay(sq.partId));
}

function attachEditorInputListeners(): void {
    const signal = uiAbort?.signal;

    document.getElementById('sq-editor-question-body')?.addEventListener('input', markDirty, { signal });

    document.querySelectorAll<HTMLTextAreaElement>('.sq-part-prompt, .sq-part-answer').forEach(el => {
        el.addEventListener('input', () => {
            markDirty();
            const partId = el.dataset.partId;
            if (partId && el.classList.contains('sq-part-answer')) {
                debouncePartPreview(partId);
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
        previewEl.innerHTML = renderChat.render(markdown, `sq-part-${partId}`);
        previewEl.classList.add('sq-part-answer-rendered');
        renderLatexInHtmlContent(previewEl);
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
    const bodyHtml = renderChat.render(step.bodyMarkdown, `sq-fc-${partId}-${idx}`);
    container.innerHTML = `
        <div class="sq-flashcard">
            <div class="sq-flashcard-header">
                <span class="sq-flashcard-step-label">Step ${idx + 1} of ${steps.length}</span>
                <span class="sq-flashcard-title">${escapeHtml(step.title)}</span>
            </div>
            <div class="sq-flashcard-body message-content">${bodyHtml}</div>
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
    renderLatexInHtmlContent(container.querySelector('.sq-flashcard-body') as HTMLElement);
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

    list.innerHTML = objectives.map((lo, i) => `
        <span class="sq-lo-pill">
            ${escapeHtml(lo)}
            <button type="button" class="sq-lo-remove" data-lo-index="${i}" aria-label="Remove ${escapeHtml(lo)}">×</button>
        </span>
    `).join('');

    list.querySelectorAll<HTMLButtonElement>('.sq-lo-remove').forEach(btn => {
        btn.addEventListener('click', () => {
            const index = parseInt(btn.dataset.loIndex ?? '-1', 10);
            if (index < 0 || !editorQuestion) return;
            const next = editorQuestion.learningObjectives.filter((_, j) => j !== index);
            editorQuestion = { ...editorQuestion, learningObjectives: next };
            renderLearningObjectives(next);
            markDirty();
        }, { signal: uiAbort?.signal });
    });
}

function handleAddLearningObjective(): void {
    const value = window.prompt('Learning objective label (e.g. LO-10-1):');
    if (!value?.trim()) return;

    const list = document.getElementById('sq-editor-lo-list');
    if (!list) return;

    const existing = editorQuestion?.learningObjectives ?? [];
    const next = [...existing, value.trim()];
    if (editorQuestion) editorQuestion = { ...editorQuestion, learningObjectives: next };
    renderLearningObjectives(next);
    markDirty();
}

function updateExpectedTimeDisplay(minutes: number): void {
    const el = document.getElementById('sq-editor-expected-time');
    if (el) el.textContent = formatExpectedTime(minutes);
    el?.setAttribute('data-minutes', String(minutes));
}

function adjustExpectedTime(delta: number): void {
    const el = document.getElementById('sq-editor-expected-time');
    const current = parseInt(el?.getAttribute('data-minutes') ?? '25', 10);
    const next = Math.max(5, Math.min(120, current + delta));
    updateExpectedTimeDisplay(next);
    markDirty();
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

    const loList = document.getElementById('sq-editor-lo-list');
    const learningObjectives = loList
        ? Array.from(loList.querySelectorAll('.sq-lo-pill')).map(p => {
            const clone = p.cloneNode(true) as HTMLElement;
            clone.querySelector('.sq-lo-remove')?.remove();
            return clone.textContent?.trim() ?? '';
        }).filter(Boolean)
        : [];

    const subQuestions = (editorQuestion?.subQuestions ?? []).map(sq => {
        const partId = sq.partId;
        const prompt = document.querySelector<HTMLTextAreaElement>(`.sq-part-prompt[data-part-id="${partId}"]`)?.value ?? sq.prompt;
        const modelAnswer = document.querySelector<HTMLTextAreaElement>(`.sq-part-answer[data-part-id="${partId}"]`)?.value ?? sq.modelAnswer;
        return { partId, subQuestionType: sq.subQuestionType, prompt, modelAnswer };
    });

    return {
        title: editorQuestion?.title ?? 'Untitled',
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

async function handlePublish(): Promise<void> {
    if (!currentCourse || !editorQuestionId) return;
    const errorEl = document.getElementById('sq-editor-error');

    if (isDirty) await persistEditor(false);

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
        showSuccessToast('Question published.');
        editorQuestionId = null;
        await refreshQuestions();
        showTopicDetailView();
        renderTopicDetail();
    } catch (error) {
        if (errorEl) {
            errorEl.textContent = errorMessage(error, 'Could not publish.');
            errorEl.style.display = '';
        }
    }
}

async function handleReject(): Promise<void> {
    if (!currentCourse || !editorQuestionId) return;
    if (isDirty) await persistEditor(false);

    try {
        await patchStatus(currentCourse.id, editorQuestionId, 'rejected');
        showSuccessToast('Question rejected.');
        editorQuestionId = null;
        await refreshQuestions();
        showTopicDetailView();
        renderTopicDetail();
    } catch (error) {
        showErrorToast(errorMessage(error, 'Could not reject question.'));
    }
}
