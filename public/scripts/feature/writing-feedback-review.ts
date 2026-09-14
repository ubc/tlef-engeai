// public/scripts/feature/writing-feedback-review.ts
/**
 * Writing Feedback Review — staff review and release workspace
 *
 * Left: the submission as a single readable annotated document (verification
 * textarea only while staff confirmation is pending). Right: a sticky Feedback
 * panel in two steps (D-124): Annotations (text-anchored, editable comments with
 * function/level filters), then Summary (editable strengths, criterion feedback and
 * goals, grading, history, release). Next redrafts the summary from changed
 * annotations (D-125). Approval and release stay separate actions; nothing reaches
 * a student without explicit staff approval.
 *
 * @author: @rdschrs
 * @date: 2026-07-22
 * @version: 1.0.0
 * @description: Coordinates transcript verification, review revisions, PDF downloads, approval, and release.
 */

import { showConfirmModal, showErrorModal, showGridModal, showViewerModal } from '../ui/modal-overlay.js';
import { showErrorToast, showSuccessToast, showToast } from '../ui/toast-notification.js';
import {
    AnchoredComment,
    Assignment,
    CriterionFeedback,
    FeedbackRun,
    FUNCTION_TAG_LABELS,
    ReviewRevision,
    RubricCriterion,
    RubricDefinition,
    StaffFinalAssessment,
    STATUS_LABELS,
    STATUS_TONES,
    Submission,
    SubmissionDetail,
    WritingFeedbackLens,
    baseUrl,
    chip,
    confirmDiscardDirty,
    createButton,
    createText,
    createZoomControl,
    diffReviewComments,
    element,
    field,
    formatDate,
    isLateSubmission,
    jsonRequest,
    refreshIcons,
    request,
    scrollingAncestor,
    setQueryState,
    runButtonAction,
    setView,
    state,
    textAreaControl,
    views
} from './writing-feedback-shared.js';
import { getWorkingComments, initAnchorWorkingSet, renderAnnotations } from './writing-feedback-anchors.js';
import { earnedLevelFor, formatBand, resolveBand, totalRubricPoints } from './writing-feedback-grid.js';
import { changedLenses, decideNextAction, stepBarState, type ReviewStep } from './writing-feedback-review-steps.js';
import { SummaryEditor, seedSummaryText, type SummaryBaseline } from './writing-feedback-summary-editor.js';
import { fingerprintAnnotations } from './writing-feedback-annotation-fingerprint.js';

function latestReview(submission: Submission): ReviewRevision | undefined {
    return submission.reviews?.[submission.reviews.length - 1];
}

/** Resolves labels against the immutable rubric version used by this model run, for the given lens. */
function rubricForRun(assignment: Assignment | null, run: FeedbackRun, lens: WritingFeedbackLens = 'linguistic'): RubricDefinition | undefined {
    if (!assignment) return undefined;
    const current = lens === 'technical' ? assignment.technicalRubric : assignment.rubric;
    const history = lens === 'technical' ? assignment.technicalRubricHistory : assignment.rubricHistory;
    const draft = lens === 'technical' ? assignment.technicalRubricDraft : assignment.rubricDraft;
    const candidates = [current, ...(history ?? []), draft]
        .filter((rubric): rubric is RubricDefinition => Boolean(rubric));
    if (run.rubricVersion === undefined) return current;
    return candidates.find((rubric) => rubric.version === run.rubricVersion);
}

function criterionLabel(rubric: RubricDefinition | undefined, id: string): string {
    return rubric?.criteria.find((criterion) => criterion.id === id)?.label ?? 'Removed criterion';
}

function criterionTitle(rubric: RubricDefinition | undefined, id: string): string | undefined {
    if (rubric?.criteria.some((criterion) => criterion.id === id)) return undefined;
    return `This criterion was removed after rubric v${rubric?.version ?? 'unknown'}. Existing feedback still uses that saved rubric version.`;
}

/**
 * levelLabel - what this criterion calls the rating it earned
 *
 * A rating is named per criterion, the way Canvas names it per row, so the name comes
 * from the cell. The column's own label is the fallback for a grid whose cells were
 * never named, and the raw id the last resort for a level the rubric no longer has.
 *
 * @param rubric - Rubric version the feedback was generated against
 * @param criterionId - Criterion whose cell carries the name
 * @param id - Level earned
 * @returns Staff-facing rating name
 */
function levelLabel(rubric: RubricDefinition | undefined, criterionId: string, id: string): string {
    const criterion = rubric?.criteria.find((entry) => entry.id === criterionId);
    const named = criterion?.cells?.[id]?.label?.trim();
    return named || rubric?.levels.find((level) => level.id === id)?.label || id;
}

function orderedCriterionIds(rubric: RubricDefinition | undefined, feedback: CriterionFeedback[]): string[] {
    const ids = rubric?.criteria.map((criterion) => criterion.id) ?? [];
    feedback.forEach((criterion) => {
        if (!ids.includes(criterion.criterion)) ids.push(criterion.criterion);
    });
    return ids;
}

/** One criterion's suggested points band and staff-only reason. */
interface SuggestedCriterionGrade {
    criterionId: string;
    label: string;
    levelLabel: string;
    min: number;
    max: number;
    reason: string;
}

/** Staff-only suggestion derived from one model run and never persisted. */
interface SuggestedGrading {
    criteria: SuggestedCriterionGrade[];
    totalMin: number;
    totalMax: number;
}

/**
 * Frontend mirror of `src/writing-feedback/suggested-grading.ts`.
 *
 * The review page cannot import from `src/`, so this mirrors the pure derivation
 * against the rubric version returned by `rubricForRun`. Suggested grading is
 * staff-only display state: it is never written to a release payload or PDF.
 */
function deriveSuggestedGrading(run: FeedbackRun, rubric: RubricDefinition): SuggestedGrading {
    const criteria: SuggestedCriterionGrade[] = [];

    run.result.criteria.forEach((feedback) => {
        const definition = rubric.criteria.find((criterion) => criterion.id === feedback.criterion);
        if (!definition) return;
        const band = resolveBand(definition, feedback.suggestedLevel, rubric.levels);
        if (!band) return;
        const level = rubric.levels.find((entry) => entry.id === feedback.suggestedLevel);

        criteria.push({
            criterionId: definition.id,
            label: definition.label,
            // The cell's own rating name where it has one; resolveBand returns the cell.
            levelLabel: band.label?.trim() || level?.label || feedback.suggestedLevel,
            min: band.min,
            max: band.max,
            reason: feedback.explanation
        });
    });

    return {
        criteria,
        totalMin: criteria.reduce((total, entry) => total + entry.min, 0),
        totalMax: criteria.reduce((total, entry) => total + entry.max, 0)
    };
}

function hasSuggestedGrading(rubric: RubricDefinition | undefined): rubric is RubricDefinition {
    return Boolean(rubric?.criteria.length
        && rubric.criteria.every((criterion) => criterion.points !== undefined && criterion.points > 0));
}

interface StaffAssessmentDraft {
    rubricVersion: number;
    criteria: Array<{ criterionId: string; points: number }>;
}

/**
 * What survives the re-render after a save, approval or summary redraft: the step to reopen,
 * the notice to show, and unsaved values a redraft must not discard (D-125).
 */
interface PendingReviewState {
    submissionId: string;
    step: ReviewStep;
    notice?: string;
    internalNote?: string;
    finalAssessment?: StaffAssessmentDraft;
}

let pendingReviewState: PendingReviewState | null = null;

interface GradingEditor {
    element: HTMLElement;
    readAssessment: () => StaffAssessmentDraft | undefined;
}

