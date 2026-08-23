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
    MAX_CRITERIA,
    MAX_LEVELS,
    MIN_CRITERIA,
    MIN_LEVELS,
    RUBRIC_SLUG,
    parseBand,
    renderRubricGrid
} from './writing-feedback-grid.js';
import {
    Assignment,
    RubricCell,
    RubricCriterion,
    RubricDefinition,
    RubricLevel,
    RubricResponse,
    WfFunctionTag,
    WritingFeedbackLens,
    chip,
    confirmDiscardDirty,
    createButton,
    createText,
    element,
    field,
    formatDate,
    inputControl,
    jsonRequest,
    request,
    setWorkspaceMessage,
    setQueryState,
    setView,
    state,
    textAreaControl,
    views
} from './writing-feedback-shared.js';

const MAX_LAB_CONTEXT = 12000;
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
    /**
     * True for a lab report whose technical rubric has neither a draft nor an
     * approved version, so no technical editor registers itself. The shared
     * 'Lab handout' field still renders, so saving must seed that rubric rather
     * than drop the text.
     */
    technicalMissing: boolean;
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

/**
 * optionalControlValue - reads a named control, distinguishing empty from absent
 *
 * @param form - Rubric editor form
 * @param name - Control name following the grid's `criterion.{row}.*` / `level.{column}.*` convention
 * @returns The trimmed value, or undefined when this grid renders no such control
 */
function optionalControlValue(form: HTMLFormElement, name: string): string | undefined {
    const control = form.elements.namedItem(name) as RubricControl | null;
    return control ? control.value.trim() : undefined;
}

/**
 * readCellControls - rebuilds one criterion's per-level bands from its row of controls
 *
 * A cell exists only where staff entered a points range; a blank range means the
 * criterion awards nothing at that level, which the schema represents by omitting
 * the key rather than by inventing a zero.
 *
 * @param form - Rubric editor form
 * @param index - Criterion row position
 * @param levelIds - Level ids in the column order the grid rendered
 * @returns Bands keyed by level id, or undefined when the row carries none
 */
function readCellControls(
    form: HTMLFormElement,
    index: number,
    levelIds: string[]
): Record<string, RubricCell> | undefined {
    const cells: Record<string, RubricCell> = {};
    levelIds.forEach((levelId, column) => {
        const band = parseBand(optionalControlValue(form, `criterion.${index}.cell.${column}.band`) ?? '');
        if (!band) return;
        const descriptor = optionalControlValue(form, `criterion.${index}.cell.${column}.descriptor`);
        cells[levelId] = descriptor ? { ...band, descriptor } : band;
    });
    return Object.keys(cells).length ? cells : undefined;
}

/**
 * syncStructuredValues - reads the grid's controls back into the working copy
 *
 * The grid names every control it renders `criterion.{row}.*` or `level.{column}.*`,
 * and this is the only reader of that convention. A name the grid does not render is
 * not an empty value: the stored value is carried through untouched, so a grid that
 * omits a field — the technical rubric omits the linguistic focus line, and neither
 * grid edits the Academic Writing Matrix function or the per-level points that feed
 * the numeric release mapping — can never blank it on save.
 *
 * Nothing is validated here. Add, remove, and reorder all call it first so an
 * in-progress edit survives the structural change.
 *
 * @param form - Rubric editor form owning the grid
 * @param working - Working copy for this rubric, rewritten in place
 */
