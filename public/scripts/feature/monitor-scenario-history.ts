// public/scripts/feature/monitor-scenario-history.ts

/**
 * Monitor "scenarios" panel — one student's Practice Scenarios history for instructors.
 *
 * Renders every published question grouped by chapter (with not-attempted ones listed so gaps
 * are visible), then removed or unpublished questions the student answered. Each attempted
 * question expands to its parts: the latest answer, its feedback, and earlier attempts.
 * Student answers are shown as plain text; feedback is rendered Markdown with math.
 */

import type {
    ScenarioEffortFlag,
    ScenarioMode,
    ScenarioStudentUsageHistory,
    ScenarioUsageAttempt,
    ScenarioUsagePart,
    ScenarioUsageQuestion,
} from '../types.js';
import { RenderChat } from './render-chat.js';
import { renderLatexInHtmlContent } from './chat.js';
import { normalizeMathDelimiters } from './math-delimiters.js';
import { SUB_QUESTION_TYPE_LABELS } from './scenario-answer-flashcard.js';

const renderChat = new RenderChat();

const dateFmt = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
});

const PROGRESS_LABELS: Record<ScenarioUsageQuestion['progress'], string> = {
    not_attempted: 'Not attempted',
    partial: 'Partly answered',
    complete: 'Completed',
};

const REMOVED_GROUP_TITLE = 'Removed or unpublished questions';

/** Same rules the usage CSV counts as "Flagged answers" — prompts to look, not verdicts. */
const FLAG_LABELS: Record<ScenarioEffortFlag, { label: string; title: string }> = {
    too_short: { label: 'Very short', title: 'Fewer than 3 words, or a non-answer such as "idk"' },
    repeats_question: { label: 'Repeats the question', title: 'Mostly the wording of the question itself' },
    duplicate: { label: 'Same as previous answer', title: 'Identical to their previous answer to this part' },
    copies_model_answer: { label: 'Close to model answer', title: 'Mostly the wording of the model answer' },
};