function renderSuggestedGrading(
    run: FeedbackRun,
    rubric: RubricDefinition,
    saved: StaffFinalAssessment | StaffAssessmentDraft | undefined,
    markDirty: () => void
): GradingEditor | null {
    const grading = deriveSuggestedGrading(run, rubric);
    if (!grading.criteria.length) return null;

    const section = document.createElement('section');
    section.className = 'wf-feedback-section wf-suggested-grading';
    const header = document.createElement('div');
    header.className = 'wf-suggested-grading__header';
    header.append(
        createText('h3', 'Rubric grading'),
        createText(
            'p',
            'Model suggestions are staff-only. Enter the final points you intend to save, include in the feedback PDF, and send to Canvas after approval.',
            'wf-muted-note'
        )
    );

    // The panel lives outside the page and is handed to the modal, which shows this very
    // element rather than a copy. Detached inputs keep their values, so a grade typed here
    // survives closing and reopening and readAssessment below still reads it.
    const panel = document.createElement('div');
    panel.className = 'wf-suggested-grading__panel';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'wf-button wf-button--secondary';
    button.textContent = 'Open rubric grading';
    button.addEventListener('click', () => { void showGridModal('Rubric grading', panel); });
    header.append(button);

    const scroll = document.createElement('div');
    scroll.className = 'wf-suggested-grading__scroll';
    const table = document.createElement('table');
    table.className = 'wf-suggested-grading__table';
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    const corner = createText('th', 'Criterion');
    corner.setAttribute('scope', 'col');
    headRow.append(corner);
    // Sorted once: the header, every row, and the earned-level mark must agree on which
    // column is which, and rank is the only thing that decides that.
    const ordered = rubric.levels.slice().sort((left, right) => left.rank - right.rank);
    ordered.forEach((level) => {
        const heading = createText('th', level.label);
        heading.setAttribute('scope', 'col');
        headRow.append(heading);
    });
    const finalHeading = createText('th', 'Final grade');
    finalHeading.setAttribute('scope', 'col');
    headRow.append(finalHeading);
    thead.append(headRow);
    table.append(thead);

    const tbody = document.createElement('tbody');
    const feedbackByCriterion = new Map(run.result.criteria.map((feedback) => [feedback.criterion, feedback]));
    const savedByCriterion = new Map(saved?.criteria.map((entry) => [entry.criterionId, entry.points]) ?? []);
    const gradeInputs = new Map<string, HTMLInputElement>();
    /** Level cells of one criterion, in rank order, so the earned one can be repainted. */
    const levelCells = new Map<string, HTMLTableCellElement[]>();
    /** Every grade input in criterion order, which is the order Enter walks. */
    const gradeOrder: HTMLInputElement[] = [];

    /**
     * Paints the level a typed grade falls in, and clears the rest of that row. Staff see
     * where the number lands before they save it, and the mark matches the one the PDF
     * draws because both answer to earnedLevelFor.
     */
    const paintEarned = (criterion: RubricCriterion, input: HTMLInputElement): void => {
        const cells = levelCells.get(criterion.id) ?? [];
        cells.forEach((cell) => cell.classList.remove('wf-suggested-grading__earned'));
        const raw = input.value.trim();
        if (raw === '') return;
        const points = Number(raw);
        if (!Number.isFinite(points)) return;
        const earned = earnedLevelFor(criterion, ordered, points);
        if (!earned) return;
        const index = ordered.findIndex((level) => level.id === earned.id);
        cells[index]?.classList.add('wf-suggested-grading__earned');
    };

    rubric.criteria.forEach((criterion) => {
        const feedback = feedbackByCriterion.get(criterion.id);
        if (!feedback) return;
        const row = document.createElement('tr');
        const rowHeading = createText('th', criterion.label);
        rowHeading.setAttribute('scope', 'row');
        row.append(rowHeading);
        const cellsForRow: HTMLTableCellElement[] = [];
        ordered.forEach((level) => {
            const cell = document.createElement('td');
            const band = resolveBand(criterion, level.id, rubric.levels);
            if (band) cell.append(createText('strong', formatBand(band), 'wf-suggested-grading__band'));
            if (feedback.suggestedLevel === level.id) {
                cell.classList.add('wf-suggested-grading__choice');
                cell.append(
                    createText('span', 'Suggested', 'wf-suggested-grading__tag'),
                    createText('p', feedback.explanation, 'wf-suggested-grading__reason')
                );
            }
            cellsForRow.push(cell);
            row.append(cell);
        });
        levelCells.set(criterion.id, cellsForRow);
        const gradeCell = document.createElement('td');
        const gradeInput = document.createElement('input');
        gradeInput.type = 'number';
        gradeInput.className = 'wf-input wf-final-grade-input';
        gradeInput.min = '0';
        gradeInput.max = String(criterion.points);
        gradeInput.step = '0.01';
        gradeInput.placeholder = `0–${criterion.points}`;
        gradeInput.setAttribute('aria-label', `Final points for ${criterion.label}, out of ${criterion.points}`);
        const savedPoints = savedByCriterion.get(criterion.id);
        if (savedPoints !== undefined) gradeInput.value = String(savedPoints);
        gradeInput.addEventListener('input', () => {
            markDirty();
            paintEarned(criterion, gradeInput);
        });
        gradeInput.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            // These inputs sit outside any form, so Enter submits nothing; it is free to
            // mean "next criterion", which is how a marker works down a column of grades.
            event.preventDefault();
            const at = gradeOrder.indexOf(gradeInput);
            const next = gradeOrder[at + (event.shiftKey ? -1 : 1)];
            if (next) {
                next.focus();
                next.select();
            } else {
                gradeInput.blur();
            }
        });
        gradeCell.append(gradeInput, createText('span', ` / ${criterion.points}`, 'wf-muted-note'));
        gradeInputs.set(criterion.id, gradeInput);
        gradeOrder.push(gradeInput);
        row.append(gradeCell);
        tbody.append(row);
        // A saved grade should already show its level when the page opens.
        paintEarned(criterion, gradeInput);
    });
    table.append(tbody);
    scroll.append(table);

    const total = totalRubricPoints(rubric.criteria);
    const totalText = grading.totalMin === grading.totalMax
        ? `${grading.totalMax} of ${total}`
        : `${grading.totalMin} – ${grading.totalMax} of ${total}`;
    // A draft carried across a redraft has no server totals; only a saved assessment does.
    const savedText = saved && 'totalPoints' in saved
        ? `Saved final grade: ${saved.totalPoints} of ${saved.maxPoints}`
        : 'No final grade has been saved yet.';
    panel.append(
        scroll,
        createText('p', `Model suggestion: ${totalText}`, 'wf-suggested-grading__total'),
        createText('p', savedText, 'wf-suggested-grading__total')
    );
    // The grid now opens in a modal, so the page itself has to keep stating where the grade
    // stands; otherwise closing the modal loses the one number staff came here to check.
    section.append(header, createText('p', savedText, 'wf-suggested-grading__total'));
    return {
        element: section,
        readAssessment: () => {
            const values = rubric.criteria.map((criterion) => {
                const raw = gradeInputs.get(criterion.id)?.value.trim() ?? '';
                return { criterion, raw, points: Number(raw) };
            });
            if (values.every((entry) => entry.raw === '')) return undefined;
            if (values.some((entry) => entry.raw === '')) {
                throw new Error('Enter a final grade for every rubric criterion, or leave every final-grade field blank.');
            }
            const invalid = values.find((entry) => !Number.isFinite(entry.points)
                || entry.points < 0
                || entry.points > (entry.criterion.points ?? 0));
            if (invalid) {
                throw new Error(`Final grade for ${invalid.criterion.label} must be between 0 and ${invalid.criterion.points}.`);
            }
            return {
                rubricVersion: rubric.version,
                criteria: values.map((entry) => ({ criterionId: entry.criterion.id, points: entry.points }))
            };
        }
    };
}

/**
 * openReview - opens one submission in the staff review workspace
 *
 * Protects unsaved edits, synchronizes the URL, loads the assignment and
 * submission snapshots, and initializes an isolated annotation working set
 * before rendering. No review, approval, or release mutation occurs here.
 *
 * @param submissionId - Internal submission identifier scoped by the active course API
 * @throws Error when the assignment or submission data cannot be loaded
 */
export async function openReview(submissionId: string): Promise<void> {
    // Resolve dirty-state confirmation before changing the URL or replacing the
    // current review DOM, so "Keep editing" leaves the existing view intact.
    if (!(await confirmDiscardDirty('review'))) return;
    state.reviewDirty = false;
    setQueryState({ wfSubmission: submissionId, wfView: null });
    setView('review');
    const root = element<HTMLDivElement>('wf-view-review');
    root.replaceChildren(createText('p', 'Loading submission…', 'wf-muted-note'));
    try {
        // Load assignments only when needed, then bind the submission to the
        // matching approved-rubric context before creating editable annotations.
        if (!state.assignments.length) state.assignments = await request<Assignment[]>('/assignments');
        const detail = await request<SubmissionDetail>(`/submissions/${encodeURIComponent(submissionId)}`);
        state.currentAssignment = state.assignments.find((item) => item.id === detail.submission.assignmentId) ?? null;
        state.expandedAssignmentId = detail.submission.assignmentId;
        initAnchorWorkingSet(detail);
        renderReviewView(root, detail);
        refreshIcons();
    } catch (error) {
        root.replaceChildren(createText('p', 'This submission could not be loaded.', 'wf-muted-note'));
        throw error;
    }
}

