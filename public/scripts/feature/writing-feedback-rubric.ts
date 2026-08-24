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
    CanvasRubricResponse,
    CanvasRubricRow,
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

/**
 * canvasCellValue - reads one imported-rubric cell by control name
 *
 * The imported grid sits inside the rubric editor's form and so cannot be a form of its own,
 * which rules out `form.elements`. Names are generated here rather than supplied, so a plain
 * attribute selector is a safe lookup.
 *
 * @param container - Element wrapping the imported grid
 * @param name - Generated control name, e.g. `row.0.label`
 * @returns Trimmed control value, or an empty string when the control is absent
 */
function canvasCellValue(container: HTMLElement, name: string): string {
    const control = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`);
    return control?.value.trim() ?? '';
}

function namedControl<T extends HTMLInputElement | HTMLTextAreaElement>(control: T, name: string): T {
    control.name = name;
    return control;
}

/**
 * autoGrow - keeps a textarea exactly as tall as the text it holds
 *
 * Imported Canvas descriptors are frequently empty, so a fixed multi-row box would
 * spend most of the grid on nothing. Height is measured rather than declared because
 * scrollHeight is the only reliable source for the wrapped line count.
 *
 * @param textarea - Control to size against its own content
 */
function autoGrow(textarea: HTMLTextAreaElement): void {
    const fit = (): void => {
        textarea.style.height = 'auto';
        // A control inside a hidden container reports no scroll height. Keeping the natural
        // row height there is the safe failure: too short beats collapsed to nothing.
        if (textarea.scrollHeight > 0) textarea.style.height = `${textarea.scrollHeight}px`;
    };
    textarea.addEventListener('input', fit);
    textarea.addEventListener('focus', fit);
    // scrollHeight reads 0 until the control has been laid out, so the first fit waits a frame.
    requestAnimationFrame(fit);
}

/**
 * quietField - builds a grid control that reads as text until it is hovered or focused
 *
 * The imported grid is scanned far more often than it is edited, so borders and labels
 * would bury the rubric under form chrome. The control stays a real named form element
 * so the save handler keeps addressing it by name, and carries its own accessible name
 * because the visible label is the column header rather than per-control text.
 *
 * @param control - Detached input or textarea to place in the grid
 * @param name - Form element name the save handler reads back
 * @param ariaLabel - Accessible name replacing the omitted visible label
 * @param readOnly - True when the viewer may not edit the imported rubric
 * @param modifier - Optional presentation modifier class
 * @returns The same control, named, labelled, and styled for the grid
 */
function quietField<T extends HTMLInputElement | HTMLTextAreaElement>(
    control: T,
    name: string,
    ariaLabel: string,
    readOnly: boolean,
    modifier?: string
): T {
    namedControl(control, name);
    control.className = `wf-quiet-field${modifier ? ` ${modifier}` : ''}`;
    control.setAttribute('aria-label', ariaLabel);
    // Read-only staff keep the same grid rather than a second render path; the control
    // simply refuses input instead of collecting edits that have nowhere to be saved.
    control.readOnly = readOnly;
    // A one-row textarea would clip any descriptor that wraps, so multiline controls track
    // their own content height instead of being given a fixed row count.
    if (control instanceof HTMLTextAreaElement) autoGrow(control);
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
    const [data, canvas] = await Promise.all([
        request<RubricResponse>(`/assignments/${encodeURIComponent(assignmentId)}/rubric`),
        request<CanvasRubricResponse>(`/assignments/${encodeURIComponent(assignmentId)}/canvas-rubric`)
    ]);
    renderRubricPage(root, assignment, data, canvas);
}

function renderRubricPage(
    root: HTMLDivElement,
    assignment: Assignment,
    data: RubricResponse,
    canvas: CanvasRubricResponse
): void {
    root.replaceChildren();
    // A saved draft is the editable source when present, but the approved
    // definition remains the generation/release source until explicit approval.
    const source = data.draft ?? data.approved;
    const canEdit = data.permissions.canEdit;

    const back = createButton('← Back to assignments', 'quiet', async () => {
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

    // Rubric state leads the page, above both rubrics, so the draft/approved position is read
    // before either editor rather than found partway down.
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

    // The instructor's real rubric leads, at full width rather than inside the editor column.
    // Neither rubric gets an invented section heading: each already carries its own name, and a
    // label describing which one drives generation would expire once both do. The regions still
    // need accessible names so assistive technology can tell two rubric editors apart.
    root.append(renderCanvasRubricSection(assignment, canvas));
    const engeAiRubric = document.createElement('section');
    engeAiRubric.setAttribute('aria-label', 'Rubric built in EngE-AI');
    root.append(engeAiRubric);

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
    engeAiRubric.append(layout);
    renderRubricPreview(preview, form, source);
}

/**
 * renderCanvasRubricSection - shows the rubric imported from Canvas
 *
 * Rendered as a section of its own, above the A2 rubric editor, because the two are separate
 * objects: different shapes, different endpoints, and different lifecycles — this one is a mirror
 * that a re-import replaces, the other is versioned and approved. The section takes no invented
 * heading; the rubric's own Canvas title names it, and the metadata line states its provenance.
 *
 * The grid mirrors the Canvas rubric exactly: a criterion-per-row table with the same columns
 * Canvas shows, and no EngE-AI-specific fields mixed in, so staff can compare the import against
 * the original without translating between two layouts. Rows are fixed here — there is no add or
 * delete control, and the server rebuilds row structure from storage regardless of what this form
 * sends — so the rubric's shape stays the one the instructor authored in Canvas. Each row keeps
 * its own rating count, leaving the grid intentionally ragged where Canvas is.
 *
 * Every cell is an in-place control that presents as text until hovered or focused. Reviewing the
 * import is the common case and editing the rare one, so form chrome stays out of the way rather
 * than turning a rubric that fits on one screen into several screens of boxes.
 */
function renderCanvasRubricSection(assignment: Assignment, canvas: CanvasRubricResponse): HTMLElement {
    const section = document.createElement('section');
    section.className = 'wf-canvas-rubric-section';
    section.setAttribute('aria-label', 'Rubric imported from Canvas');

    if (!canvas.rubric) {
        const empty = document.createElement('div');
        empty.className = 'wf-callout wf-callout--warning';
        empty.append(
            createText('strong', 'No Canvas rubric for this assignment'),
            createText(
                'span',
                assignment.canvasAssignmentId
                    ? 'This assignment was imported from Canvas but had no rubric attached. Build one in Canvas and import again, or author the rubric above in EngE-AI.'
                    : 'This assignment was created in EngE-AI, so there is no Canvas rubric to import. Author the rubric above.'
            )
        );
        section.append(empty);
        return section;
    }

    const rubric = canvas.rubric;
    const canEdit = canvas.permissions.canEdit;

    // The rubric's own name leads, at heading weight, because it identifies which Canvas rubric
    // this is — the surrounding metadata only qualifies it.
    section.append(createText('h3', rubric.title, 'wf-canvas-rubric-title'));

    const meta = document.createElement('p');
    meta.className = 'wf-assignment-meta';
    meta.append(
        createText('span', rubric.pointsPossible === undefined ? 'No rubric total' : `${rubric.pointsPossible} points total`),
        createText('span', `Imported ${formatDate(rubric.importedAt)}`),
        chip(canEdit ? 'Editable' : 'Read-only', canEdit ? 'green' : 'neutral')
    );
    section.append(meta);

    if (canvas.details?.descriptionText) {
        const brief = document.createElement('details');
        brief.className = 'wf-canvas-brief';
        const summary = document.createElement('summary');
        summary.textContent = 'Assignment brief imported from Canvas';
        const body = createText('p', canvas.details.descriptionText);
        body.className = 'wf-canvas-brief-body';
        brief.append(summary, body);
        section.append(brief);
    }

    // A div rather than a form: this grid is rendered inside the rubric editor's own form,
    // and nested forms are invalid. Input events still bubble, so dirty tracking is unaffected.
    const form = document.createElement('div');
    form.className = 'wf-canvas-rubric-form';

    // Same shape Canvas shows the instructor: one row per criterion, its ratings beside it.
    // Reading the import against the Canvas original is the whole job of this screen, so the
    // grid is scanned rather than scrolled through, and edits happen in place.
    const table = document.createElement('table');
    table.className = 'wf-canvas-rubric-table';

    const tableHead = document.createElement('thead');
    const headRow = document.createElement('tr');
    const criterionHeading = createText('th', 'Criterion');
    criterionHeading.setAttribute('scope', 'col');
    const ratingsHeading = document.createElement('th');
    ratingsHeading.setAttribute('scope', 'col');
    ratingsHeading.append(createText('span', 'Ratings'));
    headRow.append(criterionHeading, ratingsHeading);
    tableHead.append(headRow);
    table.append(tableHead);

    const tableBody = document.createElement('tbody');
    rubric.rows.forEach((row, rowIndex) => {
        const rowEl = document.createElement('tr');
        rowEl.className = 'wf-canvas-rubric-row';
        rowEl.dataset.criterionId = row.canvasCriterionId;
        const rowNumber = rowIndex + 1;

        const criterionDescription = quietField(
            textAreaControl(row.description, 1),
            `row.${rowIndex}.description`,
            `Criterion ${rowNumber} description`,
            !canEdit,
            'wf-quiet-field--multiline'
        );
        // An empty description collapses to an invisible line, so editors get a prompt where
        // Canvas left the field blank.
        if (canEdit) criterionDescription.placeholder = 'Add a description';

        const criterionCell = document.createElement('th');
        criterionCell.setAttribute('scope', 'row');
        criterionCell.className = 'wf-canvas-rubric-criterion';
        criterionCell.append(
            quietField(
                inputControl(row.label),
                `row.${rowIndex}.label`,
                `Criterion ${rowNumber} name`,
                !canEdit,
                'wf-quiet-field--title'
            ),
            criterionDescription
        );
        if (row.points !== undefined) {
            criterionCell.append(createText('p', `${row.points} pts`, 'wf-canvas-rubric-row-points'));
        }
        rowEl.append(criterionCell);

        const ratingsCell = document.createElement('td');
        ratingsCell.className = 'wf-canvas-rubric-ratings';
        // The strip carries the flex layout so the cell itself stays a table-cell and keeps
        // its fixed column width and top alignment.
        const ratingStrip = document.createElement('div');
        ratingStrip.className = 'wf-canvas-rubric-rating-strip';
        row.ratings.forEach((rating, ratingIndex) => {
            const cell = document.createElement('div');
            cell.className = 'wf-canvas-rubric-cell';
            cell.dataset.ratingId = rating.canvasRatingId;

            const cellHead = document.createElement('div');
            cellHead.className = 'wf-canvas-rubric-cell-head';
            cellHead.append(quietField(
                inputControl(rating.label),
                `row.${rowIndex}.rating.${ratingIndex}.label`,
                `Criterion ${rowNumber}, rating ${ratingIndex + 1} name`,
                !canEdit,
                'wf-quiet-field--rating'
            ));
            if (rating.points !== undefined) {
                cellHead.append(createText('span', `${rating.points} pts`, 'wf-canvas-rubric-points'));
            }
            cell.append(cellHead);

            const descriptor = quietField(
                textAreaControl(rating.description, 1),
                `row.${rowIndex}.rating.${ratingIndex}.description`,
                `Criterion ${rowNumber}, rating ${ratingIndex + 1} descriptor`,
                !canEdit,
                'wf-quiet-field--multiline'
            );
            // Canvas rubrics routinely ship ratings with no descriptor. An empty control that
            // collapses to one line keeps the grid readable while still accepting an edit.
            if (canEdit) descriptor.placeholder = 'Add descriptor';
            cell.append(descriptor);

            ratingStrip.append(cell);
        });
        ratingsCell.append(ratingStrip);
        rowEl.append(ratingsCell);
        tableBody.append(rowEl);
    });
    table.append(tableBody);
    form.append(table);

    if (canEdit) {
        // Durable inline dirty state: the save control sits below a grid that can run long,
        // so unsaved work has to be visible without scrolling back up to notice it.
        const dirtyState = chip('No unsaved changes', 'neutral');
        dirtyState.setAttribute('aria-live', 'polite');
        const setDirty = (dirty: boolean): void => {
            // Text carries the state as well as colour, so the distinction survives for anyone
            // who cannot separate the neutral and amber tones.
            state.panelDirty = dirty;
            dirtyState.textContent = dirty ? 'Unsaved changes' : 'No unsaved changes';
            dirtyState.className = `wf-chip wf-chip--${dirty ? 'amber' : 'neutral'}`;
        };
        form.addEventListener('input', () => setDirty(true));

        const actions = document.createElement('div');
        actions.className = 'wf-canvas-rubric-actions';
        actions.append(dirtyState, createButton('Save rubric edits', 'primary', async () => {
            const rows: CanvasRubricRow[] = rubric.rows.map((row, rowIndex) => ({
                canvasCriterionId: row.canvasCriterionId,
                label: canvasCellValue(form, `row.${rowIndex}.label`),
                description: canvasCellValue(form, `row.${rowIndex}.description`),
                ratings: row.ratings.map((rating, ratingIndex) => ({
                    canvasRatingId: rating.canvasRatingId,
                    label: canvasCellValue(form, `row.${rowIndex}.rating.${ratingIndex}.label`),
                    description: canvasCellValue(form, `row.${rowIndex}.rating.${ratingIndex}.description`)
                }))
            }));
            if (rows.some((row) => !row.label)) throw new Error('Every rubric row needs a name.');

            await jsonRequest<CanvasRubricResponse>(
                `/assignments/${encodeURIComponent(assignment.id)}/canvas-rubric`,
                'PUT',
                { rows }
            );
            setDirty(false);
            showSuccessToast('Canvas rubric edits saved. Nothing was written back to Canvas.');
        }));
        form.append(actions);
    }

    section.append(form);
    return section;
}
