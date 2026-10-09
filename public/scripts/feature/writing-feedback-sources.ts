// public/scripts/feature/writing-feedback-sources.ts
/**
 * Writing Feedback sources — the assignment material "Fill these in for me" reads
 *
 * Lists an assignment's instructions, its Canvas description when that differs, and every
 * file or paste staff added, each with a checkbox. Staff upload files or paste text here;
 * a paste keeps the clipboard's HTML so a table copied from Word or Google Docs arrives with
 * its rows and columns. Ticks are remembered per assignment while the workspace is open.
 *
 * @author: EngE-AI Team
 * @date: 2026-10-08
 * @version: 1.0.0
 * @description: Renders and manages the auto-fill source list on the rubric page.
 */

import { showConfirmModal } from '../ui/modal-overlay.js';
import { assertNotWritingFeedbackDemoMode } from './writing-feedback-demo-mode.js';
import {
    AutofillSource,
    AutofillSourcesResponse,
    chip,
    createButton,
    createText,
    jsonRequest,
    request,
    textAreaControl
} from './writing-feedback-shared.js';

/** The source list on screen, as the rubric page reads it. */
export interface SourcesPanel {
    element: HTMLElement;
    /** Ids of the ticked sources, in list order. */
    selectedIds(): string[];
    /** Whether a fill can run now: the list has loaded, something is ticked, and it fits the limit. */
    canFill(): boolean;
    /** Why a fill cannot run now, for the fill button's tooltip; empty when it can. */
    blockedReason(): string;
    /** Runs `listener` whenever the list or the ticks change. */
    onChange(listener: () => void): void;
}

/** File types the server accepts as source material. */
const ACCEPTED_FILES = '.docx,.pdf,.html,.htm,.txt,.md,.markdown';

/**
 * Sources staff have unticked, per assignment. Tracking the unticked ones rather than the
 * ticked ones means a newly added source starts ticked.
 */
const untickedByAssignment = new Map<string, Set<string>>();

function formatCount(count: number): string {
    return count.toLocaleString('en-US');
}

/**
 * renderSourcesPanel - builds the source list for one assignment and loads it.
 *
 * @param assignmentId - Assignment whose sources are listed
 * @param canEdit - Whether this staff member may add and remove sources
 * @returns The panel element and the selection the fill button reads
 */
export function renderSourcesPanel(assignmentId: string, canEdit: boolean): SourcesPanel {
    const unticked = untickedByAssignment.get(assignmentId) ?? new Set<string>();
    untickedByAssignment.set(assignmentId, unticked);
    const listeners: Array<() => void> = [];
    let sources: AutofillSource[] | undefined;
    let maxCharacters = 0;

    const section = document.createElement('section');
    section.className = 'wf-sources';
    const headingId = `wf-sources-heading-${assignmentId}`;
    section.setAttribute('aria-labelledby', headingId);
    const heading = createText('h3', 'Assignment material', 'wf-sources__heading');
    heading.id = headingId;
    const intro = createText(
        'p',
        canEdit
            ? '"Fill these in for me" reads the sources you tick. Add the files that hold your instructions or rubric, or paste them in.'
            : '"Fill these in for me" reads these sources.',
        'wf-help-text'
    );
    const list = document.createElement('ul');
    list.className = 'wf-sources__list';
    const total = createText('p', '', 'wf-sources__total');
    total.setAttribute('aria-live', 'polite');
    const status = createText('p', '', 'wf-help-text');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    section.append(heading, intro, list, total);

    const selected = (): AutofillSource[] => (sources ?? []).filter((source) => !unticked.has(source.id));
    const selectedCharacters = (): number => selected().reduce((sum, source) => sum + source.characterCount, 0);
    const notify = (): void => { listeners.forEach((listener) => listener()); };

    const blockedReason = (): string => {
        if (!sources) return 'The assignment material is still loading.';
        if (sources.length === 0) return 'Add the assignment instructions, or upload or paste the assignment material, first.';
        if (selected().length === 0) return 'Tick at least one source to fill from.';
        if (selectedCharacters() > maxCharacters) return 'The ticked sources are too long to read at once. Untick one or more.';
        return '';
    };

    const renderTotal = (): void => {
        if (!sources || sources.length === 0) {
            total.textContent = '';
            return;
        }
        const over = selectedCharacters() > maxCharacters;
        total.dataset.tone = over ? 'error' : 'info';
        total.textContent = over
            ? `Ticked: ${formatCount(selectedCharacters())} of ${formatCount(maxCharacters)} characters. That is more than one fill can read; untick a source.`
            : `Ticked: ${formatCount(selectedCharacters())} of ${formatCount(maxCharacters)} characters.`;
    };

    const renderItem = (source: AutofillSource): HTMLLIElement => {
        const item = document.createElement('li');
        item.className = 'wf-sources__item';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `wf-source-${assignmentId}-${source.id}`;
        checkbox.checked = !unticked.has(source.id);
        checkbox.disabled = !canEdit;
        checkbox.addEventListener('change', () => {
            if (checkbox.checked) unticked.delete(source.id);
            else unticked.add(source.id);
            renderTotal();
            notify();
        });
        const label = document.createElement('label');
        label.htmlFor = checkbox.id;
        label.className = 'wf-sources__label';
        label.textContent = source.label;

        const meta = document.createElement('span');
        meta.className = 'wf-sources__meta';
        meta.append(createText('span', `${formatCount(source.characterCount)} characters`));
        // Only an upload or paste can carry real table structure, so only those are labelled.
        if (source.kind === 'file' || source.kind === 'paste') {
            meta.append(source.hasTables ? chip('Tables kept', 'green') : chip('No tables', 'neutral'));
        }

        // Native disclosure: staff check what was extracted, especially a rubric table.
        const preview = document.createElement('details');
        preview.className = 'wf-sources__preview';
        const summary = createText('summary', 'Show text');
        const text = createText('pre', source.text, 'wf-sources__text');
        preview.append(summary, text);

        item.append(checkbox, label, meta);
        if (canEdit && (source.kind === 'file' || source.kind === 'paste')) {
            const remove = createButton('Remove', 'quiet', async () => {
                const confirmation = await showConfirmModal(
                    'Remove this source?',
                    'EngE-AI will stop reading it. The assignment details and rubric stay as they are.',
                    'Remove',
                    'Cancel',
                    'danger'
                );
                if (confirmation.action !== 'remove') return;
                await jsonRequest(
                    `/assignments/${encodeURIComponent(assignmentId)}/source-materials/${encodeURIComponent(source.id)}`,
                    'DELETE'
                );
                unticked.delete(source.id);
                await load();
                status.textContent = `Removed ${source.label}.`;
            });
            // Every row's button reads "Remove", so the source's name tells them apart when heard.
            remove.setAttribute('aria-label', `Remove ${source.label}`);
            item.append(remove);
        }
        item.append(preview);
        return item;
    };

    const load = async (): Promise<void> => {
        const response = await request<AutofillSourcesResponse>(`/assignments/${encodeURIComponent(assignmentId)}/autofill-sources`);
        sources = response.sources;
        maxCharacters = response.maxCharacters;
        // A tick for a source that no longer exists would only ever be stale.
        [...unticked].forEach((id) => { if (!sources!.some((source) => source.id === id)) unticked.delete(id); });
        list.replaceChildren(...sources.map(renderItem));
        if (sources.length === 0) list.append(createText('li', 'No assignment material yet.', 'wf-muted-note'));
        renderTotal();
        notify();
    };

    const addMaterial = async (body: FormData, description: string): Promise<void> => {
        assertNotWritingFeedbackDemoMode();
        status.textContent = `Reading ${description}…`;
        await request(`/assignments/${encodeURIComponent(assignmentId)}/source-materials`, { method: 'POST', body });
        await load();
        status.textContent = `Added ${description}. Check its text below, then fill.`;
    };

    if (canEdit) section.append(renderAddControls(addMaterial, status));
    section.append(status);

    void load().catch((error: unknown) => {
        sources = [];
        list.replaceChildren(createText('li', error instanceof Error ? error.message : 'The assignment material could not be loaded.', 'wf-muted-note'));
        notify();
    });

    return {
        element: section,
        selectedIds: () => selected().map((source) => source.id),
        canFill: () => blockedReason() === '',
        blockedReason,
        onChange: (listener) => { listeners.push(listener); }
    };
}

