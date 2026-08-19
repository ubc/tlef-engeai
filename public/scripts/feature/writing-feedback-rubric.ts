// public/scripts/feature/writing-feedback-rubric.ts
/**
 * Writing Feedback Rubric â€” assignment-specific rubric editor and approval view
 *
 * Rubric criteria and performance levels are instructor-authored data. New
 * assignments begin with a draft; only an explicitly approved version governs
 * generation, student reports, and release. Stable slugs preserve historical
 * feedback joins while labels, descriptions, order, lenses, and points remain
 * editable in later drafts.
 *
 * @author: @rdschrs
 * @date: 2026-08-10
 * @version: 2.0.0
 * @description: Owns dynamic rubric editing, validation, draft persistence, preview, and approval.
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
const RUBRIC_SLUG = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
const FUNCTION_OPTIONS: Array<{ value: WfFunctionTag; label: string }> = [
    { value: 'content', label: 'Content' },
    { value: 'interpersonal', label: 'Interpersonal' },
    { value: 'organizational', label: 'Organizational' }
];

interface RubricDraftInput {
    title: string;
    task: string;
    audience: string;
    purpose: string;
    constraints: string[];
    learningOutcomes: string[];
    gradingIntent: string;
    criteria: RubricCriterion[];
    levels: RubricLevel[];
}

type RubricControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

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
            id: rubricTextValue(form, `criterion.${index}.id`) || criterion.id,
            label: rubricTextValue(form, `criterion.${index}.label`),
            description: rubricTextValue(form, `criterion.${index}.description`),
            ...(functionTag ? { functionTag } : {}),
            ...(sflDimension ? { sflDimension } : {})
        };
    });
    working.levels = working.levels.map((level, index) => {
        const rawPoints = rubricTextValue(form, `level.${index}.points`);
        return {
            id: rubricTextValue(form, `level.${index}.id`) || level.id,
            label: rubricTextValue(form, `level.${index}.label`),
            description: rubricTextValue(form, `level.${index}.description`),
            rank: index + 1,
            ...(rawPoints ? { points: Number(rawPoints) } : {})
        };
    });
}

function validateSlugs(values: Array<{ id: string }>, noun: string): void {
    if (values.some((value) => !RUBRIC_SLUG.test(value.id))) {
        throw new Error(`${noun} slugs must start with a lowercase letter and use only lowercase letters, numbers, and underscores.`);
    }
    if (new Set(values.map((value) => value.id)).size !== values.length) {
        throw new Error(`${noun} slugs must be unique.`);
    }
}

function collectRubric(form: HTMLFormElement, working: RubricDefinition): RubricDraftInput {
    const requiredNames = ['title', 'task', 'audience', 'purpose', 'gradingIntent'];
    if (requiredNames.some((name) => !rubricTextValue(form, name))) {
        throw new Error('Complete every required rubric context field.');
    }
    const constraints = rubricLines(form, 'constraints');
    const learningOutcomes = rubricLines(form, 'learningOutcomes');
    if (!constraints.length || !learningOutcomes.length) {
        throw new Error('Add at least one task constraint and one learning outcome.');
    }

    syncStructuredValues(form, working);
    if (working.criteria.length < MIN_CRITERIA || working.criteria.length > MAX_CRITERIA) {
        throw new Error(`Use between ${MIN_CRITERIA} and ${MAX_CRITERIA} rubric criteria.`);
    }
    if (working.levels.length < MIN_LEVELS || working.levels.length > MAX_LEVELS) {
        throw new Error(`Use between ${MIN_LEVELS} and ${MAX_LEVELS} performance levels.`);
    }
    validateSlugs(working.criteria, 'Criterion');
    validateSlugs(working.levels, 'Performance-level');
    if (working.criteria.some((criterion) => !criterion.label || !criterion.description)) {
        throw new Error('Every rubric criterion needs a label and description.');
    }
    if (working.levels.some((level) => !level.label || !level.description)) {
        throw new Error('Every performance level needs a label and description.');
    }

    const pointsCount = working.levels.filter((level) => level.points !== undefined).length;
    if (pointsCount > 0 && pointsCount !== working.levels.length) {
        throw new Error('Enter points for every performance level, or leave all points blank for ordinal feedback.');
    }
    if (working.levels.some((level) => level.points !== undefined
        && (!Number.isFinite(level.points) || level.points < 0 || level.points > 1000))) {
        throw new Error('Rubric points must be numbers from 0 to 1000.');
    }

    return {
        title: rubricTextValue(form, 'title'),
        task: rubricTextValue(form, 'task'),
        audience: rubricTextValue(form, 'audience'),
        purpose: rubricTextValue(form, 'purpose'),
        constraints,
        learningOutcomes,
        gradingIntent: rubricTextValue(form, 'gradingIntent'),
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

function renderRubricPreview(root: HTMLElement, form: HTMLFormElement, working: RubricDefinition): void {
    root.replaceChildren();
    try {
        const rubric = collectRubric(form, working);
        root.append(
            createText('h3', 'Student-facing preview'),
            createText('strong', rubric.title),
            createText('p', rubric.task),
            createText('p', `Audience: ${rubric.audience}`)
        );
        const criteria = document.createElement('ul');
        rubric.criteria.forEach((criterion) => criteria.append(createText('li', `${criterion.label}: ${criterion.description}`)));
        root.append(criteria);
        const scale = createText(
            'p',
            `Scale: ${rubric.levels.map((level) => level.label).join(' â†’ ')}`,
            'wf-help-text'
        );
        const grading = rubric.levels.every((level) => level.points !== undefined)
            ? 'Numeric mapping ready'
            : 'Ordinal levels; numeric Canvas grade blocked';
        root.append(scale, createText('p', grading, 'wf-help-text'));
    } catch (error) {
        root.append(
            createText('h3', 'Student-facing preview'),
            createText('p', 'Complete the rubric to preview it.'),
            createText('p', error instanceof Error ? error.message : 'Review the required fields.')
        );
    }
}

function setEditable(control: RubricControl, editable: boolean): void {
    if (control instanceof HTMLSelectElement) {
        control.disabled = !editable;
        return;
    }
    control.readOnly = !editable;
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
    root.replaceChildren(createText('p', 'Loading rubricâ€¦', 'wf-muted-note'));
    if (!state.assignments.length) state.assignments = await request<Assignment[]>('/assignments');
    const assignment = state.assignments.find((item) => item.id === assignmentId);
    if (!assignment) throw new Error('Writing assignment not found');
    const data = await request<RubricResponse>(`/assignments/${encodeURIComponent(assignmentId)}/rubric`);
    renderRubricPage(root, assignment, data);
}

/**
 * Exported so the onboarding tutorial can render the production interface from
 * canned data. The handlers attached here still perform real mutations, so any
 * caller outside the real workspace must arm demo mode first — see
 * `writing-feedback-demo-mode.ts`.
 */
