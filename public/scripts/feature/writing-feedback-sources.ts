// public/scripts/feature/writing-feedback-sources.ts
/**
 * Writing Feedback sources — the material a fill reads, and where the marking grid comes from
 *
 * Lists an assignment's instructions, its Canvas description when that differs, and every
 * file or paste staff added, each with a checkbox. Staff upload files or paste text here;
 * a paste keeps the clipboard's HTML so a table copied from Word or Google Docs arrives with
 * its rows and columns. Below the list, staff choose where the graded marking grid comes
 * from. Ticks and the choice are remembered per assignment while the workspace is open.
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
    GradedGridState,
    RubricSourceChoice,
    createButton,
    createText,
    jsonRequest,
    refreshIcons,
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
    /** Runs `listener` whenever the list, the ticks, or the grid choice change. */
    onChange(listener: () => void): void;
    /** The grid source staff chose; the source the grid already has means keep it. */
    rubricChoice(): RubricSourceChoice;
    /** The graded grid's current source, once loaded. */
    rubricState(): GradedGridState | undefined;
    /** The label of a source, for naming it in messages. */
    materialLabel(sourceId: string): string | undefined;
    /** One line for the step header, e.g. "2 sources". */
    summary(): string;
    /** How many sources the assignment has, or undefined until the list has loaded. */
    sourceCount(): number | undefined;
}

/** A grid choice as the radio group holds it: which option, and for material, which source. */
interface GridChoice {
    kind: 'keep' | 'canvas' | 'default' | 'material';
    sourceId?: string;
    scale?: ScaleChoice;
}

/** The scales a rubric without levels can use, as the picker lists them. */
type ScaleChoice = 'suggested' | 'four_level' | 'three_level_met' | 'ubc_percent_bands';
const SCALE_OPTIONS: ReadonlyArray<{ value: ScaleChoice; label: string }> = [
    { value: 'suggested', label: 'Suggested by EngE-AI' },
    { value: 'four_level', label: 'Weak / Developing / Proficient / Exemplary' },
    { value: 'three_level_met', label: 'Not met / Partly met / Met' },
    { value: 'ubc_percent_bands', label: 'UBC percentage bands (<50% to 80–100%)' }
];

/** The grid choice staff made, per assignment, while the workspace is open. */
const rubricChoiceByAssignment = new Map<string, GridChoice>();

/** The choice that leaves a grid's current source as it is. */
function choiceForCurrent(current: GradedGridState['current']): GridChoice {
    if (current === 'canvas') return { kind: 'canvas' };
    if (current === 'builtin') return { kind: 'default' };
    return { kind: 'keep' };
}

/** The choice in the form the fill request takes. */
function toRequestChoice(choice: GridChoice): RubricSourceChoice {
    if (choice.kind === 'material') return choice.sourceId ? { sourceId: choice.sourceId, scale: choice.scale ?? 'suggested' } : 'keep';
    return choice.kind;
}

function gridSourceText(state: GradedGridState): string {
    if (state.current === 'canvas') return 'from Canvas';
    if (state.current === 'uploaded') return `from ${state.uploaded?.sourceLabel ?? 'your material'}`;
    return "EngE-AI's default";
}

/** File types the server accepts as source material. */
const ACCEPTED_FILES = '.docx,.pdf,.html,.htm,.txt,.md,.markdown';

/** Longest text one file or paste may hold. Mirrors MAX_SOURCE_MATERIAL_CHARS on the server. */
const MAX_MATERIAL_CHARACTERS = 60000;

