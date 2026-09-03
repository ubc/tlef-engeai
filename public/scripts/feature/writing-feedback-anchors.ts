// public/scripts/feature/writing-feedback-anchors.ts
/**
 * Writing Feedback Anchors — annotated text and editable comment cards
 *
 * Renders the verified text as offset-tracked segments inside the paper pane
 * (student text is always inserted as text nodes, never markup), numbers each
 * anchored comment with an inline marker, and renders the editable annotation
 * card list in the Feedback panel with function/level filters. Offsets are the
 * anchor source of truth; stale comments (verified text changed after
 * commenting) are listed but never re-anchored visually.
 *
 * @author: @rdschrs
 * @date: 2026-07-22
 * @version: 1.0.0
 * @description: Owns safe text anchoring, selection-to-comment conversion, and annotation editing.
 */

import { showConfirmModal } from '../ui/modal-overlay.js';
import {
    AnchoredComment,
    FUNCTION_TAG_LABELS,
    FUNCTION_TAG_TONES,
    LEVEL_TAG_LABELS,
    PRIORITY_LABELS,
    PRIORITY_TONES,
    SubmissionDetail,
    WritingFeedbackLens,
    WritingGlossaryEntry,
    WfFunctionTag,
    WfLevelTag,
    WfPriority,
    chip,
    createText,
    field,
    jsonRequest,
    request
} from './writing-feedback-shared.js';

interface AnnotationContext {
    docHost: HTMLElement;
    listHost: HTMLElement;
    verifiedText: string;
    /**
     * Which rubric this pane annotates. A lab report renders two panes over the same
     * document, so every read and write here is scoped to one lens; without it a technical
     * comment would be filed against the writing rubric's criterion ids.
     */
    lens: WritingFeedbackLens;
    markDirty: () => void;
}

/**
 * This module owns an isolated working copy so edits cannot mutate the immutable model seed
 * or the last saved staff revision returned by the API.
 *
 * One set per lens. Both panes of a lab report are built into the DOM at setup, so a single
 * shared array would have let whichever rendered last collect every new comment.
 */
const workingSets = new Map<WritingFeedbackLens, AnchoredComment[]>();

/** The working set for one lens, created empty on first use. */
function commentsFor(lens: WritingFeedbackLens): AnchoredComment[] {
    const existing = workingSets.get(lens);
    if (existing) return existing;
    const created: AnchoredComment[] = [];
    workingSets.set(lens, created);
    return created;
}
let activeCommentId: string | null = null;
let editingCommentId: string | null = null;
let filters: { fn: 'all' | WfFunctionTag; level: 'all' | WfLevelTag } = { fn: 'all', level: 'all' };
let glossaryCache: WritingGlossaryEntry[] | null = null;

async function loadGlossaryEntries(): Promise<WritingGlossaryEntry[]> {
    if (!glossaryCache) glossaryCache = await request<WritingGlossaryEntry[]>('/glossary');
    return glossaryCache;
}

function glossarySnapshot(entry: WritingGlossaryEntry): NonNullable<AnchoredComment['glossarySnapshot']> {
    return {
        id: entry.id,
        term: entry.term,
        definition: entry.definition,
        version: entry.version
    };
}

/**
 * initAnchorWorkingSet - starts an editable annotation session for one submission
 *
 * A saved staff revision takes precedence over model suggestions. Every comment
 * is shallow-cloned so browser edits remain local until the review is explicitly saved.
 *
 * @param detail - Submission detail containing saved comments and model seed fallbacks
 */
export function initAnchorWorkingSet(detail: SubmissionDetail): void {
    workingSets.clear();
    const source = detail.comments.length ? detail.comments : detail.seedComments;
    for (const comment of source) {
        // Comments stored before lab-report annotation carry no lens and are all linguistic,
        // matching the default the server's validator applies to the same records.
        commentsFor(comment.lens ?? 'linguistic').push({ ...comment, lens: comment.lens ?? 'linguistic' });
    }
    activeCommentId = null;
    editingCommentId = null;
    filters = { fn: 'all', level: 'all' };
}

/**
 * getWorkingComments - serializes the current annotations for a staff revision
 *
 * @returns A fresh comment array without server-derived stale flags
 */