async function refreshReview(submissionId: string): Promise<void> {
    state.reviewDirty = false;
    // A refresh rebuilds the whole view, so record where staff were before it is replaced.
    const root = element<HTMLDivElement>('wf-view-review');
    const scroller = scrollingAncestor(root);
    const pageScrollTop = scroller.scrollTop;

    state.assignments = await request<Assignment[]>('/assignments');
    await openReview(submissionId);

    // Restore after layout, once the reopened annotations have rendered to full height.
    requestAnimationFrame(() => {
        scroller.scrollTop = pageScrollTop;
    });
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
}

// The worker retries a failed attempt up to maxAttempts (3) with up to a 60s lease
// each, so a job that fails once and succeeds on retry can legitimately take past
// two minutes. This ceiling stays comfortably above that worst case, and matches
// the server's default idle-session window (5 minutes) so a submission that is
// still generating when this loop gives up has, in practice, already logged the
// user out rather than doing so silently after this promise settles.
const GENERATION_POLL_TIMEOUT_MS = 300_000;

async function waitForGeneration(submissionId: string): Promise<SubmissionDetail> {
    const deadline = Date.now() + GENERATION_POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
        const detail = await request<SubmissionDetail>(`/submissions/${encodeURIComponent(submissionId)}`);
        if (detail.submission.status === 'draft_ready') return detail;
        if (detail.submission.status === 'failed') {
            throw new Error('Feedback generation failed. Check the rubric/profile and try again.');
        }
        await delay(2000);
    }
    throw new Error('Feedback generation is taking longer than expected. It may still finish — refresh this submission in a moment to check.');
}

/** What `release-status` reports while a queued release runs. */
interface ReleaseStatus {
    release: SubmissionDetail['release'];
    jobState: 'queued' | 'leased' | 'completed' | 'failed' | null;
    jobError?: string;
}

// A live release uploads the feedback PDF, posts a Canvas comment, and waits on Canvas's own grade job.
// Five minutes is well past the worst case observed against Canvas and matches the generation
// ceiling above, including its reasoning about the idle-session window.
const RELEASE_POLL_TIMEOUT_MS = 300_000;

/**
 * waitForRelease - polls a queued release until Canvas has been written to, or has refused.
 *
 * @param submissionId - Submission whose release job is running
 * @returns The terminal release state
 * @throws Error carrying the staff-facing reason the release did not complete
 */
async function waitForRelease(submissionId: string): Promise<ReleaseStatus> {
    const deadline = Date.now() + RELEASE_POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
        const status = await request<ReleaseStatus>(`/submissions/${encodeURIComponent(submissionId)}/release-status`);
        const releaseStatus = status.release?.status;
        if (releaseStatus === 'released' || releaseStatus === 'reconciled') return status;
        if (releaseStatus === 'reconciliation_required') {
            throw new Error('Canvas returned an uncertain result. Do not retry; reconcile the Canvas submission first.');
        }
        // The job is the authority on failure: a release that never reached Canvas at all leaves
        // the release record untouched and the reason on the job.
        if (status.jobState === 'failed') {
            throw new Error(status.jobError || 'Canvas did not confirm the complete release.');
        }
        // The handler finished, yet the record is not terminal: the release did not happen and
        // no retry will be scheduled, so say so instead of polling to the deadline.
        if (status.jobState === 'completed') {
            throw new Error('The release finished without confirming Canvas. Check the submission in Canvas before retrying.');
        }
        await delay(2000);
    }
    throw new Error('The Canvas release is taking longer than expected. It may still finish — reopen this submission in a moment to check.');
}

function renderReviewView(root: HTMLDivElement, detail: SubmissionDetail): void {
    const { submission, feedbackRun } = detail;
    const assignment = state.currentAssignment;
    root.replaceChildren();

    // Top bar: back, identity, status.
    const topbar = document.createElement('div');
    topbar.className = 'wf-review-topbar';
    const left = document.createElement('div');
    left.className = 'wf-review-topbar-info';
    const back = createButton('← Back to assignments', 'quiet', async () => {
        if (!(await confirmDiscardDirty('review'))) return;
        state.reviewDirty = false;
        await views.showLanding();
    });
    const identity = document.createElement('div');
    const subtitle = createText('p', `${assignment?.title ?? 'Writing assignment'} · Attempt ${submission.attempt}${submission.submittedAt ? ` · Submitted ${formatDate(submission.submittedAt, true)}` : ''}`);
    if (isLateSubmission(submission, assignment)) subtitle.append(' · ', createText('span', 'Late', 'wf-late-flag'));
    identity.append(createText('h2', submission.studentLabel || 'Unlabelled student'), subtitle);
    left.append(back, identity);
    const meta = document.createElement('div');
    meta.className = 'wf-review-meta';
    meta.append(
        chip(STATUS_LABELS[submission.status], STATUS_TONES[submission.status]),
        chip(`Rubric v${feedbackRun?.rubricVersion ?? '—'}`, 'neutral')
    );
    topbar.append(left, meta);
    root.append(topbar);

    // A run is reviewable only against the rubric version that produced it.
    // Version drift blocks annotation display, approval, and release until regeneration --
    // except for released feedback. It was approved and sent against its own rubric version,
    // which rubricForRun still finds in the history, so a newer approved rubric leaves it
    // readable rather than hiding it behind "Regenerate".
    const released = submission.status === 'released';
    const staleRubric = !released
        && Boolean(feedbackRun && assignment && (feedbackRun.rubricVersion ?? 1) !== assignment.rubric.version);
    if (staleRubric) {
        const warning = createText(
            'div',
            `The approved rubric is now v${assignment?.rubric.version}. Regenerate this feedback before approval or release.`,
            'wf-workspace-message'
        );
        warning.dataset.tone = 'warning';
        root.append(warning);
    }

    // The technical lens can drift (or be missing) independently of the linguistic
    // run above; approval/release/PDF all require it once the assignment is a lab
    // report with an approved technical rubric, so surface that gap here too.
    const technicalStale = !released && Boolean(
        assignment?.isLabReport
        && assignment.technicalRubric?.status === 'approved'
        && (!detail.technicalFeedbackRun
            || (detail.technicalFeedbackRun.rubricVersion ?? 1) !== assignment.technicalRubric.version)
    );
    if (technicalStale) {
        const warning = createText(
            'div',
            detail.technicalFeedbackRun
                ? `The approved technical rubric is now v${assignment?.technicalRubric?.version}. Regenerate this feedback before approval or release.`
                : 'The technical rubric is approved but no technical feedback has been generated. Regenerate feedback before approval or release.',
            'wf-workspace-message'
        );
        warning.dataset.tone = 'warning';
        root.append(warning);
    }

    const layout = document.createElement('div');
    layout.className = 'wf-review-layout';
    const storedWidth = window.localStorage.getItem('wf-panel-width');
    if (storedWidth) layout.style.setProperty('--wf-panel-width', `${storedWidth}px`);
    layout.append(
        // Doc-pane annotations are anchored to the linguistic run only; keep this
        // gate on staleRubric alone regardless of technical lens state.
        renderDocPane(submission, feedbackRun !== null && !staleRubric),
        createPanelResizeHandle(layout),
        renderFeedbackPanel(detail, assignment, staleRubric || technicalStale)
    );
    root.append(layout);
}

const PANEL_MIN_WIDTH = 340;
const PANEL_DEFAULT_WIDTH = 420;
const WIDE_VIEW_STORAGE_KEY = 'wf-doc-wide';

