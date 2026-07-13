// public/scripts/feature/scenarios-student.ts

/**
 * Scenario Generation (student mock)
 *
 * Client-only mock of the Scenario Generation student flow: question list with
 * Attempted filter, Practice/Exam mode modal, practice AI feedback buttons, and
 * a 25-minute exam countdown. No API calls — hardcoded sample questions.
 *
 * @author: EngE-AI Team
 * @date: 2026-07-09
 * @version: 2.0.0
 * @description: Student Scenario Generation mock UI (list, modal, practice, exam).
 */

import { activeCourse } from '../types.js';
import { renderFeatherIcons } from '../api/api.js';
import { closeModal, showCustomModal, showWarningModal } from '../ui/modal-overlay.js';
import { parseAnswerKeyToFlashcards, SUB_QUESTION_TYPE_LABELS } from './scenario-answer-flashcard.js';

type ScenarioMode = 'practice' | 'exam';
type StatusFilter = 'all' | 'attempted' | 'unsolved';
type SubQuestionType = keyof typeof SUB_QUESTION_TYPE_LABELS;

interface MockPart {
    id: 'a' | 'b';
    subQuestionType: SubQuestionType;
    prompt: string;
    mockAiResponse: string;
    /** Mock instructor answer key (flashcard source in practice). */
    modelAnswer: string;
}

interface MockQuestion {
    id: string;
    title: string;
    chapter: string;
    topics: string[];
    date: string;
    attempted: boolean;
    narrative: string;
    topicLabel: string;
    learningObjectives: string[];
    parts: MockPart[];
}

const EXAM_SECONDS = 25 * 60;