export function getWorkingComments(): AnchoredComment[] {
    // Technical first, so a lab report's saved revision and its PDF both lead with the
    // marking scheme the grade comes from.
    return [...commentsFor('technical'), ...commentsFor('linguistic')]
        .map(({ stale: _stale, ...comment }) => comment);
}

/** Accepts only offsets that still reproduce the exact quotation in verified text. */
function anchorable(comment: AnchoredComment, verifiedText: string): boolean {
    return !comment.stale
        && comment.endOffset <= verifiedText.length
        && verifiedText.slice(comment.startOffset, comment.endOffset) === comment.quote;
}

function orderedAnchorable(lens: WritingFeedbackLens, verifiedText: string): AnchoredComment[] {
    return commentsFor(lens)
        .filter((comment) => anchorable(comment, verifiedText))
        .sort((a, b) => a.startOffset - b.startOffset || a.endOffset - b.endOffset);
}

/**
 * Stable annotation numbers: position order over all anchorable comments, filter-independent.
 *
 * Numbered within one lens, so each pane counts from 1 and a lab report does not present a
 * technical comment as "number 7" because six writing comments precede it in the document.
 */
function annotationNumbers(lens: WritingFeedbackLens, verifiedText: string): Map<string, number> {
    const numbers = new Map<string, number>();
    orderedAnchorable(lens, verifiedText).forEach((comment, index) => numbers.set(comment.id, index + 1));
    return numbers;
}

function matchesFilters(comment: AnchoredComment): boolean {
    if (filters.fn !== 'all' && comment.functionTag !== filters.fn) return false;
    if (filters.level !== 'all' && comment.levelTag !== filters.level) return false;
    return true;
}

/**
 * renderAnnotations - renders synchronized document highlights and comment cards
 *
 * Student text is inserted with text nodes, and comment offsets are interpreted
 * only against the verified-text snapshot supplied by the review view. Stale or
 * overlapping anchors remain available in the audit-oriented card list but are
 * not placed over unrelated text.
 *
 * @param context - Document/list hosts, verified text, and the review dirty-state callback
 */
export function renderAnnotations(context: AnnotationContext): void {
    context.docHost.replaceChildren();
    context.listHost.replaceChildren();

    context.docHost.append(createText('p', 'Select any text in the document to add a comment.', 'wf-muted-note'));

    const textContainer = document.createElement('div');
    textContainer.className = 'wf-doc-text';
    textContainer.setAttribute('tabindex', '0');
    context.docHost.append(textContainer);

    const popover = document.createElement('div');
    popover.className = 'wf-selection-popover';
    popover.hidden = true;
    context.docHost.append(popover);

    const rerender = () => {
        renderAnchoredText(textContainer, context, rerender);
        renderAnnotationList(context, rerender);
    };
    bindSelectionPopover(context.docHost, textContainer, popover, context, rerender);
    rerender();
}

function activateComment(commentId: string, rerender: () => void): void {
    activeCommentId = commentId;
    rerender();
    document.getElementById(`wf-comment-${commentId}`)?.scrollIntoView({ block: 'nearest' });
}

