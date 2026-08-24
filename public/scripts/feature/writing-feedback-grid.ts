// public/scripts/feature/writing-feedback-grid.ts
/**
 * Writing Feedback Grid — criteria as rows, performance levels as columns
 *
 * One table replaces the two lists staff used to fill in separately. Every row is
 * a criterion, every column a performance level, and every cell carries the points
 * range that criterion awards at that level over the descriptor staff wrote for it.
 * The last column holds the criterion's weight, and the table foots with the total
 * those weights add up to.
 *
 * Bands are whole points. A weight too small to give every level its own range is
 * unavoidable arithmetic rather than a defect, so the grid says so and still saves.
 *
 * Criterion and performance-level slugs are internal. They are derived from the
 * label when a row or column is created and are never rendered.
 *
 * @author: @rdschrs
 * @date: 2026-08-23
 * @version: 1.0.0
 * @description: Renders and edits one rubric as a single criteria-by-levels table.
 */

import { showConfirmModal } from '../ui/modal-overlay.js';
import {
    RubricCell,
    RubricCriterion,
    RubricDefinition,
    RubricLevel,
    createButton,
    createIconButton,
    createText,
    inputControl,
    refreshIcons,
    textAreaControl
} from './writing-feedback-shared.js';

/** Fewest criteria a rubric may carry. */
export const MIN_CRITERIA = 1;
/** Most criteria a rubric may carry. */
export const MAX_CRITERIA = 10;
/** Fewest performance levels a rubric may carry. */
export const MIN_LEVELS = 2;
/** Most performance levels a rubric may carry. */
export const MAX_LEVELS = 8;
/** Slug shape the rubric schema enforces on every criterion and performance-level id. */
export const RUBRIC_SLUG = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

const MAX_SLUG_LENGTH = 64;
const MAX_CRITERION_LABEL = 80;
const MAX_LEVEL_LABEL = 60;
const MAX_DESCRIPTOR = 400;
const MAX_TEXT = 1200;

/* ------------------------------------------------------------------------- *
 * Band arithmetic
 *
 * Mirrored from src/writing-feedback/rubric-bands.ts, which the browser bundle
 * cannot import: public/scripts/ never reaches into src/. Behaviour here is
 * identical, the same way public/scripts/types.ts mirrors src/types/shared.ts.
 * Change one and change the other; src/writing-feedback/__tests__/rubric-bands.test.ts
 * pins the behaviour both copies must have.
 * ------------------------------------------------------------------------- */

/**
 * spaceBandsEvenly - partitions a criterion's weight across its levels.
 *
 * Each band ends at its share of the weight rounded to a whole point, and the next
 * begins one point above. A weight too small to spread leaves the top bands as single
 * values, and a weight smaller than the number of levels forces adjacent levels to
 * share a band — whole points cannot be divided more finely than one apiece.
 *
 * @param points - Maximum points the criterion contributes
 * @param levels - Levels of the rubric, in any order; rank decides the sequence
 * @returns Band per level id, or an empty map when the criterion carries no weight
 */
export function spaceBandsEvenly(
    points: number,
    levels: ReadonlyArray<RubricLevel>
): Record<string, RubricCell> {
    if (!points || points <= 0 || levels.length === 0) return {};

    const ordered = [...levels].sort((left, right) => left.rank - right.rank);
    const bands: Record<string, RubricCell> = {};

    ordered.forEach((level, index) => {
        // Each band begins one point above where the previous one ended, so bands
        // partition the weight without overlapping.
        const min = index === 0 ? 0 : Math.floor((points * index) / ordered.length) + 1;
        // The last band always ends exactly at the weight, so rounding never loses a point.
        const ceiling = index === ordered.length - 1
            ? points
            : Math.floor((points * (index + 1)) / ordered.length);
        // A small weight can push a band's floor past its natural ceiling; it then
        // collapses to a single value rather than inverting.
        bands[level.id] = { min, max: Math.max(min, ceiling) };
    });

    return bands;
}

