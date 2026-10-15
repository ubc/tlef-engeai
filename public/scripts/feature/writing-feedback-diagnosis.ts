/**
 * @fileoverview DOM for the review page's section check: the staff-only card shown for a
 * whole-text problem with its "Include annotations" checkbox, the group of annotations not
 * included, and the overall-message editor.
 */

import type { AnchoredComment } from './writing-feedback-shared.js';
import { chip, createText, refreshIcons } from './writing-feedback-shared.js';
import type { sectionCheckView } from './writing-feedback-diagnosis-model.js';

type SectionCheckView = NonNullable<ReturnType<typeof sectionCheckView>>;

/**
 * Whether annotations are held back, for the section check. Shown inverted, as
 * "Include annotations", so ticking the box means the student sees them.
 */
export interface HoldBackState {
    /** Effective hold-back: the staff choice, else the default (held back). */
    checked: boolean;
    /** True when staff changed it from the suggestion, saved or not. */
    changed: boolean;
}

/**
 * renderSectionCheck - staff-only section check for a whole-text problem.
 *
 * @param view - From sectionCheckView
 * @param holdBack - Current checkbox state
 * @param canEdit - Whether the viewer may change the checkbox
 * @param onChange - Called with the hold-back choice, or undefined to reset to the default
 * @returns Section check element
 */
export function renderSectionCheck(
    view: SectionCheckView,
    holdBack: HoldBackState,
    canEdit: boolean,
    onChange: (next: boolean | undefined) => void
): HTMLElement {
    // Built on the annotation card so the panel reads as one family (D-155).
    const card = document.createElement('section');
    card.className = 'wf-annotation-card wf-diagnosis';
    card.setAttribute('aria-label', 'Off-genre or missing sections');

    const header = document.createElement('div');
    header.className = 'wf-annotation-header wf-diagnosis-header';
    header.append(createText('span', 'OFF-GENRE OR MISSING SECTIONS', 'wf-filter-label'));
    card.append(header);

    card.append(createText('h4', view.headline, 'wf-diagnosis-headline'));

    const stages = document.createElement('ul');
    stages.className = 'wf-diagnosis-stages';
    stages.setAttribute('aria-label', 'Sections');
    view.stageChips.forEach((stage) => {
        const item = document.createElement('li');
        const node = chip(`${stage.label}: ${stage.status}`, stage.tone);
        if (stage.required) {
            const marker = document.createElement('span');
            marker.className = 'wf-diagnosis-required';
            marker.textContent = '*';
            marker.title = 'Required section';
            marker.setAttribute('aria-label', 'required');
            node.append(marker);
        }
        item.append(node);
        stages.append(item);
    });
    card.append(stages);

    view.warnings.forEach((warning) => {
        const note = document.createElement('p');
        note.className = 'wf-diagnosis-note';
        note.setAttribute('role', 'note');
        const icon = document.createElement('i');
        icon.setAttribute('data-feather', 'info');
        icon.setAttribute('aria-hidden', 'true');
        note.append(icon, document.createTextNode(warning));
        card.append(note);
    });

    card.append(renderWhyLink(view.rationale));

    card.append(renderHoldBackControl(holdBack, canEdit, onChange));
    refreshIcons();
    return card;
}

/** A small text link that shows or hides EngE-AI's reasoning, collapsed to start. */
function renderWhyLink(rationale: string): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'wf-diagnosis-why';
    const text = createText('p', rationale);
    text.id = 'wf-diagnosis-why-text';
    text.hidden = true;
    const link = document.createElement('button');
    link.type = 'button';
    link.className = 'wf-diagnosis-why__link';
    link.setAttribute('aria-expanded', 'false');
    link.setAttribute('aria-controls', text.id);
    link.append(createText('span', 'Why EngE-AI flagged this', 'wf-diagnosis-why__label'), createText('span', '›', 'wf-diagnosis-why__arrow'));
    link.querySelector('.wf-diagnosis-why__arrow')?.setAttribute('aria-hidden', 'true');
    link.addEventListener('click', () => {
        const open = link.getAttribute('aria-expanded') !== 'true';
        link.setAttribute('aria-expanded', String(open));
        text.hidden = !open;
    });
    wrapper.append(link, text);
    return wrapper;
}

/** "Include annotations", with where its value came from and a way back to the default. */
function renderHoldBackControl(
    holdBack: HoldBackState,
    canEdit: boolean,
    onChange: (next: boolean | undefined) => void
): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'wf-hold-back';

    const option = document.createElement('label');
    option.className = 'wf-hold-back__option';
    const input = document.createElement('input');
    input.type = 'checkbox';
    // Ticked means included, the opposite of the stored hold-back value.
    input.checked = !holdBack.checked;
    input.disabled = !canEdit;
    input.setAttribute('aria-describedby', 'wf-hold-back-source');
    input.addEventListener('change', () => onChange(!input.checked));
    option.append(input, createText('span', 'Include annotations'));
    wrapper.append(option);

    const source = document.createElement('p');
    source.id = 'wf-hold-back-source';
    source.className = 'wf-hold-back__source';
    if (holdBack.changed) {
        source.append(document.createTextNode('Changed by staff. '));
        if (canEdit) {
            const reset = document.createElement('button');
            reset.type = 'button';
            reset.className = 'wf-hold-back__reset';
            reset.textContent = 'Reset to default';
            reset.addEventListener('click', () => onChange(undefined));
            source.append(reset);
        }
    } else {
        source.textContent = 'Annotations are not included by default because of the issue above. The student sees only the annotations you include one by one.';
    }
    wrapper.append(source);
    return wrapper;
}

/**
 * renderHeldBackGroup - collapsed list of annotations not included for the student.
 *
 * @param comments - Held-back comments
 * @param renderCard - The review page's annotation card renderer; given an include action, the
 *                     card shows an Include button with its other actions
 * @param canEdit - Whether the viewer may include comments
 * @param onRelease - Called with a comment id when staff include it
 * @returns A details element, or null when nothing is held back
 */
export function renderHeldBackGroup(
    comments: AnchoredComment[],
    renderCard: (comment: AnchoredComment, onInclude?: () => void) => HTMLElement,
    canEdit: boolean,
    onRelease: (id: string) => void
): HTMLElement | null {
    if (!comments.length) return null;
    const group = document.createElement('details');
    group.className = 'wf-held-back';
    const summary = document.createElement('summary');
    summary.textContent = `Annotations not included (${comments.length})`;
    group.append(summary, createText('p', 'The student does not see these annotations. Include one to show it to the student.', 'wf-field-help'));
    comments.forEach((comment) => {
        const item = document.createElement('div');
        item.className = 'wf-held-back-item';
        item.append(renderCard(comment, canEdit ? () => onRelease(comment.id) : undefined));
        group.append(item);
    });
    return group;
}

/**
 * renderOverallMessageEditor - Summary-step editor for the overall message ("General feedback").
 *
 * @param value - Current message (staff edit over the model's)
 * @param canEdit - Whether the viewer may edit
 * @param onChange - Called with the edited text on every input
 * @returns Textarea named by the section heading
 */
export function renderOverallMessageEditor(
    value: string,
    canEdit: boolean,
    onChange: (next: string) => void
): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'wf-field wf-field--wide';
    const input = document.createElement('textarea');
    input.id = 'wf-overall-message';
    // The section heading names the field, so it carries no visible label of its own.
    input.setAttribute('aria-label', 'General feedback');
    input.rows = 7;
    input.value = value;
    input.readOnly = !canEdit;
    input.addEventListener('input', () => onChange(input.value));
    wrapper.append(input);
    return wrapper;
}