function renderAnchoredText(host: HTMLElement, context: AnnotationContext, rerender: () => void): void {
    host.replaceChildren();
    const text = context.verifiedText;
    const numbers = annotationNumbers(context.lens, text);
    const anchored = orderedAnchorable(context.lens, text);

    // Rebuild the document as alternating plain-text and anchored segments while
    // retaining absolute offsets on every segment for later selection mapping.
    let cursor = 0;
    const appendGap = (from: number, to: number) => {
        if (to <= from) return;
        const span = document.createElement('span');
        span.dataset.offset = String(from);
        span.textContent = text.slice(from, to);
        host.append(span);
    };

    const buildMarker = (comment: AnchoredComment, filteredOut: boolean, activate: () => void): HTMLElement => {
        const marker = document.createElement('sup');
        marker.className = 'wf-marker';
        marker.textContent = String(numbers.get(comment.id) ?? '');
        marker.setAttribute('role', 'button');
        marker.setAttribute('tabindex', '0');
        marker.setAttribute('aria-label', `Go to comment ${numbers.get(comment.id)}`);
        if (comment.id === activeCommentId) marker.classList.add('is-active');
        if (filteredOut) marker.classList.add('is-filtered-out');
        marker.addEventListener('click', activate);
        marker.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                activate();
            }
        });
        return marker;
    };

    anchored.forEach((comment) => {
        const filteredOut = !matchesFilters(comment);
        const activate = () => {
            // Clicking a dimmed anchor clears the filters so its card is reachable.
            if (!matchesFilters(comment)) filters = { fn: 'all', level: 'all' };
            activateComment(comment.id, rerender);
        };

        // Overlapping spans keep a numbered marker in reading order, but only the
        // first anchor's mark wraps the shared text: nested marks would corrupt
        // selection-to-offset calculations.
        if (comment.startOffset < cursor) {
            host.append(buildMarker(comment, filteredOut, activate));
            return;
        }
        appendGap(cursor, comment.startOffset);

        const mark = document.createElement('mark');
        mark.className = 'wf-anchor';
        mark.dataset.offset = String(comment.startOffset);
        mark.dataset.commentId = comment.id;
        mark.setAttribute('tabindex', '0');
        mark.setAttribute('role', 'button');
        mark.setAttribute('aria-describedby', `wf-comment-${comment.id}`);
        mark.textContent = text.slice(comment.startOffset, comment.endOffset);
        if (comment.id === activeCommentId) mark.classList.add('is-active');
        if (filteredOut) mark.classList.add('is-filtered-out');
        mark.addEventListener('click', activate);
        mark.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                activate();
            }
        });
        host.append(mark, buildMarker(comment, filteredOut, activate));
        cursor = comment.endOffset;
    });
    appendGap(cursor, text.length);
}

/** Maps a DOM selection endpoint back to its absolute verified-text offset. */
function absoluteOffset(host: HTMLElement, node: Node | null, offsetInNode: number): number | null {
    if (!node || !host.contains(node)) return null;
    const segment = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as HTMLElement);
    const base = segment instanceof HTMLElement ? segment.dataset.offset : undefined;
    if (base === undefined) return null;
    return Number(base) + offsetInNode;
}

function bindSelectionPopover(
    paper: HTMLElement,
    host: HTMLElement,
    popover: HTMLElement,
    context: AnnotationContext,
    rerender: () => void
): void {
    const hidePopover = () => { popover.hidden = true; };

    const showPopoverForSelection = () => {
        // Reject selections outside the offset-tracked document or selections
        // collapsed by keyboard/mouse cleanup before constructing an anchor.
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
            hidePopover();
            return;
        }
        const start = absoluteOffset(host, selection.anchorNode, selection.anchorOffset);
        const end = absoluteOffset(host, selection.focusNode, selection.focusOffset);
        if (start === null || end === null || start === end) {
            hidePopover();
            return;
        }
        const [from, to] = start < end ? [start, end] : [end, start];
        // Keep the client anchor within the server's 4,000-character staff limit;
        // model-created evidence has a separate, narrower limit upstream.
        const quote = context.verifiedText.slice(from, Math.min(to, from + 4000));
        if (!quote.trim()) {
            hidePopover();
            return;
        }
        const rect = selection.getRangeAt(0).getBoundingClientRect();
        const paperRect = paper.getBoundingClientRect();
        popover.style.setProperty('--wf-popover-x', `${Math.max(0, rect.left - paperRect.left)}px`);
        popover.style.setProperty('--wf-popover-y', `${rect.bottom - paperRect.top + 6}px`);
        popover.replaceChildren();
        const add = document.createElement('button');
        add.type = 'button';
        add.className = 'wf-button wf-button--primary';
        add.textContent = 'Add comment';
        add.addEventListener('click', () => {
            // Store both the exact quote and its offsets. The server validates this
            // tuple again instead of trusting browser selection state.
            const comment: AnchoredComment = {
                id: crypto.randomUUID(),
                // Single working set today, so every staff comment is linguistic.
                lens: 'linguistic',
                quote,
                startOffset: from,
                endOffset: from + quote.length,
                comment: '',
                origin: 'staff'
            };
            commentsFor(context.lens).push(comment);
            activeCommentId = comment.id;
            editingCommentId = comment.id;
            filters = { fn: 'all', level: 'all' };
            context.markDirty();
            hidePopover();
            window.getSelection()?.removeAllRanges();
            rerender();
            // Move keyboard focus into the newly created editor so the selection
            // workflow remains operable without hunting through the card list.
            const cardEl = document.getElementById(`wf-comment-${comment.id}`);
            cardEl?.scrollIntoView({ block: 'nearest' });
            cardEl?.querySelector('textarea')?.focus();
        });
        popover.append(add);
        popover.hidden = false;
    };

    host.addEventListener('mouseup', () => window.setTimeout(showPopoverForSelection, 0));
    host.addEventListener('keyup', (event) => {
        if (event.shiftKey || event.key === 'Shift') window.setTimeout(showPopoverForSelection, 0);
    });
    document.addEventListener('selectionchange', () => {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) hidePopover();
    });
}

