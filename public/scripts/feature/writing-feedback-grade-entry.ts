// public/scripts/feature/writing-feedback-grade-entry.ts
/**
 * Grade entry — the final grade control on each criterion card of the staff review
 *
 * Staff pick a rubric level or type points, and the two stay in step: a level worth a single
 * value fills its points, a level spanning a range asks for the number, and typed points mark
 * the level they fall in. The model's suggested level is marked but never pre-selected, so
 * every grade is a staff decision. Nothing is persisted here; the review footer reads the
 * values when staff save or approve.
 *
 * @author: Kathleen Tom
 * @date: 2026-09-15
 * @version: 1.0.0
 * @description: Level buttons, points input, card status chip, grading progress, and the read-only rubric grid.
 */

import {
    createText,
    type FeedbackRun,
    type RubricCell,
    type RubricCriterion,
    type RubricDefinition,
    type RubricLevel,
    type StaffAssessmentDraft
} from './writing-feedback-shared.js';
import { earnedLevelFor, formatBand, resolveBand } from './writing-feedback-grid.js';
import { gradeProgress, readPoints, type GradeCriterion, type GradeProgress } from './writing-feedback-grade-progress.js';

/**
 * levelName - a level button's name, allowed to wrap after a slash.
 *
 * Names like "No attempt/Poor" would otherwise hold the button at the width of "attempt/Poor"
 * and push the row of levels onto a second line in a narrow feedback pane.
 *
 * @param name - Level name as staff wrote it
 * @returns Name span with a line-break opportunity after each slash
 */
export function levelName(name: string): HTMLSpanElement {
    const span = document.createElement('span');
    span.className = 'wf-grade-level__name';
    name.split('/').forEach((part, index) => {
        if (index > 0) span.append('/', document.createElement('wbr'));
        span.append(part);
    });
    return span;
}

/** What the grade controls hold, split the way the review save endpoint accepts it. */
export interface GradeReading {
    complete?: StaffAssessmentDraft; // every criterion graded: sent as `finalAssessment`
    draft?: StaffAssessmentDraft; // some criteria graded: sent as `assessmentDraft`
}

/** One level button and the band it awards for its criterion. */
interface LevelOption {
    level: RubricLevel;
    band: RubricCell;
    name: string;
    button: HTMLButtonElement;
}

/**
 * GradeEntry - final grade controls for every criterion of one gradable rubric.
 *
 * Construct once per review render with the rubric version the run was generated against;
 * mount each criterion's control with {@link GradeEntry.control} on its card.
 */
export class GradeEntry {
    /** Criteria in rubric order, with the maximum each may award. */
    readonly criteria: GradeCriterion[];
    private readonly ordered: RubricLevel[];
    private readonly inputs = new Map<string, HTMLInputElement>();
    private readonly chips = new Map<string, HTMLElement>();
    private readonly options = new Map<string, LevelOption[]>();
    private readonly hints = new Map<string, HTMLElement>();
    /** A range level staff clicked before typing its points, by criterion id. */
    private readonly pendingLevel = new Map<string, string>();

    /**
     * @param rubric - Rubric version the run was generated against; every criterion carries points
     * @param run - Model run whose suggested levels are marked on the buttons
     * @param saved - Grades to start from, already filtered to this rubric version
     * @param onChange - Called after every staff change, so the page can mark itself dirty
     */
    constructor(
        private readonly rubric: RubricDefinition,
        private readonly run: FeedbackRun,
        saved: StaffAssessmentDraft | undefined,
        private readonly onChange: () => void
    ) {
        this.criteria = rubric.criteria.map((criterion) => ({ id: criterion.id, label: criterion.label, max: criterion.points ?? 0 }));
        // Sorted once: the buttons, the grid columns and the earned-level mark must agree on order.
        this.ordered = rubric.levels.slice().sort((left, right) => left.rank - right.rank);
        const savedPoints = new Map(saved?.criteria.map((entry) => [entry.criterionId, entry.points]) ?? []);

        // Inputs exist for every criterion up front, so progress is right before any card is shown.
        rubric.criteria.forEach((criterion) => {
            const input = document.createElement('input');
            input.type = 'number';
            input.id = `wf-grade-points-${criterion.id}`;
            input.min = '0';
            input.max = String(criterion.points);
            input.step = '0.01';
            input.inputMode = 'decimal';
            input.placeholder = `0–${criterion.points}`;
            // No visible label: the prompt beside the box speaks only when staff need to act.
            input.setAttribute('aria-label', `Points for ${criterion.label}`);
            const points = savedPoints.get(criterion.id);
            if (points !== undefined) input.value = String(points);
            this.inputs.set(criterion.id, input);
            this.chips.set(criterion.id, document.createElement('span'));
            this.paint(criterion);
        });
    }