/** Drag handle between the doc pane and feedback panel; resizes via --wf-panel-width, persisted per-browser. */
function createPanelResizeHandle(layout: HTMLElement): HTMLElement {
    const handle = document.createElement('div');
    handle.className = 'wf-panel-resize-handle';
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-orientation', 'vertical');
    handle.setAttribute('aria-label', 'Resize feedback panel');
    handle.tabIndex = 0;

    function currentWidth(): number {
        const raw = getComputedStyle(layout).getPropertyValue('--wf-panel-width').trim();
        const parsed = parseFloat(raw);
        return Number.isFinite(parsed) ? parsed : PANEL_DEFAULT_WIDTH;
    }

    function setWidth(px: number): void {
        const maxWidth = layout.getBoundingClientRect().width * 0.65;
        const clamped = Math.min(Math.max(px, PANEL_MIN_WIDTH), Math.max(maxWidth, PANEL_MIN_WIDTH));
        layout.style.setProperty('--wf-panel-width', `${clamped}px`);
        window.localStorage.setItem('wf-panel-width', String(Math.round(clamped)));
    }

    handle.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        handle.setPointerCapture(event.pointerId);
        const startX = event.clientX;
        const startWidth = currentWidth();
        function onMove(moveEvent: PointerEvent): void {
            setWidth(startWidth - (moveEvent.clientX - startX));
        }
        function onUp(): void {
            handle.removeEventListener('pointermove', onMove);
            handle.removeEventListener('pointerup', onUp);
        }
        handle.addEventListener('pointermove', onMove);
        handle.addEventListener('pointerup', onUp);
    });

    handle.addEventListener('dblclick', () => setWidth(PANEL_DEFAULT_WIDTH));

    handle.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowLeft') { event.preventDefault(); setWidth(currentWidth() + 10); }
        if (event.key === 'ArrowRight') { event.preventDefault(); setWidth(currentWidth() - 10); }
    });

    return handle;
}

/**
 * Sticky reading toolbar above the document: zoom stepper plus a Wide view
 * toggle that releases the 75ch prose measure. Both persist per-browser so a
 * grader's reading setup survives across the whole queue of submissions.
 */
function createDocToolbar(pane: HTMLElement): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'wf-doc-toolbar';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Document view options');

    bar.append(createZoomControl(pane));

    const wide = document.createElement('button');
    wide.type = 'button';
    wide.className = 'wf-toolbar-toggle';
    wide.textContent = 'Wide view';
    const applyWide = (on: boolean): void => {
        pane.classList.toggle('wf-doc-pane--wide', on);
        wide.setAttribute('aria-pressed', String(on));
        window.localStorage.setItem(WIDE_VIEW_STORAGE_KEY, on ? '1' : '0');
    };
    applyWide(window.localStorage.getItem(WIDE_VIEW_STORAGE_KEY) === '1');
    wide.addEventListener('click', () => {
        applyWide(!pane.classList.contains('wf-doc-pane--wide'));
    });
    bar.append(wide);

    return bar;
}

/**
 * Single reading pane: verification editor while staff confirmation is
 * pending; otherwise the annotated (or plain) document, with the original
 * extraction available behind a collapsible only when it differs.
 *
 * Exported so the onboarding tutorial can render the production interface from
 * canned data. The handlers attached here still perform real mutations, so any
 * caller outside the real workspace must arm demo mode first — see
 * `writing-feedback-demo-mode.ts`.
 */
export function renderDocPane(submission: Submission, annotate: boolean): HTMLElement {
    const pane = document.createElement('div');
    pane.className = 'wf-doc-pane';
    pane.append(createDocToolbar(pane));

    if (submission.requiresVerification) {
        // OCR/file extraction remains an untrusted transcript until staff explicitly
        // confirms the corrected text; generation controls are withheld in this state.
        const paper = document.createElement('div');
        paper.className = 'wf-doc-paper';
        const transcript = textAreaControl(submission.verifiedText ?? submission.originalText, 18);
        transcript.id = 'wf-verified-transcript';
        paper.append(
            createText('h3', 'Verify extracted text'),
            createText('p', 'Compare this transcript with the original file and correct extraction errors. Feedback generation stays blocked until you confirm it.', 'wf-muted-note'),
            transcript,
            createButton('Confirm transcript', 'primary', async () => {
                await jsonRequest(`/submissions/${encodeURIComponent(submission.id)}/verify`, 'POST', {
                    verifiedText: transcript.value
                });
                showSuccessToast('Transcript confirmed. Feedback can now be generated.');
                await refreshReview(submission.id);
            })
        );
        pane.append(paper);
        return pane;
    }

    const verifiedText = submission.verifiedText ?? submission.originalText;
    if (submission.verifiedText !== undefined && submission.verifiedText !== submission.originalText) {
        const original = document.createElement('details');
        original.className = 'wf-doc-original';
        const summary = document.createElement('summary');
        summary.textContent = 'View original extraction';
        const pre = document.createElement('pre');
        pre.textContent = submission.originalText;
        original.append(summary, pre);
        pane.append(original);
    }

    const paper = document.createElement('div');
    paper.className = 'wf-doc-paper';
    paper.id = 'wf-doc-paper';
    if (!annotate) {
        const text = createText('div', verifiedText, 'wf-doc-text');
        text.setAttribute('tabindex', '0');
        paper.append(text);
    }
    pane.append(paper);
    return pane;
}

/**
 * Exported so the onboarding tutorial can render the production interface from
 * canned data. The handlers attached here still perform real mutations, so any
 * caller outside the real workspace must arm demo mode first — see
 * `writing-feedback-demo-mode.ts`.
 */