/**
 * resolveBand - the band a criterion awards at one level.
 *
 * @param criterion - Criterion whose band is wanted
 * @param levelId - Level being resolved
 * @param levels - Complete level set, used only when the band must be derived
 * @returns The authored band, a derived one, or undefined when the criterion is
 *          ordinal only or deliberately omits this level
 */
export function resolveBand(
    criterion: RubricCriterion,
    levelId: string,
    levels: ReadonlyArray<RubricLevel>
): RubricCell | undefined {
    // An authored cells map is exhaustive for that criterion: a missing key means the
    // criterion has no band at this level, not that one should be invented.
    if (criterion.cells) return criterion.cells[levelId];
    if (criterion.points === undefined) return undefined;
    return spaceBandsEvenly(criterion.points, levels)[levelId];
}

/**
 * totalRubricPoints - sum of the criterion weights.
 *
 * @param criteria - Criteria of one rubric
 * @returns Total points, counting only criteria that carry a weight
 */
export function totalRubricPoints(criteria: ReadonlyArray<RubricCriterion>): number {
    return criteria.reduce((total, criterion) => total + (criterion.points ?? 0), 0);
}

/* ------------------------------- End mirror ------------------------------- */

/**
 * formatBand - the staff-facing text for one points range
 *
 * @param cell - Band to display
 * @returns `min – max`, collapsed to a single number when the range holds one value
 */
export function formatBand(cell: RubricCell): string {
    return cell.min === cell.max ? String(cell.min) : `${cell.min} – ${cell.max}`;
}

/**
 * parseBand - reads a points range typed by staff
 *
 * Accepts what {@link formatBand} writes plus the shapes staff type by hand: a hyphen
 * or any dash between the two numbers, the word `to`, or a single number for a band
 * that holds one value. A reversed range is read in the order the schema requires.
 *
 * @param text - Raw control value
 * @returns The band, or undefined when the text is blank or is not a range
 */
export function parseBand(text: string): RubricCell | undefined {
    const normalized = text
        .trim()
        // Every dash Unicode offers, including the en dash formatBand writes.
        .replace(/[\u2010-\u2015\u2212]/g, '-')
        .replace(/\s+to\s+/i, '-');
    if (!normalized) return undefined;
    const parts = normalized.split('-').map((part) => part.trim()).filter((part) => part.length > 0);
    if (!parts.length || parts.length > 2) return undefined;
    const numbers = parts.map(Number);
    if (numbers.some((value) => !Number.isFinite(value) || value < 0 || value > 1000)) return undefined;
    const [first] = numbers;
    const second = numbers.length === 2 ? numbers[1] : first;
    return { min: Math.min(first, second), max: Math.max(first, second) };
}

/**
 * slugFromLabel - derives a criterion or level id from the name staff gave it
 *
 * @param label - Staff-authored label
 * @returns A slug matching {@link RUBRIC_SLUG}, or '' when the label carries no
 *          usable letters
 */
export function slugFromLabel(label: string): string {
    const candidate = label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^[^a-z]+/, '')
        .replace(/_+$/, '')
        .slice(0, MAX_SLUG_LENGTH)
        .replace(/_+$/, '');
    return RUBRIC_SLUG.test(candidate) ? candidate : '';
}

/**
 * uniqueSlug - the first free id built from a preferred slug
 *
 * @param preferred - Slug derived from the label, or '' when none could be derived
 * @param fallback - Prefix used when the label yields nothing usable
 * @param taken - Every id already spoken for, including ids retired by an approved version
 * @returns A slug that no criterion, level, or retired id already uses
 */
function uniqueSlug(preferred: string, fallback: 'criterion' | 'level', taken: ReadonlyArray<string>): string {
    const used = new Set(taken);
    const base = preferred || fallback;
    if (!used.has(base) && preferred) return base;
    let suffix = preferred ? 2 : used.size + 1;
    let candidate = `${base}_${suffix}`;
    while (used.has(candidate)) {
        suffix += 1;
        candidate = `${base}_${suffix}`;
    }
    return candidate;
}

/**
 * escapeHtml - makes staff-authored text safe for a modal body
 *
 * `showConfirmModal` writes its message with innerHTML, so a label is escaped
 * before it is quoted back to the person removing it.
 *
 * @param value - Raw label text
 * @returns The same text with HTML syntax neutralized
 */