const MOCK_QUESTIONS: MockQuestion[] = [
    {
        id: 'q1',
        title: 'Heat Exchanger E-401 Area & LMTD',
        chapter: 'Chapter 4',
        topics: ['Heat Transfer', 'LMTD'],
        date: '2026-03-12',
        attempted: false,
        narrative:
            'Estimate the required heat-transfer area and LMTD for heat exchanger E-401 under the stated process conditions. Use the given overall heat-transfer coefficient and assume counter-current flow unless noted otherwise.',
        topicLabel: 'Topic 1: Heat Transfer',
        learningObjectives: [
            'Apply steady-state mass balances to process units.',
            'Interpret P&ID symbols for valve and pump failures.',
            'Troubleshoot deviations using first-principles reasoning.'
        ],
        parts: [
            {
                id: 'a',
                subQuestionType: 'calculation',
                prompt:
                    'Calculate the heat duty, LMTD, and required area for E-401 given the inlet/outlet temperatures and mass flow rates provided in the problem statement.',
                mockAiResponse:
                    'Start from Q = m·Cp·ΔT for the cold stream, then compute LMTD for counter-current flow, and finally A = Q / (U·LMTD). Check units carefully (kW vs W).',
                modelAnswer:
                    '# Card 1: Cold-stream duty\n\n## Topic\nEnergy balance\n\n### Highlight\nQ = m·Cp·ΔT\n\n# Card 2: LMTD\n\n## Topic\nHeat exchanger design\n\n### Highlight\nCounter-current LMTD from the four terminal temperatures.\n\n# Card 3: Area\n\n## Topic\nSizing\n\n### Highlight\nA = Q / (U·LMTD); report m².'
            },
            {
                id: 'b',
                subQuestionType: 'troubleshoot',
                prompt:
                    'Outlet water temperature is lower than designed. Calculate heat duty and effective U, then list and rank likely root causes for a 10-day decline.',
                mockAiResponse:
                    'A lower outlet temperature usually means reduced duty or fouling (lower effective U). Rank fouling, flow maldistribution, and utility-side supply issues; support each with the duty/U numbers you computed.',
                modelAnswer:
                    '# Card 1: Recalculate duty\n\n## Topic\nActual performance\n\n### Highlight\nUse the measured outlet temperature.\n\n# Card 2: Effective U\n\n## Topic\nBack-calculation\n\n### Highlight\nCompare effective U to design U.\n\n# Card 3: Rank causes\n\n## Topic\nTroubleshooting\n\n### Highlight\nFouling, maldistribution, then utility supply — with evidence.'
            }
        ]
    },
    {
        id: 'q2',
        title: 'Catalyst Optimization for Green Hydrogen',
        chapter: 'Chapter 6',
        topics: ['Kinetics', 'Catalysis'],
        date: '2026-03-18',
        attempted: true,
        narrative:
            'A packed-bed reactor produces green hydrogen via steam reforming. You must recommend operating conditions that improve conversion without exceeding the catalyst temperature limit.',
        topicLabel: 'Topic 2: Reaction Engineering',
        learningObjectives: [
            'Evaluate safety and environmental impacts of process changes.',
            'Select appropriate corrective actions under operational constraints.'
        ],
        parts: [
            {
                id: 'a',
                subQuestionType: 'calculation',
                prompt:
                    'Estimate conversion at the proposed space velocity and inlet temperature using the provided rate expression.',
                mockAiResponse:
                    'Integrate the PFR design equation with the given rate law. Watch for the temperature constraint — if hotspots appear, lower inlet T or dilute the feed.',
                modelAnswer:
                    '# Card 1: PFR setup\n\n## Topic\nReactor design\n\n### Highlight\nUse the given rate law in the PFR equation.\n\n# Card 2: Integrate\n\n## Topic\nConversion\n\n### Highlight\nIntegrate across the bed at the stated space velocity.\n\n# Card 3: Temperature check\n\n## Topic\nConstraints\n\n### Highlight\nIf hotspot exceeds the limit, lower inlet T or dilute the feed.'
            },
            {
                id: 'b',
                subQuestionType: 'troubleshoot',
                prompt:
                    'Conversion dropped 8% over two weeks. Propose diagnostic checks and a ranked list of causes.',
                mockAiResponse:
                    'Check for catalyst deactivation (coking/sintering), feed impurity spikes, and measurement drift on the GC. Rank by likelihood given the gradual decline.',
                modelAnswer:
                    '# Card 1: Instruments & feed\n\n## Topic\nDiagnostics\n\n### Highlight\nReview GC calibration and feed impurity logs.\n\n# Card 2: Catalyst health\n\n## Topic\nDeactivation\n\n### Highlight\nLook for coking or sintering indicators.\n\n# Card 3: Rank causes\n\n## Topic\nRoot cause\n\n### Highlight\nDeactivation, impurities, then measurement drift.'
            }
        ]
    },
    {
        id: 'q3',
        title: 'Wastewater Treatment System Sizing',
        chapter: 'Chapter 2',
        topics: ['Mass Balance', 'Environment'],
        date: '2026-02-28',
        attempted: false,
        narrative:
            'Size a primary clarifier and aeration basin for a municipal wastewater plant upgrade. Steady-state mass balances and typical design criteria are provided.',
        topicLabel: 'Topic 3: Environmental Process Design',
        learningObjectives: [
            'Apply steady-state mass balances to process units.',
            'Communicate engineering recommendations with units and assumptions.',
            'Troubleshoot deviations using first-principles reasoning.'
        ],
        parts: [
            {
                id: 'a',
                subQuestionType: 'calculation',
                prompt:
                    'Perform a solids mass balance around the clarifier and determine the required surface area.',
                mockAiResponse:
                    'Use overflow rate and solids loading criteria together. Your area should satisfy both; report which constraint governs.',
                modelAnswer:
                    '# Card 1: Solids balance\n\n## Topic\nMass balance\n\n### Highlight\nWrite the solids balance around the clarifier.\n\n# Card 2: Size by criteria\n\n## Topic\nDesign criteria\n\n### Highlight\nOverflow rate and solids loading each imply an area.\n\n# Card 3: Governing constraint\n\n## Topic\nSelection\n\n### Highlight\nTake the larger area and state which constraint governs.'
            },
            {
                id: 'b',
                subQuestionType: 'troubleshoot',
                prompt:
                    'Effluent TSS is rising. Identify possible hydraulic or process causes and suggest one corrective action for each.',
                mockAiResponse:
                    'Consider short-circuiting, sludge blanket rise, and influent surge events. For each, propose a concrete check (e.g. dye test, blanket depth, flow equalization).',
                modelAnswer:
                    '# Card 1: Short-circuiting\n\n## Topic\nHydraulics\n\n### Highlight\nDye test; correct inlet baffling if needed.\n\n# Card 2: Sludge blanket\n\n## Topic\nSolids inventory\n\n### Highlight\nMeasure blanket depth and adjust wasting.\n\n# Card 3: Influent surges\n\n## Topic\nLoad variation\n\n### Highlight\nAdd flow equalization if surges drive the TSS rise.'
            }
        ]
    }
];

let statusFilter: StatusFilter = 'all';
let activeQuestion: MockQuestion | null = null;
let activeMode: ScenarioMode | null = null;
let examSecondsLeft = EXAM_SECONDS;
let examTimerId: ReturnType<typeof setInterval> | null = null;
let uiAbort: AbortController | null = null;
/** Flashcard step index per part id while answer panel is open. */
const flashcardIndexByPart = new Map<string, number>();