export function renderFeedbackPanel(detail: SubmissionDetail, assignment: Assignment | null, staleRubric: boolean): HTMLElement {
    const { submission, feedbackRun } = detail;
    const panel = document.createElement('aside');
    panel.className = 'wf-feedback-panel';
    panel.setAttribute('aria-label', 'Feedback');

    const header = document.createElement('div');
    header.className = 'wf-panel-header';
    header.append(createText('h3', 'Feedback'));
    panel.append(header);

    if (!feedbackRun || staleRubric) {
        const body = document.createElement('div');
        body.className = 'wf-panel-body';
        const card = document.createElement('div');
        card.append(
            createText('h4', staleRubric ? 'Regenerate feedback' : 'Generate a feedback draft'),
            createText(
                'p',
                submission.requiresVerification
                    ? 'Confirm the transcript first. The model will only evaluate verified text.'
                    : 'The draft produces summary guidance with guiding questions plus annotations anchored to the text. Everything remains staff-only until it is reviewed and approved.',
                'wf-muted-note'
            )
        );
        // Name the technical rubric explicitly when it — not the linguistic run —
        // is what is stuck, so staff know which lens the regenerate call must fix.
        if (feedbackRun && assignment?.isLabReport && assignment.technicalRubric?.status === 'approved') {
            const technicalRunStale = !detail.technicalFeedbackRun
                || (detail.technicalFeedbackRun.rubricVersion ?? 1) !== assignment.technicalRubric.version;
            if (technicalRunStale) {
                card.append(createText(
                    'p',
                    detail.technicalFeedbackRun
                        ? `The technical rubric is now v${assignment.technicalRubric.version}; the technical feedback run is out of date.`
                        : 'The technical rubric is approved but no technical feedback has been generated yet.',
                    'wf-muted-note'
                ));
            }
        }
        card.append(
            createButton(
                staleRubric ? 'Regenerate with approved rubric' : 'Generate feedback',
                'primary',
                async () => {
                    await jsonRequest<{ status: 'queued'; jobId: string; submissionId: string }>(
                        `/submissions/${encodeURIComponent(submission.id)}/generate`,
                        'POST'
                    );
                    showSuccessToast('Feedback generation queued. This page will refresh when it is ready.');
                    const settled = await waitForGeneration(submission.id);
                    if (assignment?.isLabReport && assignment.technicalRubric?.status === 'approved' && !settled.technicalFeedbackRun) {
                        showErrorToast('Technical feedback was not generated. Check that the technical rubric is approved, then generate again.');
                    } else showSuccessToast('Feedback draft generated for staff review.');
                    await refreshReview(submission.id);
                },
                submission.requiresVerification
            )
        );
        body.append(card);
        panel.append(body);
        return panel;
    }

    const lensRuns: Partial<Record<WritingFeedbackLens, FeedbackRun>> = {
        ...(detail.technicalFeedbackRun ? { technical: detail.technicalFeedbackRun } : {}),
        linguistic: feedbackRun
    };
    // The technical lens leads: a lab report is graded on its technical rubric (D-098).
    const lenses = (['technical', 'linguistic'] as const).filter((lens) => lensRuns[lens]);
    const isLabReport = lenses.length > 1;
    const markDirty = () => { state.reviewDirty = true; };
    const editor = new SummaryEditor(markDirty);
    const preserved = pendingReviewState?.submissionId === submission.id ? pendingReviewState : null;
    pendingReviewState = null;

    let step: ReviewStep = preserved?.step ?? 'annotations';
    let activeLens: WritingFeedbackLens = lenses[0];

    // Step bar: symmetric Back / Next around the step title (D-124).
    // Plain buttons rather than createButton: runButtonAction re-enables its button when the
    // action ends, which would undo the step bar's own enabled state. The busy state is still
    // shown through runButtonAction, and the bar is re-applied once the action settles.
    const stepButton = (label: string, action: () => Promise<void>): HTMLButtonElement => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'wf-button wf-button--secondary';
        button.textContent = label;
        button.addEventListener('click', () => {
            void runButtonAction(button, action).then(() => {
                if (button.isConnected) applyStepBar();
            });
        });
        return button;
    };
    const backButton = stepButton('← Back', async () => setStep('annotations'));
    const nextButton = stepButton('Next →', async () => goNext());
    const stepTitle = createText('h3', '');
    const stepPosition = createText('p', '', 'wf-muted-note');
    const stepCenter = document.createElement('div');
    stepCenter.className = 'wf-step-bar__center';
    stepCenter.append(stepTitle, stepPosition);
    header.replaceChildren(backButton, stepCenter, nextButton);
    header.classList.add('wf-step-bar');

    // Annotations step: lens tabs (lab reports) and one list host per lens.
    const annotationsBody = document.createElement('div');
    annotationsBody.className = 'wf-panel-body';
    annotationsBody.id = 'wf-step-panel-annotations';
    const listHosts = new Map<WritingFeedbackLens, HTMLElement>(lenses.map((lens) => [lens, document.createElement('div')]));

    // Summary step: one panel per lens, then the shared tail.
    const summaryBody = document.createElement('div');
    summaryBody.className = 'wf-panel-body';
    summaryBody.id = 'wf-step-panel-summary';
    const summaryNotice = document.createElement('div');
    summaryNotice.className = 'wf-callout';
    summaryNotice.setAttribute('role', 'status');
    summaryNotice.hidden = !preserved?.notice;
    summaryNotice.textContent = preserved?.notice ?? '';
    const lensPanels = new Map<WritingFeedbackLens, HTMLElement>();
    const baselines = new Map<WritingFeedbackLens, SummaryBaseline>();
    const evidenceRefreshers: Array<() => void> = [];

    const latest = latestReview(submission);
    const docPaper = () => document.getElementById('wf-doc-paper');
    const renderLensAnnotations = (lens: WritingFeedbackLens) => {
        const paper = docPaper();
        const listHost = listHosts.get(lens);
        if (!paper || !listHost) return;
        renderAnnotations({
            docHost: paper,
            listHost,
            verifiedText: submission.verifiedText ?? submission.originalText,
            lens,
            markDirty
        });
    };

    // Lab reports switch lens with the existing tab buttons on both steps.
    const tabLists: HTMLElement[] = [];
    const lensTabs = (): HTMLElement | null => {
        if (!isLabReport) return null;
        const list = document.createElement('div');
        list.className = 'wf-panel-tabs wf-lens-tabs';
        list.setAttribute('role', 'tablist');
        list.setAttribute('aria-label', 'Feedback lens');
        lenses.forEach((lens) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'wf-tab-btn';
            button.dataset.lens = lens;
            button.textContent = lens === 'technical' ? 'Technical' : 'Writing';
            button.setAttribute('role', 'tab');
            button.addEventListener('click', () => selectLens(lens));
            list.append(button);
        });
        tabLists.push(list);
        return list;
    };
    const selectLens = (lens: WritingFeedbackLens) => {
        activeLens = lens;
        listHosts.forEach((host, key) => { host.hidden = key !== lens; });
        lensPanels.forEach((panelElement, key) => { panelElement.hidden = key !== lens; });
        tabLists.forEach((list) => list.querySelectorAll<HTMLButtonElement>('.wf-tab-btn').forEach((button) => {
            const selected = button.dataset.lens === lens;
            button.setAttribute('aria-selected', String(selected));
            button.tabIndex = selected ? 0 : -1;
        }));
        // Both lenses annotate the same document pane, and rendering one replaces its
        // children, so the pane follows the visible lens on either step rather than being
        // built once. On the Summary step the highlights stay visible beside the summary.
        renderLensAnnotations(lens);
    };

    const annotationTabs = lensTabs();
    if (annotationTabs) annotationsBody.append(annotationTabs);
    listHosts.forEach((host) => annotationsBody.append(host));

    const summaryTabs = lensTabs();
    if (summaryTabs) summaryBody.append(summaryTabs);
    summaryBody.append(summaryNotice);

    let studentFeedback: HTMLTextAreaElement | null = null;
    let readFinalAssessment: () => StaffAssessmentDraft | undefined = () => undefined;
    for (const lens of lenses) {
        const run = lensRuns[lens]!;
        const lensSummary = renderSummaryLens({ assignment, lens, run, editor, markDirty, latest, preserved });
        lensPanels.set(lens, lensSummary.element);
        baselines.set(lens, lensSummary.baseline);
        evidenceRefreshers.push(lensSummary.refreshEvidence);
        if (lensSummary.studentFeedback) studentFeedback = lensSummary.studentFeedback;
        if (lensSummary.readFinalAssessment) readFinalAssessment = lensSummary.readFinalAssessment;
        summaryBody.append(lensSummary.element);
    }
    const shared = renderSummaryShared(detail, assignment, markDirty, preserved?.internalNote);
    summaryBody.append(...shared.children);

    panel.append(annotationsBody, summaryBody);

    // One explicit save snapshots the summary, the annotation working set and the grade as an
    // append-only staff revision; editing never overwrites model provenance. The footer is shown
    // only on the Summary step, so nothing is approved from a view that never showed the summary.
    const footer = document.createElement('div');
    footer.className = 'wf-panel-footer';
    footer.append(
        createButton('Save staff revision', 'secondary', async () => {
            await jsonRequest(`/submissions/${encodeURIComponent(submission.id)}/reviews`, 'POST', {
                feedbackRunId: feedbackRun.id,
                ...(detail.technicalFeedbackRun ? { technicalFeedbackRunId: detail.technicalFeedbackRun.id } : {}),
                studentFeedback: studentFeedback?.value ?? '',
                internalNote: shared.internalNote.value,
                comments: getWorkingComments(),
                finalAssessment: readFinalAssessment(),
                summaryEdits: lenses.map((lens) => editor.readEdit(lens, lensRuns[lens]!.id))
            });
            state.reviewDirty = false;
            showSuccessToast('Staff revision saved to the audit history.');
            pendingReviewState = { submissionId: submission.id, step: 'summary' };
            await refreshReview(submission.id);
        }),
        createButton('Approve', 'primary', async () => {
            // Approval is a separate, confirmed transition and deliberately does
            // not imply PDF delivery or any Canvas write.
            const confirmation = await showConfirmModal(
                'Approve this feedback?',
                'Approval confirms that a staff member reviewed the rubric evidence, guiding questions, and annotations. It will not release anything automatically.',
                'Approve feedback',
                'Keep reviewing'
            );
            if (confirmation.action !== 'approve-feedback') return;
            await jsonRequest(`/submissions/${encodeURIComponent(submission.id)}/approve`, 'POST');
            state.reviewDirty = false;
            showSuccessToast('Feedback approved. It is ready for a release preview.');
            pendingReviewState = { submissionId: submission.id, step: 'summary' };
            await refreshReview(submission.id);
        }, submission.status !== 'draft_ready'),
        renderDownloadMenu(submission, detail)
    );
    panel.append(footer);

    function applyStepBar(): void {
        const bar = stepBarState(step);
        stepTitle.textContent = bar.title;
        stepPosition.textContent = bar.position;
        backButton.disabled = bar.backDisabled;
        nextButton.disabled = bar.nextDisabled;
    }

    function setStep(next: ReviewStep): void {
        step = next;
        applyStepBar();
        annotationsBody.hidden = step !== 'annotations';
        summaryBody.hidden = step !== 'summary';
        footer.hidden = step !== 'summary';
        if (step === 'summary') evidenceRefreshers.forEach((refresh) => refresh());
        selectLens(activeLens);
    }

    async function goNext(): Promise<void> {
        // Step 1: which lenses' annotations differ from the ones their summary reflects.
        const working = getWorkingComments();
        const currentFingerprints: Partial<Record<WritingFeedbackLens, string>> = {};
        lenses.forEach((lens) => {
            currentFingerprints[lens] = fingerprintAnnotations(
                working.filter((comment) => (comment.lens ?? 'linguistic') === lens)
            );
        });
        const sourceFingerprints: Partial<Record<WritingFeedbackLens, string>> = {};
        lenses.forEach((lens) => {
            const source = detail.summarySources?.[lens];
            if (source) sourceFingerprints[lens] = source.annotationsFingerprint;
        });
        const changed = changedLenses({ lenses: [...lenses], currentFingerprints, sourceFingerprints });
        const edited = lenses.filter((lens) => editor.isEdited(lens, baselines.get(lens)!));
        const action = decideNextAction({ status: submission.status, changedLenses: changed, editedLenses: edited });

        // Step 2: advance, or confirm and redraft.
        if (action.kind === 'advance') return setStep('summary');
        if (action.kind === 'confirm') {
            const confirmation = await showConfirmModal(
                'Update the summary from your annotations?',
                'You changed annotations after editing the summary. Redrafting replaces your edits to What you did well, Feedback by rubric criterion, and Priority revision goals. Your internal note and final grades are kept.',
                'Redraft summary',
                'Keep my summary'
            );
            if (confirmation.action !== 'redraft-summary') return setStep('summary');
        }
        let preservedAssessment: StaffAssessmentDraft | undefined;
        try {
            preservedAssessment = readFinalAssessment();
        } catch {
            // A half-typed grade cannot be preserved as a complete draft; the saved grade stays.
            preservedAssessment = undefined;
        }
        try {
            await jsonRequest(`/submissions/${encodeURIComponent(submission.id)}/summary-redraft`, 'POST', {
                comments: working,
                lenses: action.lenses
            });
        } catch {
            showToast('The summary could not be updated from your annotations. Edit it by hand or try again.', 8000, 'top-right', 'error');
            return setStep('summary');
        }
        pendingReviewState = {
            submissionId: submission.id,
            step: 'summary',
            notice: 'Summary and suggested grades redrafted from your final annotations.',
            internalNote: shared.internalNote.value,
            finalAssessment: preservedAssessment
        };
        state.reviewDirty = false;
        await refreshReview(submission.id);
    }

    // Defer the first render until the document and feedback hosts share the DOM;
    // selection geometry and focus-linked markers depend on both being connected.
    queueMicrotask(() => setStep(step));
    return panel;
}