function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** Options the rubric page supplies for one grid. */
export interface RubricGridOptions {
    /** Whether the current staff user may modify this rubric. */
    canEdit: boolean;
    /** Shows the linguistic focus line; true for the writing rubric only. */
    showLinguisticFocus: boolean;
    /** Active approved version, when this rubric has been approved at least once. */
    approvedVersion?: number;
    /** Version a structural change lands in, quoted in the removal confirmation. */
    nextVersion: number;
    /** Library criteria offered for explicit addition. */
    library: ReadonlyArray<RubricCriterion>;
    /** Every id any approved version has ever used, so a new row never reuses one. */
    reservedIds: ReadonlyArray<string>;
    /** Reads the live controls back into the working copy before a structural change. */
    syncFromForm: () => void;
    /** Marks the page dirty and refreshes the section header. */
    onChange: () => void;
    /** Announces structural changes through the section's live region. */
    announce: (message: string) => void;
}

function named<T extends HTMLInputElement | HTMLTextAreaElement>(control: T, name: string, label: string): T {
    control.name = name;
    control.setAttribute('aria-label', label);
    return control;
}

/**
 * relabel - keeps an icon button's accessible name on the label staff are typing
 *
 * @param button - Icon button built by createIconButton, which names it twice
 * @param label - Replacement accessible name and tooltip
 */
function relabel(button: HTMLButtonElement, label: string): void {
    button.setAttribute('aria-label', label);
    button.title = label;
}

/**
 * bandsDisagreeAt - the top of a criterion's authored bands when it contradicts the weight
 *
 * Derived bands always agree by construction, so only an authored `cells` map can
 * disagree. Staff are told; saving is never blocked.
 *
 * @param criterion - Criterion to inspect
 * @returns The highest authored band value when it differs from the weight, else undefined
 */
function bandsDisagreeAt(criterion: RubricCriterion): number | undefined {
    if (criterion.points === undefined || !criterion.cells) return undefined;
    const maxima = Object.values(criterion.cells).map((cell) => cell.max);
    if (!maxima.length) return undefined;
    const highest = Math.max(...maxima);
    return highest === criterion.points ? undefined : highest;
}

/**
 * renderRubricGrid - draws one rubric as a single criteria-by-levels table
 *
 * The grid owns every control for this rubric's criteria and levels and names them
 * `criterion.{row}.*` / `level.{column}.*`, the convention `syncStructuredValues`
 * in writing-feedback-rubric.ts reads back on save. Adding a name here without
 * teaching that function to read it, or removing one without teaching it to carry
 * the stored value through, loses data silently.
 *
 * @param container - Mount point inside the rubric section's form
 * @param draft - Working copy for this rubric; mutated in place by structural edits
 * @param options - Permissions, page-level callbacks, and approval context
 */