    /**
     * control - the grade fieldset for one criterion card.
     *
     * @param criterionId - Criterion on the card
     * @returns The fieldset, or null for a criterion this rubric version does not have
     */
    control(criterionId: string): HTMLElement | null {
        const criterion = this.rubric.criteria.find((item) => item.id === criterionId);
        const input = this.inputs.get(criterionId);
        if (!criterion || !input) return null;

        const fieldset = document.createElement('fieldset');
        fieldset.className = 'wf-grade-entry';
        fieldset.id = `wf-grade-${criterion.id}`;
        const legend = document.createElement('legend');
        legend.className = 'wf-grade-entry__legend';
        const marker = createText('span', '*', 'wf-required-marker');
        marker.setAttribute('aria-hidden', 'true');
        legend.append('Final grade', marker);

        // Step 1: one button per level this criterion awards, with its band and the model's suggestion.
        const suggested = this.run.result.criteria.find((feedback) => feedback.criterion === criterion.id)?.suggestedLevel;
        const levels = document.createElement('div');
        levels.className = 'wf-grade-levels';
        const options: LevelOption[] = [];
        this.ordered.forEach((level) => {
            const band = resolveBand(criterion, level.id, this.rubric.levels);
            if (!band) return;
            const name = band.label?.trim() || level.label;
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'wf-grade-level';
            button.setAttribute('aria-pressed', 'false');
            button.append(levelName(name), createText('span', formatBand(band), 'wf-grade-level__band'));
            if (level.id === suggested) {
                button.classList.add('wf-grade-level--suggested');
                button.append(createText('span', 'Suggested', 'wf-grade-level__tag'));
            }
            const option = { level, band, name, button };
            button.addEventListener('click', () => this.choose(criterion, option));
            options.push(option);
            levels.append(button);
        });
        this.options.set(criterion.id, options);

        // Step 2: the points box, with a prompt beside it that asks for a number or a valid one.
        const points = document.createElement('div');
        points.className = 'wf-grade-points';
        const hint = createText('span', '', 'wf-grade-points__prompt');
        hint.id = `wf-grade-hint-${criterion.id}`;
        hint.setAttribute('aria-live', 'polite');
        this.hints.set(criterion.id, hint);
        input.setAttribute('aria-describedby', hint.id);
        input.addEventListener('input', () => {
            this.pendingLevel.delete(criterion.id);
            input.placeholder = `0–${criterion.points}`;
            this.paint(criterion);
            this.onChange();
        });
        input.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            // These inputs sit outside any form, so Enter submits nothing; it is free to
            // mean "next criterion", which is how a marker works down a column of grades.
            event.preventDefault();
            const order = this.criteria.map((item) => this.inputs.get(item.id)!);
            const next = order[order.indexOf(input) + (event.shiftKey ? -1 : 1)];
            if (next?.isConnected) {
                this.focus(this.criteria[order.indexOf(next)].id);
            } else {
                input.blur();
            }
        });
        const entry = document.createElement('div');
        entry.className = 'wf-grade-points__entry';
        entry.append(hint, input, createText('span', `/ ${criterion.points}`, 'wf-grade-points__max'));
        points.append(entry);

        fieldset.append(legend, levels, points);
        this.paint(criterion);
        return fieldset;
    }

    /**
     * statusChip - the card header chip that says whether this criterion is graded.
     *
     * @param criterionId - Criterion on the card
     * @returns The live chip element, updated in place as staff grade
     */
    statusChip(criterionId: string): HTMLElement {
        return this.chips.get(criterionId) ?? document.createElement('span');
    }

    /**
     * points - what the criterion's points box currently holds.
     *
     * @param criterionId - Criterion to read
     * @returns The points, `undefined` when blank, or `null` when invalid
     */
    points(criterionId: string): number | null | undefined {
        const criterion = this.criteria.find((item) => item.id === criterionId);
        const input = this.inputs.get(criterionId);
        return criterion && input ? readPoints(input.value, criterion.max) : undefined;
    }

    /**
     * earnedLevelLabel - the rating name the entered points fall in.
     *
     * @param criterionId - Criterion to read
     * @returns The cell's rating name, else the level's, or undefined without valid points
     */
    earnedLevelLabel(criterionId: string): string | undefined {
        const criterion = this.rubric.criteria.find((item) => item.id === criterionId);
        const points = this.points(criterionId);
        if (!criterion || typeof points !== 'number') return undefined;
        const level = earnedLevelFor(criterion, this.rubric.levels, points);
        return level ? (resolveBand(criterion, level.id, this.rubric.levels)?.label?.trim() || level.label) : undefined;
    }

    /** progress - graded, missing and invalid criteria, with the running total. */
    progress(): GradeProgress {
        const raw: Record<string, string> = {};
        this.inputs.forEach((input, id) => { raw[id] = input.value; });
        return gradeProgress(this.criteria, raw);
    }

    /**
     * read - the grades to save.
     *
     * @returns A complete assessment, a partial draft, or neither when nothing is entered
     * @throws Error naming the first criterion whose points are out of range
     */
    read(): GradeReading {
        const progress = this.progress();
        const bad = progress.invalid[0];
        if (bad) throw new Error(`Final grade for ${bad.label} must be between 0 and ${bad.max}.`);
        const value = this.valid();
        if (!value) return {};
        return progress.complete ? { complete: value } : { draft: value };
    }

    /**
     * readValid - the valid grades only, for carrying across a re-render that must not fail.
     *
     * @returns The valid entries, or undefined when there are none
     */
    readValid(): StaffAssessmentDraft | undefined {
        return this.valid();
    }

    /**
     * focus - scrolls a criterion's points box into view and focuses it.
     *
     * @param criterionId - Criterion to focus
     */
    focus(criterionId: string): void {
        const input = this.inputs.get(criterionId);
        if (!input?.isConnected) return;
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        input.closest('.wf-criterion')?.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
        input.focus({ preventScroll: true });
        input.select();
    }

    /**
     * gridTable - the read-only rubric as the student's PDF prints it, with grades marked.
     *
     * Each cell carries the rubric's own rating name, point band and description, as in the
     * PDF's rubric grid. The model's suggested cell is tagged and the cell the entered points
     * fall in is filled; neither shows the model's student-specific explanation.
     *
     * @returns Detached panel for the grading modal
     */
    gridTable(): HTMLElement {
        const panel = document.createElement('div');
        panel.className = 'wf-suggested-grading__panel';
        const scroll = document.createElement('div');
        scroll.className = 'wf-suggested-grading__scroll';
        const table = document.createElement('table');
        table.className = 'wf-suggested-grading__table';

        const headRow = document.createElement('tr');
        [createText('th', 'Criterion'), ...this.ordered.map((level) => createText('th', level.label)), createText('th', 'Final grade')]
            .forEach((heading) => {
                heading.setAttribute('scope', 'col');
                headRow.append(heading);
            });
        const thead = document.createElement('thead');
        thead.append(headRow);

        const tbody = document.createElement('tbody');
        this.rubric.criteria.forEach((criterion) => {
            const feedback = this.run.result.criteria.find((item) => item.criterion === criterion.id);
            const points = this.points(criterion.id);
            const earned = typeof points === 'number' ? earnedLevelFor(criterion, this.rubric.levels, points) : undefined;
            const row = document.createElement('tr');
            const rowHeading = createText('th', criterion.label);
            rowHeading.setAttribute('scope', 'row');
            row.append(rowHeading);
            this.ordered.forEach((level) => {
                const cell = document.createElement('td');
                const band = resolveBand(criterion, level.id, this.rubric.levels);
                // A level this criterion does not offer stays blank, as it does in the PDF.
                if (band) {
                    cell.append(
                        createText('strong', band.label?.trim() || level.label, 'wf-suggested-grading__name'),
                        createText('span', formatBand(band), 'wf-suggested-grading__band')
                    );
                    const descriptor = band.descriptor?.trim();
                    if (descriptor) cell.append(createText('p', descriptor, 'wf-suggested-grading__descriptor'));
                }
                if (feedback?.suggestedLevel === level.id) {
                    cell.classList.add('wf-suggested-grading__choice');
                    cell.append(createText('span', 'Suggested', 'wf-suggested-grading__tag'));
                }
                if (earned?.id === level.id) cell.classList.add('wf-suggested-grading__earned');
                row.append(cell);
            });
            row.append(createText('td', typeof points === 'number' ? `${points} / ${criterion.points}` : 'Not graded'));
            tbody.append(row);
        });
        table.append(thead, tbody);
        scroll.append(table);

        const progress = this.progress();
        panel.append(
            scroll,
            createText('p', `Total: ${progress.points} of ${progress.maxPoints}${progress.complete ? '' : ' so far'}`, 'wf-suggested-grading__total')
        );
        return panel;
    }

    private valid(): StaffAssessmentDraft | undefined {
        const criteria = this.criteria.flatMap((criterion) => {
            const points = this.points(criterion.id);
            return typeof points === 'number' ? [{ criterionId: criterion.id, points }] : [];
        });
        return criteria.length ? { rubricVersion: this.rubric.version, criteria } : undefined;
    }

    /** Clicking a level: fill a single value, or keep in-band points and ask for a number otherwise. */
    private choose(criterion: RubricCriterion, option: LevelOption): void {
        const input = this.inputs.get(criterion.id)!;
        if (option.band.min === option.band.max) {
            input.value = String(option.band.max);
            this.pendingLevel.delete(criterion.id);
        } else {
            const points = readPoints(input.value, criterion.points ?? 0);
            const inBand = typeof points === 'number' && points >= option.band.min && points <= option.band.max;
            if (!inBand) {
                input.value = '';
                input.placeholder = formatBand(option.band);
                this.pendingLevel.set(criterion.id, option.level.id);
            }
            input.focus();
        }
        this.paint(criterion);
        this.onChange();
    }

    /** Re-marks the pressed level, the hint, the invalid state, and the card chip for one criterion. */
    private paint(criterion: RubricCriterion): void {
        const input = this.inputs.get(criterion.id)!;
        const max = criterion.points ?? 0;
        const points = readPoints(input.value, max);
        const pending = points === undefined ? this.pendingLevel.get(criterion.id) : undefined;
        const earned = typeof points === 'number' ? earnedLevelFor(criterion, this.rubric.levels, points)?.id : undefined;
        const pressed = earned ?? pending;
        const options = this.options.get(criterion.id) ?? [];
        options.forEach((option) => option.button.setAttribute('aria-pressed', String(option.level.id === pressed)));

        input.setAttribute('aria-invalid', String(points === null));
        const hint = this.hints.get(criterion.id);
        if (hint) {
            const pendingOption = options.find((option) => option.level.id === pending);
            // The chosen level's range is already on its button and in the box's placeholder.
            hint.classList.toggle('wf-grade-points__prompt--error', points === null);
            hint.textContent = points === null
                ? `Enter points from 0 to ${max}:`
                : pendingOption ? 'Enter exact points:' : '';
        }

        const chipElement = this.chips.get(criterion.id)!;
        const [label, tone] = points === undefined
            ? ['Not graded', 'amber']
            : points === null ? ['Check points', 'red'] : [`${points} / ${max}`, 'green'];
        chipElement.className = `wf-chip wf-chip--${tone}`;
        chipElement.textContent = label;
    }
}