/** The feather icon beside each kind of source. */
const SOURCE_ICONS: Record<AutofillSource['kind'], string> = {
    instructions: 'book-open',
    canvas_description: 'book-open',
    file: 'file-text',
    paste: 'clipboard'
};

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
 * @param canEdit - Whether this staff member may add and delete sources
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
    // Staff who cannot change the ticks are told what the sources are for instead.
    const heading = createText(
        'h3',
        canEdit
            ? 'Select sources to extract assignment instructions and rubric:'
            : 'Sources used to extract assignment instructions and rubric:',
        'wf-sources__heading'
    );
    heading.id = headingId;
    const list = document.createElement('ul');
    list.className = 'wf-sources__list';
    const total = createText('p', '', 'wf-sources__total');
    total.setAttribute('aria-live', 'polite');
    const status = createText('p', '', 'wf-help-text');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    section.append(heading, list);

    let gridState: GradedGridState | undefined;
    const rubricField = document.createElement('fieldset');
    rubricField.className = 'wf-sources__rubric';

    const selected = (): AutofillSource[] => (sources ?? []).filter((source) => !unticked.has(source.id));
    const selectedCharacters = (): number => selected().reduce((sum, source) => sum + source.characterCount, 0);
    const notify = (): void => { listeners.forEach((listener) => listener()); };

    const blockedReason = (): string => {
        if (!sources) return 'The assignment material is still loading.';
        if (sources.length === 0) return 'Add the assignment instructions, or upload or paste the assignment material, first.';
        if (selected().length === 0) return 'Selected at least one source to extract from.';
        if (selectedCharacters() > maxCharacters) return 'The selected sources are too long to read at once. Unselect one or more.';
        return '';
    };

    const renderTotal = (): void => {
        if (!sources || sources.length === 0) {
            total.textContent = '';
            return;
        }
        // Counts matter only once the ticked sources are too long; then each card shows its own,
        // so staff can see which to untick.
        const over = selectedCharacters() > maxCharacters;
        section.classList.toggle('wf-sources--over', over);
        total.dataset.tone = 'error';
        total.textContent = over
            ? `You have exceeded the character limit (${formatCount(selectedCharacters())} of max ${formatCount(maxCharacters)} characters). Please unselect a source.`
            : '';
    };

    const renderItem = (source: AutofillSource): HTMLLIElement => {
        const item = document.createElement('li');
        item.className = 'wf-sources__item';
        const isMaterial = source.kind === 'file' || source.kind === 'paste';
        const editable = canEdit && isMaterial;

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
        const icon = document.createElement('i');
        icon.className = 'wf-sources__icon';
        icon.setAttribute('data-feather', SOURCE_ICONS[source.kind]);
        icon.setAttribute('aria-hidden', 'true');

        const body = document.createElement('div');
        body.className = 'wf-sources__body';
        const label = document.createElement('label');
        label.htmlFor = checkbox.id;
        label.className = 'wf-sources__label';
        label.textContent = source.label;
        const meta = document.createElement('span');
        meta.className = 'wf-sources__meta';
        meta.append(createText('span', `${formatCount(source.characterCount)} characters`, 'wf-sources__chars'));
        body.append(label, meta);

        const actions = document.createElement('div');
        actions.className = 'wf-sources__actions';
        const panel = document.createElement('div');
        panel.className = 'wf-sources__panel';
        panel.id = `wf-source-panel-${assignmentId}-${source.id}`;
        panel.hidden = true;
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'wf-button wf-button--outline wf-sources__toggle';
        const toggleText = editable ? 'View or edit' : 'View text';
        toggle.textContent = toggleText;
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-controls', panel.id);
        // Every row has the same button, so the source's name tells them apart when heard.
        toggle.setAttribute('aria-label', `${toggleText}: ${source.label}`);
        const setOpen = (open: boolean): void => {
            if (open && !panel.hasChildNodes()) panel.append(editable ? renderEditor(source, () => setOpen(false)) : renderReadOnly(source));
            panel.hidden = !open;
            toggle.setAttribute('aria-expanded', String(open));
            toggle.textContent = open ? 'Close' : toggleText;
            if (open) {
                // Open at the start of the text: a textarea's caret starts after the value set on
                // it, so focusing it would otherwise scroll to the end.
                const box = panel.querySelector<HTMLTextAreaElement>('textarea');
                box?.setSelectionRange(0, 0);
                box?.focus({ preventScroll: true });
                if (box) box.scrollTop = 0;
            }
        };
        toggle.addEventListener('click', () => setOpen(panel.hidden));
        actions.append(toggle);

        if (editable) {
            const remove = createButton('Delete', 'quiet', async () => {
                const confirmation = await showConfirmModal(
                    'Delete this source?',
                    'EngE-AI will stop reading it. The assignment details and rubric stay as they are.',
                    'Delete',
                    'Cancel',
                    'danger'
                );
                if (confirmation.action !== 'delete') return;
                await jsonRequest(
                    `/assignments/${encodeURIComponent(assignmentId)}/source-materials/${encodeURIComponent(source.id)}`,
                    'DELETE'
                );
                unticked.delete(source.id);
                await load();
            });
            remove.setAttribute('aria-label', `Delete ${source.label}`);
            actions.append(remove);
        }

        const card = document.createElement('div');
        card.className = 'wf-sources__card';
        card.append(checkbox, icon, body, actions);
        item.append(card, panel);
        return item;
    };

    /** The text of a source staff cannot change here: the instructions or a Canvas description. */
    const renderReadOnly = (source: AutofillSource): HTMLElement => {
        const text = createText('pre', source.text, 'wf-sources__text');
        text.tabIndex = 0; // scrollable, so keyboard users can reach it
        text.setAttribute('aria-label', `Text of ${source.label}`);
        return text;
    };

    /** The text of a file or paste, editable, saved as a whole when staff choose Save. */
    const renderEditor = (source: AutofillSource, close: () => void): HTMLElement => {
        const editor = document.createElement('div');
        editor.className = 'wf-sources__editor';
        const box = textAreaControl(source.text, 14);
        box.className = 'wf-sources__text wf-sources__text--editable';
        box.setAttribute('aria-label', `Text of ${source.label}`);
        box.spellcheck = false;
        const hintId = `wf-source-hint-${assignmentId}-${source.id}`;
        const hint = createText(
            'p',
            'This is the text EngE-AI reads. Fix anything that came out wrong, such as a heading split across lines or a jumbled table. Tables are written one row per line, with cells separated by |.',
            'wf-help-text'
        );
        hint.id = hintId;
        box.setAttribute('aria-describedby', hintId);
        const count = createText('span', '', 'wf-sources__count');
        const renderCount = (): void => {
            // Shown only once the text is too long to save.
            const length = box.value.trim().length;
            count.dataset.tone = 'error';
            count.textContent = length > MAX_MATERIAL_CHARACTERS
                ? `${formatCount(length)} of ${formatCount(MAX_MATERIAL_CHARACTERS)} characters. Shorten the text to save it.`
                : '';
        };
        box.addEventListener('input', renderCount);
        renderCount();

        const save = createButton('Save changes', 'secondary', async () => {
            assertNotWritingFeedbackDemoMode();
            if (box.value === source.text) {
                close();
                return;
            }
            const body = new FormData();
            body.append('text', box.value);
            await request(
                `/assignments/${encodeURIComponent(assignmentId)}/source-materials/${encodeURIComponent(source.id)}`,
                { method: 'PATCH', body }
            );
            await load();
        });
        const cancel = createButton('Cancel', 'quiet', async () => {
            box.value = source.text;
            renderCount();
            close();
        });
        const row = document.createElement('div');
        row.className = 'wf-sources__editor-actions';
        row.append(save, cancel, count);
        editor.append(hint, box, row);
        return editor;
    };

    const renderRubricChoice = (): void => {
        if (!gridState) return;
        const state = gridState;
        const materials = (sources ?? []).filter((source) => source.kind === 'file' || source.kind === 'paste');
        let chosen = rubricChoiceByAssignment.get(assignmentId) ?? choiceForCurrent(state.current);
        // A chosen source that has since been removed is no choice at all.
        if (chosen.kind === 'material' && !materials.some((source) => source.id === chosen.sourceId)) {
            chosen = materials.length ? { kind: 'material', sourceId: materials[0]!.id } : choiceForCurrent(state.current);
            rubricChoiceByAssignment.set(assignmentId, chosen);
        }

        const options: Array<{ kind: GridChoice['kind']; label: string; disabled?: boolean }> = [];
        // A grid from material has no source to re-seed from here, so keeping it is offered
        // explicitly rather than by re-choosing its source.
        if (state.current === 'uploaded') options.push({ kind: 'keep', label: `Keep the current grid (${gridSourceText(state)})` });
        if (state.canvas) {
            options.push({ kind: 'canvas', label: `The Canvas rubric (${state.canvas.criteria} criteria, ${formatCount(state.canvas.points)} points)` });
        }
        options.push({
            kind: 'material',
            label: materials.length ? 'A rubric in one of my sources:' : 'A rubric in one of my sources (upload or paste the rubric above first)',
            disabled: materials.length === 0
        });
        options.push({
            kind: 'default',
            label: state.lens === 'technical'
                ? "EngE-AI's default lab rubric (the APSC 182 evaluation form)"
                : "EngE-AI's default rubric (Organization, Content, Interpersonal Positioning)"
        });

        const legend = createText(
            'legend',
            state.lens === 'technical' ? 'Which technical rubric grid should be used?' : 'Which rubric grid should be used?',
            'wf-sources__heading'
        );
        const name = `wf-rubric-source-${assignmentId}`;
        const choose = (next: GridChoice): void => {
            rubricChoiceByAssignment.set(assignmentId, next);
            notify();
        };
        const rows = options.map((option) => {
            const row = document.createElement('label');
            row.className = 'wf-sources__choice';
            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = name;
            radio.value = option.kind;
            radio.checked = option.kind === chosen.kind;
            radio.disabled = !canEdit || Boolean(option.disabled);
            row.append(radio, createText('span', option.label));
            if (option.kind !== 'material' || !materials.length) {
                radio.addEventListener('change', () => { if (radio.checked) choose({ kind: option.kind }); });
                return row;
            }
            // The dropdown sits beside its own option, and choosing from it chooses the option.
            const select = document.createElement('select');
            select.className = 'wf-sources__material-select';
            select.setAttribute('aria-label', 'Source holding the rubric');
            select.disabled = !canEdit;
            materials.forEach((source) => {
                const item = document.createElement('option');
                item.value = source.id;
                item.textContent = source.label;
                item.selected = chosen.kind === 'material' ? chosen.sourceId === source.id : source === materials[0];
                select.append(item);
            });
            // For a rubric that states no rating levels: which scale to give it.
            const scale = document.createElement('select');
            scale.className = 'wf-sources__material-select';
            scale.disabled = !canEdit;
            const scaleId = `wf-rubric-scale-${assignmentId}`;
            scale.id = scaleId;
            SCALE_OPTIONS.forEach((option) => {
                const item = document.createElement('option');
                item.value = option.value;
                item.textContent = option.label;
                item.selected = (chosen.kind === 'material' ? chosen.scale ?? 'suggested' : 'suggested') === option.value;
                scale.append(item);
            });
            const scaleLabel = document.createElement('label');
            scaleLabel.htmlFor = scaleId;
            scaleLabel.className = 'wf-sources__scale-label';
            scaleLabel.textContent = 'If it has no rating levels, use:';
            const materialChoice = (): GridChoice => ({ kind: 'material', sourceId: select.value, scale: scale.value as ScaleChoice });
            radio.addEventListener('change', () => { if (radio.checked) choose(materialChoice()); });
            [select, scale].forEach((control) => control.addEventListener('change', () => {
                radio.checked = true;
                choose(materialChoice());
            }));
            row.append(select, scaleLabel, scale);
            return row;
        });
        rubricField.replaceChildren(legend, ...rows);
    };

    const load = async (): Promise<void> => {
        const response = await request<AutofillSourcesResponse>(`/assignments/${encodeURIComponent(assignmentId)}/autofill-sources`);
        sources = response.sources;
        maxCharacters = response.maxCharacters;
        gridState = response.rubric;
        renderRubricChoice();
        notify();
        // A tick for a source that no longer exists would only ever be stale.
        [...unticked].forEach((id) => { if (!sources!.some((source) => source.id === id)) unticked.delete(id); });
        list.replaceChildren(...sources.map(renderItem));
        if (sources.length === 0) list.append(createText('li', 'No assignment material yet.', 'wf-muted-note'));
        refreshIcons();
        renderTotal();
        notify();
    };

    /**
     * Stores one file or paste and reloads the list; the new card is the confirmation. A file
     * shows its progress, since the upload starts from the picker with no button to show it
     * working; a paste's button already shows that.
     */
    const addMaterial = async (body: FormData, description: string, announce: boolean): Promise<void> => {
        assertNotWritingFeedbackDemoMode();
        status.textContent = announce ? `Reading ${description}…` : '';
        await request(`/assignments/${encodeURIComponent(assignmentId)}/source-materials`, { method: 'POST', body });
        await load();
        status.textContent = '';
    };

    if (canEdit) section.append(renderAddControls(addMaterial, status, total));
    else section.append(total);
    section.append(status, rubricField);

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
        onChange: (listener) => { listeners.push(listener); },
        rubricChoice: () => {
            if (!gridState) return 'keep';
            return toRequestChoice(rubricChoiceByAssignment.get(assignmentId) ?? choiceForCurrent(gridState.current));
        },
        materialLabel: (sourceId: string) => sources?.find((source) => source.id === sourceId)?.label,
        rubricState: () => gridState,
        sourceCount: () => sources?.length,
        summary: () => {
            if (!sources) return '';
            return `${sources.length} ${sources.length === 1 ? 'source' : 'sources'}`;
        }
    };
}