export function renderRubricPage(root: HTMLDivElement, assignment: Assignment, data: RubricResponse): void {
    root.replaceChildren();
    const source = data.draft ?? data.approved;
    if (!source) throw new Error('This assignment does not have a rubric draft or approved rubric.');
    const working = detachedRubric(source);
    const canEdit = data.permissions.canEdit;
    const structureLocked = Boolean(data.approved || data.history.some((rubric) => rubric.status === 'approved'));

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
    meta.append(
        createText('strong', assignment.title),
        createText('span', `Created ${formatDate(assignment.createdAt)}`),
        createText('span', assignment.dueAt ? `Deadline ${formatDate(assignment.dueAt, true)}` : 'No deadline'),
        chip(canEdit ? 'Editable' : 'Read-only', canEdit ? 'green' : 'neutral')
    );
    header.append(heading, meta);
    root.append(header);

    const status = document.createElement('div');
    status.className = `wf-callout${data.draft ? ' wf-callout--warning' : ' wf-callout--success'}`;
    const statusHeading = data.draft
        ? data.approved
            ? `Draft v${data.draft.version} is not active`
            : `Draft v${data.draft.version} awaits first approval`
        : `Approved rubric v${data.approved!.version}`;
    status.append(
        createText('strong', statusHeading),
        createText(
            'span',
            canEdit
                ? 'Saving keeps a draft inactive. Approval applies it to future feedback and never writes a rubric to Canvas.'
                : 'You can inspect rubric details. Only an instructor or platform administrator can modify or approve them.'
        )
    );
    root.append(status);

    const instructions = document.createElement('details');
    instructions.className = 'wf-assignment-instructions';
    instructions.open = Boolean(assignment.instructions);
    const instructionsSummary = document.createElement('summary');
    instructionsSummary.textContent = 'Assignment instructions';
    instructions.append(
        instructionsSummary,
        createText(
            'div',
            assignment.instructions || 'No assignment instructions were provided. Add task context directly in the rubric before approval.',
            assignment.instructions ? 'wf-assignment-instructions__text' : 'wf-muted-note'
        )
    );
    root.append(instructions);

    const layout = document.createElement('div');
    layout.className = 'wf-rubric-layout';
    const editor = document.createElement('div');
    editor.className = 'wf-rubric-editor';
    const preview = document.createElement('aside');
    preview.className = 'wf-rubric-preview';

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
    const updatePreview = (): void => renderRubricPreview(preview, form, working);
    const markDirty = (): void => {
        if (canEdit) state.panelDirty = true;
        validation.hidden = true;
        updatePreview();
    };
    const bindTextControl = <T extends HTMLInputElement | HTMLTextAreaElement>(
        control: T,
        editable: boolean,
        onInput?: () => void
    ): T => {
        setEditable(control, editable);
        control.addEventListener('input', () => {
            onInput?.();
            markDirty();
        });
        return control;
    };

    const context = document.createElement('fieldset');
    context.className = 'wf-fieldset';
    context.append(createText('legend', 'Task, audience, and purpose'));
    const contextGrid = document.createElement('div');
    contextGrid.className = 'wf-form-grid';
    const contextControls: Array<{ label: string; control: HTMLInputElement | HTMLTextAreaElement; help?: string; wide?: boolean }> = [
        { label: 'Rubric title', control: namedControl(inputControl(source.title), 'title'), wide: true },
        { label: 'Task', control: namedControl(textAreaControl(source.task, 4), 'task'), wide: true },
        { label: 'Audience', control: namedControl(textAreaControl(source.audience, 3), 'audience') },
        { label: 'Purpose', control: namedControl(textAreaControl(source.purpose, 3), 'purpose') },
        { label: 'Task constraints (one per line)', control: namedControl(textAreaControl(source.constraints.join('\n'), 5), 'constraints') },
        { label: 'Learning outcomes (one per line)', control: namedControl(textAreaControl(source.learningOutcomes.join('\n'), 5), 'learningOutcomes') },
        { label: 'Grading intent', control: namedControl(textAreaControl(source.gradingIntent, 4), 'gradingIntent'), wide: true }
    ];
    contextControls.forEach((entry) => {
        bindTextControl(entry.control, canEdit);
        contextGrid.append(field(entry.label, entry.control, entry.help, entry.wide));
    });
    context.append(contextGrid);
    form.append(context);

    const criteriaFieldset = document.createElement('fieldset');
    criteriaFieldset.className = 'wf-fieldset';
    criteriaFieldset.append(
        createText('legend', 'Criteria and linguistic alignment'),
        createText(
            'p',
            structureLocked
                ? 'Stable slugs are locked after first approval so historical feedback remains readable. Labels, descriptions, functions, and lenses remain editable.'
                : `Build an assignment-specific rubric with ${MIN_CRITERIA} to ${MAX_CRITERIA} criteria. Slugs become permanent after first approval.`,
            'wf-help-text'
        )
    );
    const criteriaTools = document.createElement('div');
    criteriaTools.className = 'wf-rubric-tools';
    const criteriaGrid = document.createElement('div');
    criteriaGrid.className = 'wf-rubric-grid';
    criteriaFieldset.append(criteriaTools, criteriaGrid);
    form.append(criteriaFieldset);

    const levelsFieldset = document.createElement('fieldset');
    levelsFieldset.className = 'wf-fieldset';
    levelsFieldset.append(
        createText('legend', 'Performance levels and grading'),
        createText(
            'p',
            `Use ${MIN_LEVELS} to ${MAX_LEVELS} ordered levels. Leave every points field blank for ordinal feedback, or complete every value to enable numeric Canvas release.`,
            'wf-help-text'
        )
    );
    const levelsTools = document.createElement('div');
    levelsTools.className = 'wf-rubric-tools';
    const levelsList = document.createElement('div');
    levelsList.className = 'wf-level-list';
    levelsFieldset.append(levelsTools, levelsList);
    form.append(levelsFieldset);

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
                    updatePreview();
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
                    updatePreview();
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
                const remove = createIconButton('trash-2', `Remove criterion ${criterion.label || criterion.id}`, 'danger', async () => {
                    if (working.criteria.length <= MIN_CRITERIA) {
                        announce('At least one criterion is required.');
                        return;
                    }
                    const confirmation = await showConfirmModal(
                        'Remove this criterion?',
                        `Remove "${criterion.label || criterion.id}" from this rubric draft?`,
                        'Remove criterion',
                        'Keep criterion',
                        'danger'
                    );
                    if (confirmation.action !== 'remove-criterion') return;
                    syncStructuredValues(form, working);
                    const removed = working.criteria.splice(index, 1)[0];
                    renderCriteria();
                    state.panelDirty = true;
                    updatePreview();
                    announce(`${removed.label || removed.id} removed. ${working.criteria.length} criteria remain.`);
                    focusDynamicRow('criterion', Math.min(index, working.criteria.length - 1));
                });
                remove.disabled = working.criteria.length <= MIN_CRITERIA;
                cardHeader.append(remove);
            }

            const id = namedControl(inputControl(criterion.id), `criterion.${index}.id`);
            id.maxLength = 64;
            bindTextControl(id, canEdit && !structureLocked, () => { criterion.id = id.value.trim(); });
            const label = namedControl(inputControl(criterion.label), `criterion.${index}.label`);
            label.maxLength = 80;
            bindTextControl(label, canEdit, () => { criterion.label = label.value; });
            const description = namedControl(textAreaControl(criterion.description, 4), `criterion.${index}.description`);
            bindTextControl(description, canEdit, () => { criterion.description = description.value; });
            const functionTag = namedControl(functionSelect(criterion.functionTag), `criterion.${index}.functionTag`);
            setEditable(functionTag, canEdit);
            functionTag.addEventListener('change', () => {
                criterion.functionTag = optionalFunctionTag(functionTag.value);
                markDirty();
            });
            const lens = namedControl(textAreaControl(criterion.sflDimension ?? '', 3), `criterion.${index}.sflDimension`);
            bindTextControl(lens, canEdit, () => { criterion.sflDimension = lens.value.trim() || undefined; });
            const fields = document.createElement('div');
            fields.className = 'wf-rubric-card-fields';
            fields.append(
                field(
                    'Criterion slug',
                    id,
                    structureLocked ? 'Locked because an approved rubric already references this slug.' : 'Lowercase letters, numbers, and underscores.'
                ),
                field('Student-facing label', label),
                field('Criterion description', description, undefined, true),
                field('Academic Writing Matrix function (optional)', functionTag),
                field('SFL or linguistic lens (optional)', lens)
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
                    updatePreview();
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
                    updatePreview();
                    announce(`${moved.label || moved.id} moved to position ${target + 1} of ${working.levels.length}.`);
                    focusDynamicRow('level', target);
                };
                const up = createIconButton('arrow-up', `Move ${level.label || level.id} up`, 'neutral', async () => moveLevel(-1));
                up.disabled = index === 0;
                const down = createIconButton('arrow-down', `Move ${level.label || level.id} down`, 'neutral', async () => moveLevel(1));
                down.disabled = index === working.levels.length - 1;
                controls.append(up, down);
                if (!structureLocked) {
                    const remove = createIconButton('trash-2', `Remove performance level ${level.label || level.id}`, 'danger', async () => {
                        if (working.levels.length <= MIN_LEVELS) {
                            announce(`At least ${MIN_LEVELS} performance levels are required.`);
                            return;
                        }
                        const confirmation = await showConfirmModal(
                            'Remove this performance level?',
                            `Remove "${level.label || level.id}" from this rubric draft?`,
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
                        updatePreview();
                        announce(`${removed.label || removed.id} removed. ${working.levels.length} performance levels remain.`);
                        focusDynamicRow('level', Math.min(index, working.levels.length - 1));
                    });
                    remove.disabled = working.levels.length <= MIN_LEVELS;
                    controls.append(remove);
                }
                rowHeader.append(controls);
            }

            const id = namedControl(inputControl(level.id), `level.${index}.id`);
            id.maxLength = 64;
            bindTextControl(id, canEdit && !structureLocked, () => { level.id = id.value.trim(); });
            const label = namedControl(inputControl(level.label), `level.${index}.label`);
            label.maxLength = 60;
            bindTextControl(label, canEdit, () => { level.label = label.value; });
            const description = namedControl(textAreaControl(level.description, 3), `level.${index}.description`);
            bindTextControl(description, canEdit, () => { level.description = description.value; });
            const points = namedControl(inputControl(level.points === undefined ? '' : String(level.points), 'number'), `level.${index}.points`);
            points.min = '0';
            points.max = '1000';
            points.step = '0.01';
            bindTextControl(points, canEdit, () => {
                level.points = points.value.trim() ? Number(points.value) : undefined;
            });
            row.append(
                rowHeader,
                field(
                    'Level slug',
                    id,
                    structureLocked ? 'Locked because an approved rubric already references this slug.' : 'Lowercase letters, numbers, and underscores.'
                ),
                field('Student-facing label', label),
                field('Description', description),
                field('Points (optional)', points, `Rank ${index + 1}; complete every points field or leave all blank.`)
            );
            levelsList.append(row);
        });
        refreshIcons();
    };

    renderCriteria();
    renderLevels();

    if (canEdit) {
        const actions = document.createElement('div');
        actions.className = 'wf-button-row';
        const saveDraft = async (): Promise<Assignment> => {
            try {
                const input = collectRubric(form, working);
                validation.hidden = true;
                return await jsonRequest<Assignment>(
                    `/assignments/${encodeURIComponent(assignment.id)}/rubric-draft`,
                    'PUT',
                    input
                );
            } catch (error) {
                validation.textContent = error instanceof Error ? error.message : 'Review the rubric fields.';
                validation.hidden = false;
                validation.focus();
                throw error;
            }
        };
        actions.append(
            createButton('Save draft', 'secondary', async () => {
                await saveDraft();
                state.panelDirty = false;
                state.assignments = await request<Assignment[]>('/assignments');
                showSuccessToast('Rubric draft saved. The approved rubric is unchanged.');
                await openRubricPage(assignment.id);
            }),
            createButton('Approve and use rubric', 'primary', async () => {
                await saveDraft();
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
                    `/assignments/${encodeURIComponent(assignment.id)}/rubric-draft/approve`,
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
                await jsonRequest(`/assignments/${encodeURIComponent(assignment.id)}/rubric-draft`, 'DELETE');
                state.panelDirty = false;
                state.assignments = await request<Assignment[]>('/assignments');
                showSuccessToast('Rubric draft discarded.');
                await openRubricPage(assignment.id);
            }));
        }
        form.append(actions);
    }

    editor.append(form);
    layout.append(editor, preview);
    root.append(layout);
    updatePreview();
}
