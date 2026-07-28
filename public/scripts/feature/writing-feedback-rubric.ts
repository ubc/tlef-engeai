// public/scripts/feature/writing-feedback-rubric.ts
/**
 * Writing Feedback Rubric — assignment rubric editor and approval view
 *
 * Exposes exactly the configuration the correction pipeline consumes: assignment
 * context (task, audience, purpose, constraints, learning outcomes, grading
 * intent), the four fixed A2/SFL criteria, and the four ordinal performance
 * levels with all-or-nothing points. Drafts never change the approved rubric;
 * approval promotes a new immutable version used by future feedback runs.
 *
 * @author: @rdschrs
 * @date: 2026-07-19
 * @version: 1.0.0
 * @description: Owns staff rubric validation, draft persistence, preview, and explicit approval.
 */

import { showConfirmModal } from '../ui/modal-overlay.js';
import { showSuccessToast } from '../ui/toast-notification.js';
import {
    Assignment,
    RubricDefinition,
    RubricResponse,
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
    setQueryState,
    setView,
    state,
    textAreaControl,
    views
} from './writing-feedback-shared.js';

function rubricTextValue(form: HTMLFormElement, name: string): string {
    const control = form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | null;
    return control?.value.trim() ?? '';
}

function rubricLines(form: HTMLFormElement, name: string): string[] {
    return rubricTextValue(form, name).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function collectRubric(form: HTMLFormElement, source: RubricDefinition): Omit<RubricDefinition, 'version' | 'status' | 'updatedAt'> {
    // Validate assignment context first because the feedback model must receive
    // an explicit task, audience, purpose, constraints, outcomes, and grading intent.
    const requiredNames = ['title', 'task', 'audience', 'purpose', 'gradingIntent'];
    const missing = requiredNames.find((name) => !rubricTextValue(form, name));
    if (missing) throw new Error('Complete every required rubric context field.');
    const constraints = rubricLines(form, 'constraints');
    const learningOutcomes = rubricLines(form, 'learningOutcomes');
    if (!constraints.length || !learningOutcomes.length) {
        throw new Error('Add at least one task constraint and one learning outcome.');
    }
    // Preserve locked criterion identifiers/SFL mappings while accepting only
    // the staff-editable student label and description from the browser form.
    const criteria = source.criteria.map((criterion) => ({
        ...criterion,
        label: rubricTextValue(form, `criterion.${criterion.id}.label`),
        description: rubricTextValue(form, `criterion.${criterion.id}.description`)
    }));
    if (criteria.some((criterion) => !criterion.label || !criterion.description)) {
        throw new Error('Every rubric criterion needs a label and description.');
    }
    const levels = source.levels.map((level) => {
        const rawPoints = rubricTextValue(form, `level.${level.id}.points`);
        return {
            id: level.id,
            label: rubricTextValue(form, `level.${level.id}.label`),
            description: rubricTextValue(form, `level.${level.id}.description`),
            ...(rawPoints ? { points: Number(rawPoints) } : {})
        };
    });
    if (levels.some((level) => !level.label || !level.description)) {
        throw new Error('Every performance level needs a label and description.');
    }
    // Numeric grading is all-or-nothing: a partial points scale cannot produce
    // a defensible Canvas grade and therefore fails before draft persistence.
    const pointsCount = levels.filter((level) => level.points !== undefined).length;
    if (pointsCount > 0 && pointsCount !== levels.length) {
        throw new Error('Enter points for all four performance levels, or leave all points blank for ordinal feedback.');
    }
    if (levels.some((level) => level.points !== undefined && (!Number.isFinite(level.points) || level.points < 0))) {
        throw new Error('Rubric points must be non-negative numbers.');
    }
    return {
        title: rubricTextValue(form, 'title'),
        task: rubricTextValue(form, 'task'),
        audience: rubricTextValue(form, 'audience'),
        purpose: rubricTextValue(form, 'purpose'),
        constraints,
        learningOutcomes,
        gradingIntent: rubricTextValue(form, 'gradingIntent'),
        criteria,
        levels
    };
}

function namedControl<T extends HTMLInputElement | HTMLTextAreaElement>(control: T, name: string): T {
    control.name = name;
    return control;
}

function renderRubricPreview(root: HTMLElement, form: HTMLFormElement, source: RubricDefinition): void {
    root.replaceChildren();
    try {
        const rubric = collectRubric(form, source);
        root.append(
            createText('h3', 'Student-facing preview'),
            createText('strong', rubric.title),
            createText('p', rubric.task),
            createText('p', `Audience: ${rubric.audience}`)
        );
        const criteria = document.createElement('ul');
        rubric.criteria.forEach((criterion) => criteria.append(createText('li', `${criterion.label}: ${criterion.description}`)));
        root.append(criteria);
        const grading = rubric.levels.every((level) => level.points !== undefined)
            ? 'Numeric mapping ready'
            : 'Ordinal levels; numeric Canvas grade blocked';
        root.append(createText('p', grading, 'wf-help-text'));
    } catch (error) {
        root.append(
            createText('h3', 'Student-facing preview'),
            createText('p', 'Complete the rubric to preview it.'),
            createText('p', error instanceof Error ? error.message : 'Review the required fields.')
        );
    }
}

/**
 * openRubricPage - opens the rubric editor for one writing assignment
 *
 * Protects both setup and review edits before navigation, then loads the
 * server-authoritative approved/draft rubric pair and permission flags.
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
    const data = await request<RubricResponse>(`/assignments/${encodeURIComponent(assignmentId)}/rubric`);
    renderRubricPage(root, assignment, data);
}

function renderRubricPage(root: HTMLDivElement, assignment: Assignment, data: RubricResponse): void {
    root.replaceChildren();
    // A saved draft is the editable source when present, but the approved
    // definition remains the generation/release source until explicit approval.
    const source = data.draft ?? data.approved;
    const canEdit = data.permissions.canEdit;

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
    status.append(
        createText('strong', data.draft ? `Draft v${data.draft.version} is not active` : `Approved rubric v${data.approved.version}`),
        createText(
            'span',
            canEdit
                ? 'Saving a draft does not change feedback generation. Approval activates it for future runs and never writes to Canvas.'
                : 'TAs can review rubric details. Only an instructor or platform administrator can modify or approve them.'
        )
    );
    root.append(status);

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
    form.append(validation);

    const context = document.createElement('fieldset');
    context.className = 'wf-fieldset';
    context.append(createText('legend', 'Task, audience, and purpose'));
    const contextGrid = document.createElement('div');
    contextGrid.className = 'wf-form-grid';
    contextGrid.append(
        field('Rubric title', namedControl(inputControl(source.title), 'title'), undefined, true),
        field('Task', namedControl(textAreaControl(source.task, 4), 'task'), undefined, true),
        field('Audience', namedControl(textAreaControl(source.audience, 3), 'audience')),
        field('Purpose', namedControl(textAreaControl(source.purpose, 3), 'purpose')),
        field('Task constraints (one per line)', namedControl(textAreaControl(source.constraints.join('\n'), 5), 'constraints')),
        field('Learning outcomes (one per line)', namedControl(textAreaControl(source.learningOutcomes.join('\n'), 5), 'learningOutcomes')),
        field('Grading intent', namedControl(textAreaControl(source.gradingIntent, 4), 'gradingIntent'), undefined, true)
    );
    context.append(contextGrid);
    form.append(context);

    const criteriaFieldset = document.createElement('fieldset');
    criteriaFieldset.className = 'wf-fieldset';
    criteriaFieldset.append(
        createText('legend', 'Criteria and SFL alignment'),
        createText('p', 'The four criteria and their SFL lenses are fixed by the correction pipeline. Labels and descriptions are staff-editable.', 'wf-help-text')
    );
    const criteriaGrid = document.createElement('div');
    criteriaGrid.className = 'wf-rubric-grid';
    source.criteria.forEach((criterion) => {
        const card = document.createElement('article');
        card.className = 'wf-rubric-card';
        card.append(
            createText('h3', criterion.id.replace(/_/g, ' ')),
            createText('p', `SFL mapping (locked): ${criterion.sflDimension}`, 'wf-locked-value'),
            field('Student-facing label', namedControl(inputControl(criterion.label), `criterion.${criterion.id}.label`)),
            field('Criterion description', namedControl(textAreaControl(criterion.description, 3), `criterion.${criterion.id}.description`))
        );
        criteriaGrid.append(card);
    });
    criteriaFieldset.append(criteriaGrid);
    form.append(criteriaFieldset);

    const levelsFieldset = document.createElement('fieldset');
    levelsFieldset.className = 'wf-fieldset';
    levelsFieldset.append(
        createText('legend', 'Performance levels and grading'),
        createText('p', 'Leave all points blank for ordinal feedback. Enter all four values to enable numeric Canvas release.', 'wf-help-text')
    );
    source.levels.forEach((level) => {
        const row = document.createElement('div');
        row.className = 'wf-level-row';
        const points = namedControl(inputControl(level.points === undefined ? '' : String(level.points), 'number'), `level.${level.id}.points`);
        points.min = '0';
        points.step = '0.01';
        row.append(
            field(`${level.id} label`, namedControl(inputControl(level.label), `level.${level.id}.label`)),
            field(`${level.id} description`, namedControl(textAreaControl(level.description, 3), `level.${level.id}.description`)),
            field(`${level.id} points`, points)
        );
        levelsFieldset.append(row);
    });
    form.append(levelsFieldset);

    form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea').forEach((control) => {
        // Server permissions are authoritative; read-only controls make the same
        // approved/draft content inspectable by TAs without exposing mutations.
        control.readOnly = !canEdit;
        control.addEventListener('input', () => {
            state.panelDirty = canEdit;
            validation.hidden = true;
            renderRubricPreview(preview, form, source);
        });
    });

    if (canEdit) {
        const actions = document.createElement('div');
        actions.className = 'wf-button-row';
        const saveDraft = async (): Promise<Assignment> => {
            try {
                // Collect and validate the complete rubric before issuing one
                // draft write; validation failures are announced and focused.
                const input = collectRubric(form, source);
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
                // Persist current fields as a draft first, then require an
                // independent confirmation before promoting a new immutable version.
                await saveDraft();
                state.panelDirty = false;
                const confirmation = await showConfirmModal(
                    'Approve this rubric version?',
                    `Rubric v${data.draft?.version ?? data.approved.version + 1} will become active for future feedback. Older unreleased feedback must be regenerated. This does not update Canvas.`,
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
        if (data.draft) {
            actions.append(createButton('Discard draft', 'danger', async () => {
                const confirmation = await showConfirmModal(
                    'Discard this rubric draft?',
                    `Draft v${data.draft!.version} will be removed. Approved rubric v${data.approved.version} stays active.`,
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
    renderRubricPreview(preview, form, source);
}