function filterPill(label: string, pressed: boolean, onSelect: () => void): HTMLButtonElement {
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'wf-filter-pill';
    pill.textContent = label;
    pill.setAttribute('aria-pressed', String(pressed));
    pill.addEventListener('click', onSelect);
    return pill;
}

function renderAnnotationList(context: AnnotationContext, rerender: () => void): void {
    const host = context.listHost;
    host.replaceChildren();

    const fnRow = document.createElement('div');
    fnRow.className = 'wf-filter-row';
    fnRow.append(createText('span', 'FUNCTION', 'wf-filter-label'));
    fnRow.append(filterPill('All', filters.fn === 'all', () => { filters = { ...filters, fn: 'all' }; rerender(); }));
    (Object.keys(FUNCTION_TAG_LABELS) as WfFunctionTag[]).forEach((tag) => {
        fnRow.append(filterPill(FUNCTION_TAG_LABELS[tag], filters.fn === tag, () => {
            filters = { ...filters, fn: tag };
            rerender();
        }));
    });
    host.append(fnRow);

    const levelRow = document.createElement('div');
    levelRow.className = 'wf-filter-row';
    levelRow.append(createText('span', 'LEVEL', 'wf-filter-label'));
    levelRow.append(filterPill('All', filters.level === 'all', () => { filters = { ...filters, level: 'all' }; rerender(); }));
    (Object.keys(LEVEL_TAG_LABELS) as WfLevelTag[]).forEach((tag) => {
        levelRow.append(filterPill(LEVEL_TAG_LABELS[tag], filters.level === tag, () => {
            filters = { ...filters, level: tag };
            rerender();
        }));
    });
    host.append(levelRow);

    const list = document.createElement('div');
    list.className = 'wf-annotation-list';
    const numbers = annotationNumbers(context.lens, context.verifiedText);
    const comments = commentsFor(context.lens);

    if (!comments.length) {
        list.append(createText('p', 'No annotations yet. Select a passage in the document to add the first one.', 'wf-muted-note'));
    }

    // Stale comments bypass active filters because reviewers must resolve them
    // before saving rather than accidentally hiding invalid anchors.
    const visible = [...comments]
        .filter((comment) => comment.stale || matchesFilters(comment))
        .sort((a, b) => {
            const aStale = a.stale ? 1 : 0;
            const bStale = b.stale ? 1 : 0;
            // Match the annotationNumbers comparator exactly (start, then end) so
            // numbered cards always render in ascending order.
            return aStale - bStale || a.startOffset - b.startOffset || a.endOffset - b.endOffset;
        });
    if (comments.length && !visible.length) {
        list.append(createText('p', 'No annotations match the selected filters.', 'wf-muted-note'));
    }
    visible.forEach((comment) => list.append(renderAnnotationCard(comment, numbers.get(comment.id), context, rerender)));
    host.append(list);
}