/**
 * renderAddControls - the upload control and the paste box.
 *
 * A file uploads as soon as it is chosen. A paste keeps the clipboard's HTML only while the
 * box holds exactly what was pasted into it empty; typing or a second paste drops it, because
 * the HTML would no longer match what staff see.
 */
function renderAddControls(
    addMaterial: (body: FormData, description: string) => Promise<void>,
    status: HTMLElement
): HTMLElement {
    const controls = document.createElement('div');
    controls.className = 'wf-sources__add';

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = ACCEPTED_FILES;
    fileInput.id = `wf-sources-file-${crypto.randomUUID()}`;
    const fileLabel = document.createElement('label');
    fileLabel.htmlFor = fileInput.id;
    fileLabel.textContent = 'Upload a file';
    const fileHint = createText('small', 'Word, PDF, HTML, or text. Word files keep their tables; PDFs do not, so paste a PDF\'s table if it comes out jumbled.', 'wf-help-text');
    fileInput.addEventListener('change', () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        const body = new FormData();
        body.append('file', file);
        void addMaterial(body, file.name)
            .catch((error: unknown) => { status.textContent = error instanceof Error ? error.message : 'The file could not be added.'; })
            .finally(() => { fileInput.value = ''; });
    });
    const fileField = document.createElement('div');
    fileField.className = 'wf-field';
    fileField.append(fileLabel, fileInput, fileHint);

    const pasteBox = textAreaControl('', 6);
    pasteBox.id = `wf-sources-paste-${crypto.randomUUID()}`;
    pasteBox.placeholder = 'Paste instructions or a rubric here. Tables copied from Word or Google Docs keep their rows and columns.';
    const pasteLabel = document.createElement('label');
    pasteLabel.htmlFor = pasteBox.id;
    pasteLabel.textContent = 'Or paste text';
    let pastedHtml: string | undefined;
    pasteBox.addEventListener('paste', (event: ClipboardEvent) => {
        const html = event.clipboardData?.getData('text/html');
        pastedHtml = html && !pasteBox.value.trim() ? html : undefined;
    });
    pasteBox.addEventListener('input', (event: Event) => {
        if ((event as InputEvent).inputType !== 'insertFromPaste') pastedHtml = undefined;
    });
    const addPaste = createButton('Add pasted text', 'outline', async () => {
        const text = pasteBox.value.trim();
        if (!text) throw new Error('Paste some text first.');
        const body = new FormData();
        body.append('text', text);
        if (pastedHtml) body.append('html', pastedHtml);
        await addMaterial(body, 'the pasted text');
        pasteBox.value = '';
        pastedHtml = undefined;
    });
    const pasteActions = document.createElement('div');
    pasteActions.className = 'wf-inline-field-actions';
    pasteActions.append(addPaste);
    const pasteField = document.createElement('div');
    pasteField.className = 'wf-field';
    pasteField.append(pasteLabel, pasteBox, pasteActions);

    controls.append(fileField, pasteField);
    return controls;
}