export function renderRubricGrid(
    container: HTMLElement,
    draft: RubricDefinition,
    options: RubricGridOptions
): void {
    const gridId = `wf-grid-${crypto.randomUUID()}`;
    const { canEdit, onChange, announce, syncFromForm } = options;
    const rerender = (): void => renderRubricGrid(container, draft, options);

    const focusRow = (index: number): void => {
        window.requestAnimationFrame(() => {
            const row = container.querySelector<HTMLElement>(`[data-criterion-index="${index}"]`);
            row?.querySelector<HTMLInputElement>('input')?.focus();
        });
    };
    const focusColumn = (index: number): void => {
        window.requestAnimationFrame(() => {
            const head = container.querySelector<HTMLElement>(`[data-level-index="${index}"]`);
            head?.querySelector<HTMLInputElement>('input')?.focus();
        });
    };

    /** Ids created in this editing session, whose slug still follows the label. */
    const pendingIds = new Set<string>(
        (container.dataset.pendingIds ?? '').split(',').filter(Boolean)
    );
    const rememberPending = (): void => {
        container.dataset.pendingIds = [...pendingIds].join(',');
    };

    const allIds = (): string[] => [
        ...draft.criteria.map((criterion) => criterion.id),
        ...draft.levels.map((level) => level.id),
        ...options.reservedIds
    ];

    container.replaceChildren();

    /* Toolbar ------------------------------------------------------------- */

    if (canEdit) {
        const toolbar = document.createElement('div');
        toolbar.className = 'wf-rubric-tools';

        toolbar.append(createButton(
            'Add criterion',
            'secondary',
            async () => {
                syncFromForm();
                const label = 'New criterion';
                const id = uniqueSlug(slugFromLabel(label), 'criterion', allIds());
                draft.criteria.push({ id, label, description: '' });
                pendingIds.add(id);
                rememberPending();
                onChange();
                rerender();
                announce(`Criterion added. ${draft.criteria.length} criteria total.`);
                focusRow(draft.criteria.length - 1);
            },
            draft.criteria.length >= MAX_CRITERIA
        ));

        toolbar.append(createButton(
            'Add level',
            'secondary',
            async () => {
                syncFromForm();
                const label = 'New level';
                const id = uniqueSlug(slugFromLabel(label), 'level', allIds());
                draft.levels.push({ id, label, description: '', rank: draft.levels.length + 1 });
                pendingIds.add(id);
                rememberPending();
                onChange();
                rerender();
                announce(`Performance level added at position ${draft.levels.length} of ${draft.levels.length}.`);
                focusColumn(draft.levels.length - 1);
            },
            draft.levels.length >= MAX_LEVELS
        ));

        toolbar.append(createButton(
            'Space points evenly',
            'secondary',
            async () => {
                syncFromForm();
                draft.criteria.forEach((criterion) => {
                    if (criterion.points === undefined || criterion.points <= 0) return;
                    const descriptors = criterion.cells ?? {};
                    const spaced = spaceBandsEvenly(criterion.points, draft.levels);
                    draft.levels.forEach((level) => {
                        const descriptor = descriptors[level.id]?.descriptor;
                        if (descriptor && spaced[level.id]) spaced[level.id].descriptor = descriptor;
                    });
                    criterion.cells = spaced;
                });
                onChange();
                rerender();
                announce('Points spaced evenly across every level.');
            },
            !draft.criteria.some((criterion) => (criterion.points ?? 0) > 0)
        ));

        const available = options.library.filter(
            (candidate) => !draft.criteria.some((criterion) => criterion.id === candidate.id)
        );
        const librarySelect = document.createElement('select');
        librarySelect.className = 'wf-rubric-library-select';
        librarySelect.setAttribute('aria-label', 'Criterion library');
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = available.length ? 'Choose a library criterion' : 'No additional library criteria';
        librarySelect.append(placeholder);
        available.forEach((candidate) => {
            const option = document.createElement('option');
            option.value = candidate.id;
            option.textContent = candidate.label;
            librarySelect.append(option);
        });
        librarySelect.disabled = !available.length || draft.criteria.length >= MAX_CRITERIA;
        const addFromLibrary = createButton(
            'Add from library',
            'secondary',
            async () => {
                const candidate = available.find((entry) => entry.id === librarySelect.value);
                if (!candidate) {
                    librarySelect.focus();
                    return;
                }
                syncFromForm();
                draft.criteria.push({ ...candidate });
                onChange();
                rerender();
                announce(`${candidate.label} added from the criterion library. Position ${draft.criteria.length} of ${draft.criteria.length}.`);
                focusRow(draft.criteria.length - 1);
            },
            true
        );
        librarySelect.addEventListener('change', () => {
            addFromLibrary.disabled = librarySelect.disabled || !librarySelect.value;
        });
        toolbar.append(librarySelect, addFromLibrary);
        container.append(toolbar);
    }

    /* Table --------------------------------------------------------------- */

    const scroller = document.createElement('div');
    scroller.className = 'wf-grid-scroll';
    const table = document.createElement('table');
    table.className = 'wf-grid';

    const head = document.createElement('thead');
    const headRow = document.createElement('tr');
    const criterionHead = createText('th', 'Criterion', 'wf-grid-corner');
    criterionHead.id = `${gridId}-criterion`;
    criterionHead.setAttribute('scope', 'col');
    headRow.append(criterionHead);

    draft.levels.forEach((level, index) => {
        const cell = document.createElement('th');
        cell.className = 'wf-grid-col-head';
        cell.id = `${gridId}-l-${index}`;
        cell.setAttribute('scope', 'col');
        cell.dataset.levelIndex = String(index);

        const bar = document.createElement('div');
        bar.className = 'wf-grid-head-bar';
        const label = named(inputControl(level.label), `level.${index}.label`, `Level ${index + 1} name`);
        label.maxLength = MAX_LEVEL_LABEL;
        label.readOnly = !canEdit;
        label.className = 'wf-grid-label-input';
        bar.append(label);
        // The name staff are typing, not the one this render started with: it is what
        // the remove confirmation quotes and what the icon buttons are announced as.
        const liveLabel = (): string => label.value.trim() || `Level ${index + 1}`;

        if (canEdit) {
            const controls = document.createElement('div');
            controls.className = 'wf-grid-head-controls';
            const move = async (direction: -1 | 1): Promise<void> => {
                const target = index + direction;
                if (target < 0 || target >= draft.levels.length) return;
                syncFromForm();
                const [moved] = draft.levels.splice(index, 1);
                draft.levels.splice(target, 0, moved);
                draft.levels.forEach((entry, rankIndex) => { entry.rank = rankIndex + 1; });
                onChange();
                rerender();
                announce(`${moved.label || 'Level'} moved to position ${target + 1} of ${draft.levels.length}.`);
                focusColumn(target);
            };
            const left = createIconButton('arrow-left', `Move level ${liveLabel()} left`, 'neutral', async () => move(-1));
            left.classList.add('wf-grid-affordance');
            left.disabled = index === 0;
            const right = createIconButton('arrow-right', `Move level ${liveLabel()} right`, 'neutral', async () => move(1));
            right.classList.add('wf-grid-affordance');
            right.disabled = index === draft.levels.length - 1;
            const remove = createIconButton('trash-2', `Remove level ${liveLabel()}`, 'danger', async () => {
                if (draft.levels.length <= MIN_LEVELS) {
                    announce(`At least ${MIN_LEVELS} performance levels are required.`);
                    return;
                }
                if (!(await confirmRemoval('level', liveLabel(), options))) return;
                syncFromForm();
                const [removed] = draft.levels.splice(index, 1);
                draft.levels.forEach((entry, rankIndex) => { entry.rank = rankIndex + 1; });
                onChange();
                rerender();
                announce(`${removed.label || 'Level'} removed. ${draft.levels.length} performance levels remain.`);
                focusColumn(Math.min(index, draft.levels.length - 1));
            });
            remove.classList.add('wf-grid-affordance');
            remove.disabled = draft.levels.length <= MIN_LEVELS;
            controls.append(left, right, remove);
            bar.append(controls);
            label.addEventListener('input', () => {
                relabel(left, `Move level ${liveLabel()} left`);
                relabel(right, `Move level ${liveLabel()} right`);
                relabel(remove, `Remove level ${liveLabel()}`);
            });
        }
        label.addEventListener('input', onChange);

        const description = named(
            textAreaControl(level.description, 2),
            `level.${index}.description`,
            `Level ${index + 1} description`
        );
        description.maxLength = MAX_TEXT;
        description.readOnly = !canEdit;
        description.className = 'wf-grid-text';
        description.addEventListener('input', onChange);

        cell.append(bar, description);
        headRow.append(cell);
    });

    const pointsHead = createText('th', 'Points', 'wf-grid-points-head');
    pointsHead.id = `${gridId}-points`;
    pointsHead.setAttribute('scope', 'col');
    headRow.append(pointsHead);
    head.append(headRow);
    table.append(head);

    const body = document.createElement('tbody');
    const totalCell = document.createElement('td');
    totalCell.className = 'wf-grid-total';

    // The total follows the weight controls while staff type, so it reads them back
    // rather than the working copy, which only catches up on save.
    const refreshTotal = (): void => {
        const live = draft.criteria.map((criterion, index) => {
            const control = container.querySelector<HTMLInputElement>(`[name="criterion.${index}.points"]`);
            if (!control) return criterion;
            const raw = control.value.trim();
            const points = raw ? Number(raw) : undefined;
            return { ...criterion, points: points !== undefined && Number.isFinite(points) ? points : undefined };
        });
        // An ordinal rubric carries no weights at all; it gets no total rather than a zero.
        const weighted = live.some((criterion) => criterion.points !== undefined);
        totalCell.textContent = weighted ? `${Number(totalRubricPoints(live).toFixed(2))} points` : '';
    };

    draft.criteria.forEach((criterion, rowIndex) => {
        const row = document.createElement('tr');
        row.className = 'wf-grid-row';
        row.dataset.criterionIndex = String(rowIndex);

        const rowHead = document.createElement('th');
        rowHead.className = 'wf-grid-row-head';
        rowHead.id = `${gridId}-c-${rowIndex}`;
        rowHead.setAttribute('scope', 'row');

        const bar = document.createElement('div');
        bar.className = 'wf-grid-head-bar';
        const label = named(inputControl(criterion.label), `criterion.${rowIndex}.label`, `Criterion ${rowIndex + 1} name`);
        label.maxLength = MAX_CRITERION_LABEL;
        label.readOnly = !canEdit;
        label.className = 'wf-grid-label-input';
        label.addEventListener('input', onChange);
        // A criterion added in this session still takes its slug from its name.
        // Anything the server has already approved keeps the id it was approved with.
        label.addEventListener('change', () => {
            const current = draft.criteria[rowIndex];
            if (!current || !pendingIds.has(current.id)) return;
            const derived = slugFromLabel(label.value);
            if (!derived || derived === current.id) return;
            const others = allIds().filter((id) => id !== current.id);
            const next = uniqueSlug(derived, 'criterion', others);
            pendingIds.delete(current.id);
            pendingIds.add(next);
            rememberPending();
            current.id = next;
        });
        bar.append(label);
        const liveLabel = (): string => label.value.trim() || `Criterion ${rowIndex + 1}`;

        if (canEdit) {
            const remove = createIconButton('trash-2', `Remove criterion ${liveLabel()}`, 'danger', async () => {
                if (draft.criteria.length <= MIN_CRITERIA) {
                    announce('At least one criterion is required.');
                    return;
                }
                if (!(await confirmRemoval('criterion', liveLabel(), options))) return;
                syncFromForm();
                const [removed] = draft.criteria.splice(rowIndex, 1);
                pendingIds.delete(removed.id);
                rememberPending();
                onChange();
                rerender();
                announce(`${removed.label || 'Criterion'} removed. ${draft.criteria.length} criteria remain.`);
                focusRow(Math.min(rowIndex, draft.criteria.length - 1));
            });
            remove.classList.add('wf-grid-affordance');
            remove.disabled = draft.criteria.length <= MIN_CRITERIA;
            bar.append(remove);
            label.addEventListener('input', () => relabel(remove, `Remove criterion ${liveLabel()}`));
        }

        const description = named(
            textAreaControl(criterion.description, 3),
            `criterion.${rowIndex}.description`,
            `Criterion ${rowIndex + 1} description`
        );
        description.maxLength = MAX_TEXT;
        description.readOnly = !canEdit;
        description.className = 'wf-grid-text';
        description.addEventListener('input', onChange);
        rowHead.append(bar, description);

        if (options.showLinguisticFocus) {
            const focus = named(
                textAreaControl(criterion.sflDimension ?? '', 1),
                `criterion.${rowIndex}.sflDimension`,
                `Criterion ${rowIndex + 1} linguistic focus`
            );
            focus.maxLength = MAX_TEXT;
            focus.readOnly = !canEdit;
            focus.className = 'wf-grid-text wf-grid-focus';
            focus.placeholder = 'Linguistic focus';
            focus.addEventListener('input', onChange);
            rowHead.append(focus);
        }

        row.append(rowHead);

        // Authored cells are exhaustive, so a missing key is an empty cell. A criterion
        // with a weight but no authored cells is pinned to its derived bands here, so
        // editing one cell cannot blank the rest of the row.
        const bands = criterion.cells ?? (
            criterion.points === undefined ? {} : spaceBandsEvenly(criterion.points, draft.levels)
        );

        draft.levels.forEach((level, columnIndex) => {
            const cell = document.createElement('td');
            cell.className = 'wf-grid-cell';
            cell.headers = `${gridId}-c-${rowIndex} ${gridId}-l-${columnIndex}`;

            const band = bands[level.id];
            const bandInput = named(
                inputControl(band ? formatBand(band) : ''),
                `criterion.${rowIndex}.cell.${columnIndex}.band`,
                `Points range for criterion ${rowIndex + 1} at level ${columnIndex + 1}`
            );
            bandInput.className = 'wf-grid-band';
            bandInput.readOnly = !canEdit;

            const descriptor = named(
                textAreaControl(band?.descriptor ?? '', 2),
                `criterion.${rowIndex}.cell.${columnIndex}.descriptor`,
                `Descriptor for criterion ${rowIndex + 1} at level ${columnIndex + 1}`
            );
            descriptor.maxLength = MAX_DESCRIPTOR;
            descriptor.className = 'wf-grid-text';
            descriptor.addEventListener('input', onChange);

            const hint = createText('p', '', 'wf-grid-cell-hint');

            // A descriptor is stored inside its band, so a cell with no range has
            // nowhere to keep one. The control stays visible and reads as unavailable
            // rather than accepting text that could not be saved. The hint tells staff
            // exactly what is missing; approval (not draft save) is what actually blocks
            // on this, enforced separately by requireCompleteRubricCells on the server.
            const syncCellState = (): void => {
                const bandFilled = Boolean(parseBand(bandInput.value));
                descriptor.readOnly = !canEdit || !bandFilled;
                cell.classList.toggle('wf-grid-cell--empty', !bandFilled);
                if (!bandFilled) {
                    hint.textContent = 'Enter a points range';
                } else if (!descriptor.value.trim()) {
                    hint.textContent = 'Enter a description';
                } else {
                    hint.textContent = '';
                }
            };

            let lastValid = bandInput.value;
            bandInput.addEventListener('input', () => {
                syncCellState();
                onChange();
            });
            bandInput.addEventListener('change', () => {
                const raw = bandInput.value.trim();
                const parsed = parseBand(raw);
                if (raw && !parsed) bandInput.value = lastValid;
                else bandInput.value = parsed ? formatBand(parsed) : '';
                lastValid = bandInput.value;
                syncCellState();
            });
            syncCellState();
            descriptor.addEventListener('input', syncCellState);

            cell.append(bandInput, descriptor, hint);
            row.append(cell);
        });

        const weightCell = document.createElement('td');
        weightCell.className = 'wf-grid-weight';
        weightCell.headers = `${gridId}-c-${rowIndex} ${gridId}-points`;
        const weight = named(
            inputControl(criterion.points === undefined ? '' : String(criterion.points), 'number'),
            `criterion.${rowIndex}.points`,
            `Points for criterion ${rowIndex + 1}`
        );
        weight.min = '0';
        weight.max = '1000';
        weight.step = '1';
        weight.readOnly = !canEdit;
        weight.className = 'wf-grid-weight-input';

        const warnings = document.createElement('div');
        warnings.className = 'wf-grid-warnings';
        const refreshWarnings = (): void => {
            warnings.replaceChildren();
            const raw = weight.value.trim();
            const points = raw ? Number(raw) : undefined;
            if (points !== undefined && Number.isFinite(points) && points > 0 && points < draft.levels.length - 1) {
                warnings.append(createText(
                    'p',
                    `This criterion needs at least ${draft.levels.length - 1} points to give every level its own range.`,
                    'wf-grid-warning'
                ));
            }
            const highest = bandsDisagreeAt({
                ...criterion,
                points,
                cells: readAuthoredCells(row, draft, rowIndex)
            });
            if (highest !== undefined) {
                warnings.append(createText(
                    'p',
                    `These bands top out at ${highest}, not ${points} points.`,
                    'wf-grid-warning'
                ));
            }
        };
        weight.addEventListener('input', () => {
            refreshTotal();
            onChange();
        });
        // Both warnings depend on the weight and on every band in this row, so they
        // are recomputed from whichever control in the row just changed.
        row.addEventListener('input', refreshWarnings);
        refreshWarnings();

        weightCell.append(weight, warnings);
        row.append(weightCell);
        body.append(row);
    });

    table.append(body);

    const foot = document.createElement('tfoot');
    const footRow = document.createElement('tr');
    const totalLabel = document.createElement('th');
    totalLabel.className = 'wf-grid-total-label';
    totalLabel.textContent = 'Total';
    totalLabel.scope = 'row';
    totalLabel.colSpan = draft.levels.length + 1;
    footRow.append(totalLabel, totalCell);
    foot.append(footRow);
    table.append(foot);

    scroller.append(table);
    container.append(scroller);
    refreshTotal();
    refreshIcons();
}

