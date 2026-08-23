// public/scripts/feature/writing-feedback-rubric.ts
/**
 * Writing Feedback Rubric — assignment details and rubric editor
 *
 * An assignment is described once and graded once or twice. The assignment
 * description (title, task, audience, purpose, requirements, outcomes, and
 * grading intent) is shared: a lab report keeps two rubric definitions, and
 * staff must never retype that description for the second one. This module
 * therefore renders one details section per page and writes its values into
 * every rubric the assignment owns on save.
 *
 * Rubric criteria and performance levels stay instructor-authored data. New
 * assignments begin with a draft; only an explicitly approved version governs
 * generation, student reports, and release. Stable ids preserve historical
 * feedback joins while labels, descriptions, order, and points remain editable
 * in later drafts.
 *
 * @author: @rdschrs
 * @date: 2026-08-23
 * @version: 3.0.0
 * @description: Owns the rubric page shell, shared assignment details, draft persistence, and approval.
 */

import { showConfirmModal } from '../ui/modal-overlay.js';
import { showSuccessToast } from '../ui/toast-notification.js';
import {
    Assignment,
    RubricCriterion,
    RubricDefinition,
    RubricLevel,
    RubricResponse,
    WfFunctionTag,
    WritingFeedbackLens,
    chip,
    confirmDiscardDirty,
    createButton,
    createIconButton,
    createText,
    element,
    field,
    formatDate,
    inputControl,
    jsonRequest,
    refreshIcons,
    request,
    setQueryState,
    setView,
    state,
    textAreaControl,
    views
} from './writing-feedback-shared.js';

const MIN_CRITERIA = 1;
const MAX_CRITERIA = 10;
const MIN_LEVELS = 2;
const MAX_LEVELS = 8;
const MAX_LAB_CONTEXT = 12000;
const RUBRIC_SLUG = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
const FUNCTION_OPTIONS: Array<{ value: WfFunctionTag; label: string }> = [
    { value: 'content', label: 'Content' },
    { value: 'interpersonal', label: 'Interpersonal' },
    { value: 'organizational', label: 'Organizational' }
];

/** The assignment description shared by every rubric the assignment owns. */
interface AssignmentDetailsInput {
    title: string;
    task: string;
    audience: string;
    purpose: string;
    constraints: string[];
    learningOutcomes: string[];
    gradingIntent: string;
}

/** Criteria and performance levels, which belong to one rubric only. */
interface RubricStructureInput {
    criteria: RubricCriterion[];
    levels: RubricLevel[];
}

/** Complete `PUT .../rubric-draft` payload for a single rubric. */
type RubricDraftInput = AssignmentDetailsInput & RubricStructureInput & { labContext?: string };

type RubricControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

/**
 * One rubric editor registered with the page.
 *
 * Saving from any editor writes the shared details into every registered
 * rubric, so each editor exposes the working copy and form the page needs to
 * rebuild that rubric's own criteria and levels.
 */
interface RubricSectionHandle {
    lens: WritingFeedbackLens;
    /** Prefix used on validation messages when the page shows more than one rubric. */
    errorLabel: string;
    form: HTMLFormElement;
    working: RubricDefinition;
    canEdit: boolean;
}

/** Page-wide state the per-rubric save action reads at click time. */
interface RubricPageContext {
    assignment: Assignment;
    detailsForm: HTMLFormElement;
    sections: RubricSectionHandle[];
    isLabReport: boolean;
}

function rubricTextValue(form: HTMLFormElement, name: string): string {
    const control = form.elements.namedItem(name) as RubricControl | null;
    return control?.value.trim() ?? '';
}