function syncStructuredValues(form: HTMLFormElement, working: RubricDefinition): void {
    // Column positions map to level ids through the order the grid rendered, which is
    // the working copy's own order until a structural change re-renders it.
    const levelIds = working.levels.map((level) => level.id);

    working.criteria = working.criteria.map((criterion, index) => {
        const rawFunctionTag = optionalControlValue(form, `criterion.${index}.functionTag`);
        const functionTag = rawFunctionTag === undefined
            ? criterion.functionTag
            : optionalFunctionTag(rawFunctionTag);
        const rawFocus = optionalControlValue(form, `criterion.${index}.sflDimension`);
        const sflDimension = rawFocus === undefined ? criterion.sflDimension : (rawFocus || undefined);
        const rawPoints = optionalControlValue(form, `criterion.${index}.points`);
        const points = rawPoints === undefined
            ? criterion.points
            : (rawPoints ? Number(rawPoints) : undefined);
        const cellsRendered = form.elements.namedItem(`criterion.${index}.cell.0.band`) !== null;
        const cells = cellsRendered ? readCellControls(form, index, levelIds) : criterion.cells;
        return {
            id: criterion.id,
            label: optionalControlValue(form, `criterion.${index}.label`) ?? criterion.label,
            description: optionalControlValue(form, `criterion.${index}.description`) ?? criterion.description,
            ...(functionTag ? { functionTag } : {}),
            ...(sflDimension ? { sflDimension } : {}),
            ...(points !== undefined ? { points } : {}),
            ...(cells ? { cells } : {})
        };
    });
    working.levels = working.levels.map((level, index) => {
        const rawPoints = optionalControlValue(form, `level.${index}.points`);
        const points = rawPoints === undefined ? level.points : (rawPoints ? Number(rawPoints) : undefined);
        return {
            id: level.id,
            label: optionalControlValue(form, `level.${index}.label`) ?? level.label,
            description: optionalControlValue(form, `level.${index}.description`) ?? level.description,
            rank: index + 1,
            ...(points !== undefined ? { points } : {})
        };
    });

    // Bands are keyed by level id and the server rejects a key no level owns, so a
    // removed performance level must take its bands with it. Carrying the bands
    // through (above) without this prune would turn a legal edit into a 400.
    const survivingIds = new Set(working.levels.map((level) => level.id));
    working.criteria = working.criteria.map((criterion) => {
        const existing = criterion.cells;
        if (!existing) return criterion;
        const kept: Record<string, RubricCell> = {};
        let dropped = false;
        Object.keys(existing).forEach((levelId) => {
            if (survivingIds.has(levelId)) kept[levelId] = existing[levelId];
            else dropped = true;
        });
        if (!dropped) return criterion;
        const next: RubricCriterion = { ...criterion };
        if (Object.keys(kept).length) next.cells = kept;
        else delete next.cells;
        return next;
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

function rubricLensQuery(lens: WritingFeedbackLens): string {
    return lens === 'technical' ? '?lens=technical' : '?lens=linguistic';
}

function fillAttemptKey(assignmentId: string, lens: WritingFeedbackLens): string {
    return `${assignmentId}:${lens}`;
}

function shouldFillMissingDraftOnFirstOpen(
    assignment: Assignment,
    data: RubricResponse | undefined,
    lens: WritingFeedbackLens
): boolean {
    if (!assignment.instructions?.trim() || !data || data.draft || data.approved) return false;
    const key = fillAttemptKey(assignment.id, lens);
    if (firstOpenAutofillAttempts.has(key)) return false;
    firstOpenAutofillAttempts.add(key);
    return true;
}

async function fillRubricDraftFromInstructions(
    assignmentId: string,
    lens: WritingFeedbackLens
): Promise<Assignment> {
    return jsonRequest<Assignment>(
        `/assignments/${encodeURIComponent(assignmentId)}/rubric-draft/fill${rubricLensQuery(lens)}`,
        'POST'
    );
}

async function fillMissingDraftsOnFirstOpen(
    assignment: Assignment,
    linguisticData: RubricResponse,
    technicalData?: RubricResponse
): Promise<boolean> {
    const targets: WritingFeedbackLens[] = [];
    if (shouldFillMissingDraftOnFirstOpen(assignment, linguisticData, 'linguistic')) {
        targets.push('linguistic');
    }
    if (shouldFillMissingDraftOnFirstOpen(assignment, technicalData, 'technical')) {
        targets.push('technical');
    }
    for (const lens of targets) {
        await fillRubricDraftFromInstructions(assignment.id, lens);
    }
    return targets.length > 0;
}

function announceDetailsStatus(status: HTMLElement, message: string, tone: 'info' | 'success' | 'error' = 'info'): void {
    status.textContent = '';
    status.dataset.tone = tone;
    window.requestAnimationFrame(() => { status.textContent = message; });
}

async function fillRubricsFromInstructions(context: RubricPageContext, status: HTMLElement): Promise<void> {
    if (!context.assignment.instructions?.trim()) {
        throw new Error('Add the assignment instructions first');
    }
    const targets = new Set<WritingFeedbackLens>(
        context.sections.filter((section) => section.canEdit).map((section) => section.lens)
    );
    if (context.isLabReport && context.technicalMissing && context.sections.some((section) => section.canEdit)) {
        targets.add('technical');
    }
    if (!targets.size) {
        throw new Error('You do not have permission to edit this rubric.');
    }

    announceDetailsStatus(status, 'Reading the instructions…');
    setWorkspaceMessage('Reading the instructions…', 'info');
    try {
        const orderedTargets = [...targets].sort((left, right) => {
            if (left === right) return 0;
            return left === 'technical' ? -1 : 1;
        });
        for (const lens of orderedTargets) {
            await fillRubricDraftFromInstructions(context.assignment.id, lens);
        }
        state.panelDirty = false;
        state.assignments = await request<Assignment[]>('/assignments');
        pendingRubricNotice = { message: 'Filled from the instructions. Review before approving.', tone: 'success' };
        setWorkspaceMessage('Filled from the instructions. Review before approving.', 'success');
        showSuccessToast('Filled from the instructions. Review before approving.');
        await openRubricPage(context.assignment.id);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not read the instructions. Fill the rubric in by hand.';
        announceDetailsStatus(status, message, 'error');
        setWorkspaceMessage(message, 'error');
        throw error;
    }
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
    let assignment = state.assignments.find((item) => item.id === assignmentId);
    if (!assignment) throw new Error('Writing assignment not found');
    let linguisticData = await request<RubricResponse>(`/assignments/${encodeURIComponent(assignmentId)}/rubric?lens=linguistic`);
    let technicalData = assignment.isLabReport
        ? await request<RubricResponse>(`/assignments/${encodeURIComponent(assignmentId)}/rubric?lens=technical`)
        : undefined;
    try {
        const filled = await fillMissingDraftsOnFirstOpen(assignment, linguisticData, technicalData);
        if (filled) {
            state.assignments = await request<Assignment[]>('/assignments');
            assignment = state.assignments.find((item) => item.id === assignmentId) ?? assignment;
            linguisticData = await request<RubricResponse>(`/assignments/${encodeURIComponent(assignmentId)}/rubric?lens=linguistic`);
            technicalData = assignment.isLabReport
                ? await request<RubricResponse>(`/assignments/${encodeURIComponent(assignmentId)}/rubric?lens=technical`)
                : undefined;
            pendingRubricNotice = { message: 'Filled from the instructions. Review before approving.', tone: 'success' };
        }
    } catch (error) {
        pendingRubricNotice = {
            message: error instanceof Error ? error.message : 'Could not read the instructions. Fill the rubric in by hand.',
            tone: 'error'
        };
    }
    const notice = pendingRubricNotice;
    pendingRubricNotice = null;
    renderRubricPage(root, assignment, linguisticData, technicalData, notice ?? undefined);
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
    technicalData?: RubricResponse,
    notice?: { message: string; tone: 'success' | 'error' }
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

    let context: RubricPageContext | undefined;
    const detailsForm = renderAssignmentDetails(root, writingSource, {
        canEdit: linguisticData.permissions.canEdit,
        isLabReport,
        labContext: technicalSource?.labContext ?? '',
        hasInstructions: Boolean(assignment.instructions?.trim()),
        notice,
        onInput: () => {
            if (linguisticData.permissions.canEdit) state.panelDirty = true;
            clearValidation();
        },
        onFillFromInstructions: async (status) => {
            if (!context) throw new Error('The rubric page is still loading.');
            await fillRubricsFromInstructions(context, status);
        }
    });

    const pageContext: RubricPageContext = {
        assignment,
        detailsForm,
        sections: [],
        isLabReport,
        technicalMissing: Boolean(technicalData) && !technicalData?.draft && !technicalData?.approved
    };
    context = pageContext;

    root.append(renderRubricSection(pageContext, linguisticData, 'linguistic', {
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
            root.append(renderRubricSection(pageContext, technicalData, 'technical', {
                heading: 'Technical rubric',
                errorLabel: 'Technical rubric',
                showState: true
            }));
        }
    }
    if (notice) setWorkspaceMessage(notice.message, notice.tone);
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
    hasInstructions: boolean;
    notice?: { message: string; tone: 'success' | 'error' };
    onInput: () => void;
    onFillFromInstructions: (status: HTMLElement) => Promise<void>;
}

const firstOpenAutofillAttempts = new Set<string>();
let pendingRubricNotice: { message: string; tone: 'success' | 'error' } | null = null;

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
    const fillStatus = createText('p', options.notice?.message ?? '', 'wf-rubric-details-status');
    fillStatus.setAttribute('role', 'status');
    fillStatus.setAttribute('aria-live', 'polite');
    fillStatus.setAttribute('aria-atomic', 'true');
    if (options.notice) fillStatus.dataset.tone = options.notice.tone;
    if (options.canEdit) {
        const fillButton = createButton(
            'Fill again from instructions',
            'secondary',
            async () => options.onFillFromInstructions(fillStatus),
            !options.hasInstructions
        );
        if (!options.hasInstructions) fillButton.title = 'Add the assignment instructions first';
        headingRow.append(fillButton);
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
    section.append(headingRow, fillStatus, form);
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
 * A lab report whose technical rubric was deleted outright has no editor to
 * register, yet the shared 'Lab handout' field is still on screen and still
 * accepts text. Rather than discard that text, this seeds the technical rubric
 * through the same route the 'Re-seed technical rubric' action uses and writes
 * the handout into it, so no control on the page can swallow what staff typed.
 *
 * @param context - Page context holding the details form and registered editors
 * @throws Error carrying the first staff-facing validation or transport failure
 */
async function saveAssignmentRubrics(context: RubricPageContext): Promise<void> {
    const details = collectAssignmentDetails(context.detailsForm);
    const labContext = rubricTextValue(context.detailsForm, 'labContext').slice(0, MAX_LAB_CONTEXT) || undefined;

    // Validate every rubric before writing any of them. Validating inside the write
    // loop would let the first rubric persist a new description and the second fail
    // validation, leaving the two rubrics disagreeing about the same assignment -
    // the exact divergence the shared description exists to prevent.
    const pending = context.sections
        .filter((section) => section.canEdit)
        .map((section) => ({
            section,
            structure: collectRubricStructure(section.form, section.working, section.errorLabel)
        }));

    // Seed before the other writes: a failure here aborts the save with a visible
    // message instead of leaving the handout silently unsaved. Nothing is seeded
    // when the handout is empty, so a plain save never invents a rubric that
    // staff did not ask for - the explicit re-seed action still owns that.
    if (context.technicalMissing && labContext) {
        const seededAssignment = await jsonRequest<Assignment>(
            `/assignments/${encodeURIComponent(context.assignment.id)}/lab-report`,
            'PATCH',
            { isLabReport: true }
        );
        const seededSource = seededAssignment.technicalRubricDraft ?? seededAssignment.technicalRubric;
        if (!seededSource) {
            throw new Error('The lab handout could not be saved. Re-seed the technical rubric, then save again.');
        }
        const seeded = detachedRubric(seededSource);
        await jsonRequest<Assignment>(
            `/assignments/${encodeURIComponent(context.assignment.id)}/rubric-draft?lens=technical`,
            'PUT',
            { ...details, criteria: seeded.criteria, levels: seeded.levels, labContext } satisfies RubricDraftInput
        );
        Object.assign(context.assignment, seededAssignment);
        // The flag is deliberately NOT cleared. Only a full page reload retires this
        // state, and several paths leave the page standing after a successful seed
        // (an approval the user then cancels, or a later rubric failing validation).
        // Clearing it here would strand the handout field with no send path again on
        // the next save. Re-seeding is harmless: PATCH .../lab-report is idempotent
        // and returns the draft that already exists.
    }

    for (const { section, structure } of pending) {
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
    const lensQuery = lens === 'technical' ? '?lens=technical' : '';

    const section = document.createElement('details');
    section.className = 'wf-rubric-section';
    section.open = true;
    const summary = document.createElement('summary');
    summary.className = 'wf-rubric-section__summary';
    // A heading element, not a span: h2 matches the sibling 'Assignment details'
    // heading above and gives the grid below an ancestor heading to sit under.
    const summaryTitle = createText('h2', options.heading, 'wf-rubric-section__title');
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

    // The rubric is one table: criteria are rows, performance levels are columns,
    // and every cell carries the points range that criterion awards at that level.
    const gridMount = document.createElement('div');
    gridMount.className = 'wf-rubric-grid-mount';
    gridMount.dataset.rubricGrid = lens;
    form.append(gridMount);

    // A structural change lands in the next version; the confirmation names it, and
    // the ids every approved version has used are off limits to a new row or column.
    const approvedVersions = [
        ...(data.approved ? [data.approved] : []),
        ...data.history.filter((rubric) => rubric.status === 'approved')
    ];
    const approvedVersion = approvedVersions.length
        ? Math.max(...approvedVersions.map((rubric) => rubric.version))
        : undefined;
    const reservedIds = approvedVersions.flatMap((rubric) => [
        ...rubric.criteria.map((criterion) => criterion.id),
        ...rubric.levels.map((level) => level.id)
    ]);

    renderRubricGrid(gridMount, working, {
        canEdit,
        // The linguistic focus line belongs to the writing rubric only.
        showLinguisticFocus: lens === 'linguistic',
        approvedVersion,
        nextVersion: data.draft?.version ?? (approvedVersion ?? 0) + 1,
        library: data.library ?? [],
        reservedIds,
        syncFromForm: () => syncStructuredValues(form, working),
        onChange: markDirty,
        announce
    });

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