/**
 * renderDownloadMenu - the student PDF viewer buttons shown in the Summary step's footer.
 *
 * @param submission - Submission whose PDFs are opened
 * @param detail - Detail payload, used to offer the technical PDF for a lab report
 * @returns Detached button group
 */
function renderDownloadMenu(submission: Submission, detail: SubmissionDetail): HTMLElement {
    const downloadMenu = document.createElement('div');
    downloadMenu.className = 'wf-download-menu';
    const pdfBase = `${baseUrl()}/submissions/${encodeURIComponent(submission.id)}/feedback.pdf`;

    /**
     * Opens one PDF mode in a viewer rather than downloading it.
     *
     * The route serves `inline`, so the frame renders the document in place. A failed render
     * returns a JSON error body, which an iframe would show as a blank page or a wall of raw
     * JSON — so the response is fetched first and its error surfaced as a sentence.
     */
    const openPdf = async (label: string, query: string): Promise<void> => {
        const url = `${pdfBase}${query}`;
        let objectUrl: string | null = null;
        try {
            const response = await fetch(url, { credentials: 'same-origin' });
            if (!response.ok) {
                const problem = await response.json().catch(() => null);
                await showErrorModal('Could not open the PDF',
                    problem?.error ?? 'The feedback PDF could not be generated.');
                return;
            }
            objectUrl = URL.createObjectURL(await response.blob());
            const frame = document.createElement('iframe');
            frame.className = 'wf-pdf-frame';
            frame.title = `${label} preview`;
            frame.src = objectUrl;
            await showViewerModal(label, frame, `${url}${query ? '&' : '?'}download=1`);
        } finally {
            // Revoked after the modal closes; the frame has already parsed the document.
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        }
    };

    const viewerButton = (label: string, title: string, query: string): HTMLButtonElement => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'wf-button wf-button--quiet';
        button.textContent = label;
        button.title = title;
        button.addEventListener('click', () => { void openPdf(label, query); });
        return button;
    };

    // The include query is the public PDF mode contract: summary-only is the
    // default, annotated includes hover comments, and both combines the outputs.
    downloadMenu.append(
        viewerButton('PDF', 'Open the student PDF (summary feedback)', ''),
        viewerButton('Annotated PDF', 'Open the student text with highlighted comments', '?include=annotated'),
        viewerButton('Complete PDF', 'Open summary feedback plus the annotated student text', '?include=both'),
        ...(detail.technicalFeedbackRun
            ? [viewerButton('Technical PDF', 'Open the technical lab-report feedback on its own', '?lens=technical')]
            : [])
    );
    return downloadMenu;
}

/** One lens's summary controls, as composed into the Summary step. */
interface LensSummary {
    element: HTMLElement;
    baseline: SummaryBaseline;
    studentFeedback?: HTMLTextAreaElement;
    readFinalAssessment?: () => StaffAssessmentDraft | undefined;
    /** Re-reads the working annotations into each criterion's evidence (called on entering step 2). */
    refreshEvidence: () => void;
}

/**
 * renderSummaryLens - one lens's editable summary (D-126, D-127).
 *
 * Strengths, grading on the graded lens, criterion feedback with evidence from the final
 * annotations, readings (writing lens), internal flags, and revision goals.
 *
 * @param input - Lens, its latest run, the shared editor, and preserved state after a redraft
 * @returns The lens panel plus what the footer and Next step need from it
 */