function renderAnnotationCard(
    comment: AnchoredComment,
    number: number | undefined,
    context: AnnotationContext,
    rerender: () => void
): HTMLElement {
    const card = document.createElement('article');
    card.className = 'wf-annotation-card';
    card.id = `wf-comment-${comment.id}`;
    if (comment.stale) card.classList.add('wf-annotation-card--stale');
    if (comment.id === activeCommentId) card.classList.add('is-active');
    card.addEventListener('mouseenter', () => highlightMark(comment.id, true));
    card.addEventListener('mouseleave', () => highlightMark(comment.id, false));
    card.addEventListener('focusin', () => highlightMark(comment.id, true));
    card.addEventListener('focusout', () => highlightMark(comment.id, false));

    const header = document.createElement('div');
    header.className = 'wf-annotation-header';
    if (number !== undefined) {
        const badge = document.createElement('span');
        badge.className = 'wf-annotation-number';
        badge.textContent = String(number);
        header.append(badge);
    }
    if (comment.functionTag) header.append(chip(FUNCTION_TAG_LABELS[comment.functionTag], FUNCTION_TAG_TONES[comment.functionTag]));
    if (comment.levelTag) header.append(chip(LEVEL_TAG_LABELS[comment.levelTag], 'neutral'));
    if (comment.priority) header.append(chip(PRIORITY_LABELS[comment.priority], PRIORITY_TONES[comment.priority]));
    // Staff comments carry the server-stamped author name; the generic label is a fallback.
    header.append(chip(
        comment.origin === 'model_seed' ? 'Model suggested' : (comment.authorName || 'Staff'),
        comment.origin === 'model_seed' ? 'blue' : 'neutral'
    ));
    card.append(header);

    if (comment.stale) {
        card.append(createText('p', 'The verified text changed and this comment no longer anchors. Delete it or add a new one.', 'wf-muted-note'));
    }

    const quotePreview = comment.quote.length > 140 ? `${comment.quote.slice(0, 137)}…` : comment.quote;
    card.append(createText('blockquote', quotePreview, 'wf-evidence'));

    if (editingCommentId === comment.id) {
        renderCardEditor(card, comment, context, rerender);
    } else {
        renderCardDisplay(card, comment, context, rerender);
    }
    return card;
}

function renderCardDisplay(
    card: HTMLElement,
    comment: AnchoredComment,
    context: AnnotationContext,
    rerender: () => void
): void {
    if (comment.comment) {
        const feedback = document.createElement('p');
        feedback.append(createText('span', 'Feedback: ', 'wf-annotation-label'), document.createTextNode(comment.comment));
        card.append(feedback);
    }
    if (comment.howToImprove) {
        const guidance = document.createElement('p');
        guidance.append(createText('span', 'Revision guidance: ', 'wf-annotation-label'), document.createTextNode(comment.howToImprove));
        card.append(guidance);
    }
    if (comment.courseMaterialMention || comment.courseMaterialLink) {
        const box = document.createElement('div');
        box.className = 'wf-material-box';
        const title = document.createElement('span');
        title.className = 'wf-material-title';
        title.textContent = 'SUGGESTED COURSE MATERIAL';
        if (comment.courseMaterialMention) {
            box.append(title, createText('span', `Review this material before revising: ${comment.courseMaterialMention.label}`));
        } else if (comment.courseMaterialLink) {
            const link = document.createElement('a');
            link.href = comment.courseMaterialLink;
            link.target = '_blank';
            link.rel = 'noopener';
            link.textContent = comment.courseMaterialLink;
            box.append(title, createText('span', 'Review this material before revising: '), link);
        }
        card.append(box);
    }
    const glossaryValue = comment.glossarySnapshot ?? comment.glossaryDefinition;
    if (glossaryValue) {
        const glossary = document.createElement('p');
        glossary.append(
            createText('span', `Glossary — ${glossaryValue.term}: `, 'wf-annotation-label'),
            document.createTextNode(glossaryValue.definition)
        );
        card.append(glossary);
    }

    const actions = document.createElement('div');
    actions.className = 'wf-annotation-actions';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'wf-button wf-button--quiet';
    edit.textContent = 'Edit';
    edit.addEventListener('click', () => {
        editingCommentId = comment.id;
        activeCommentId = comment.id;
        rerender();
    });
    actions.append(edit, deleteButton(comment, context, rerender));
    card.append(actions);
}