/**
 * readAuthoredCells - the bands one row currently shows, read back from its controls
 *
 * Warnings are recomputed while staff type, so they read the live controls rather
 * than the working copy, which only catches up on save or a structural change.
 *
 * @param scope - Element holding this row's controls
 * @param draft - Working copy supplying level ids for the column positions
 * @param rowIndex - Row being inspected
 * @returns Band map keyed by level id, or undefined when the row shows no bands
 */
function readAuthoredCells(
    scope: ParentNode,
    draft: RubricDefinition,
    rowIndex: number
): Record<string, RubricCell> | undefined {
    const cells: Record<string, RubricCell> = {};
    draft.levels.forEach((level, columnIndex) => {
        const control = scope.querySelector<HTMLInputElement>(
            `[name="criterion.${rowIndex}.cell.${columnIndex}.band"]`
        );
        const band = control ? parseBand(control.value) : undefined;
        if (band) cells[level.id] = band;
    });
    return Object.keys(cells).length ? cells : undefined;
}

/**
 * confirmRemoval - asks before a row or column leaves the rubric
 *
 * An unapproved draft is confirmed plainly. Once a version has been approved,
 * removal creates the next version, so the confirmation names that version and
 * says what staff must do about work already sitting on the current one.
 *
 * @param kind - Whether a criterion or a performance level is being removed
 * @param label - Staff-visible name of the row or column
 * @param options - Grid options carrying the approval context
 * @returns True when staff confirmed the removal
 */