function rubricLines(form: HTMLFormElement, name: string): string[] {
    return rubricTextValue(form, name).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function namedControl<T extends RubricControl>(control: T, name: string): T {
    control.name = name;
    return control;
}

function setEditable(control: RubricControl, editable: boolean): void {
    if (control instanceof HTMLSelectElement) {
        control.disabled = !editable;
        return;
    }
    control.readOnly = !editable;
}

/**
 * bindTextControl - applies the read-only gate and change handler shared by
 * every text control on this page
 *
 * @param control - Input or textarea to wire
 * @param editable - Whether the current staff user may modify this rubric
 * @param onInput - Handler run on every keystroke; owns dirty tracking
 * @returns The same control, for inline use in field construction
 */
function bindTextControl<T extends HTMLInputElement | HTMLTextAreaElement>(
    control: T,
    editable: boolean,
    onInput: () => void
): T {
    setEditable(control, editable);
    control.addEventListener('input', onInput);
    return control;
}

function detachedRubric(source: RubricDefinition): RubricDefinition {
    return {
        ...source,
        constraints: [...source.constraints],
        learningOutcomes: [...source.learningOutcomes],
        criteria: source.criteria.map((criterion) => ({ ...criterion })),
        levels: source.levels
            .map((level) => ({ ...level }))
            .sort((left, right) => left.rank - right.rank)
            .map((level, index) => ({ ...level, rank: index + 1 }))
    };
}

function optionalFunctionTag(value: string): WfFunctionTag | undefined {
    return FUNCTION_OPTIONS.some((option) => option.value === value)
        ? value as WfFunctionTag
        : undefined;
}

/** Reads dynamic rows without validating them so add/remove/reorder preserves edits. */
function syncStructuredValues(form: HTMLFormElement, working: RubricDefinition): void {
    working.criteria = working.criteria.map((criterion, index) => {
        const functionTag = optionalFunctionTag(rubricTextValue(form, `criterion.${index}.functionTag`));
        const sflDimension = rubricTextValue(form, `criterion.${index}.sflDimension`);
        return {
            id: criterion.id,
            label: rubricTextValue(form, `criterion.${index}.label`),
            description: rubricTextValue(form, `criterion.${index}.description`),
            ...(functionTag ? { functionTag } : {}),
            ...(sflDimension ? { sflDimension } : {}),
            // Points and per-level bands have no control in this shell. Carry them
            // through untouched so saving never silently discards an authored grid.
            ...(criterion.points !== undefined ? { points: criterion.points } : {}),
            ...(criterion.cells ? { cells: criterion.cells } : {})
        };
    });
    working.levels = working.levels.map((level, index) => {
        const rawPoints = rubricTextValue(form, `level.${index}.points`);
        return {
            id: level.id,
            label: rubricTextValue(form, `level.${index}.label`),
            description: rubricTextValue(form, `level.${index}.description`),
            rank: index + 1,
            ...(rawPoints ? { points: Number(rawPoints) } : {})
        };
    });
}

function validateIds(values: Array<{ id: string }>, noun: string): void {
    if (values.some((value) => !RUBRIC_SLUG.test(value.id))) {
        throw new Error(`${noun} names are malformed. Reload the page and try again.`);
    }
    if (new Set(values.map((value) => value.id)).size !== values.length) {
        throw new Error(`${noun} names must be unique.`);
    }
}

/**
 * collectAssignmentDetails - validates the one shared assignment description
 *
 * @param form - The assignment-details form rendered once per page
 * @returns Description values written into every rubric this assignment owns
 * @throws Error carrying a message written for staff, shown in the validation summary
 */
function collectAssignmentDetails(form: HTMLFormElement): AssignmentDetailsInput {
    const required = ['title', 'task', 'audience', 'purpose', 'gradingIntent'];
    if (required.some((name) => !rubricTextValue(form, name))) {
        throw new Error('Fill in the title, task, audience, purpose, and how to grade.');
    }
    const constraints = rubricLines(form, 'constraints');
    const learningOutcomes = rubricLines(form, 'learningOutcomes');
    if (!constraints.length || !learningOutcomes.length) {
        throw new Error('Add at least one requirement and one learning outcome.');
    }
    return {
        title: rubricTextValue(form, 'title'),
        task: rubricTextValue(form, 'task'),
        audience: rubricTextValue(form, 'audience'),
        purpose: rubricTextValue(form, 'purpose'),
        constraints,
        learningOutcomes,
        gradingIntent: rubricTextValue(form, 'gradingIntent'),
    };
}

/**
 * collectRubricStructure - validates one rubric's criteria and performance levels
 *
 * @param form - Editor form owning the dynamic criterion and level rows
 * @param working - Working copy kept in sync with those rows
 * @param errorLabel - Rubric name prefixed to messages when the page shows two rubrics
 * @returns Criteria and levels ready to send with the shared assignment details
 * @throws Error carrying a staff-facing message
 */
function collectRubricStructure(
    form: HTMLFormElement,
    working: RubricDefinition,
    errorLabel: string
): RubricStructureInput {
    const prefix = errorLabel ? `${errorLabel}: ` : '';
    const fail = (message: string): never => { throw new Error(`${prefix}${message}`); };

    syncStructuredValues(form, working);
    if (working.criteria.length < MIN_CRITERIA || working.criteria.length > MAX_CRITERIA) {
        fail(`Use between ${MIN_CRITERIA} and ${MAX_CRITERIA} criteria.`);
    }
    if (working.levels.length < MIN_LEVELS || working.levels.length > MAX_LEVELS) {
        fail(`Use between ${MIN_LEVELS} and ${MAX_LEVELS} performance levels.`);
    }
    try {
        validateIds(working.criteria, 'Criterion');
        validateIds(working.levels, 'Performance-level');
    } catch (error) {
        fail(error instanceof Error ? error.message : 'Review the rubric.');
    }
    if (working.criteria.some((criterion) => !criterion.label || !criterion.description)) {
        fail('Every criterion needs a label and a description.');
    }
    if (working.levels.some((level) => !level.label || !level.description)) {
        fail('Every performance level needs a label and a description.');
    }

    const pointsCount = working.levels.filter((level) => level.points !== undefined).length;
    if (pointsCount > 0 && pointsCount !== working.levels.length) {
        fail('Enter points for every performance level, or leave them all blank.');
    }
    if (working.levels.some((level) => level.points !== undefined
        && (!Number.isFinite(level.points) || level.points < 0 || level.points > 1000))) {
        fail('Points must be numbers from 0 to 1000.');
    }

    return {
        criteria: working.criteria.map((criterion) => ({ ...criterion })),
        levels: working.levels.map((level, index) => ({ ...level, rank: index + 1 }))
    };
}

function nextAvailableSlug(prefix: string, existing: string[]): string {
    let suffix = existing.length + 1;
    let candidate = `${prefix}_${suffix}`;
    while (existing.includes(candidate)) {
        suffix += 1;
        candidate = `${prefix}_${suffix}`;
    }
    return candidate;
}

function functionSelect(value?: WfFunctionTag): HTMLSelectElement {
    const select = document.createElement('select');
    const unset = document.createElement('option');
    unset.value = '';
    unset.textContent = 'No function selected';
    select.append(unset);
    FUNCTION_OPTIONS.forEach((entry) => {
        const option = document.createElement('option');
        option.value = entry.value;
        option.textContent = entry.label;
        option.selected = entry.value === value;
        select.append(option);
    });
    return select;
}

/**
 * approvalStateLabel - the one-line approval state shown for a rubric
 *
 * @param data - Rubric response for one rubric
 * @returns Either the active approved version or the pre-approval draft state
 */
function approvalStateLabel(data: RubricResponse): string {
    return data.approved ? `Approved v${data.approved.version}` : 'Draft · not yet approved';
}

/**
 * approvalStateChip - approval state rendered as a compact status chip
 *
 * @param data - Rubric response for one rubric
 * @returns Detached chip element
 */
function approvalStateChip(data: RubricResponse): HTMLElement {
    return chip(approvalStateLabel(data), data.approved ? 'green' : 'neutral');
}

/**
 * rubricSizeSummary - the "N criteria · M points" line shown in a rubric header
 *
 * Criterion points win when the grid carries them; otherwise every criterion is
 * assumed to top out at the highest performance level, which is what a rubric
 * with points on the levels alone means.
 *
 * @param working - Live working copy for one rubric
 * @returns Header summary text; the points half is dropped for an ungraded rubric
 */
function rubricSizeSummary(working: RubricDefinition): string {
    const count = working.criteria.length;
    const countText = `${count} ${count === 1 ? 'criterion' : 'criteria'}`;
    const levelPoints = working.levels
        .map((level) => level.points)
        .filter((points): points is number => typeof points === 'number' && Number.isFinite(points));
    const topLevel = levelPoints.length === working.levels.length && levelPoints.length
        ? Math.max(...levelPoints)
        : undefined;
    const total = working.criteria.reduce((sum, criterion) => sum + (criterion.points ?? topLevel ?? 0), 0);
    if (total <= 0) return countText;
    return `${countText} · ${Number(total.toFixed(2))} points`;
}

/**
 * openRubricPage - opens the rubric editor for one writing assignment
 *
 * @param assignmentId - Internal assignment identifier scoped to the active course
 * @throws Error when the assignment or rubric response cannot be loaded
 */
export async function openRubricPage(assignmentId: string): Promise<void> {
    if (!(await confirmDiscardDirty('setup')) || !(await confirmDiscardDirty('review'))) return;
    state.panelDirty = false;
    state.reviewDirty = false;
    setQueryState({ wfView: 'rubric', wfAssignment: assignmentId, wfSubmission: null });
    setView('rubric');
    const root = element<HTMLDivElement>('wf-view-rubric');
    root.replaceChildren(createText('p', 'Loading rubric…', 'wf-muted-note'));
    if (!state.assignments.length) state.assignments = await request<Assignment[]>('/assignments');
    const assignment = state.assignments.find((item) => item.id === assignmentId);
    if (!assignment) throw new Error('Writing assignment not found');
    const linguisticData = await request<RubricResponse>(`/assignments/${encodeURIComponent(assignmentId)}/rubric?lens=linguistic`);
    const technicalData = assignment.isLabReport
        ? await request<RubricResponse>(`/assignments/${encodeURIComponent(assignmentId)}/rubric?lens=technical`)
        : undefined;
    renderRubricPage(root, assignment, linguisticData, technicalData);
}

/**
 * renderRubricPage - renders the assignment header, the shared assignment
 * details, and one collapsible rubric editor per rubric the assignment owns
 *
 * @param root - Detached rubric view container to populate
 * @param assignment - Parent assignment supplying title, instructions, and lab-report state
 * @param linguisticData - Always-present writing rubric response
 * @param technicalData - Technical rubric response, present only for a lab-report assignment
 * @throws Error when the writing rubric has neither a draft nor an approved version
 */
function renderRubricPage(
    root: HTMLDivElement,
    assignment: Assignment,
    linguisticData: RubricResponse,
    technicalData?: RubricResponse
): void {
    root.replaceChildren();
    const isLabReport = Boolean(technicalData);

    const back = createButton('Back to assignments', 'quiet', async () => {
        if (!(await confirmDiscardDirty('setup'))) return;
        state.panelDirty = false;
        await views.showLanding();
    });
    back.classList.add('wf-back-button');
    root.append(back);

    const header = document.createElement('header');
    const heading = createText('h2', 'Assignment Rubric and Details', 'wf-section-title');
    const meta = document.createElement('p');
    meta.className = 'wf-assignment-meta';
    const canEditAny = linguisticData.permissions.canEdit;
    meta.append(
        createText('strong', assignment.title),
        // The writing rubric's approval state belongs beside the assignment title;
        // a lab report's second rubric carries its own state in its section header.
        approvalStateChip(linguisticData),
        createText('span', `Created ${formatDate(assignment.createdAt)}`),
        createText('span', assignment.dueAt ? `Deadline ${formatDate(assignment.dueAt, true)}` : 'No deadline'),
        chip(canEditAny ? 'Editable' : 'Read-only', canEditAny ? 'green' : 'neutral')
    );
    header.append(heading, meta);
    root.append(header);

    const instructions = document.createElement('details');
    instructions.className = 'wf-assignment-instructions';
    const instructionsSummary = document.createElement('summary');
    instructionsSummary.textContent = 'Assignment instructions';
    instructions.append(
        instructionsSummary,
        createText(
            'div',
            assignment.instructions || 'No assignment instructions were provided. Describe the task in the assignment details below.',
            assignment.instructions ? 'wf-assignment-instructions__text' : 'wf-muted-note'
        )
    );
    root.append(instructions);

    const writingSource = linguisticData.draft ?? linguisticData.approved;
    if (!writingSource) throw new Error('This assignment does not have a rubric draft or approved rubric.');
    const technicalSource = technicalData?.draft ?? technicalData?.approved;

    const clearValidation = (): void => {
        root.querySelectorAll<HTMLElement>('.wf-validation-summary').forEach((node) => { node.hidden = true; });
    };

    const detailsForm = renderAssignmentDetails(root, writingSource, {
        canEdit: linguisticData.permissions.canEdit,
        isLabReport,
        labContext: technicalSource?.labContext ?? '',
        onInput: () => {
            if (linguisticData.permissions.canEdit) state.panelDirty = true;
            clearValidation();
        }
    });

    const context: RubricPageContext = { assignment, detailsForm, sections: [], isLabReport };

    root.append(renderRubricSection(context, linguisticData, 'linguistic', {
        heading: isLabReport ? '2 · Writing rubric' : 'Rubric',
        errorLabel: isLabReport ? 'Writing rubric' : '',
        showState: false
    }));

    if (technicalData) {
        // A lab report can lose its only technical rubric (e.g. its draft was
        // deleted directly via the API before ever being approved). Offer a
        // re-seed action instead of throwing out of renderRubricSection.
        if (!technicalData.draft && !technicalData.approved) {
            root.append(renderMissingTechnicalRubric(assignment));
        } else {
            root.append(renderRubricSection(context, technicalData, 'technical', {
                heading: 'Technical rubric',
                errorLabel: 'Technical rubric',
                showState: true
            }));
        }
    }
}

/** Rendering options that differ between an assignment's first and second rubric. */
interface RubricSectionOptions {
    /** Visible section heading; carries a step number only when two rubrics exist. */
    heading: string;
    /** Rubric name prefixed to this rubric's validation messages, or '' when it is the only one. */
    errorLabel: string;
    /** Whether this section header shows its own approval state. */
    showState: boolean;
}

/** Configuration for the single shared assignment-details section. */
interface AssignmentDetailsOptions {
    canEdit: boolean;
    isLabReport: boolean;
    /** Current lab handout text, which lives on the technical rubric only. */
    labContext: string;
    onInput: () => void;
}

/**
 * renderAssignmentDetails - renders the one assignment description the page owns
 *
 * A lab report keeps two rubric definitions that repeat the same description.
 * Staff describe the assignment once here; {@link saveAssignmentRubrics} writes
 * these values into every rubric on save. The lab handout is edited here too
 * but is sent only with the technical rubric, whose approval gates what handout
 * text can reach the model.
 *
 * @param container - Page container the section is appended to
 * @param draft - Rubric supplying the current description values
 * @param options - Edit permission, lab-report state, handout text, and the dirty handler
 * @returns The details form, read on save by every rubric editor on the page
 */
function renderAssignmentDetails(
    container: HTMLElement,
    draft: RubricDefinition,
    options: AssignmentDetailsOptions
): HTMLFormElement {
    const section = document.createElement('section');
    section.className = 'wf-rubric-details';

    const headingRow = document.createElement('div');
    headingRow.className = 'wf-rubric-heading-row';
    headingRow.append(createText(
        'h2',
        options.isLabReport ? '1 · Assignment details' : 'Assignment details',
        'wf-section-title'
    ));
    if (options.isLabReport) {
        headingRow.append(createText('span', 'used by both rubrics', 'wf-quiet-note'));
    }

    const form = document.createElement('form');
    form.className = 'wf-rubric-details-form';
    const grid = document.createElement('div');
    grid.className = 'wf-form-grid';

    const constraints = namedControl(textAreaControl(draft.constraints.join('\n'), 5), 'constraints');
    constraints.placeholder = 'One per line';
    const learningOutcomes = namedControl(textAreaControl(draft.learningOutcomes.join('\n'), 5), 'learningOutcomes');
    learningOutcomes.placeholder = 'One per line';

    const entries: Array<{ label: string; control: HTMLInputElement | HTMLTextAreaElement; wide?: boolean }> = [
        { label: 'Title', control: namedControl(inputControl(draft.title), 'title'), wide: true },
        { label: 'Task', control: namedControl(textAreaControl(draft.task, 4), 'task'), wide: true },
        { label: 'Audience', control: namedControl(textAreaControl(draft.audience, 3), 'audience') },
        { label: 'Purpose', control: namedControl(textAreaControl(draft.purpose, 3), 'purpose') },
        { label: 'Requirements', control: constraints },
        { label: 'Learning outcomes', control: learningOutcomes },
        { label: 'How to grade', control: namedControl(textAreaControl(draft.gradingIntent, 4), 'gradingIntent'), wide: true }
    ];
    entries.forEach((entry) => {
        bindTextControl(entry.control, options.canEdit, options.onInput);
        grid.append(field(entry.label, entry.control, undefined, entry.wide));
    });

    // The lab handout is versioned and approval-gated on the technical rubric,
    // so it is edited here but never sent with the writing rubric.
    if (options.isLabReport) {
        const labContext = namedControl(textAreaControl(options.labContext, 10), 'labContext');
        labContext.maxLength = MAX_LAB_CONTEXT;
        labContext.placeholder = 'Paste the lab handout: what students were asked to do, the steps, and any expected observations.';
        bindTextControl(labContext, options.canEdit, options.onInput);

        const handoutFile = inputControl('', 'file');
        handoutFile.accept = '.txt,.docx,.pdf,.html,.htm';
        handoutFile.setAttribute('aria-label', 'Lab handout file');
        const extractionState = createText('p', '', 'wf-help-text');
        extractionState.setAttribute('role', 'status');
        extractionState.setAttribute('aria-live', 'polite');

        const extractHandout = async (): Promise<void> => {
            const selectedFile = handoutFile.files?.[0];
            if (!selectedFile) throw new Error('Choose a lab handout file first.');
            const payload = new FormData();
            payload.append('file', selectedFile);
            // Reuses the existing local extractor; nothing here enters the RAG pipeline.
            const extracted = await request<{ text: string }>('/instructions/extract', { method: 'POST', body: payload });
            labContext.value = extracted.text.slice(0, MAX_LAB_CONTEXT);
            options.onInput();
            extractionState.textContent = `Extracted ${selectedFile.name}. Review and trim the text before saving.`;
            labContext.focus();
        };

        const handoutField = field('Lab handout', labContext);
        handoutField.classList.add('wf-field--wide');
        if (options.canEdit) {
            const handoutActions = document.createElement('div');
            handoutActions.className = 'wf-inline-field-actions';
            handoutActions.append(handoutFile, createButton('Extract from file', 'secondary', extractHandout));
            handoutField.append(handoutActions, extractionState);
        }
        grid.append(handoutField);
    }

    form.append(grid);
    section.append(headingRow, form);
    container.append(section);
    return form;
}

/**
 * saveAssignmentRubrics - persists the shared description into every rubric
 *
 * The description is validated once, then each editable rubric is written with
 * its own criteria and levels through the existing per-rubric draft route. The
 * lab handout accompanies the technical request only, keeping its approval gate
 * on the rubric that consumes it.
 *
 * @param context - Page context holding the details form and registered editors
 * @throws Error carrying the first staff-facing validation or transport failure
 */
async function saveAssignmentRubrics(context: RubricPageContext): Promise<void> {
    const details = collectAssignmentDetails(context.detailsForm);
    const labContext = rubricTextValue(context.detailsForm, 'labContext').slice(0, MAX_LAB_CONTEXT) || undefined;
    for (const section of context.sections) {
        if (!section.canEdit) continue;
        const structure = collectRubricStructure(section.form, section.working, section.errorLabel);
        const input: RubricDraftInput = {
            ...details,
            ...structure,
            ...(section.lens === 'technical' ? { labContext } : {})
        };
        await jsonRequest<Assignment>(
            `/assignments/${encodeURIComponent(context.assignment.id)}/rubric-draft${section.lens === 'technical' ? '?lens=technical' : ''}`,
            'PUT',
            input
        );
    }
}

/**
 * renderMissingTechnicalRubric - placeholder shown when a lab-report assignment
 * has neither a draft nor an approved technical rubric (the only reachable
 * empty state, since the writing template always seeds one)
 *
 * @param assignment - Parent assignment; re-seeding reuses the same
 * `PATCH .../lab-report` route the "Lab report" toggle already calls
 * @returns Detached callout with a re-seed action for staff who can manage the rubric
 */
function renderMissingTechnicalRubric(assignment: Assignment): HTMLElement {
    const status = document.createElement('div');
    status.className = 'wf-callout wf-callout--warning';
    const canManageRubric = Boolean(state.workspace?.permissions.canManageRubric);
    status.append(
        createText('strong', 'No technical rubric'),
        createText(
            'span',
            'This lab report has no technical rubric draft or approved version. Re-seed it to start editing.'
        )
    );
    if (canManageRubric) {
        status.append(createButton('Re-seed technical rubric', 'secondary', async () => {
            const updated = await jsonRequest<Assignment>(
                `/assignments/${encodeURIComponent(assignment.id)}/lab-report`,
                'PATCH',
                { isLabReport: true }
            );
            Object.assign(assignment, updated);
            showSuccessToast('Technical rubric seeded.');
            await openRubricPage(assignment.id);
        }));
    }
    return status;
}

/**
 * renderRubricSection - builds one collapsible rubric editor
 *
 * The section holds only what belongs to this rubric — its criteria, its
 * performance levels, and its own save, approve, and discard actions. The
 * assignment description is rendered once above every section and written into
 * this rubric on save.
 *
 * @param context - Page context; the section registers itself so any save writes every rubric
 * @param data - Rubric response for this rubric
 * @param lens - Which rubric this is; `?lens=technical` is appended to every mutation route
 * @param options - Heading, validation-message prefix, and whether to show its own approval state
 * @returns Detached collapsible section ready for insertion into the rubric view
 * @throws Error when the rubric has neither a draft nor an approved version
 */
function renderRubricSection(
    context: RubricPageContext,
    data: RubricResponse,
    lens: WritingFeedbackLens,
    options: RubricSectionOptions
): HTMLElement {
    const assignment = context.assignment;
    const source = data.draft ?? data.approved;
    if (!source) throw new Error('This assignment does not have a rubric draft or approved rubric.');
    const working = detachedRubric(source);
    const canEdit = data.permissions.canEdit;
    const structureLocked = Boolean(data.approved || data.history.some((rubric) => rubric.status === 'approved'));
    const lensQuery = lens === 'technical' ? '?lens=technical' : '';

    const section = document.createElement('details');
    section.className = 'wf-rubric-section';
    section.open = true;
    const summary = document.createElement('summary');
    summary.className = 'wf-rubric-section__summary';
    const summaryTitle = createText('span', options.heading, 'wf-rubric-section__title');
    const summaryMeta = createText('span', rubricSizeSummary(working), 'wf-rubric-section__meta');
    summary.append(summaryTitle, summaryMeta);
    if (options.showState) summary.append(approvalStateChip(data));
    section.append(summary);

    const layout = document.createElement('div');
    layout.className = 'wf-rubric-layout';
    const editor = document.createElement('div');
    editor.className = 'wf-rubric-editor';

    const form = document.createElement('form');
    const validation = document.createElement('div');
    validation.className = 'wf-validation-summary';
    validation.hidden = true;
    validation.setAttribute('role', 'alert');
    validation.tabIndex = -1;
    const announcer = createText('div', '', 'wf-visually-hidden');
    announcer.setAttribute('role', 'status');
    announcer.setAttribute('aria-live', 'polite');
    announcer.setAttribute('aria-atomic', 'true');
    form.append(validation, announcer);

    const announce = (message: string): void => {
        announcer.textContent = '';
        window.requestAnimationFrame(() => { announcer.textContent = message; });
    };
    const updateSummary = (): void => { summaryMeta.textContent = rubricSizeSummary(working); };
    const markDirty = (): void => {
        if (canEdit) state.panelDirty = true;
        validation.hidden = true;
        updateSummary();
    };

    const criteriaFieldset = document.createElement('fieldset');
    criteriaFieldset.className = 'wf-fieldset';
    criteriaFieldset.append(
        createText('legend', 'Criteria'),
        createText(
            'p',
            structureLocked
                ? 'Criteria are fixed after the first approval so released feedback stays readable. Labels and descriptions remain editable.'
                : `Use ${MIN_CRITERIA} to ${MAX_CRITERIA} criteria.`,
            'wf-help-text'
        )
    );
    const criteriaTools = document.createElement('div');
    criteriaTools.className = 'wf-rubric-tools';
    const criteriaGrid = document.createElement('div');
    criteriaGrid.className = 'wf-rubric-grid';
    criteriaFieldset.append(criteriaTools, criteriaGrid);

    const levelsFieldset = document.createElement('fieldset');
    levelsFieldset.className = 'wf-fieldset';
    levelsFieldset.append(
        createText('legend', 'Performance levels'),
        createText(
            'p',
            `Use ${MIN_LEVELS} to ${MAX_LEVELS} ordered levels. Enter points for every level, or leave them all blank.`,
            'wf-help-text'
        )
    );
    const levelsTools = document.createElement('div');
    levelsTools.className = 'wf-rubric-tools';
    const levelsList = document.createElement('div');
    levelsList.className = 'wf-level-list';
    levelsFieldset.append(levelsTools, levelsList);

    // Single mount point for this rubric's grid. The split criteria/levels
    // fieldsets live here until one grid replaces both.
    const gridMount = document.createElement('div');
    gridMount.className = 'wf-rubric-grid-mount';
    gridMount.dataset.rubricGrid = lens;
    gridMount.append(criteriaFieldset, levelsFieldset);
    form.append(gridMount);

    const focusDynamicRow = (kind: 'criterion' | 'level', index: number): void => {
        window.requestAnimationFrame(() => {
            const row = form.querySelector<HTMLElement>(`[data-${kind}-index="${index}"]`);
            row?.querySelector<HTMLInputElement>('input')?.focus();
        });
    };

    const renderCriteria = (): void => {
        criteriaGrid.replaceChildren();
        criteriaTools.replaceChildren();
        if (canEdit && !structureLocked) {
            const addCriterion = createButton(
                'Add criterion',
                'secondary',
                async () => {
                    syncStructuredValues(form, working);
                    const id = nextAvailableSlug('criterion', working.criteria.map((criterion) => criterion.id));
                    working.criteria.push({ id, label: 'New criterion', description: '' });
                    renderCriteria();
                    state.panelDirty = true;
                    updateSummary();
                    announce(`Criterion added. ${working.criteria.length} criteria total.`);
                    focusDynamicRow('criterion', working.criteria.length - 1);
                },
                working.criteria.length >= MAX_CRITERIA
            );
            const availableLibrary = (data.library ?? []).filter(
                (candidate) => !working.criteria.some((criterion) => criterion.id === candidate.id)
            );
            const librarySelect = document.createElement('select');
            librarySelect.className = 'wf-rubric-library-select';
            librarySelect.setAttribute('aria-label', 'Criterion library');
            const placeholder = document.createElement('option');
            placeholder.value = '';
            placeholder.textContent = availableLibrary.length ? 'Choose a library criterion' : 'No additional library criteria';
            librarySelect.append(placeholder);
            availableLibrary.forEach((candidate) => {
                const option = document.createElement('option');
                option.value = candidate.id;
                option.textContent = candidate.label;
                librarySelect.append(option);
            });
            librarySelect.disabled = !availableLibrary.length || working.criteria.length >= MAX_CRITERIA;
            const addFromLibrary = createButton(
                'Add from library',
                'secondary',
                async () => {
                    const candidate = availableLibrary.find((entry) => entry.id === librarySelect.value);
                    if (!candidate) {
                        librarySelect.focus();
                        return;
                    }
                    syncStructuredValues(form, working);
                    working.criteria.push({ ...candidate });
                    renderCriteria();
                    state.panelDirty = true;
                    updateSummary();
                    announce(`${candidate.label} added from the criterion library. Position ${working.criteria.length} of ${working.criteria.length}.`);
                    focusDynamicRow('criterion', working.criteria.length - 1);
                },
                true
            );
            librarySelect.addEventListener('change', () => {
                addFromLibrary.disabled = librarySelect.disabled || !librarySelect.value;
            });
            criteriaTools.append(addCriterion, librarySelect, addFromLibrary);
        }

        working.criteria.forEach((criterion, index) => {
            const card = document.createElement('article');
            card.className = 'wf-rubric-card';
            card.dataset.criterionIndex = String(index);
            const cardHeader = document.createElement('div');
            cardHeader.className = 'wf-rubric-item-header';
            cardHeader.append(createText('h3', `Criterion ${index + 1}`));
            if (canEdit && !structureLocked) {
                const remove = createIconButton('trash-2', `Remove criterion ${criterion.label || `${index + 1}`}`, 'danger', async () => {
                    if (working.criteria.length <= MIN_CRITERIA) {
                        announce('At least one criterion is required.');
                        return;
                    }
                    const confirmation = await showConfirmModal(
                        'Remove this criterion?',
                        `Remove "${criterion.label || `Criterion ${index + 1}`}" from this rubric draft?`,
                        'Remove criterion',
                        'Keep criterion',
                        'danger'
                    );
                    if (confirmation.action !== 'remove-criterion') return;
                    syncStructuredValues(form, working);
                    const removed = working.criteria.splice(index, 1)[0];
                    renderCriteria();
                    state.panelDirty = true;
                    updateSummary();
                    announce(`${removed.label || 'Criterion'} removed. ${working.criteria.length} criteria remain.`);
                    focusDynamicRow('criterion', Math.min(index, working.criteria.length - 1));
                });
                remove.disabled = working.criteria.length <= MIN_CRITERIA;
                cardHeader.append(remove);
            }

            const label = namedControl(inputControl(criterion.label), `criterion.${index}.label`);
            label.maxLength = 80;
            bindTextControl(label, canEdit, () => { criterion.label = label.value; markDirty(); });
            const description = namedControl(textAreaControl(criterion.description, 4), `criterion.${index}.description`);
            bindTextControl(description, canEdit, () => { criterion.description = description.value; markDirty(); });
            const functionTag = namedControl(functionSelect(criterion.functionTag), `criterion.${index}.functionTag`);
            setEditable(functionTag, canEdit);
            functionTag.addEventListener('change', () => {
                criterion.functionTag = optionalFunctionTag(functionTag.value);
                markDirty();
            });
            const focus = namedControl(textAreaControl(criterion.sflDimension ?? '', 3), `criterion.${index}.sflDimension`);
            bindTextControl(focus, canEdit, () => {
                criterion.sflDimension = focus.value.trim() || undefined;
                markDirty();
            });
            const fields = document.createElement('div');
            fields.className = 'wf-rubric-card-fields';
            fields.append(
                field('Label', label),
                field('Description', description, undefined, true),
                field('Academic Writing Matrix function (optional)', functionTag),
                field('Linguistic focus (optional)', focus)
            );
            card.append(cardHeader, fields);
            criteriaGrid.append(card);
        });
        refreshIcons();
    };

    const renderLevels = (): void => {
        levelsList.replaceChildren();
        levelsTools.replaceChildren();
        if (canEdit && !structureLocked) {
            levelsTools.append(createButton(
                'Add performance level',
                'secondary',
                async () => {
                    syncStructuredValues(form, working);
                    const id = nextAvailableSlug('level', working.levels.map((level) => level.id));
                    working.levels.push({ id, label: 'New level', description: '', rank: working.levels.length + 1 });
                    renderLevels();
                    state.panelDirty = true;
                    updateSummary();
                    announce(`Performance level added at position ${working.levels.length} of ${working.levels.length}.`);
                    focusDynamicRow('level', working.levels.length - 1);
                },
                working.levels.length >= MAX_LEVELS
            ));
        }

        working.levels.forEach((level, index) => {
            const row = document.createElement('article');
            row.className = 'wf-level-row';
            row.dataset.levelIndex = String(index);
            const rowHeader = document.createElement('div');
            rowHeader.className = 'wf-rubric-item-header wf-level-row__header';
            rowHeader.append(createText('h3', `Level ${index + 1} of ${working.levels.length}`));
            if (canEdit) {
                const controls = document.createElement('div');
                controls.className = 'wf-reorder-controls';
                const moveLevel = async (direction: -1 | 1): Promise<void> => {
                    const target = index + direction;
                    if (target < 0 || target >= working.levels.length) return;
                    syncStructuredValues(form, working);
                    const [moved] = working.levels.splice(index, 1);
                    working.levels.splice(target, 0, moved);
                    working.levels.forEach((entry, rankIndex) => { entry.rank = rankIndex + 1; });
                    renderLevels();
                    state.panelDirty = true;
                    updateSummary();
                    announce(`${moved.label || 'Level'} moved to position ${target + 1} of ${working.levels.length}.`);
                    focusDynamicRow('level', target);
                };
                const up = createIconButton('arrow-up', `Move ${level.label || `level ${index + 1}`} up`, 'neutral', async () => moveLevel(-1));
                up.disabled = index === 0;
                const down = createIconButton('arrow-down', `Move ${level.label || `level ${index + 1}`} down`, 'neutral', async () => moveLevel(1));
                down.disabled = index === working.levels.length - 1;
                controls.append(up, down);
                if (!structureLocked) {
                    const remove = createIconButton('trash-2', `Remove performance level ${level.label || `${index + 1}`}`, 'danger', async () => {
                        if (working.levels.length <= MIN_LEVELS) {
                            announce(`At least ${MIN_LEVELS} performance levels are required.`);
                            return;
                        }
                        const confirmation = await showConfirmModal(
                            'Remove this performance level?',
                            `Remove "${level.label || `Level ${index + 1}`}" from this rubric draft?`,
                            'Remove level',
                            'Keep level',
                            'danger'
                        );
                        if (confirmation.action !== 'remove-level') return;
                        syncStructuredValues(form, working);
                        const removed = working.levels.splice(index, 1)[0];
                        working.levels.forEach((entry, rankIndex) => { entry.rank = rankIndex + 1; });
                        renderLevels();
                        state.panelDirty = true;
                        updateSummary();
                        announce(`${removed.label || 'Level'} removed. ${working.levels.length} performance levels remain.`);
                        focusDynamicRow('level', Math.min(index, working.levels.length - 1));
                    });
                    remove.disabled = working.levels.length <= MIN_LEVELS;
                    controls.append(remove);
                }
                rowHeader.append(controls);
            }

            const label = namedControl(inputControl(level.label), `level.${index}.label`);
            label.maxLength = 60;
            bindTextControl(label, canEdit, () => { level.label = label.value; markDirty(); });
            const description = namedControl(textAreaControl(level.description, 3), `level.${index}.description`);
            bindTextControl(description, canEdit, () => { level.description = description.value; markDirty(); });
            const points = namedControl(inputControl(level.points === undefined ? '' : String(level.points), 'number'), `level.${index}.points`);
            points.min = '0';
            points.max = '1000';
            points.step = '0.01';
            bindTextControl(points, canEdit, () => {
                level.points = points.value.trim() ? Number(points.value) : undefined;
                markDirty();
            });
            row.append(
                rowHeader,
                field('Label', label),
                field('Description', description),
                field('Points (optional)', points)
            );
            levelsList.append(row);
        });
        refreshIcons();
    };

    renderCriteria();
    renderLevels();

    context.sections.push({ lens, errorLabel: options.errorLabel, form, working, canEdit });

    if (canEdit) {
        const actions = document.createElement('div');
        actions.className = 'wf-button-row';
        // Saving writes the shared assignment details into every rubric this
        // assignment owns, so staff never retype the description for a lab report.
        const saveDrafts = async (): Promise<void> => {
            try {
                await saveAssignmentRubrics(context);
                validation.hidden = true;
            } catch (error) {
                validation.textContent = error instanceof Error ? error.message : 'Review the rubric fields.';
                validation.hidden = false;
                validation.focus();
                throw error;
            }
        };
        actions.append(
            createButton('Save draft', 'secondary', async () => {
                await saveDrafts();
                state.panelDirty = false;
                state.assignments = await request<Assignment[]>('/assignments');
                showSuccessToast('Rubric draft saved. The approved rubric is unchanged.');
                await openRubricPage(assignment.id);
            }),
            createButton('Approve and use rubric', 'primary', async () => {
                await saveDrafts();
                state.panelDirty = false;
                const nextVersion = data.draft?.version ?? (data.approved?.version ?? 0) + 1;
                const confirmation = await showConfirmModal(
                    data.approved ? 'Approve this rubric version?' : 'Approve this first rubric?',
                    data.approved
                        ? `Rubric v${nextVersion} will become active for future feedback. Older unreleased feedback must be regenerated. This does not update Canvas.`
                        : `Rubric v${nextVersion} will become the first active rubric for this assignment. This does not generate feedback or update Canvas.`,
                    'Approve rubric',
                    'Keep as draft'
                );
                if (confirmation.action !== 'approve-rubric') return;
                await jsonRequest(
                    `/assignments/${encodeURIComponent(assignment.id)}/rubric-draft/approve${lensQuery}`,
                    'POST'
                );
                state.panelDirty = false;
                state.assignments = await request<Assignment[]>('/assignments');
                showSuccessToast('Rubric approved for future feedback generation.');
                await openRubricPage(assignment.id);
            })
        );
        if (data.draft && data.approved) {
            actions.append(createButton('Discard draft', 'danger', async () => {
                const confirmation = await showConfirmModal(
                    'Discard this rubric draft?',
                    `Draft v${data.draft!.version} will be removed. Approved rubric v${data.approved!.version} stays active.`,
                    'Discard draft',
                    'Cancel',
                    'danger'
                );
                if (confirmation.action !== 'discard-draft') return;
                await jsonRequest(`/assignments/${encodeURIComponent(assignment.id)}/rubric-draft${lensQuery}`, 'DELETE');
                state.panelDirty = false;
                state.assignments = await request<Assignment[]>('/assignments');
                showSuccessToast('Rubric draft discarded.');
                await openRubricPage(assignment.id);
            }));
        }
        form.append(actions);
    }

    editor.append(form);
    layout.append(editor);
    section.append(layout);
    return section;
}