function renderSummaryLens(input: {
    assignment: Assignment | null;
    lens: WritingFeedbackLens;
    run: FeedbackRun;
    editor: SummaryEditor;
    markDirty: () => void;
    latest: ReviewRevision | undefined;
    preserved: PendingReviewState | null;
}): LensSummary {
    const { assignment, lens, run, editor, markDirty, latest, preserved } = input;
    const element = document.createElement('div');
    element.className = 'wf-summary-lens';
    const rubric = rubricForRun(assignment, run, lens);
    const edit = latest?.summaryEdits?.find((item) => item.lens === lens && item.feedbackRunId === run.id);
    const baseline: SummaryBaseline = {
        strengths: run.result.strengths,
        explanations: Object.fromEntries(run.result.criteria.map((criterion) => [criterion.criterion, criterion.explanation])),
        goals: seedSummaryText(run.result.revisionGoals)
    };

    // Step 1: What you did well.
    element.append(editor.strengthsSection(lens, edit?.strengths ?? run.result.strengths));

    // Step 2: grading on the lens the assignment is graded on — technical for a lab report.
    const gradedLens: WritingFeedbackLens = assignment?.isLabReport ? 'technical' : 'linguistic';
    let readFinalAssessment: LensSummary['readFinalAssessment'];
    if (lens === gradedLens && hasSuggestedGrading(rubric)) {
        const grading = renderSuggestedGrading(run, rubric, preserved?.finalAssessment ?? latest?.finalAssessment, markDirty);
        if (grading) {
            element.append(grading.element);
            readFinalAssessment = grading.readAssessment;
        }
    }

    // Step 3: criterion feedback. Evidence comes from this lens's final annotations and is re-read
    // every time the Summary step opens, because staff edit annotations on step 1.
    const evidenceHosts = new Map<string, HTMLElement>();
    const refreshEvidence = () => {
        const working = getWorkingComments().filter((comment) => (comment.lens ?? 'linguistic') === lens);
        evidenceHosts.forEach((host, criterionId) => {
            host.replaceChildren(...working
                .filter((comment) => comment.criterion === criterionId)
                .sort((left, right) => left.startOffset - right.startOffset)
                .map((comment) => createText('blockquote', `“${comment.quote}”`, 'wf-evidence')));
        });
    };
    const rubricSection = document.createElement('section');
    rubricSection.className = 'wf-feedback-section';
    rubricSection.append(createText('h3', 'Feedback by rubric criterion'));
    const criterionList = document.createElement('div');
    criterionList.className = 'wf-criterion-list';
    orderedCriterionIds(rubric, run.result.criteria).forEach((criterionId) => {
        const criterion = run.result.criteria.find((item) => item.criterion === criterionId);
        const definition = rubric?.criteria.find((item) => item.id === criterionId);
        const item = document.createElement('article');
        item.className = 'wf-criterion';
        const criterionHeader = document.createElement('div');
        criterionHeader.className = 'wf-criterion-header';
        const heading = createText('h4', criterionLabel(rubric, criterionId));
        const title = criterionTitle(rubric, criterionId);
        if (title) heading.title = title;
        criterionHeader.append(heading);
        if (criterion) criterionHeader.append(chip(levelLabel(rubric, criterion.criterion, criterion.suggestedLevel), 'neutral'));
        item.append(criterionHeader);
        const sflLabel = definition?.sflDimension
            ?? (definition?.functionTag ? `${FUNCTION_TAG_LABELS[definition.functionTag]} function` : undefined);
        if (sflLabel) item.append(createText('p', sflLabel, 'wf-sfl-label'));
        if (!criterion) {
            item.append(createText('p', 'No stored feedback was found for this rubric criterion.', 'wf-muted-note'));
            criterionList.append(item);
            return;
        }
        const explanation = edit?.criterionExplanations.find((entry) => entry.criterion === criterionId)?.explanation
            ?? criterion.explanation;
        item.append(editor.explanationField(lens, criterionId, explanation));
        const evidenceHost = document.createElement('div');
        evidenceHosts.set(criterionId, evidenceHost);
        item.append(evidenceHost);
        criterionList.append(item);
    });
    rubricSection.append(criterionList);
    element.append(rubricSection);

    // Step 4: readings (writing lens) and internal flags, under the levels they qualify.
    if (lens === 'linguistic') element.append(...renderReadings(run));
    element.append(...renderInternalFlags(run));

    // Step 5: revision goals. Writing keeps the student-feedback textarea and its binding rule.
    const goalsSection = document.createElement('section');
    goalsSection.className = 'wf-feedback-section';
    goalsSection.append(createText('h3', 'Priority revision goals'));
    let studentFeedback: HTMLTextAreaElement | undefined;
    if (lens === 'linguistic') {
        // Staff text applies only while it was saved against this run; after a redraft the
        // goals reseed from the redrafted run, the same rule the student PDF follows.
        const seed = latest && latest.feedbackRunId === run.id ? latest.studentFeedback : baseline.goals;
        const goals = editor.goalsField(lens, seed, 'Goals the student will receive', 'Guide revision without supplying rewritten sentences or a model answer.');
        goals.textarea.id = 'wf-student-feedback';
        studentFeedback = goals.textarea;
        goalsSection.append(goals.wrapper);
    } else {
        const goals = editor.goalsField(
            lens,
            edit?.revisionGoalsText ?? baseline.goals,
            'Technical goals the student will receive',
            'Guide revision without supplying corrected values or a model answer.'
        );
        goalsSection.append(goals.wrapper);
    }
    element.append(goalsSection);

    refreshEvidence();
    return { element, baseline, studentFeedback, readFinalAssessment, refreshEvidence };
}

/**
 * renderReadings - staff view of the course materials this run cited or retrieved.
 *
 * @param run - Latest writing run
 * @returns The readings section, or nothing when retrieval found none
 */
function renderReadings(run: FeedbackRun): HTMLElement[] {
    // Staff see everything retrieval read, marked where a document is not published: an
    // unpublished document can ground the writing without being nameable to the student, and
    // a reviewer needs to know which is which. Students see the published list only.
    const publishedMentions = run.result.courseMaterialMentions ?? [];
    // The run carries the citable ids because the student-facing list is capped at five:
    // inferring publication from it marks a sixth published document "not published".
    // Runs written before that field fall back to the student list, as they always did.
    const publishedIds = new Set(
        run.citableCourseMaterialMentionIds?.length
            ? run.citableCourseMaterialMentionIds
            : publishedMentions.map((mention) => mention.id)
    );
    const mentions = run.staffCourseMaterialMentions?.length
        ? run.staffCourseMaterialMentions
        : publishedMentions;
    if (!mentions.length) return [];
    const materialsSection = document.createElement('section');
    materialsSection.className = 'wf-feedback-section';
    materialsSection.append(createText('h3', 'Useful readings'));
    const materialList = document.createElement('ul');
    materialList.className = 'wf-strength-list';
    mentions.forEach((mention) => {
        const item = createText('li', mention.label);
        if (!publishedIds.has(mention.id)) {
            item.append(createText('span', ' Not published to students', 'wf-muted-note'));
        }
        materialList.append(item);
    });
    materialsSection.append(materialList);
    return [materialsSection];
}

/**
 * renderInternalFlags - what the model could not judge, one per line (D-114).
 *
 * @param run - Latest run for the lens
 * @returns The staff-only flags section, or nothing when the run has none
 */
function renderInternalFlags(run: FeedbackRun): HTMLElement[] {
    // Internal flags stay in the staff workspace only; the PDF service and release payload
    // exclude them. They sit directly under the criterion levels because that is what they
    // qualify — a model that could not check source completeness has told the marker
    // something about the level they are approving. One per line: joined into a sentence
    // at the foot of the tab, a marker scrolled past them.
    if (!run.result.internalFlags.length) return [];
    const flags = document.createElement('section');
    flags.className = 'wf-feedback-section wf-internal-note';
    flags.append(
        createText('h3', 'Internal review flags'),
        createText('p', 'What the model could not judge from the verified text. Staff-only; never in the student PDF.', 'wf-muted-note')
    );
    const flagList = document.createElement('ul');
    flagList.className = 'wf-strength-list';
    run.result.internalFlags.forEach((flag) => flagList.append(createText('li', flag)));
    flags.append(flagList);
    return [flags];
}

/**
 * renderSummaryShared - internal note, review history, and release card, shown once per submission.
 *
 * @param detail - Submission detail
 * @param assignment - Parent assignment
 * @param markDirty - Marks the review as having unsaved edits
 * @param preservedNote - Unsaved note carried across a redraft re-render
 * @returns Sections to append and the note control the footer saves
 */
function renderSummaryShared(
    detail: SubmissionDetail,
    assignment: Assignment | null,
    markDirty: () => void,
    preservedNote?: string
): { children: HTMLElement[]; internalNote: HTMLTextAreaElement } {
    const { submission } = detail;
    const revision = latestReview(submission);
    const children: HTMLElement[] = [];

    const noteSection = document.createElement('section');
    noteSection.className = 'wf-feedback-section';
    const internalNote = textAreaControl(preservedNote ?? revision?.internalNote ?? '', 3);
    internalNote.id = 'wf-internal-note';
    internalNote.addEventListener('input', markDirty);
    noteSection.append(field(
        'Internal staff note',
        internalNote,
        'Visible only to instructors and TAs; excluded from the student PDF.'
    ));
    children.push(noteSection);

    if (submission.reviews?.length) {
        const historySection = document.createElement('section');
        historySection.className = 'wf-feedback-section';
        historySection.append(
            createText('h3', `Review history (${submission.reviews.length})`),
            createText('p', 'Every saved revision is kept for audit. This is a read-only record — it cannot be restored or reverted.', 'wf-muted-note')
        );
        const history = document.createElement('div');
        history.className = 'wf-history-list';
        const reviews = submission.reviews;
        [...reviews].reverse().forEach((item, reverseIndex) => {
            const revisionNumber = reviews.length - reverseIndex;
            const previous = reviews[revisionNumber - 2];
            const diff = diffReviewComments(previous?.comments, item.comments);

            const entry = document.createElement('details');
            entry.className = 'wf-history-item';
            entry.open = reverseIndex === 0;

            const summary = document.createElement('summary');
            summary.textContent = `Revision ${revisionNumber} · ${formatDate(item.createdAt, true)} · ${item.staffUserId}`;
            entry.append(summary);

            const body = document.createElement('div');
            body.className = 'wf-history-item-body';
            body.append(
                createText('h4', 'Priority revision goals'),
                createText('pre', item.studentFeedback, 'wf-history-text')
            );
            if (item.internalNote) {
                body.append(createText('h4', 'Internal staff note'), createText('pre', item.internalNote, 'wf-history-text'));
            }
            if (item.finalAssessment) {
                body.append(
                    createText('h4', 'Final rubric assessment'),
                    createText(
                        'p',
                        `${item.finalAssessment.totalPoints} of ${item.finalAssessment.maxPoints} · rubric v${item.finalAssessment.rubricVersion}`
                    )
                );
            }

            const commentLine = (label: string, comment: AnchoredComment): HTMLElement => {
                const line = document.createElement('p');
                line.className = 'wf-history-comment-line';
                line.append(
                    createText('strong', `${label}: `),
                    createText('span', `"${comment.quote}" — ${comment.comment}`),
                    chip(comment.origin === 'staff' ? (comment.authorName || 'Staff') : 'Model seed', comment.origin === 'staff' ? 'green' : 'neutral')
                );
                return line;
            };

            if (diff.added.length || diff.removed.length || diff.edited.length) {
                body.append(createText('h4', 'Comment changes'));
                diff.added.forEach((c) => body.append(commentLine('Added', c)));
                diff.edited.forEach(({ after }) => body.append(commentLine('Edited', after)));
                diff.removed.forEach((c) => body.append(commentLine('Removed', c)));
            }

            entry.append(body);
            history.append(entry);
        });
        historySection.append(history);
        children.push(historySection);
    }

    const releaseSection = document.createElement('section');
    releaseSection.className = 'wf-feedback-section';
    releaseSection.append(renderReleaseCard(submission, assignment, detail.release, {
        released: detail.releaseCount ?? 0,
        max: detail.maxReleases ?? 0
    }));
    children.push(releaseSection);

    return { children, internalNote };
}