function renderCardEditor(
    card: HTMLElement,
    comment: AnchoredComment,
    context: AnnotationContext,
    rerender: () => void
): void {
    // Controls update the isolated working copy immediately and mark the parent
    // review dirty; persistence still occurs only through "Save staff revision".
    const commentText = document.createElement('textarea');
    commentText.value = comment.comment;
    commentText.rows = 3;
    commentText.required = true;
    const howToImprove = document.createElement('textarea');
    howToImprove.value = comment.howToImprove ?? '';
    howToImprove.rows = 2;
    const link = document.createElement('input');
    link.type = 'url';
    link.value = comment.courseMaterialLink ?? '';
    link.placeholder = 'https://…';
    const glossaryTerm = document.createElement('input');
    glossaryTerm.type = 'text';
    glossaryTerm.value = comment.glossarySnapshot?.term ?? comment.glossaryDefinition?.term ?? '';
    const glossaryListId = `wf-glossary-${comment.id}`;
    glossaryTerm.setAttribute('list', glossaryListId);
    const glossaryOptions = document.createElement('datalist');
    glossaryOptions.id = glossaryListId;
    const glossaryDefinition = document.createElement('textarea');
    glossaryDefinition.value = comment.glossarySnapshot?.definition ?? comment.glossaryDefinition?.definition ?? '';
    glossaryDefinition.rows = 2;
    const glossaryStatus = createText('p', '', 'wf-help-text');
    glossaryStatus.setAttribute('role', 'status');
    glossaryStatus.setAttribute('aria-live', 'polite');

    const functionSelect = tagSelect<WfFunctionTag>(FUNCTION_TAG_LABELS, comment.functionTag, 'No function');
    const levelSelect = tagSelect<WfLevelTag>(LEVEL_TAG_LABELS, comment.levelTag, 'No level');
    const prioritySelect = tagSelect<WfPriority>(PRIORITY_LABELS, comment.priority, 'No priority');

    const syncGlossary = () => {
        const term = glossaryTerm.value.trim();
        const definition = glossaryDefinition.value.trim();
        comment.glossaryDefinition = term && definition ? { term, definition } : undefined;
        if (!term || !definition) {
            comment.glossaryEntryId = undefined;
            comment.glossarySnapshot = undefined;
        }
    };
    const refreshGlossaryOptions = async (): Promise<void> => {
        const entries = await loadGlossaryEntries();
        glossaryOptions.replaceChildren();
        entries.forEach((entry) => {
            const option = document.createElement('option');
            option.value = entry.term;
            option.label = entry.definition;
            glossaryOptions.append(option);
        });
    };
    const applyGlossaryMatch = async (): Promise<void> => {
        const entries = await loadGlossaryEntries();
        const selected = entries.find((entry) => entry.term.toLocaleLowerCase() === glossaryTerm.value.trim().toLocaleLowerCase());
        if (!selected) return;
        glossaryDefinition.value = selected.definition;
        comment.glossaryEntryId = selected.id;
        comment.glossarySnapshot = glossarySnapshot(selected);
        comment.glossaryDefinition = { term: selected.term, definition: selected.definition };
        glossaryStatus.textContent = `Using glossary entry v${selected.version}.`;
        context.markDirty();
    };
    commentText.addEventListener('input', () => { comment.comment = commentText.value; context.markDirty(); });
    howToImprove.addEventListener('input', () => { comment.howToImprove = howToImprove.value.trim() || undefined; context.markDirty(); });
    link.addEventListener('input', () => { comment.courseMaterialLink = link.value.trim() || undefined; context.markDirty(); });
    glossaryTerm.addEventListener('focus', () => { void refreshGlossaryOptions(); });
    glossaryTerm.addEventListener('change', () => { void applyGlossaryMatch(); });
    [glossaryTerm, glossaryDefinition].forEach((control) => control.addEventListener('input', () => { syncGlossary(); context.markDirty(); }));
    functionSelect.addEventListener('change', () => { comment.functionTag = (functionSelect.value || undefined) as WfFunctionTag | undefined; context.markDirty(); });
    levelSelect.addEventListener('change', () => { comment.levelTag = (levelSelect.value || undefined) as WfLevelTag | undefined; context.markDirty(); });
    prioritySelect.addEventListener('change', () => { comment.priority = (prioritySelect.value || undefined) as WfPriority | undefined; context.markDirty(); });

    card.append(
        field('Feedback', commentText, 'What should the student reconsider in this passage?'),
        field('Revision guidance', howToImprove, 'Concrete direction, balanced with the guiding questions in the summary.'),
        field('Function', functionSelect),
        field('Level', levelSelect),
        field('Priority', prioritySelect),
        field('Course material link', link, 'Optional link to a specific lecture or resource.'),
        field('Glossary term', glossaryTerm),
        field('Glossary definition', glossaryDefinition)
    );
    card.append(glossaryOptions, glossaryStatus);

    const actions = document.createElement('div');
    actions.className = 'wf-annotation-actions';
    const saveGlossary = document.createElement('button');
    saveGlossary.type = 'button';
    saveGlossary.className = 'wf-button wf-button--secondary';
    saveGlossary.textContent = 'Save glossary';
    saveGlossary.addEventListener('click', async () => {
        const term = glossaryTerm.value.trim();
        const definition = glossaryDefinition.value.trim();
        if (!term || !definition) {
            glossaryStatus.textContent = 'Enter a term and definition first.';
            return;
        }
        const existing = (await loadGlossaryEntries())
            .find((entry) => entry.term.toLocaleLowerCase() === term.toLocaleLowerCase());
        const entry = existing
            ? await jsonRequest<WritingGlossaryEntry>(
                `/glossary/${encodeURIComponent(existing.id)}`,
                'PUT',
                { term, definition, expectedVersion: existing.version, confirmDefinitionChange: true }
            )
            : await jsonRequest<WritingGlossaryEntry>('/glossary', 'POST', { term, definition });
        glossaryCache = null;
        comment.glossaryEntryId = entry.id;
        comment.glossarySnapshot = glossarySnapshot(entry);
        comment.glossaryDefinition = { term: entry.term, definition: entry.definition };
        glossaryStatus.textContent = `Saved glossary entry v${entry.version}.`;
        context.markDirty();
    });
    const done = document.createElement('button');
    done.type = 'button';
    done.className = 'wf-button wf-button--primary';
    done.textContent = 'Done';
    done.addEventListener('click', () => {
        editingCommentId = null;
        rerender();
    });
    actions.append(saveGlossary, done, deleteButton(comment, context, rerender));
    card.append(actions);
}

