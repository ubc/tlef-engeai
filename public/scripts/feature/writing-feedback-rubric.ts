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
    deriveGenreState,
    describeDetails,
    describeGrid,
    describeProfile,
    type DetailsValues,
    type GridReadiness,
    type StepReadiness
} from './writing-feedback-rubric-progress.js';
import {
    MAX_CRITERIA,
    MAX_LEVELS,
    MIN_CRITERIA,
    MIN_LEVELS,
    RUBRIC_SLUG,
    parseBand,
    renderRubricGrid,
    slugFromLabel,
    spaceBandsEvenly
} from './writing-feedback-grid.js';
import {
    Assignment,
    assignmentOriginText,
    CanvasRubricRefusal,
    RubricCell,
    RubricCriterion,
    RubricDefinition,
    RubricLevel,
    RubricResponse,
    SflContextProfile,
    SflStage,
    WfFunctionTag,
    WritingFeedbackLens,
    chip,
    confirmDiscardDirty,
    createButton,
    createIconButton,
    createText,
    disclosureHeader,
    element,
    field,
    formatDate,
    inputControl,
    jsonRequest,
    refreshIcons,
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

/* ------------------------------------------------------------------------- *
 * Default rubric mirror
 *
 * Mirrored from src/writing-feedback/default-rubric-profile.ts and
 * lab-report-profile.ts, which the browser bundle cannot import: public/scripts/
 * never reaches into src/. Behaviour here is identical to the server data; the
 * two are kept in sync by the shared points/labels asserted in
 * src/writing-feedback/__tests__/default-rubric-profile.test.ts and
 * lab-report-profile.test.ts, and by this task's requirement that both were
 * edited together (Tasks 3, 4, and this one land in the same review).
 * ------------------------------------------------------------------------- */

const DEFAULT_WRITING_LEVELS_MIRROR: RubricLevel[] = [
    { id: 'weak', label: 'Weak', description: 'The criterion is not yet demonstrated; revision should start here.', rank: 1 },
    { id: 'developing', label: 'Developing', description: 'The criterion is partly demonstrated and needs focused revision.', rank: 2 },
    { id: 'proficient', label: 'Proficient', description: 'The criterion is clearly demonstrated for this task.', rank: 3 },
    { id: 'exemplary', label: 'Exemplary', description: 'The criterion is demonstrated precisely and effectively.', rank: 4 }
];

const DEFAULT_WRITING_CRITERIA_MIRROR: Array<{ id: string; label: string; description: string; functionTag?: WfFunctionTag; sflDimension?: string; points: number; descriptors: Record<string, string> }> = [
    {
        id: 'organization', label: 'Organization', functionTag: 'organizational', points: 30,
        description: 'How effectively the text is staged and held together for this task.',
        sflDimension: 'Information sequencing, theme progression, cohesive ties, and paragraph boundaries.',
        descriptors: {
            weak: 'Ideas appear in no clear sequence, paragraph boundaries are unclear or absent, and a reader must work to find related information.',
            developing: 'A rough sequence is visible but transitions are missing or inconsistent, and some paragraphs mix unrelated ideas.',
            proficient: 'Information is sequenced logically with clear paragraph boundaries and cohesive ties; a reader can follow the progression without re-reading.',
            exemplary: "The sequence builds purposefully toward the task's goal, transitions make relationships between ideas explicit, and paragraphing reinforces the structure."
        }
    },
    {
        id: 'content', label: 'Content', functionTag: 'content', points: 40,
        description: 'How accurately and completely the text represents the subject of the assignment.',
        sflDimension: 'Technical entities, processes, participants, circumstances, and the relations between them.',
        descriptors: {
            weak: 'The subject matter is mostly inaccurate, missing, or unrelated to what the task asked for.',
            developing: 'Core content is present but incomplete or contains inaccuracies that a reader familiar with the topic would notice.',
            proficient: 'The subject matter is represented accurately and completely, with entities, processes, and relationships explained correctly.',
            exemplary: 'Content is accurate, complete, and precise, with relationships between entities and processes explained in a way that shows command of the subject.'
        }
    },
    {
        id: 'interpersonal_positioning', label: 'Interpersonal Positioning', functionTag: 'interpersonal', points: 30,
        description: 'How effectively the writer positions the reader for the stated audience and purpose.',
        sflDimension: 'Modality, hedging, stance, and technicality calibrated to the stated audience.',
        descriptors: {
            weak: 'Stance and tone do not match the stated audience or purpose; claims are overstated, unsupported, or written for the wrong reader.',
            developing: 'Stance is mostly appropriate but modality, hedging, or technicality slip out of register in places.',
            proficient: 'Modality, hedging, and technicality are calibrated to the stated audience and purpose throughout.',
            exemplary: 'The writer positions the reader precisely and consistently, using stance and technicality that anticipate what this audience needs to be convinced or informed.'
        }
    }
];

const LAB_REPORT_LEVELS_MIRROR: RubricLevel[] = [
    { id: 'weak', label: 'Weak', description: 'The section is not yet demonstrated; revision should start here.', rank: 1, points: 0 },
    { id: 'developing', label: 'Developing', description: 'The section is partly demonstrated and needs focused revision.', rank: 2, points: 1 },
    { id: 'proficient', label: 'Proficient', description: 'The section is clearly demonstrated for this lab report.', rank: 3, points: 2 },
    { id: 'exemplary', label: 'Exemplary', description: 'The section is demonstrated precisely and effectively.', rank: 4, points: 3 }
];

const LAB_REPORT_CRITERIA_MIRROR: Array<{ id: string; label: string; description: string; points: number; descriptors: Record<string, string> }> = [
    { id: 'report_presentation', label: 'Report Presentation', points: 15,
        description: 'Whether the report is properly formatted, contains all required elements, and is presented in a clear, organized, professional way.',
        descriptors: {
            weak: 'The report is missing required elements or its formatting makes it difficult to follow.',
            developing: 'Most required elements are present, but formatting or organization is inconsistent in places.',
            proficient: 'The report is properly formatted, contains all required elements, and is organized clearly.',
            exemplary: 'The report is properly formatted, complete, and presented in a polished, professional way that reads like a finished technical document.'
        } },
    { id: 'language', label: 'Language', points: 5,
        description: 'Whether the quality of the language is appropriate and technical language is used where appropriate.',
        descriptors: {
            weak: 'Language errors or imprecise wording interfere with understanding, and technical terms are used incorrectly or not at all.',
            developing: 'Language is mostly clear, but technical terminology is used inconsistently or occasionally imprecisely.',
            proficient: 'Language quality is appropriate throughout and technical terms are used correctly where needed.',
            exemplary: 'Language is precise and appropriate throughout, and technical terminology is used accurately and confidently.'
        } },
    { id: 'abstract', label: 'Summary/Abstract', points: 10,
        description: 'Whether the summary is complete and concise, and states the experimental objectives, important results, and main conclusions.',
        descriptors: {
            weak: 'The summary is missing, or omits the objectives, results, or conclusions.',
            developing: 'The summary states most of the objectives, results, and conclusions but is incomplete or unfocused.',
            proficient: 'The summary is complete and concise, and clearly states the objectives, key results, and main conclusions.',
            exemplary: 'The summary is complete, concise, and gives a reader who reads nothing else an accurate picture of what was done, found, and concluded.'
        } },
    { id: 'results_discussion', label: 'Results and Discussion', points: 45,
        description: 'Whether every point in the lab handout is addressed, the discussion is correct and comprehensive, results are compared to theoretical or reported values, sources of error and deviations are critically discussed, and the report demonstrates understanding of the phenomena involved.',
        descriptors: {
            weak: 'Most handout points are unaddressed, results are not compared to expected values, and deviations are not discussed.',
            developing: 'Some handout points are addressed and results are compared to expected values, but the discussion of deviations or error sources is thin or missing.',
            proficient: 'Every point in the handout is addressed, results are compared to theoretical or reported values, and sources of error and deviations are discussed.',
            exemplary: 'Every point is addressed comprehensively, results are compared critically to expected values, and deviations are explained with plausible, well-reasoned causes that show real understanding of the phenomena.'
        } },
    { id: 'conclusions', label: 'Conclusions', points: 5,
        description: 'Whether the conclusions are supported by the results and discussion, relevant information is presented, and recommendations for improving the experiment are made.',
        descriptors: {
            weak: 'Conclusions are missing, unsupported by the results, or unrelated to the discussion.',
            developing: 'Conclusions follow the results in general terms but omit relevant information or recommendations.',
            proficient: 'Conclusions are supported by the results and discussion, present relevant information, and include recommendations for improving the experiment.',
            exemplary: 'Conclusions follow directly and precisely from the results and discussion, and the recommendations show genuine insight into how the experiment could be improved.'
        } },
    { id: 'references', label: 'References', points: 5,
        description: 'Whether material is appropriately referenced in the required citation style.',
        descriptors: {
            weak: 'Sources are missing or not cited in the required style.',
            developing: 'Most sources are cited, but the style is inconsistent or some citations are missing.',
            proficient: 'Material is appropriately referenced throughout in the required citation style.',
            exemplary: 'Every source is referenced accurately and consistently in the required citation style, with no gaps.'
        } },
    { id: 'sample_calculations', label: 'Sample Calculations', points: 15,
        description: 'Whether calculations are presented clearly and logically, use correct equations, are accurate, and report the correct number of significant figures.',
        descriptors: {
            weak: 'Calculations are missing, use incorrect equations, or contain errors that affect the results.',
            developing: 'Calculations are mostly correct but are presented unclearly or use an inconsistent number of significant figures.',
            proficient: 'Calculations are presented clearly and logically, use correct equations, are accurate, and report the correct number of significant figures.',
            exemplary: 'Calculations are presented clearly and logically, are fully accurate, use correct equations, and are precise about significant figures throughout.'
        } }
];

/**
 * defaultRubricCriteria - builds fresh criterion rows for the reset action
 *
 * @param lens - Which rubric's default template to build
 * @returns Detached criteria with bands and descriptors already spaced via {@link spaceBandsEvenly}
 */
function defaultRubricCriteria(lens: WritingFeedbackLens): RubricCriterion[] {
    const source = lens === 'technical' ? LAB_REPORT_CRITERIA_MIRROR : DEFAULT_WRITING_CRITERIA_MIRROR;
    const levels = lens === 'technical' ? LAB_REPORT_LEVELS_MIRROR : DEFAULT_WRITING_LEVELS_MIRROR;
    return source.map((criterion) => {
        const cells = spaceBandsEvenly(criterion.points, levels);
        Object.entries(criterion.descriptors).forEach(([levelId, descriptor]) => {
            if (cells[levelId]) cells[levelId] = { ...cells[levelId], descriptor };
        });
        return {
            id: criterion.id,
            label: criterion.label,
            description: criterion.description,
            ...('functionTag' in criterion && criterion.functionTag ? { functionTag: criterion.functionTag } : {}),
            ...('sflDimension' in criterion && criterion.sflDimension ? { sflDimension: criterion.sflDimension } : {}),
            points: criterion.points,
            cells
        } as RubricCriterion;
    });
}

/**
 * defaultRubricLevels - fresh, detached copies of the default ordinal scale
 *
 * @param lens - Which rubric's default level set to build
 * @returns Detached levels, safe for an editor to mutate
 */
function defaultRubricLevels(lens: WritingFeedbackLens): RubricLevel[] {
    return (lens === 'technical' ? LAB_REPORT_LEVELS_MIRROR : DEFAULT_WRITING_LEVELS_MIRROR).map((level) => ({ ...level }));
}

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
type RubricDraftInput = AssignmentDetailsInput & RubricStructureInput & {
    labContext?: string;
    sflContext?: SflContextProfile;
};

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
    /**
     * Save and Approve moved to step 3, where there is one of each for the whole
     * assignment. These let that single pair drive a rubric that no longer owns
     * its own buttons: a failure still surfaces in the grid it belongs to.
     */
    showValidationError: (message: string) => void;
    clearValidationError: () => void;
    /** Version this rubric would become on approval, used in the confirmation copy. */
    nextVersion: number;
    /** Whether an approved version already exists, which changes that copy. */
    hasApproved: boolean;
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

/** One field in the genre/register profile: plain label, optional SFL hint, and its control. */
interface SflFieldSpec {
    label: string;
    hint?: string;
    control: RubricControl;
    wide?: boolean;
}

/**
 * sflField - builds one genre-profile field with a plain label and an optional SFL hint line
 *
 * Mirrors {@link field} but appends the hint as a `.wf-field-hint` line under the control
 * instead of as a `<small>` sibling, and never puts SFL terminology in the label itself.
 *
 * @param spec - Label, optional hint, and control for this field
 * @returns Detached field wrapper
 */
function sflField(spec: SflFieldSpec): HTMLDivElement {
    const wrapper = field(spec.label, spec.control, undefined, spec.wide);
    if (spec.hint) wrapper.append(createText('small', spec.hint, 'wf-field-hint'));
    return wrapper;
}

/**
 * profileStatusChip - the profile's readiness, said as a count rather than a state
 *
 * "Needs your input" told staff nothing about how much was left, and "Ready" was
 * a claim the engine did not honour. A count is checkable against the questions
 * on screen.
 *
 * @param readiness - Current profile readiness
 * @returns Detached chip
 */
function profileStatusChip(readiness: StepReadiness): HTMLElement {
    return readiness.complete
        ? chip('Every question answered', 'green')
        : chip(`${readiness.done} of ${readiness.total} answered`, 'amber');
}

/**
 * renderSflProfileBox - the genre and register profile as its own collapsible sub-section
 *
 * Plain-language labels are primary; the SFL term (Field, Tenor, Mode, embedded genres)
 * appears only as a hint line, and the internal `genreId` is never shown (D-066, D-073).
 * Stages use {@link renderStageRepeater} instead of a delimited textarea.
 *
 * @param sflContext - Current profile values, or undefined for a brand-new draft
 * @param details - Description values the profile borrows task, purpose, audience and outcomes from
 * @param canEdit - Whether the current staff user may modify the profile
 * @param onInput - Dirty-tracking handler shared with the rest of the details form
 * @returns Detached sub-box; its controls are named `sfl.*` and read by {@link collectSflContext}
 */
function renderSflProfileBox(
    sflContext: SflContextProfile | undefined,
    details: DetailsValues,
    canEdit: boolean,
    onInput: () => void
): HTMLDivElement {
    // Readiness answers to requireCompleteSflProfile, the rule that actually
    // blocks feedback. The old test here asked only whether the fields were
    // non-empty, which the seeded placeholder text satisfies, so a profile
    // generation would reject could show a green "Ready" chip.
    const readiness = describeProfile(sflContext, details);
    const complete = readiness.complete;

    const outer = document.createElement('div');
    outer.className = 'wf-field wf-field--wide';

    const box = document.createElement('div');
    box.className = 'wf-profile-box';
    const body = document.createElement('div');
    body.className = 'wf-profile-box-body';

    const title = createText('h3', 'What kind of writing is this?', 'wf-subsection-title');
    // Recomputed in place by renderRubricPage's progress refresh; the count here
    // is only the value at first paint.
    const statusSlot = document.createElement('span');
    statusSlot.className = 'wf-profile-status';
    statusSlot.append(profileStatusChip(readiness));
    const header = disclosureHeader([title, statusSlot], body, `wf-profile-box-body-${crypto.randomUUID()}`, !complete, 'wf-profile-box-header');

    // Approval does not require this sub-card, but generation does. Saying so here
    // is the disclosure that used to arrive only as a failure on the review page.
    body.append(createText('p', 'Not needed to approve — but the assistant cannot draft feedback without it.', 'wf-help-text'));

    body.append(createText('p', 'The writing itself', 'wf-group-label'));
    const genreLabelControl = namedControl(inputControl(sflContext?.genreLabel ?? ''), 'sfl.genreLabel');
    body.append(sflField({
        label: 'What kind of writing is it?', control: genreLabelControl, wide: true,
        hint: 'e.g. “A reflective essay”, “A lab report”, “A short design proposal”.'
    }));

    const fieldControl = namedControl(textAreaControl(sflContext?.field ?? '', 2), 'sfl.field');
    const tenorControl = namedControl(textAreaControl(sflContext?.tenor ?? '', 2), 'sfl.tenor');
    body.append(sflField({
        label: 'What is the writing about?', control: fieldControl,
        hint: 'The subject matter — e.g. “The collapse of the Quebec Bridge.”'
    }));
    body.append(sflField({
        label: 'How should the student sound?', control: tenorControl,
        hint: 'How formal, and how close to the reader — e.g. “Personal, but still careful with claims.”'
    }));

    body.append(createText('p', 'How it is written', 'wf-group-label'));
    const modeControl = namedControl(textAreaControl(sflContext?.mode ?? '', 2), 'sfl.mode');
    const evaluatorControl = namedControl(textAreaControl(sflContext?.actualEvaluator ?? 'Instructor or teaching assistant.', 1), 'sfl.actualEvaluator');
    const productionControl = namedControl(textAreaControl(sflContext?.productionConditions ?? '', 2), 'sfl.productionConditions');
    body.append(sflField({
        label: 'How long, and in what form?', control: modeControl,
        hint: 'e.g. “1,000 words, submitted as a Word file.”'
    }));
    body.append(sflField({ label: 'Who marks it?', control: evaluatorControl }));
    body.append(sflField({
        label: 'What were the writing conditions?', control: productionControl,
        hint: 'e.g. “Take-home, over two weeks”, or “Written in class, one hour, closed book.”'
    }));

    body.append(createText('p', 'How it is put together', 'wf-group-label'));
    body.append(renderStageRepeater(sflContext?.stages ?? [], canEdit, onInput));
    const embeddedGenres = namedControl(textAreaControl((sflContext?.embeddedGenres ?? []).join('\n'), 2), 'sfl.embeddedGenres');
    embeddedGenres.placeholder = 'One per line';
    const taskRequirements = namedControl(textAreaControl((sflContext?.taskRequirements ?? []).join('\n'), 3), 'sfl.taskRequirements');
    taskRequirements.placeholder = 'One per line';
    const glossaryTerms = namedControl(textAreaControl((sflContext?.approvedGlossaryTerms ?? []).join('\n'), 2), 'sfl.approvedGlossaryTerms');
    glossaryTerms.placeholder = 'One per line';
    body.append(sflField({
        label: 'Smaller pieces of writing inside it', control: embeddedGenres,
        hint: 'e.g. a data commentary inside a lab report. Leave blank if none.'
    }));
    body.append(sflField({
        label: 'What must they include?', control: taskRequirements,
        hint: 'One per line — e.g. “At least three sources.”'
    }));
    body.append(sflField({
        label: 'Words from your course glossary', control: glossaryTerms,
        hint: 'One per line. Leave blank if none.'
    }));

    [genreLabelControl, fieldControl, tenorControl, modeControl, evaluatorControl, productionControl,
        embeddedGenres, taskRequirements, glossaryTerms].forEach((control) => bindTextControl(control, canEdit, onInput));

    box.append(header, body);
    outer.append(box);
    return outer;
}

/**
 * renderStageRepeater - editable list of assignment stages, replacing the old
 * pipe-delimited textarea with real add/remove/reorder controls
 *
 * Each row writes two hidden-in-plain-sight named controls,
 * `sfl.stage.{n}.label` and `sfl.stage.{n}.purpose`, that {@link readStageRepeaterRows}
 * reads back on save. Stage ids are derived from the label the same way criterion
 * ids are derived, via {@link slugFromLabel}, and are never shown to staff.
 *
 * @param initialStages - Stages already on the draft, in order
 * @param canEdit - Whether the current staff user may modify the profile
 * @param onInput - Dirty-tracking handler shared with the rest of the details form
 * @returns Detached field wrapper containing the repeater
 */
function renderStageRepeater(
    initialStages: SflStage[],
    canEdit: boolean,
    onInput: () => void
): HTMLDivElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'wf-field wf-field--wide';
    const labelEl = document.createElement('label');
    labelEl.textContent = 'What sections should it have, in order?';
    wrapper.append(labelEl);

    const list = document.createElement('div');
    list.className = 'wf-stage-repeater';
    wrapper.append(list);

    const rows: Array<{ id: string; nameLabel: HTMLInputElement; purpose: HTMLTextAreaElement }> = [];

    const renumber = (): void => {
        list.replaceChildren();
        rows.forEach((row, index) => {
            row.nameLabel.name = `sfl.stage.${index}.label`;
            row.purpose.name = `sfl.stage.${index}.purpose`;
            const rowEl = document.createElement('div');
            rowEl.className = 'wf-stage-row';
            rowEl.append(row.nameLabel, row.purpose);
            if (canEdit) {
                const remove = createIconButton('trash-2', `Remove stage ${row.nameLabel.value || index + 1}`, 'danger', async () => {
                    const at = rows.indexOf(row);
                    if (at === -1) return;
                    rows.splice(at, 1);
                    renumber();
                    onInput();
                });
                rowEl.append(remove);
            }
            list.append(rowEl);
        });
    };

    const addRow = (label: string, purpose: string): void => {
        const nameLabel = document.createElement('input');
        nameLabel.type = 'text';
        nameLabel.value = label;
        nameLabel.placeholder = 'Section name';
        nameLabel.readOnly = !canEdit;
        nameLabel.addEventListener('input', onInput);
        const purposeControl = document.createElement('textarea');
        purposeControl.value = purpose;
        purposeControl.rows = 1;
        purposeControl.placeholder = 'What this section is for';
        purposeControl.readOnly = !canEdit;
        purposeControl.addEventListener('input', onInput);
        rows.push({ id: crypto.randomUUID(), nameLabel, purpose: purposeControl });
        renumber();
    };

    (initialStages.length ? initialStages : [{ id: 'main_response', label: 'Main response', purpose: '', required: true, order: 1 }])
        .forEach((stage) => addRow(stage.label, stage.purpose));

    if (canEdit) {
        const addButton = createButton('Add stage', 'secondary', async () => {
            addRow('', '');
            onInput();
        });
        wrapper.append(addButton);
    }

    return wrapper;
}