function flagPills(flags: ScenarioEffortFlag[]): string {
    return flags
        .map(
            (flag) =>
                `<span class="monitor-scenario-flag" title="${escapeHtml(FLAG_LABELS[flag].title)}">${escapeHtml(FLAG_LABELS[flag].label)}</span>`
        )
        .join('');
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatDate(iso: string | null): string {
    if (!iso) return '';
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? '' : dateFmt.format(date);
}

function modeBadge(mode: ScenarioMode): string {
    return `<span class="sg-mode-badge sg-mode-badge--${mode}">${mode === 'practice' ? 'Practice' : 'Exam'}</span>`;
}

/**
 * Panel HTML for one student's history. Feedback bodies are empty placeholders until
 * {@link paintScenarioHistoryFeedback} fills them.
 *
 * @param history - The student's history from the usage API
 * @returns HTML for the inside of the Monitor panel
 */
export function renderScenarioHistoryHtml(history: ScenarioStudentUsageHistory): string {
    if (history.questions.length === 0) {
        return '<p class="monitor-panel-empty">No scenario questions are published yet.</p>';
    }

    const summary = `
        <p class="monitor-scenario-summary">
            Attempted <strong>${history.questionsAttempted}</strong> of ${history.publishedQuestionCount}
            published question${history.publishedQuestionCount === 1 ? '' : 's'}
            · <strong>${history.questionsCompleted}</strong> completed
        </p>`;

    // Group in API order: chapters for published questions, one trailing group for the rest
    const groups: Array<{ title: string; questions: ScenarioUsageQuestion[] }> = [];
    for (const question of history.questions) {
        const title = question.questionState === 'published' ? question.topicTitle : REMOVED_GROUP_TITLE;
        const last = groups[groups.length - 1];
        if (last && last.title === title) last.questions.push(question);
        else groups.push({ title, questions: [question] });
    }

    return `${summary}${groups
        .map(
            (group) => `
        <section class="monitor-scenario-group">
            <h4 class="monitor-scenario-group-title">${escapeHtml(group.title)}</h4>
            <ul class="monitor-scenario-question-list">
                ${group.questions.map(renderQuestionHtml).join('')}
            </ul>
        </section>`
        )
        .join('')}`;
}

function renderQuestionHtml(question: ScenarioUsageQuestion): string {
    const stateNote =
        question.questionState === 'removed'
            ? '<span class="monitor-scenario-state">Removed</span>'
            : question.questionState === 'unpublished'
              ? '<span class="monitor-scenario-state">Unpublished</span>'
              : '';
    const flaggedCount = question.parts.reduce(
        (sum, part) => sum + part.attempts.filter((a) => a.flags.length > 0).length,
        0
    );
    const flaggedNote = flaggedCount
        ? `<span class="monitor-scenario-flag">${flaggedCount} flagged answer${flaggedCount === 1 ? '' : 's'}</span>`
        : '';
    const meta = `
        <span class="monitor-scenario-progress monitor-scenario-progress--${question.progress}">${PROGRESS_LABELS[question.progress]}</span>
        ${stateNote}
        ${flaggedNote}
        ${question.lastSubmittedAt ? `<time class="monitor-scenario-time" datetime="${escapeHtml(question.lastSubmittedAt)}">${escapeHtml(formatDate(question.lastSubmittedAt))}</time>` : ''}`;
    const title = `<span class="monitor-scenario-question-title">${escapeHtml(question.title)}</span>`;

    // Nothing to expand for an unattempted question
    if (question.progress === 'not_attempted') {
        return `<li class="monitor-scenario-question monitor-scenario-question--empty">
            <div class="monitor-scenario-question-row">${title}<span class="monitor-scenario-meta">${meta}</span></div>
        </li>`;
    }

    return `<li class="monitor-scenario-question">
        <details class="monitor-scenario-details">
            <summary class="monitor-scenario-question-row">
                ${title}<span class="monitor-scenario-meta">${meta}</span>
            </summary>
            <div class="monitor-scenario-parts">
                ${question.parts.map((part, i) => renderPartHtml(part, i)).join('')}
            </div>
        </details>
    </li>`;
}

function renderPartHtml(part: ScenarioUsagePart, index: number): string {
    const typeLabel = SUB_QUESTION_TYPE_LABELS[part.subQuestionType] ?? part.subQuestionType;
    const heading = `<h5 class="monitor-scenario-part-title">Part ${index + 1} · ${escapeHtml(typeLabel)}</h5>`;

    if (part.attempts.length === 0) {
        return `<div class="monitor-scenario-part">${heading}<p class="monitor-panel-empty">Not answered.</p></div>`;
    }

    const [latest, ...earlier] = part.attempts;
    const earlierHtml = earlier.length
        ? `<details class="monitor-scenario-earlier">
                <summary>${earlier.length} earlier attempt${earlier.length === 1 ? '' : 's'}</summary>
                ${earlier.map(renderAttemptHtml).join('')}
           </details>`
        : '';

    return `<div class="monitor-scenario-part">
        ${heading}
        ${renderAttemptHtml(latest)}
        ${earlierHtml}
    </div>`;
}

function renderAttemptHtml(attempt: ScenarioUsageAttempt): string {
    const grade =
        typeof attempt.grade === 'number'
            ? `<span class="monitor-scenario-grade" title="Grade assigned by AI">AI grade ${attempt.grade}/10</span>`
            : '';
    return `<article class="monitor-scenario-attempt">
        <div class="monitor-scenario-attempt-header">
            ${modeBadge(attempt.mode)}
            ${grade}
            ${flagPills(attempt.flags ?? [])}
            <time class="monitor-scenario-time" datetime="${escapeHtml(attempt.submittedAt)}">${escapeHtml(formatDate(attempt.submittedAt))}</time>
        </div>
        <div class="monitor-scenario-label">Answer</div>
        <div class="monitor-scenario-answer">${escapeHtml(attempt.studentAnswer)}</div>
        <div class="monitor-scenario-label">Feedback shown to student</div>
        <div class="monitor-scenario-feedback message-content" data-attempt-feedback="${escapeHtml(attempt.id)}"></div>
    </article>`;
}

/**
 * Render each attempt's feedback (Markdown + math) into the placeholders from
 * {@link renderScenarioHistoryHtml}.
 *
 * @param container - Element holding the rendered panel
 * @param history - The same history the HTML was built from
 */
export function paintScenarioHistoryFeedback(container: HTMLElement, history: ScenarioStudentUsageHistory): void {
    const feedbackById = new Map<string, string>();
    history.questions.forEach((q) => q.parts.forEach((p) => p.attempts.forEach((a) => feedbackById.set(a.id, a.feedback))));

    container.querySelectorAll<HTMLElement>('[data-attempt-feedback]').forEach((el) => {
        const id = el.dataset.attemptFeedback ?? '';
        el.innerHTML = renderChat.render(normalizeMathDelimiters(feedbackById.get(id) ?? ''), `monitor-scenario-${id}`);
    });
    renderLatexInHtmlContent(container);
}