function tagSelect<T extends string>(
    labels: Record<T, string>,
    current: T | undefined,
    unsetLabel: string
): HTMLSelectElement {
    const select = document.createElement('select');
    const unset = document.createElement('option');
    unset.value = '';
    unset.textContent = unsetLabel;
    select.append(unset);
    (Object.keys(labels) as T[]).forEach((value) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = labels[value];
        select.append(option);
    });
    select.value = current ?? '';
    return select;
}

function deleteButton(comment: AnchoredComment, context: AnnotationContext, rerender: () => void): HTMLButtonElement {
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'wf-button wf-button--danger';
    remove.textContent = 'Delete';
    remove.addEventListener('click', () => {
        void (async () => {
            // Deleting affects only the current working set. Previously saved
            // revisions remain immutable and visible in the review audit history.
            const confirmation = await showConfirmModal(
                'Delete this comment?',
                'The comment is removed from the working set. It stays in previously saved revisions.',
                'Delete comment',
                'Keep comment',
                'danger'
            );
            if (confirmation.action !== 'delete-comment') return;
            const set = commentsFor(context.lens);
            const index = set.findIndex((item) => item.id === comment.id);
            if (index >= 0) set.splice(index, 1);
            if (activeCommentId === comment.id) activeCommentId = null;
            if (editingCommentId === comment.id) editingCommentId = null;
            context.markDirty();
            rerender();
        })();
    });
    return remove;
}

function highlightMark(commentId: string, active: boolean): void {
    document.querySelectorAll<HTMLElement>(`[data-comment-id="${commentId}"]`).forEach((mark) => {
        mark.classList.toggle('is-active', active || commentId === activeCommentId);
    });
}