/**
 * renderAddControls - the row of add actions, with the ticked total at its end.
 *
 * "Upload a file" opens the file picker and uploads as soon as a file is chosen. "Paste text"
 * opens a paste box below the row. A paste keeps the clipboard's HTML only while the box holds
 * exactly what was pasted into it empty; typing or a second paste drops it, because the HTML
 * would no longer match what staff see.
 */
function renderAddControls(
    addMaterial: (body: FormData, description: string, announce: boolean) => Promise<void>,
    status: HTMLElement,
    total: HTMLElement
): HTMLElement {
    const controls = document.createElement('div');
    controls.className = 'wf-sources__add';

    // The picker itself stays out of sight; the button is the control staff use.
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = ACCEPTED_FILES;
    fileInput.hidden = true;
    fileInput.addEventListener('change', () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        const body = new FormData();
        body.append('file', file);
        void addMaterial(body, file.name, true)
            .catch((error: unknown) => { status.textContent = error instanceof Error ? error.message : 'The file could not be added.'; })
            .finally(() => { fileInput.value = ''; });
    });
    const upload = createButton('Upload a file', 'outline', async () => { fileInput.click(); }, false, 'upload');

    const pasteArea = document.createElement('div');
    pasteArea.className = 'wf-sources__paste';
    pasteArea.id = `wf-sources-paste-area-${crypto.randomUUID()}`;
    pasteArea.hidden = true;
    const pasteToggle = createButton('Paste text', 'outline', async () => {
        const open = pasteArea.hidden;
        pasteArea.hidden = !open;
        pasteToggle.setAttribute('aria-expanded', String(open));
        if (open) pasteBox.focus();
    }, false, 'clipboard');
    pasteToggle.setAttribute('aria-expanded', 'false');
    pasteToggle.setAttribute('aria-controls', pasteArea.id);

    const buttons = document.createElement('div');
    buttons.className = 'wf-sources__add-buttons';
    buttons.append(upload, pasteToggle, fileInput);
    const row = document.createElement('div');
    row.className = 'wf-sources__add-row';
    row.append(buttons, total);
    const fileHint = createText(
        'p',
        'Upload a Word, PDF, HTML, or text file. Word files are preferable if possible.',
        'wf-help-text'
    );

    const pasteBox = textAreaControl('', 6);
    pasteBox.setAttribute('aria-label', 'Text to add');
    pasteBox.placeholder = 'Paste assignment instructions or details here.';
    let pastedHtml: string | undefined;
    pasteBox.addEventListener('paste', (event: ClipboardEvent) => {
        const html = event.clipboardData?.getData('text/html');
        pastedHtml = html && !pasteBox.value.trim() ? html : undefined;
    });
    pasteBox.addEventListener('input', (event: Event) => {
        if ((event as InputEvent).inputType !== 'insertFromPaste') pastedHtml = undefined;
    });
    const closePaste = (): void => {
        pasteBox.value = '';
        pastedHtml = undefined;
        pasteArea.hidden = true;
        pasteToggle.setAttribute('aria-expanded', 'false');
    };
    const addPaste = createButton('Add pasted text', 'secondary', async () => {
        const text = pasteBox.value.trim();
        if (!text) throw new Error('Paste some text first.');
        const body = new FormData();
        body.append('text', text);
        if (pastedHtml) body.append('html', pastedHtml);
        await addMaterial(body, 'the pasted text', false);
        closePaste();
    });
    const cancelPaste = createButton('Cancel', 'quiet', async () => {
        closePaste();
        pasteToggle.focus();
    });
    const pasteActions = document.createElement('div');
    pasteActions.className = 'wf-inline-field-actions';
    pasteActions.append(addPaste, cancelPaste);
    pasteArea.append(pasteBox, pasteActions);

    controls.append(row, fileHint, pasteArea);
    return controls;
}