async function confirmRemoval(
    kind: 'criterion' | 'level',
    label: string,
    options: RubricGridOptions
): Promise<boolean> {
    const noun = kind === 'criterion' ? 'criterion' : 'performance level';
    const quoted = escapeHtml(label);

    if (options.approvedVersion === undefined) {
        const plain = await showConfirmModal(
            `Remove this ${noun}?`,
            `Remove "${quoted}" from this rubric draft?`,
            kind === 'criterion' ? 'Remove criterion' : 'Remove level',
            kind === 'criterion' ? 'Keep criterion' : 'Keep level',
            'danger'
        );
        return plain.action === (kind === 'criterion' ? 'remove-criterion' : 'remove-level');
    }

    const current = options.approvedVersion;
    const next = options.nextVersion;
    const carried = kind === 'criterion'
        ? `Feedback already generated on v${current} keeps that version, and comments anchored to "${quoted}" keep their text.`
        : `Feedback already generated on v${current} keeps that version and stays readable.`;
    const confirmText = `Remove and create v${next}`;
    const result = await showConfirmModal(
        `Remove this ${noun} from an approved rubric?`,
        [
            `Removing "${quoted}" creates rubric v${next}. Approved rubric v${current} moves to history unchanged.`,
            carried,
            `Any unreleased draft feedback on v${current} must be regenerated before it can be approved.`
        ].join('<br><br>'),
        confirmText,
        'Cancel',
        'danger'
    );
    return result.action === confirmText.toLowerCase().replace(/\s+/g, '-');
}
