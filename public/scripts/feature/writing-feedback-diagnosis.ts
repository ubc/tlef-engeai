/**
 * @fileoverview DOM for the review page's whole-text diagnosis: the staff banner with the
 * mode toggle, the held-back annotation group, and the rewrite-block editor.
 */

import type { AnchoredComment, FeedbackMode } from './writing-feedback-shared.js';
import { createButton, createText } from './writing-feedback-shared.js';
import type { diagnosisBannerView } from './writing-feedback-diagnosis-model.js';

type BannerView = NonNullable<ReturnType<typeof diagnosisBannerView>>;

/** The rewrite block staff edit on the Summary step. */
export interface GlobalRevisionDraft {
    diagnosisStatement: string;
    whatToKeep: string[];
    rewriteDirection: string;
}

/**
 * renderDiagnosisBanner - staff-only whole-text diagnosis with the mode toggle.
 *
 * @param view - From diagnosisBannerView
 * @param mode - Current effective mode
 * @param canEdit - Whether the viewer may change the mode
 * @param onToggle - Called with the new mode; the caller marks the summary stale and re-renders
 * @returns Banner element
 */
export function renderDiagnosisBanner(
    view: BannerView,
    mode: FeedbackMode,
    canEdit: boolean,
    onToggle: (next: FeedbackMode) => void
): HTMLElement {
    const banner = document.createElement('section');
    banner.className = mode === 'global_revision' ? 'wf-diagnosis wf-diagnosis--rewrite' : 'wf-diagnosis';
    banner.setAttribute('aria-label', 'Whole-text diagnosis');

    banner.append(createText('p', view.headline, 'wf-diagnosis-headline'));
    banner.append(createText('p', mode === 'global_revision'
        ? 'The student gets rewrite feedback only. Passage comments are held back.'
        : 'The student gets passage comments and revision goals.', 'wf-diagnosis-mode'));

    const stages = document.createElement('ul');
    stages.className = 'wf-diagnosis-stages';
    view.stageChips.forEach((chip) => {
        const item = document.createElement('li');
        item.className = `wf-diagnosis-stage wf-diagnosis-stage--${chip.status.toLowerCase().replace(/\s+/g, '-')}`;
        item.textContent = `${chip.label}: ${chip.status}${chip.required ? ' (required)' : ''}`;
        stages.append(item);
    });
    banner.append(stages);

    view.warnings.forEach((warning) => {
        const note = createText('p', warning, 'wf-diagnosis-warning');
        note.setAttribute('role', 'note');
        banner.append(note);
    });

    const why = document.createElement('details');
    why.className = 'wf-diagnosis-why';
    const summary = document.createElement('summary');
    summary.textContent = 'Why?';
    why.append(summary, createText('p', view.rationale));
    banner.append(why);

    if (canEdit) {
        const toggle = createButton(view.toggleLabel, 'outline', async () => {
            onToggle(mode === 'global_revision' ? 'standard' : 'global_revision');
        });
        toggle.classList.add('wf-diagnosis-toggle');
        banner.append(toggle);
    }
    return banner;
}

/**
 * renderHeldBackGroup - collapsed list of annotations withheld from the student.
 *
 * @param comments - Held-back comments
 * @param renderCard - The review page's existing annotation card renderer
 * @param canEdit - Whether the viewer may release comments
 * @param onRelease - Called with a comment id when staff release it
 * @returns A details element, or null when nothing is held back
 */
export function renderHeldBackGroup(
    comments: AnchoredComment[],
    renderCard: (comment: AnchoredComment) => HTMLElement,
    canEdit: boolean,
    onRelease: (id: string) => void
): HTMLElement | null {
    if (!comments.length) return null;
    const group = document.createElement('details');
    group.className = 'wf-held-back';
    const summary = document.createElement('summary');
    summary.textContent = `Held back until revision (${comments.length})`;
    group.append(summary, createText('p', 'The student does not see these while this submission gets rewrite feedback.', 'wf-field-help'));
    comments.forEach((comment) => {
        const item = document.createElement('div');
        item.className = 'wf-held-back-item';
        item.append(renderCard(comment));
        if (canEdit) {
            item.append(createButton('Release to student', 'outline', async () => onRelease(comment.id)));
        }
        group.append(item);
    });
    return group;
}

/**
 * renderGlobalRevisionEditor - Summary-step editor for the rewrite block.
 *
 * @param value - Current block (staff edit over the model's)
 * @param canEdit - Whether the viewer may edit
 * @param onChange - Called with the edited block on every input
 * @returns Editor element with labelled fields
 */
export function renderGlobalRevisionEditor(
    value: GlobalRevisionDraft,
    canEdit: boolean,
    onChange: (next: GlobalRevisionDraft) => void
): HTMLElement {
    const editor = document.createElement('div');
    editor.className = 'wf-global-editor';
    const current: GlobalRevisionDraft = { ...value, whatToKeep: [...value.whatToKeep] };

    const field = (id: string, label: string, text: string, rows: number, apply: (raw: string) => void): HTMLElement => {
        const wrapper = document.createElement('div');
        wrapper.className = 'wf-field wf-field--wide';
        const labelEl = document.createElement('label');
        labelEl.htmlFor = id;
        labelEl.textContent = label;
        const input = document.createElement('textarea');
        input.id = id;
        input.rows = rows;
        input.value = text;
        input.readOnly = !canEdit;
        input.addEventListener('input', () => {
            apply(input.value);
            onChange({ ...current, whatToKeep: [...current.whatToKeep] });
        });
        wrapper.append(labelEl, input);
        return wrapper;
    };

    editor.append(
        field('wf-global-diagnosis', 'What the text does', current.diagnosisStatement, 4, (raw) => { current.diagnosisStatement = raw; }),
        field('wf-global-keep', 'Keep (one per line)', current.whatToKeep.join('\n'), 3, (raw) => {
            current.whatToKeep = raw.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 3);
        }),
        field('wf-global-direction', 'How to rewrite', current.rewriteDirection, 4, (raw) => { current.rewriteDirection = raw; })
    );
    return editor;
}