/**
 * readStageRepeaterRows - reads the stage repeater's controls back into stage values
 *
 * @param form - Details form owning the repeater
 * @returns Stages in row order, with ids derived from each label via {@link slugFromLabel}
 */
function readStageRepeaterRows(form: HTMLFormElement): SflStage[] {
    const stages: SflStage[] = [];
    const usedIds = new Set<string>();
    for (let index = 0; ; index += 1) {
        const label = optionalControlValue(form, `sfl.stage.${index}.label`);
        if (label === undefined) break;
        const purpose = optionalControlValue(form, `sfl.stage.${index}.purpose`) ?? '';
        if (!label.trim()) continue;
        let id = slugFromLabel(label) || `stage_${index + 1}`;
        while (usedIds.has(id)) id = `${id}_${index + 1}`;
        usedIds.add(id);
        stages.push({ id, label, purpose, required: true, order: stages.length + 1 });
    }
    return stages;
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
        ...(source.sflContext ? {
            sflContext: {
                ...source.sflContext,
                stages: source.sflContext.stages.map((stage) => ({ ...stage })),
                embeddedGenres: [...source.sflContext.embeddedGenres],
                taskRequirements: [...source.sflContext.taskRequirements],
                learningOutcomes: [...source.sflContext.learningOutcomes],
                ...(source.sflContext.approvedGlossaryTerms
                    ? { approvedGlossaryTerms: [...source.sflContext.approvedGlossaryTerms] }
                    : {})
            }
        } : {}),
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
 * A cell exists only where staff entered points; a blank cell means the
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
 * grid edits hidden function tags or per-level points — can never blank it on save.
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
 * detailsFromDraft - the description values a rubric was stored with
 *
 * Used for the profile chip's first paint, before the details form exists to be
 * read; every later recomputation reads the live form instead.
 *
 * @param draft - Rubric supplying the stored description
 * @returns Description values as saved
 */
function detailsFromDraft(draft: RubricDefinition): DetailsValues {
    return {
        title: draft.title,
        task: draft.task,
        audience: draft.audience,
        purpose: draft.purpose,
        constraints: draft.constraints,
        learningOutcomes: draft.learningOutcomes,
        gradingIntent: draft.gradingIntent
    };
}

/**
 * readAssignmentDetails - reads the shared assignment description without judging it
 *
 * The progress strip and the profile chip recompute on every keystroke, when the
 * form is by definition half-answered, so they need a reader that reports what
 * is there rather than refusing an incomplete form. Saving still goes through
 * {@link collectAssignmentDetails}, which validates.
 *
 * @param form - The assignment-details form rendered once per page
 * @returns Current description values, however incomplete
 */
function readAssignmentDetails(form: HTMLFormElement): AssignmentDetailsInput {
    return {
        title: rubricTextValue(form, 'title'),
        task: rubricTextValue(form, 'task'),
        audience: rubricTextValue(form, 'audience'),
        purpose: rubricTextValue(form, 'purpose'),
        constraints: rubricLines(form, 'constraints'),
        learningOutcomes: rubricLines(form, 'learningOutcomes'),
        gradingIntent: rubricTextValue(form, 'gradingIntent'),
    };
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
    const details = readAssignmentDetails(form);
    if (!details.constraints.length || !details.learningOutcomes.length) {
        throw new Error('Add at least one requirement and one learning outcome.');
    }
    return details;
}

/**
 * readSflContext - reads the profile form without judging it, and derives its state
 *
 * Like {@link readAssignmentDetails}, this exists because the progress strip and
 * the profile chip recompute on every keystroke and must describe a half-filled
 * form rather than refuse it. Saving still goes through {@link collectSflContext}.
 *
 * `genreState` is derived here rather than asked. The control that used to set it
 * was a dropdown asking staff to state the profile's status, which meant nothing
 * to them: moving it off `needs_staff_input` over untouched placeholder text
 * produced a green "Ready" chip on a profile the engine rejects. Deriving it is also
 * what makes removing the control safe — without a derivation, every profile
 * would be stuck on `needs_staff_input` and feedback would be blocked forever.
 *
 * @param form - The details form, which owns the `sfl.*` controls
 * @param details - Description values supplying task, purpose, audience and outcomes
 * @param previousGenreId - Genre id carried forward from the stored profile
 * @returns Current profile values, however incomplete, with a derived state
 */
function readSflContext(
    form: HTMLFormElement,
    details: AssignmentDetailsInput,
    previousGenreId: string | undefined
): SflContextProfile {
    const profile: SflContextProfile = {
        genreId: previousGenreId,
        genreLabel: rubricTextValue(form, 'sfl.genreLabel'),
        genreState: 'needs_staff_input',
        task: details.task,
        purpose: details.purpose,
        audience: details.audience,
        field: rubricTextValue(form, 'sfl.field'),
        tenor: rubricTextValue(form, 'sfl.tenor'),
        mode: rubricTextValue(form, 'sfl.mode'),
        actualEvaluator: rubricTextValue(form, 'sfl.actualEvaluator'),
        productionConditions: rubricTextValue(form, 'sfl.productionConditions'),
        stages: readStageRepeaterRows(form),
        embeddedGenres: rubricLines(form, 'sfl.embeddedGenres'),
        taskRequirements: rubricLines(form, 'sfl.taskRequirements'),
        learningOutcomes: details.learningOutcomes,
        approvedGlossaryTerms: rubricLines(form, 'sfl.approvedGlossaryTerms')
    };
    return { ...profile, genreState: deriveGenreState(profile, details) };
}

/**
 * collectSflContext - validates the profile the way saving requires
 *
 * @param form - The details form, which owns the `sfl.*` controls
 * @param details - Description values written into the profile on save
 * @param previousGenreId - Genre id carried forward from the stored profile
 * @returns The profile persisted with this rubric draft
 * @throws Error carrying a message written for staff, shown in the validation summary
 */
function collectSflContext(
    form: HTMLFormElement,
    details: AssignmentDetailsInput,
    previousGenreId: string | undefined
): SflContextProfile {
    const profile = readSflContext(form, details, previousGenreId);
    const required = [
        profile.genreLabel, profile.field, profile.tenor,
        profile.mode, profile.actualEvaluator, profile.productionConditions
    ];
    if (required.some((value) => !value)) {
        throw new Error('Complete the genre and register profile before saving.');
    }
    if (!profile.stages.length) throw new Error('Add at least one reviewed stage before saving.');
    return profile;
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

/** One cell of the progress strip. */
interface StepState {
    ordinal: number;
    label: string;
    /** The short line under the label, e.g. "Every question answered". */
    detail: string;
    state: 'done' | 'current' | 'pending';
}

/**
 * stepToken - the numbered circle that opens a step header
 *
 * Decorative: every step header already carries its ordinal in the heading text
 * that follows, so announcing the token as well would read the number twice.
 *
 * @param ordinal - 1-based step number
 * @returns Detached token element
 */
function stepToken(ordinal: number): HTMLElement {
    const token = document.createElement('span');
    token.className = 'wf-step-token';
    token.setAttribute('aria-hidden', 'true');
    token.textContent = String(ordinal);
    return token;
}

/**
 * renderProgressStrip - the three-cell bar that always says where the user is
 *
 * Derived from the live working copies on every input; nothing here is stored.
 * Marked up as an ordered list so the ordinals are real content for a screen
 * reader rather than decorative circles.
 *
 * @param steps - The three step states, in order
 * @returns Detached strip element
 */
function renderProgressStrip(steps: StepState[]): HTMLElement {
    const list = document.createElement('ol');
    list.className = 'wf-steps';
    steps.forEach((step) => {
        const item = document.createElement('li');
        item.className = 'wf-steps__item';
        item.dataset.state = step.state;
        if (step.state === 'current') item.setAttribute('aria-current', 'step');

        const token = document.createElement('span');
        token.className = 'wf-steps__token';
        token.setAttribute('aria-hidden', 'true');
        if (step.state === 'done') {
            token.innerHTML = '<i data-feather="check" aria-hidden="true"></i>';
        } else {
            token.textContent = String(step.ordinal);
        }

        const text = document.createElement('span');
        text.className = 'wf-steps__text';
        text.append(
            createText('span', `${step.ordinal}. ${step.label}`, 'wf-steps__label'),
            createText('span', step.detail, 'wf-steps__detail')
        );

        item.append(token, text);
        list.append(item);
    });
    return list;
}

/**
 * linkAccordion - makes a set of disclosure headers mutually exclusive
 *
 * Watches `aria-expanded` rather than listening for clicks, because
 * {@link disclosureHeader}'s keyboard path calls its toggle directly and never
 * dispatches a click event: a click listener would leave Enter and Space able to
 * open two steps at once.
 *
 * @param headers - Headers that may not be open simultaneously
 */
function linkAccordion(headers: HTMLElement[]): void {
    let settling = false;
    headers.forEach((header) => {
        const observer = new MutationObserver(() => {
            if (settling || header.getAttribute('aria-expanded') !== 'true') return;
            settling = true;
            headers
                .filter((other) => other !== header && other.getAttribute('aria-expanded') === 'true')
                .forEach((other) => other.click());
            settling = false;
        });
        observer.observe(header, { attributes: true, attributeFilter: ['aria-expanded'] });
    });
}

/**
 * describeAllGrids - readiness across every grid the assignment owns
 *
 * A lab report has two, and a staff member thinks of "the grid" as finished only
 * when both are. Reads each editor's live working copy, so the strip moves as the
 * grid is edited rather than reporting the version the page loaded with.
 *
 * @param sections - Registered rubric editors
 * @returns Summed counts across every grid
 */
function describeAllGrids(sections: RubricSectionHandle[]): GridReadiness {
    const parts = sections.map((section) => describeGrid(section.working.criteria, section.working.levels));
    if (!parts.length) return { criteria: 0, levels: 0, totalPoints: 0, emptyCells: 0, complete: false };
    return {
        criteria: parts.reduce((sum, part) => sum + part.criteria, 0),
        // Levels are the shared columns of one grid, so a single-grid assignment
        // reports its own count and a lab report reports its writing grid's.
        levels: parts[0].levels,
        totalPoints: Number(parts.reduce((sum, part) => sum + part.totalPoints, 0).toFixed(2)),
        emptyCells: parts.reduce((sum, part) => sum + part.emptyCells, 0),
        complete: parts.every((part) => part.complete)
    };
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

    const back = createButton('← Back to assignments', 'quiet', async () => {
        if (!(await confirmDiscardDirty('setup'))) return;
        state.panelDirty = false;
        await views.showLanding();
    });
    back.classList.add('wf-back-button');
    root.append(back);

    const header = document.createElement('header');
    header.className = 'wf-rubric-header';
    // The assignment's own name is the page title: staff know which assignment
    // they clicked, and the heading confirms it rather than naming the form.
    const heading = createText('h1', assignment.title, 'wf-rubric-title');
    const meta = document.createElement('p');
    meta.className = 'wf-assignment-meta';
    const canEditAny = linguisticData.permissions.canEdit;
    meta.append(
        // The writing rubric's approval state belongs beside the assignment title;
        // a lab report's second rubric carries its own state in its section header.
        approvalStateChip(linguisticData),
        createText('span', assignmentOriginText(assignment)),
        // Shown only when the assignment carries a deadline; "No deadline" spends a segment
        // on the absence of something optional.
        ...(assignment.dueAt ? [createText('span', `Deadline ${formatDate(assignment.dueAt, true)}`)] : []),
        chip(canEditAny ? 'Editable' : 'Read-only', canEditAny ? 'green' : 'neutral')
    );
    header.append(heading, meta);
    root.append(header);

    const instructions = document.createElement('details');
    instructions.className = 'wf-assignment-instructions';
    const instructionsSummary = document.createElement('summary');
    instructionsSummary.textContent = 'What students were told to do';
    instructions.append(
        instructionsSummary,
        createText(
            'div',
            assignment.instructions || 'Nothing was imported for this assignment. Describe the task in step 1 instead.',
            assignment.instructions ? 'wf-assignment-instructions__text' : 'wf-muted-note'
        )
    );
    root.append(instructions);

    // The progress strip is inserted here but filled by refreshProgress once the
    // steps below exist; everything it shows is derived, nothing is stored.
    const stripMount = document.createElement('div');
    stripMount.className = 'wf-steps-mount';
    root.append(stripMount);

    const writingSource = linguisticData.draft ?? linguisticData.approved;
    if (!writingSource) throw new Error('This assignment does not have a rubric draft or approved rubric.');
    const technicalSource = technicalData?.draft ?? technicalData?.approved;

    const clearValidation = (): void => {
        root.querySelectorAll<HTMLElement>('.wf-validation-summary').forEach((node) => { node.hidden = true; });
    };

    let context: RubricPageContext | undefined;

    const step1Body = document.createElement('div');
    step1Body.className = 'wf-step-body';
    const detailsForm = renderAssignmentDetails(step1Body, writingSource, {
        canEdit: linguisticData.permissions.canEdit,
        isLabReport,
        labContext: technicalSource?.labContext ?? '',
        hasInstructions: Boolean(assignment.instructions?.trim()),
        notice,
        onInput: () => {
            if (linguisticData.permissions.canEdit) state.panelDirty = true;
            clearValidation();
            refreshProgress();
        },
        onFillFromInstructions: async (status) => {
            if (!context) throw new Error('The rubric page is still loading.');
            await fillRubricsFromInstructions(context, status);
        },
        onResetToDefault: async () => {
            if (!context) throw new Error('The rubric page is still loading.');
            const confirmation = await showConfirmModal(
                'Start over from the standard rubric?',
                isLabReport
                    ? 'Both grids will be replaced with their starting templates. Nothing is saved until you choose Save for now or Approve rubric in step 3.'
                    : 'The grid will be replaced with its starting template. Nothing is saved until you choose Save for now or Approve rubric in step 3.',
                'Reset rubric',
                'Cancel',
                'danger'
            );
            if (confirmation.action !== 'reset-rubric') return;
            context.sections.forEach((section) => {
                if (!section.canEdit) return;
                section.working.criteria = defaultRubricCriteria(section.lens);
                section.working.levels = defaultRubricLevels(section.lens);
            });
            state.panelDirty = linguisticData.permissions.canEdit ? true : state.panelDirty;
            await openRubricPage(assignment.id);
        }
    });

    // Assigned once every step exists. Declared here so the details form's input
    // handler can call it without depending on the order the page is built in.
    let refreshProgress = (): void => {};

    const readDetailsNow = (): DetailsValues => readAssignmentDetails(detailsForm);
    const readProfileNow = (): SflContextProfile =>
        readSflContext(detailsForm, readDetailsNow(), writingSource.sflContext?.genreId);
    const describedComplete = (): boolean =>
        describeDetails(readDetailsNow()).complete && describeProfile(readProfileNow(), readDetailsNow()).complete;

    const step1Open = !describedComplete();

    const step1Meta = createText('span', '', 'wf-step-meta');
    const step1 = document.createElement('div');
    step1.className = 'wf-step';
    // The token is aria-hidden, so the ordinal is carried as text in the heading.
    const step1Title = createText('h2', '1. Describe the assignment', 'wf-step-title');
    const step1Header = disclosureHeader(
        [stepToken(1), step1Title, step1Meta],
        step1Body, 'wf-step-1-body', step1Open, 'wf-step-header'
    );
    step1.append(step1Header, step1Body);
    root.append(step1);

    const pageContext: RubricPageContext = {
        assignment,
        detailsForm,
        sections: [],
        isLabReport,
        technicalMissing: Boolean(technicalData) && !technicalData?.draft && !technicalData?.approved
    };
    context = pageContext;

    const step2Body = document.createElement('div');
    step2Body.className = 'wf-step-body';

    // An imported assignment whose Canvas rubric was out of contract was seeded from
    // the built-in profile instead. Staff met that silently until now.
    if (assignment.canvasRubricRefusal && !linguisticData.approved) {
        const dropped = document.createElement('div');
        dropped.className = 'wf-owed';
        dropped.append(
            createText('p', "This assignment's Canvas rubric could not be imported", 'wf-owed__title'),
            createText('p', `${canvasRefusalReason(assignment.canvasRubricRefusal)} The starting grid below is EngE-AI's default — replace it with your own before approving.`)
        );
        step2Body.append(dropped);
    }

    // The heading names the rubric (D-066) and the plain-English line explains it. A lab
    // report shows two grids at once, so the name is what tells them apart.
    step2Body.append(renderRubricSection(pageContext, linguisticData, 'linguistic', {
        heading: isLabReport ? 'Writing rubric' : 'Rubric',
        subtitle: isLabReport
            ? 'How they wrote it — structure, clarity, and how the writing speaks to its reader'
            : 'Structure, clarity, and how the writing speaks to its reader',
        errorLabel: isLabReport ? 'the writing rubric' : '',
        showState: isLabReport
    }));

    if (technicalData) {
        // A lab report can lose its only technical rubric (e.g. its draft was
        // deleted directly via the API before ever being approved). Offer a
        // re-seed action instead of throwing out of renderRubricSection.
        if (!technicalData.draft && !technicalData.approved) {
            step2Body.append(renderMissingTechnicalRubric(assignment));
        } else {
            step2Body.append(renderRubricSection(pageContext, technicalData, 'technical', {
                heading: 'Technical rubric',
                subtitle: 'The experiment itself — whether the reasoning holds together and the data supports the claims',
                errorLabel: 'the technical rubric',
                showState: true
            }));
        }
    }

    // Open the first of the two that is unfinished; when both are done they close
    // and Step 3 carries the page, which is the resting state of a finished rubric.
    const step2Open = !step1Open && !describeAllGrids(pageContext.sections).complete;

    const step2Meta = createText('span', '', 'wf-step-meta');
    const step2 = document.createElement('div');
    step2.className = 'wf-step';
    const step2Title = createText('h2', isLabReport ? '2. Build the marking grids' : '2. Build the marking grid', 'wf-step-title');
    const step2Header = disclosureHeader(
        [stepToken(2), step2Title, step2Meta],
        step2Body, 'wf-step-2-body', step2Open, 'wf-step-header'
    );
    step2.append(step2Header, step2Body);
    root.append(step2);

    // Steps 1 and 2 are the accordion; opening one closes the other so the page
    // never becomes the wall of simultaneously open boxes this redesign replaced.
    // Step 3 is not part of it -- its actions must never be a click away.
    linkAccordion([step1Header, step2Header]);

    // Step 3 is not a disclosure. It is the terminus, it is short, and its actions
    // must never be a click away, so its body is always rendered. The header is
    // there for rhythm and numbering only.
    const step3 = document.createElement('div');
    step3.className = 'wf-step wf-step--terminal';
    const step3Header = document.createElement('div');
    step3Header.className = 'wf-step-header wf-step-header--static';
    step3Header.append(stepToken(3), createText('h2', '3. Approve it', 'wf-step-title'));

    const step3Body = document.createElement('div');
    step3Body.className = 'wf-step-body';

    const approveRow = document.createElement('div');
    approveRow.className = 'wf-approve-row';
    const approveCopy = document.createElement('div');
    approveCopy.className = 'wf-approve-copy';
    approveCopy.append(
        createText('p', 'You can approve now. Approving fixes the version that student work is marked against.'),
        createText('p', 'You can still change the rubric afterwards — feedback already drafted keeps the version it was marked against.', 'wf-help-text')
    );
    approveRow.append(approveCopy);

    if (canEditAny) {
        const actions = document.createElement('div');
        actions.className = 'wf-button-row';
        actions.append(
            createButton('Save for now', 'secondary', async () => {
                await saveEveryRubric(pageContext);
                state.panelDirty = false;
                state.assignments = await request<Assignment[]>('/assignments');
                showSuccessToast('Rubric draft saved. The approved rubric is unchanged.');
                await openRubricPage(assignment.id);
            }),
            createButton('Approve rubric', 'primary', async () => approveEveryRubric(pageContext))
        );
        approveRow.append(actions);
    }

    step3Body.append(approveRow);

    // What is still owed before feedback can be drafted. This is disclosure, not a
    // gate: requireCompleteSflProfile enforces it at generation, and staff used to
    // meet it only as a failure on the review page.
    const owed = document.createElement('div');
    owed.className = 'wf-owed';
    owed.hidden = true;
    step3Body.append(owed);

    step3.append(step3Header, step3Body);
    root.append(step3);

    /**
     * refreshProgress - recomputes the strip, the step summaries, the profile chip,
     * and the owed notice from the live working copies
     *
     * Called on every input. Everything it renders is derived; nothing is stored.
     * It reads the details form and each editor's working copy rather than the
     * rubric the page loaded with, so the numbers move as staff type.
     */
    refreshProgress = (): void => {
        const details = readDetailsNow();
        const detailsNow = describeDetails(details);
        const profileNow = describeProfile(readProfileNow(), details);
        const gridNow = describeAllGrids(pageContext.sections);
        const describedDone = detailsNow.complete && profileNow.complete;

        stripMount.replaceChildren(renderProgressStrip([
            {
                ordinal: 1, label: 'Describe the assignment', state: describedDone ? 'done' : 'current',
                detail: detailsNow.complete
                    ? (profileNow.complete
                        ? 'Every question answered'
                        : `Writing profile: ${profileNow.done} of ${profileNow.total} answered`)
                    : `${detailsNow.done} of ${detailsNow.total} questions answered`
            },
            {
                ordinal: 2, label: isLabReport ? 'Build the marking grids' : 'Build the marking grid',
                state: gridNow.complete ? 'done' : (describedDone ? 'current' : 'pending'),
                detail: gridNow.complete
                    ? `${gridNow.criteria} criteria · ${gridNow.levels} levels · ${gridNow.totalPoints} points`
                    : `${gridNow.emptyCells} ${gridNow.emptyCells === 1 ? 'box' : 'boxes'} still empty`
            },
            {
                ordinal: 3, label: 'Approve it',
                state: describedDone && gridNow.complete ? 'current' : 'pending',
                detail: describedDone && gridNow.complete
                    ? 'Ready to approve'
                    : 'Ready to approve — some things still owed'
            }
        ]));

        const outstanding: string[] = [];
        if (!profileNow.complete) {
            outstanding.push(`“What kind of writing is this?” is ${profileNow.done} of ${profileNow.total} answered`);
        }
        if (gridNow.emptyCells > 0) {
            outstanding.push(`${gridNow.emptyCells} ${gridNow.emptyCells === 1 ? 'box' : 'boxes'} in the grid ${gridNow.emptyCells === 1 ? 'is' : 'are'} still empty`);
        }
        owed.hidden = outstanding.length === 0;
        owed.replaceChildren(
            createText('p', outstanding.length === 1
                ? 'One more thing before any feedback can be drafted'
                : 'Two more things before any feedback can be drafted', 'wf-owed__title'),
            createText('p', `${outstanding.join(', and ')}.`)
        );

        step1Meta.textContent = describedDone
            ? 'Every question answered'
            : `${detailsNow.done} of ${detailsNow.total} questions answered`;
        step2Meta.textContent = gridNow.complete
            ? `${gridNow.criteria} criteria · ${gridNow.levels} levels · ${gridNow.totalPoints} points`
            : `${gridNow.emptyCells} ${gridNow.emptyCells === 1 ? 'box' : 'boxes'} still empty`;

        detailsForm.querySelector('.wf-profile-status')?.replaceChildren(profileStatusChip(profileNow));
        refreshIcons();
    };
    refreshProgress();

    if (notice) setWorkspaceMessage(notice.message, notice.tone);
    refreshIcons();
}

/**
 * saveEveryRubric - the page's one Save, writing every rubric the assignment owns
 *
 * A validation failure is surfaced in the grid it belongs to, the way the
 * per-section Save used to, so the message still appears next to the field that
 * caused it rather than beside a button two steps away.
 *
 * @param context - Page context holding the details form and registered editors
 * @throws Error carrying the first staff-facing validation or transport failure
 */
async function saveEveryRubric(context: RubricPageContext): Promise<void> {
    try {
        await saveAssignmentRubrics(context);
        context.sections.forEach((section) => section.clearValidationError());
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Review the rubric fields.';
        context.sections.find((section) => section.canEdit)?.showValidationError(message);
        throw error;
    }
}

/**
 * approveEveryRubric - the page's one Approve, covering every rubric it owns
 *
 * Staff think of approving "the rubric" once, even on a lab report that keeps
 * two. Each request is the same per-rubric approve the page has always issued;
 * only the button count changed. Saving first is what the per-section Approve
 * did too, so an unsaved edit can never be approved out from under its author.
 *
 * @param context - Page context holding the registered rubric editors
 * @throws Error carrying the first staff-facing validation or transport failure
 */
async function approveEveryRubric(context: RubricPageContext): Promise<void> {
    await saveEveryRubric(context);
    state.panelDirty = false;

    const editable = context.sections.filter((section) => section.canEdit);
    if (!editable.length) return;
    const versions = editable.map((section) => `v${section.nextVersion}`).join(' and ');
    const alreadyApproved = editable.some((section) => section.hasApproved);
    const noun = editable.length > 1 ? 'Rubrics' : 'Rubric';
    const confirmation = await showConfirmModal(
        alreadyApproved ? 'Approve this rubric version?' : 'Approve this first rubric?',
        alreadyApproved
            ? `${noun} ${versions} will become active for future feedback. Older unreleased feedback must be regenerated. This does not update Canvas.`
            : `${noun} ${versions} will become active for this assignment. This does not generate feedback or update Canvas.`,
        'Approve rubric',
        'Keep as draft'
    );
    if (confirmation.action !== 'approve-rubric') return;

    for (const section of editable) {
        await jsonRequest(
            `/assignments/${encodeURIComponent(context.assignment.id)}/rubric-draft/approve${rubricLensQuery(section.lens)}`,
            'POST'
        );
    }
    state.panelDirty = false;
    state.assignments = await request<Assignment[]>('/assignments');
    showSuccessToast('Rubric approved for future feedback generation.');
    await openRubricPage(context.assignment.id);
}

/** Rendering options that differ between an assignment's first and second rubric. */
interface RubricSectionOptions {
    /** Visible section heading, naming what this grid judges rather than its lens. */
    heading: string;
    /** One line under the heading saying what this grid judges. */
    subtitle?: string;
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
    onResetToDefault: () => Promise<void>;
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
            'Fill these in for me',
            'secondary',
            async () => options.onFillFromInstructions(fillStatus),
            !options.hasInstructions
        );
        if (!options.hasInstructions) fillButton.title = 'Add the assignment instructions first';
        headingRow.append(fillButton);

        const resetButton = createButton('Start over from the standard rubric', 'secondary', async () => options.onResetToDefault());
        headingRow.append(resetButton);
    }

    const form = document.createElement('form');
    form.className = 'wf-rubric-details-form';
    const grid = document.createElement('div');
    grid.className = 'wf-form-grid';

    const constraints = namedControl(textAreaControl(draft.constraints.join('\n'), 5), 'constraints');
    constraints.placeholder = 'One per line';
    const learningOutcomes = namedControl(textAreaControl(draft.learningOutcomes.join('\n'), 5), 'learningOutcomes');
    learningOutcomes.placeholder = 'One per line';

    const entries: Array<{ label: string; hint?: string; control: HTMLInputElement | HTMLTextAreaElement; wide?: boolean }> = [
        {
            // This is RubricDefinition.title, not the assignment's. The page heading
            // above already carries the assignment name, so calling this one
            // "Assignment name" put two different values under the same word.
            label: 'Rubric name',
            hint: 'Shown to staff wherever this rubric is listed.',
            control: namedControl(inputControl(draft.title), 'title'), wide: true
        },
        {
            label: 'What are students asked to do?',
            hint: 'One or two sentences, the way you would explain it out loud.',
            control: namedControl(textAreaControl(draft.task, 3), 'task'), wide: true
        },
        {
            label: 'Who are they writing for?',
            hint: 'For example: a first-year classmate who has not read the case.',
            control: namedControl(textAreaControl(draft.audience, 2), 'audience')
        },
        {
            label: 'Why are they writing it?',
            hint: 'What the piece of writing is meant to achieve.',
            control: namedControl(textAreaControl(draft.purpose, 2), 'purpose')
        },
        { label: 'Rules they must follow', hint: 'One per line.', control: constraints },
        { label: 'What they should learn from it', hint: 'One per line.', control: learningOutcomes },
        {
            label: 'What matters most when you mark it?',
            hint: 'The thing you would mention first when handing the work back.',
            control: namedControl(textAreaControl(draft.gradingIntent, 2), 'gradingIntent'), wide: true
        }
    ];
    entries.forEach((entry) => {
        bindTextControl(entry.control, options.canEdit, options.onInput);
        const wrapper = field(entry.label, entry.control, entry.hint, entry.wide);
        if (entry.control === constraints || entry.control === learningOutcomes) {
            const countSpan = createText('span', '', 'wf-field-count');
            wrapper.querySelector('label')?.append(countSpan);
            const updateCount = (): void => {
                const count = entry.control.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).length;
                countSpan.textContent = count === 0 ? '' : `${count} ${count === 1 ? 'item' : 'items'}`;
            };
            entry.control.addEventListener('input', updateCount);
            updateCount();
        }
        grid.append(wrapper);
    });

    grid.append(renderSflProfileBox(draft.sflContext, detailsFromDraft(draft), options.canEdit, options.onInput));

    // The lab handout is versioned and approval-gated on the technical rubric,
    // so it is edited here but never sent with the writing rubric.
    if (options.isLabReport) {
        const labContext = namedControl(textAreaControl(options.labContext, 10), 'labContext');
        labContext.maxLength = MAX_LAB_CONTEXT;
        labContext.placeholder = 'Paste the lab handout: what students were asked to do, the steps, and any expected observations.';
        bindTextControl(labContext, options.canEdit, options.onInput);

        const handoutFile = inputControl('', 'file');
        handoutFile.accept = '.txt,.md,.markdown,.docx,.pdf,.html,.htm';
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
    // A stored draft can carry a literal `null` here (older Mongo documents, or any
    // future write path that leaves an undefined-valued key — MongoDB's driver
    // serializes that as BSON null): coerce it to undefined so a save can never send
    // `"genreId": null` back to a server schema that only accepts a string or absence.
    const storedGenreId = context.sections.find((section) => section.lens === 'linguistic')?.working.sflContext?.genreId;
    const sflContext = collectSflContext(context.detailsForm, details, storedGenreId ?? undefined);
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
            ...(section.lens === 'linguistic' ? { sflContext } : {}),
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
/**
 * canvasRefusalReason - why a Canvas rubric could not become a grid, in staff language
 *
 * @param refusal - Reason recorded at import
 * @returns One sentence naming what put the rubric out of contract
 */
function canvasRefusalReason(refusal: CanvasRubricRefusal): string {
    switch (refusal) {
        case 'too_few_ratings':
            return 'Its criteria offer one rating each, and a marking grid needs at least two to compare against.';
        case 'too_many_criteria':
            return `It has more than ${MAX_CRITERIA} criteria, which is more than a grid here can hold.`;
        case 'too_many_levels':
            return `It has more than ${MAX_LEVELS} ratings on a criterion, which is more levels than a grid here can hold.`;
        case 'no_rubric':
        default:
            return 'The Canvas assignment carried no rubric.';
    }
}

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

    const section = document.createElement('div');
    section.className = 'wf-rubric-section';
    // A heading element, not a span: h2 matches the sibling 'Assignment details'
    // heading above and gives the grid below an ancestor heading to sit under.
    const summaryTitle = createText('h2', options.heading, 'wf-rubric-section__title');
    const summaryMeta = createText('span', rubricSizeSummary(working), 'wf-rubric-section__meta');
    const summaryContent: HTMLElement[] = [summaryTitle, summaryMeta];
    if (options.showState) summaryContent.push(approvalStateChip(data));
    if (options.subtitle) summaryTitle.append(createText('span', options.subtitle, 'wf-rubric-section__subtitle'));

    const layout = document.createElement('div');
    layout.className = 'wf-rubric-layout';
    const header = disclosureHeader(
        summaryContent,
        layout,
        `wf-rubric-section-body-${crypto.randomUUID()}`,
        true,
        'wf-rubric-section__summary'
    );
    section.append(header);
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
    // and every cell carries the points that criterion awards at that level.
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
        approvedVersion,
        nextVersion: data.draft?.version ?? (approvedVersion ?? 0) + 1,
        library: data.library ?? [],
        reservedIds,
        syncFromForm: () => syncStructuredValues(form, working),
        onChange: markDirty,
        announce
    });

    context.sections.push({
        lens,
        errorLabel: options.errorLabel,
        form,
        working,
        canEdit,
        showValidationError: (message: string) => {
            validation.textContent = message;
            validation.hidden = false;
            validation.focus();
        },
        clearValidationError: () => { validation.hidden = true; },
        nextVersion: data.draft?.version ?? (data.approved?.version ?? 0) + 1,
        hasApproved: Boolean(data.approved)
    });

    // Save and Approve live in step 3, once for the whole assignment: a lab report
    // has two of these sections, and two Save buttons on one page is a question
    // staff should never have to answer. Discard stays here because it is genuinely
    // per-rubric -- its message names this rubric's own draft and approved versions.
    if (canEdit) {
        const actions = document.createElement('div');
        actions.className = 'wf-button-row';
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