/**
 * releaseHistoryLine - what staff are told about a submission's earlier releases.
 *
 * Silent on the first release, because a submission that has never been released has no history
 * to report. After that the count is stated with the cap, since each further release adds a new
 * Canvas comment and notifies the student again — staff decide whether a correction is worth it.
 *
 * @param counts - Completed releases and the per-submission limit
 * @returns The sentence to show, or an empty string when there is nothing to say
 */
function releaseHistoryLine(counts: { released: number; max: number }): string {
    if (counts.released < 1) return '';
    const remaining = Math.max(counts.max - counts.released, 0);
    const times = counts.released === 1 ? 'once' : `${counts.released} times`;
    if (remaining < 1) {
        return `This attempt’s feedback has been released ${times}, which is the limit for one attempt.`;
    }
    return `This attempt’s feedback has been released ${times}. A submission may be released at most`
        + ` ${counts.max} times, and each release adds another comment to the student’s Canvas submission.`;
}

function renderReleaseCard(
    submission: Submission,
    assignment: Assignment | null,
    priorRelease: SubmissionDetail['release'],
    counts: { released: number; max: number }
): HTMLElement {
    const card = document.createElement('section');
    card.className = 'wf-release-card';
    const workspace = state.workspace!;

    const isDemo = workspace.canvas.mode === 'demo';
    const finalAssessment = latestReview(submission)?.finalAssessment;
    const hasFinalAssessment = Boolean(finalAssessment);
    // Feedback reaches Canvas once (D-128). After that the card only reports the release and says
    // a correction means a new attempt; there is no second release of the same attempt.
    const capReached = counts.max > 0 && counts.released >= counts.max;
    if (priorRelease?.status === 'released' || priorRelease?.status === 'reconciled' || submission.status === 'released') {
        card.append(
            createText('h3', priorRelease?.revision && priorRelease.revision > 1
                ? `Released to Canvas · revision ${priorRelease.revision}`
                : 'Released to Canvas'),
            createText(
                'p',
                priorRelease?.postManually
                    ? 'The feedback files and grade reached Canvas and remain hidden until the assignment is posted.'
                    : 'The feedback files and grade were confirmed in Canvas.'
            )
        );
        const history = releaseHistoryLine(counts);
        if (history) card.append(createText('p', history));
        // Released feedback cannot be edited — the service refuses a review revision on a
        // released submission — so a correction is a new attempt, not a second pass over this
        // one. Say that, rather than offering a control the server would refuse.
        card.append(createText(
            'p',
            'Released feedback cannot be edited. To send a correction, add or import a new attempt for this student and review it.'
        ));
        return card;
    }
    if (priorRelease?.status === 'reconciliation_required') {
        card.append(
            createText('h3', 'Canvas reconciliation required'),
            createText(
                'p',
                'Canvas returned an uncertain result during release. Check this student’s submission and grade in Canvas before any retry; automatic retry is disabled to prevent duplicate feedback.'
            )
        );
        return card;
    }
    // Release remains unavailable until human approval, a complete numeric
    // mapping, and a usable Canvas adapter are all simultaneously present.
    const releaseReady = submission.status === 'approved' && hasFinalAssessment && workspace.canvas.canImport && !capReached;
    card.append(
        createText('h3', isDemo ? 'Canvas release simulation' : 'Release to Canvas'),
        createText(
            'p',
            isDemo
                ? 'Local demo mode creates a release record but never contacts Canvas or a real student.'
                : 'Send the approved feedback PDF and staff-final grade to this exact Canvas attempt. Feedback can be released only once.'
        )
    );
    const releaseState = document.createElement('div');
    releaseState.className = 'wf-release-state';
    releaseState.setAttribute('role', 'status');
    releaseState.setAttribute('aria-live', 'polite');
    if (capReached) releaseState.textContent = releaseHistoryLine(counts);
    else if (!hasFinalAssessment) releaseState.textContent = 'Release is blocked until a complete staff-final rubric grade is saved.';
    else if (!workspace.canvas.canImport) releaseState.textContent = workspace.canvas.message;
    else if (submission.status !== 'approved') releaseState.textContent = 'Approve the staff-reviewed feedback before release.';
    else if (priorRelease?.releaseLockedAt) releaseState.textContent = 'A release is already on its way to Canvas for this submission.';
    else if (priorRelease?.status === 'failed') releaseState.textContent = priorRelease.sanitizedError || 'The prior Canvas release failed safely and may be retried.';
    else if (priorRelease?.status === 'feedback_attached') releaseState.textContent = 'Feedback is attached; the Canvas grade still needs confirmation.';
    else if (priorRelease?.status === 'grade_queued') releaseState.textContent = 'Canvas accepted the grade job; check its completion before retrying.';
    else releaseState.textContent = 'Ready to release.';

    const buttons = document.createElement('div');
    buttons.className = 'wf-button-row';
    buttons.append(
        createButton(isDemo ? 'Simulate release' : 'Release to Canvas', 'primary', async () => {
            // External delivery (or its visibly synthetic demo equivalent) always
            // requires a second, submission-specific confirmation.
            const confirmation = await showConfirmModal(
                isDemo ? 'Simulate this Canvas release?' : 'Release approved feedback to Canvas?',
                `${submission.studentLabel || 'This student'} · ${assignment?.title || 'Writing assignment'}\n\nThe approved PDF and numeric grade will be included. Feedback can be released only once.`,
                isDemo ? 'Simulate release' : 'Release to Canvas',
                'Cancel'
            );
            const expectedAction = isDemo ? 'simulate-release' : 'release-to-canvas';
            if (confirmation.action !== expectedAction) return;
            // The server queues the release and returns immediately; the write itself happens in
            // the worker, so this waits on the record rather than on one long request.
            await jsonRequest<{ status: string; jobId: string }>(
                `/submissions/${encodeURIComponent(submission.id)}/release`,
                'POST'
            );
            releaseState.textContent = isDemo
                ? 'Simulating the release…'
                : 'Sending the feedback files and grade to Canvas…';
            let released: ReleaseStatus;
            try {
                released = await waitForRelease(submission.id);
            } catch (error) {
                releaseState.textContent = error instanceof Error
                    ? error.message
                    : 'Canvas did not confirm the complete release.';
                showErrorToast(releaseState.textContent);
                return;
            }
            showSuccessToast(isDemo
                ? 'Demo release completed without contacting Canvas.'
                : released.release?.postManually
                    ? 'Feedback and grade reached Canvas and remain hidden until the assignment is posted.'
                    : 'Feedback and grade were released to the student in Canvas.');
            await refreshReview(submission.id);
        }, !releaseReady)
    );
    card.append(releaseState, buttons);
    return card;
}