/**
 * initializeScenariosStudent
 *
 * @param _course activeCourse — unused in mock; kept for student-mode.ts call site
 * @returns Promise<void>
 */
export async function initializeScenariosStudent(_course: activeCourse): Promise<void> {
    stopExamTimer();
    statusFilter = 'all';
    activeQuestion = null;
    activeMode = null;

    uiAbort?.abort();
    uiAbort = new AbortController();

    showListView();
    syncFilterPills();
    renderQuestionList();
    attachListListeners();
    attachWorkspaceListeners();
    renderFeatherIcons();
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

/**
 * isScenarioWorkspaceActive — true while Practice/Exam workspace is open
 */
export function isScenarioWorkspaceActive(): boolean {
    return activeMode !== null;
}

/**
 * expandStudentSidebar — restore sidebar after leaving Practice/Exam or Scenario Generation
 */
export function expandStudentSidebar(): void {
    document.querySelector('.sidebar')?.classList.remove('collapsed');
}

/**
 * confirmLeaveScenarioWorkspace — warn before abandoning an active Practice/Exam.
 * Returns true if navigation may proceed (no session, or student confirmed Leave).
 */
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

/**
 * confirmLeaveWorkspace — back-button path; only leaves after confirm
 */
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

function filteredQuestions(): MockQuestion[] {
    if (statusFilter === 'attempted') return MOCK_QUESTIONS.filter(q => q.attempted);
    if (statusFilter === 'unsolved') return MOCK_QUESTIONS.filter(q => !q.attempted);
    return MOCK_QUESTIONS;
}

function syncFilterPills(): void {
    document.querySelectorAll<HTMLButtonElement>('.sg-student-filter-pill[data-filter]').forEach(btn => {
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
        container.innerHTML = `<p class="sg-student-empty-state">No questions match this filter.</p>`;
        return;
    }

    container.innerHTML = questions.map(q => `
        <button type="button" class="sg-student-question-card" data-question-id="${escapeHtml(q.id)}" role="listitem">
            <div class="sg-student-card-top">
                <div class="sg-student-card-title-row">
                    <h3 class="sg-student-card-title">${escapeHtml(q.title)}</h3>
                    <span class="sg-student-card-chapter">${escapeHtml(q.chapter)}</span>
                </div>
                <span class="sg-student-card-status${q.attempted ? ' attempted' : ''}">
                    ${q.attempted ? 'Attempted' : 'Unsolved'}
                </span>
            </div>
            <div class="sg-student-card-meta">
                <span class="sg-student-card-topics">
                    Covered Topic:
                    ${q.topics.map(t => `<span class="sg-student-topic-pill">${escapeHtml(t)}</span>`).join('')}
                </span>
                <span>Date: ${escapeHtml(q.date)}</span>
            </div>
        </button>
    `).join('');
}

function attachListListeners(): void {
    const signal = uiAbort?.signal;

    document.querySelector('.sg-student-filters')?.addEventListener('click', (e: Event) => {
        const btn = (e.target as HTMLElement).closest('.sg-student-filter-pill') as HTMLButtonElement | null;
        if (!btn || btn.disabled) return;
        const key = btn.dataset.filter as StatusFilter | undefined;
        if (!key || (key !== 'all' && key !== 'attempted' && key !== 'unsolved')) return;
        statusFilter = key;
        syncFilterPills();
        renderQuestionList();
    }, { signal });

    const list = document.getElementById('sg-student-question-list');
    list?.addEventListener('click', (e: MouseEvent) => {
        const card = (e.target as HTMLElement).closest('.sg-student-question-card') as HTMLElement | null;
        const id = card?.dataset.questionId;
        if (!id) return;
        const question = MOCK_QUESTIONS.find(q => q.id === id);
        if (question) void openModeModal(question);
    }, { signal });
}

/**
 * openModeModal — Practice / Exam chooser via shared modal-overlay
 *
 * Select a mode card (green highlight), then confirm with Start.
 *
 * @param question MockQuestion
 */
async function openModeModal(question: MockQuestion): Promise<void> {
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
        confirmEl?.removeAttribute('hidden');
        startBtn?.focus();
    };

    body.addEventListener('click', (event) => {
        const target = event.target as HTMLElement;
        const card = target.closest<HTMLElement>('[data-mode]');
        if (card) {
            const mode = card.dataset.mode;
            if (mode === 'practice' || mode === 'exam') selectMode(mode);
            return;
        }
        if (target.closest('[data-start]') && selectedMode) {
            closeModal(selectedMode);
        }
    });

    const resultPromise = showCustomModal({
        type: 'info',
        title: question.title,
        content: body,
        maxWidth: '560px',
        customClass: 'sg-student-mode-modal',
        closeOnOverlayClick: true,
        buttons: []
    });

    queueMicrotask(() => {
        body.querySelector<HTMLButtonElement>('[data-mode="practice"]')?.focus();
    });

    const result = await resultPromise;

    if (result.action === 'practice') startWorkspace(question, 'practice');
    else if (result.action === 'exam') startWorkspace(question, 'exam');
}

function startWorkspace(question: MockQuestion, mode: ScenarioMode): void {
    activeQuestion = question;
    activeMode = mode;
    flashcardIndexByPart.clear();

    const titleEl = document.getElementById('sg-student-question-title');
    if (titleEl) titleEl.textContent = question.title;

    const narrativeEl = document.getElementById('sg-student-narrative');
    if (narrativeEl) narrativeEl.textContent = question.narrative;

    const topicEl = document.getElementById('sg-student-topic-label');
    if (topicEl) topicEl.textContent = question.topicLabel;

    const lloEl = document.getElementById('sg-student-llo-list');
    if (lloEl) {
        lloEl.innerHTML = question.learningObjectives.length
            ? question.learningObjectives
                .map(lo => `<span class="sg-student-lo-pill">${escapeHtml(lo)}</span>`)
                .join('')
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
    setupTimerForMode(mode);
    showWorkspaceView();
    collapseStudentSidebar();
    renderFeatherIcons();
}

function collapseStudentSidebar(): void {
    document.querySelector('.sidebar')?.classList.add('collapsed');
}

function renderParts(question: MockQuestion, mode: ScenarioMode): void {
    const container = document.getElementById('sg-student-parts');
    if (!container) return;

    container.innerHTML = question.parts.map(part => {
        const typeLabel = SUB_QUESTION_TYPE_LABELS[part.subQuestionType] ?? part.subQuestionType;
        const practiceBlock = mode === 'practice'
            ? `
            <div class="sg-student-part-actions">
                <button type="button" class="sg-student-ai-btn" data-part-id="${part.id}">Get AI Feedback</button>
                <button type="button" class="sg-student-answer-btn" data-part-id="${part.id}">See the Answer</button>
            </div>
            <div class="sg-student-ai-feedback" data-part-id="${part.id}" hidden>
                <div class="sg-student-ai-feedback-header">
                    <i data-feather="message-circle" aria-hidden="true"></i>
                    <span>AI Feedback</span>
                </div>
                <div class="sg-student-ai-feedback-body"></div>
            </div>`
            : '';

        return `
        <section class="sg-student-part" data-part-id="${part.id}">
            <div class="sg-student-part-header">
                <div class="sg-part-title-group">
                    <h3 class="sg-part-title">Part ${part.id.toUpperCase()}</h3>
                    <span class="sg-part-type-badge sg-part-type-${part.subQuestionType}">${escapeHtml(typeLabel)}</span>
                </div>
            </div>
            <p class="sg-student-part-prompt">${escapeHtml(part.prompt)}</p>
            <textarea
                class="sg-student-answer-input"
                data-part-id="${part.id}"
                rows="5"
                placeholder="Type your answer here..."
            ></textarea>
            ${practiceBlock}
            <div class="sg-student-answer-panel" data-part-id="${part.id}" hidden></div>
        </section>
    `;
    }).join('');
}

function setupTimerForMode(mode: ScenarioMode): void {
    stopExamTimer();
    const timerBlock = document.getElementById('sg-student-timer-block');
    const timeUpEl = document.getElementById('sg-student-time-up');
    const display = document.getElementById('sg-student-timer-display');

    if (mode !== 'exam') {
        if (timerBlock) timerBlock.style.display = 'none';
        return;
    }

    examSecondsLeft = EXAM_SECONDS;
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

    document.querySelectorAll<HTMLTextAreaElement>('.sg-student-answer-input').forEach(el => {
        el.disabled = true;
    });

    const submitBtn = document.getElementById('sg-student-submit-btn') as HTMLButtonElement | null;
    if (submitBtn) submitBtn.disabled = true;
}

function showAnswerFlashcard(part: MockPart): void {
    const panel = document.querySelector<HTMLElement>(
        `.sg-student-answer-panel[data-part-id="${part.id}"]`
    );
    if (!panel) return;

    const steps = parseAnswerKeyToFlashcards(part.modelAnswer);
    if (!steps.length) {
        panel.hidden = false;
        panel.innerHTML = `<p class="sg-student-flashcard-empty">No answer key available for this part.</p>`;
        return;
    }

    let idx = flashcardIndexByPart.get(part.id) ?? 0;
    if (idx >= steps.length) idx = steps.length - 1;
    if (idx < 0) idx = 0;
    flashcardIndexByPart.set(part.id, idx);

    const step = steps[idx];
    const body = step.bodyMarkdown.replace(/^\d+\.\s+/, '').trim();
    const showTitle = !/^Step\s+\d+$/i.test(step.title);

    panel.hidden = false;
    panel.innerHTML = `
        <div class="sg-student-flashcard">
            <div class="sg-student-flashcard-header">
                <span class="sg-student-flashcard-step-label">Step ${idx + 1} of ${steps.length}</span>
                ${showTitle ? `<span class="sg-student-flashcard-title">${escapeHtml(step.title)}</span>` : ''}
            </div>
            <div class="sg-student-flashcard-body">${escapeHtml(body)}</div>
            <div class="sg-student-flashcard-nav">
                <button type="button" class="sg-student-flashcard-nav-btn" data-action="prev" data-part-id="${part.id}" ${idx === 0 ? 'disabled' : ''} aria-label="Previous step">
                    <i data-feather="chevron-left"></i>
                </button>
                <button type="button" class="sg-student-flashcard-nav-btn" data-action="next" data-part-id="${part.id}" ${idx >= steps.length - 1 ? 'disabled' : ''} aria-label="Next step">
                    <i data-feather="chevron-right"></i>
                </button>
            </div>
        </div>
    `;
    renderFeatherIcons();
}

function revealAllAnswerFlashcards(): void {
    if (!activeQuestion) return;
    for (const part of activeQuestion.parts) {
        flashcardIndexByPart.set(part.id, 0);
        showAnswerFlashcard(part);
    }
}

function attachWorkspaceListeners(): void {
    const signal = uiAbort?.signal;

    document.getElementById('sg-student-back-btn')?.addEventListener('click', () => {
        void confirmLeaveWorkspace();
    }, { signal });

    document.getElementById('sg-student-submit-btn')?.addEventListener('click', () => {
        if (activeMode !== 'exam' || !activeQuestion) return;
        stopExamTimer();
        lockExamInputs('Submitted');
        const submitBtn = document.getElementById('sg-student-submit-btn') as HTMLButtonElement | null;
        if (submitBtn) submitBtn.textContent = 'Submitted';
        revealAllAnswerFlashcards();
    }, { signal });

    const parts = document.getElementById('sg-student-parts');
    parts?.addEventListener('click', (e: MouseEvent) => {
        if (!activeQuestion) return;
        const target = e.target as HTMLElement;

        const navBtn = target.closest('.sg-student-flashcard-nav-btn') as HTMLButtonElement | null;
        if (navBtn) {
            const partId = navBtn.dataset.partId;
            const part = activeQuestion.parts.find(p => p.id === partId);
            if (!part) return;
            const steps = parseAnswerKeyToFlashcards(part.modelAnswer);
            const cur = flashcardIndexByPart.get(part.id) ?? 0;
            const next = navBtn.dataset.action === 'next' ? cur + 1 : cur - 1;
            flashcardIndexByPart.set(part.id, Math.max(0, Math.min(steps.length - 1, next)));
            showAnswerFlashcard(part);
            return;
        }

        if (activeMode !== 'practice') return;

        const aiBtn = target.closest('.sg-student-ai-btn') as HTMLButtonElement | null;
        if (aiBtn) {
            const partId = aiBtn.dataset.partId;
            const part = activeQuestion.parts.find(p => p.id === partId);
            if (!part) return;
            const feedback = document.querySelector<HTMLElement>(
                `.sg-student-ai-feedback[data-part-id="${part.id}"]`
            );
            const body = feedback?.querySelector<HTMLElement>('.sg-student-ai-feedback-body');
            if (feedback && body) {
                body.textContent = part.mockAiResponse;
                feedback.hidden = false;
                renderFeatherIcons();
            }
            return;
        }

        const answerBtn = target.closest('.sg-student-answer-btn') as HTMLButtonElement | null;
        if (answerBtn) {
            const partId = answerBtn.dataset.partId;
            const part = activeQuestion.parts.find(p => p.id === partId);
            if (!part) return;
            flashcardIndexByPart.set(part.id, flashcardIndexByPart.get(part.id) ?? 0);
            showAnswerFlashcard(part);
        }
    }, { signal });
}
