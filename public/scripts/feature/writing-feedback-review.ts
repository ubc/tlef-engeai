// public/scripts/feature/writing-feedback-review.ts
/**
 * Writing Feedback Review — staff review and release workspace
 *
 * Left: the submission as a single readable annotated document (verification
 * textarea only while staff confirmation is pending). Right: a sticky Feedback
 * panel with Annotations (text-anchored, editable comments with function/level
 * filters) and Summary (SFL sections, strengths, revision goals with Socratic
 * guiding questions, staff editors, history, release) tabs. Approval
 * and release stay separate actions; nothing reaches a student without
 * explicit staff approval.
 *
 * @author: @rdschrs
 * @date: 2026-07-22
 * @version: 1.0.0
 * @description: Coordinates transcript verification, review revisions, PDF downloads, approval, and release.
 */

import { showConfirmModal, showErrorModal, showViewerModal } from '../ui/modal-overlay.js';
import { showErrorToast, showSuccessToast } from '../ui/toast-notification.js';
import {
    AnchoredComment,
    Assignment,
    CriterionFeedback,
    FeedbackRun,
    FUNCTION_TAG_LABELS,
    ReviewRevision,
    RubricDefinition,
    SOURCE_LABELS,
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
    jsonRequest,
    refreshIcons,
    request,
    setQueryState,
    setView,
    state,
    textAreaControl,
    views
} from './writing-feedback-shared.js';
import { getWorkingComments, initAnchorWorkingSet, renderAnnotations } from './writing-feedback-anchors.js';
import { formatBand, resolveBand, totalRubricPoints } from './writing-feedback-grid.js';

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

function levelLabel(rubric: RubricDefinition | undefined, id: string): string {
    return rubric?.levels.find((level) => level.id === id)?.label ?? id;
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
            levelLabel: level?.label ?? feedback.suggestedLevel,
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

interface GradingEditor {
    element: HTMLElement;
    readAssessment: () => StaffAssessmentDraft | undefined;
}

function renderSuggestedGrading(
    run: FeedbackRun,
    rubric: RubricDefinition,
    saved: StaffFinalAssessment | undefined,
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

    const panel = document.createElement('div');
    panel.className = 'wf-suggested-grading__panel';
    panel.hidden = true;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'wf-button wf-button--secondary';
    button.textContent = 'Show suggested grading';
    button.addEventListener('click', () => {
        panel.hidden = !panel.hidden;
        button.textContent = panel.hidden ? 'Show suggested grading' : 'Hide suggested grading';
    });
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
    rubric.levels
        .slice()
        .sort((left, right) => left.rank - right.rank)
        .forEach((level) => {
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
    rubric.criteria.forEach((criterion) => {
        const feedback = feedbackByCriterion.get(criterion.id);
        if (!feedback) return;
        const row = document.createElement('tr');
        const rowHeading = createText('th', criterion.label);
        rowHeading.setAttribute('scope', 'row');
        row.append(rowHeading);
        rubric.levels
            .slice()
            .sort((left, right) => left.rank - right.rank)
            .forEach((level) => {
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
                row.append(cell);
            });
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
        gradeInput.addEventListener('input', markDirty);
        gradeCell.append(gradeInput, createText('span', ` / ${criterion.points}`, 'wf-muted-note'));
        gradeInputs.set(criterion.id, gradeInput);
        row.append(gradeCell);
        tbody.append(row);
    });
    table.append(tbody);
    scroll.append(table);

    const total = totalRubricPoints(rubric.criteria);
    const totalText = grading.totalMin === grading.totalMax
        ? `${grading.totalMax} of ${total}`
        : `${grading.totalMin} – ${grading.totalMax} of ${total}`;
    panel.append(
        scroll,
        createText('p', `Model suggestion: ${totalText}`, 'wf-suggested-grading__total'),
        createText(
            'p',
            saved ? `Saved final grade: ${saved.totalPoints} of ${saved.maxPoints}` : 'No final grade has been saved yet.',
            'wf-suggested-grading__total'
        )
    );
    section.append(header, panel);
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
    state.assignments = await request<Assignment[]>('/assignments');
    await openReview(submissionId);
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
    identity.append(
        createText('h2', submission.studentLabel || 'Unlabelled student'),
        createText('p', `${assignment?.title ?? 'Writing assignment'} · Attempt ${submission.attempt} · ${SOURCE_LABELS[submission.sourceType]} · Submitted ${formatDate(submission.createdAt, true)}${assignment?.dueAt ? ` · Deadline ${formatDate(assignment.dueAt, true)}` : ''}`)
    );
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
    // Version drift blocks annotation display, approval, and release until regeneration.
    const staleRubric = Boolean(feedbackRun && assignment && (feedbackRun.rubricVersion ?? 1) !== assignment.rubric.version);
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
    const technicalStale = Boolean(
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

    // Tabs.
    const tabList = document.createElement('div');
    tabList.className = 'wf-panel-tabs';
    tabList.setAttribute('role', 'tablist');
    tabList.setAttribute('aria-label', 'Feedback views');
    header.append(tabList);

    const annotationsBody = document.createElement('div');
    annotationsBody.className = 'wf-panel-body';
    annotationsBody.id = 'wf-tab-panel-annotations';
    annotationsBody.setAttribute('role', 'tabpanel');
    annotationsBody.hidden = Boolean(detail.technicalFeedbackRun);
    const summaryBody = document.createElement('div');
    summaryBody.className = 'wf-panel-body';
    summaryBody.id = 'wf-tab-panel-summary';
    summaryBody.setAttribute('role', 'tabpanel');
    summaryBody.hidden = true;
    const technicalBody = document.createElement('div');
    technicalBody.className = 'wf-panel-body';
    technicalBody.id = 'wf-tab-panel-technical';
    technicalBody.setAttribute('role', 'tabpanel');
    // Visibility is set by selectTab against tab order, so neither panel hard-codes it.
    technicalBody.hidden = Boolean(detail.technicalFeedbackRun) === false;

    // renderAnnotations replaces its list host wholesale, so each annotating tab keeps a
    // dedicated container: the technical panel's read-only draft sits above its own.
    const annotationsListHost = document.createElement('div');
    const technicalListHost = document.createElement('div');

    // The technical tab only exists for a lab report whose technical lens has run, and when it
    // does it leads: the technical rubric is what a lab report is graded on, so its annotations
    // are what a reviewer works through first.
    const technicalTab = detail.technicalFeedbackRun
        ? [{ id: 'technical', label: 'Technical', panel: technicalBody, lens: 'technical' as const, listHost: technicalListHost }]
        : [];
    const tabs: Array<{ id: string; label: string; panel: HTMLElement; lens?: WritingFeedbackLens; listHost?: HTMLElement }> = [
        ...technicalTab,
        { id: 'annotations', label: assignment?.isLabReport ? 'Writing' : 'Annotations', panel: annotationsBody, lens: 'linguistic' as const, listHost: annotationsListHost },
        { id: 'summary', label: 'Summary', panel: summaryBody }
    ];
    const buttons: HTMLButtonElement[] = [];
    const selectTab = (selected: number) => {
        // Keep ARIA selection and keyboard tab stops synchronized with panel
        // visibility so arrow-key users encounter exactly one active tab.
        tabs.forEach((tab, index) => {
            tab.panel.hidden = index !== selected;
            buttons[index].setAttribute('aria-selected', String(index === selected));
            buttons[index].tabIndex = index === selected ? 0 : -1;
        });
        // Both lenses annotate the same document pane, and rendering one replaces its
        // children. So the pane follows the visible tab rather than being built once.
        const { lens, listHost } = tabs[selected];
        if (lens && listHost) renderLensAnnotations(lens, listHost);
    };
    tabs.forEach((tab, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'wf-tab-btn';
        button.id = `wf-tab-${tab.id}`;
        button.textContent = tab.label;
        button.setAttribute('role', 'tab');
        button.setAttribute('aria-selected', String(index === 0));
        button.setAttribute('aria-controls', tab.panel.id);
        button.tabIndex = index === 0 ? 0 : -1;
        tab.panel.setAttribute('aria-labelledby', button.id);
        button.addEventListener('click', () => selectTab(index));
        button.addEventListener('keydown', (event) => {
            if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
            event.preventDefault();
            const next = (index + (event.key === 'ArrowRight' ? 1 : buttons.length - 1)) % buttons.length;
            selectTab(next);
            buttons[next].focus();
        });
        buttons.push(button);
        tabList.append(button);
    });

    const markDirty = () => { state.reviewDirty = true; };

    // Anchored comments over the shared document pane, for whichever lens is on screen.
    const docPaper = () => document.getElementById('wf-doc-paper');
    const renderLensAnnotations = (lens: WritingFeedbackLens, listHost: HTMLElement) => {
        const paper = docPaper();
        if (!paper) return;
        renderAnnotations({
            docHost: paper,
            listHost,
            verifiedText: submission.verifiedText ?? submission.originalText,
            lens,
            markDirty
        });
    };
    // Defer the first render until the document and feedback hosts share the DOM;
    // selection geometry and focus-linked markers depend on both being connected.
    queueMicrotask(() => {
        const first = tabs[0];
        if (first.lens && first.listHost) renderLensAnnotations(first.lens, first.listHost);
    });

    // Summary tab.
    const summaryContent = renderSummaryTab(detail, assignment, markDirty);
    summaryBody.append(...summaryContent.children);
    const studentFeedback = summaryContent.studentFeedback;
    const internalNote = summaryContent.internalNote;

    annotationsBody.append(annotationsListHost);
    panel.append(annotationsBody, summaryBody);

    // Technical tab — the read-only technical draft, then the technical rubric's own
    // annotations. Approval and release remain whole-submission actions on the Summary tab.
    if (detail.technicalFeedbackRun) {
        technicalBody.append(...renderTechnicalTab(detail.technicalFeedbackRun, assignment), technicalListHost);
        panel.append(technicalBody);
    }

    // One explicit save snapshots both summary fields and the annotation working
    // set as an append-only staff revision; editing never overwrites model provenance.
    const footer = document.createElement('div');
    footer.className = 'wf-panel-footer';
    footer.append(
        createButton('Save staff revision', 'secondary', async () => {
            await jsonRequest(`/submissions/${encodeURIComponent(submission.id)}/reviews`, 'POST', {
                feedbackRunId: feedbackRun.id,
                studentFeedback: studentFeedback.value,
                internalNote: internalNote.value,
                comments: getWorkingComments(),
                finalAssessment: summaryContent.readFinalAssessment()
            });
            state.reviewDirty = false;
            showSuccessToast('Staff revision saved to the audit history.');
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
            await refreshReview(submission.id);
        }, submission.status !== 'draft_ready')
    );
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
    footer.append(downloadMenu);
    panel.append(footer);

    return panel;
}

/**
 * renderTechnicalTab - renders the read-only technical (lab-report) draft
 *
 * The technical run judges argument consistency and evidence support against
 * the approved technical rubric and lab context; it never judges agreement
 * with theory. Approval and release stay whole-submission actions on the
 * Summary tab, so this tab only displays the draft for staff review.
 *
 * @param run - Latest immutable technical model result
 * @param assignment - Parent assignment supplying the technical rubric used to label criteria
 * @returns Detached section nodes ready for insertion into the technical tab panel
 */
function renderTechnicalTab(run: FeedbackRun, assignment: Assignment | null): HTMLElement[] {
    const children: HTMLElement[] = [];

    children.push(createText(
        'p',
        'Read-only technical draft from the lab-report engine. Approve and release from the Summary tab apply to the whole submission.',
        'wf-muted-note'
    ));

    const strengths = document.createElement('section');
    strengths.className = 'wf-feedback-section';
    strengths.append(createText('h3', 'What works (technical)'));
    const strengthList = document.createElement('ul');
    strengthList.className = 'wf-strength-list';
    run.result.strengths.forEach((strength) => strengthList.append(createText('li', strength)));
    strengths.append(strengthList);
    children.push(strengths);

    const rubric = rubricForRun(assignment, run, 'technical');
    const rubricSection = document.createElement('section');
    rubricSection.className = 'wf-feedback-section';
    rubricSection.append(createText('h3', 'Feedback by technical rubric criterion'));
    const criterionList = document.createElement('div');
    criterionList.className = 'wf-criterion-list';
    orderedCriterionIds(rubric, run.result.criteria).forEach((criterionId) => {
        const criterion = run.result.criteria.find((item) => item.criterion === criterionId);
        const item = document.createElement('article');
        item.className = 'wf-criterion';
        const criterionHeader = document.createElement('div');
        criterionHeader.className = 'wf-criterion-header';
        const heading = createText('h4', criterionLabel(rubric, criterionId));
        const title = criterionTitle(rubric, criterionId);
        if (title) heading.title = title;
        criterionHeader.append(heading);
        if (criterion) criterionHeader.append(chip(levelLabel(rubric, criterion.suggestedLevel), 'neutral'));
        item.append(criterionHeader);
        if (!criterion) {
            item.append(createText('p', 'No stored feedback was found for this rubric criterion.', 'wf-muted-note'));
            criterionList.append(item);
            return;
        }
        item.append(createText('p', criterion.explanation));
        criterion.evidence.forEach((evidence) => {
            item.append(createText('blockquote', `“${evidence.quote}”`, 'wf-evidence'));
        });
        criterionList.append(item);
    });
    rubricSection.append(criterionList);
    children.push(rubricSection);

    const goalsSection = document.createElement('section');
    goalsSection.className = 'wf-feedback-section';
    goalsSection.append(
        createText('h3', 'Priority technical revision goals'),
        createText('p', 'At most three high-impact goals, each posed as a guiding question rather than a corrected answer.', 'wf-muted-note')
    );
    run.result.revisionGoals.slice(0, 3).forEach((goal) => {
        const goalCard = document.createElement('article');
        goalCard.className = 'wf-goal-card';
        goalCard.append(
            createText('strong', goal.goal),
            createText('p', `Guiding question: ${goal.guidedQuestion}`, 'wf-guided-question'),
            chip(goal.skillTag, 'neutral')
        );
        goalsSection.append(goalCard);
    });
    children.push(goalsSection);

    // Internal flags stay in the staff workspace only, matching the Summary tab.
    if (run.result.internalFlags.length) {
        const flags = document.createElement('section');
        flags.className = 'wf-feedback-section wf-internal-note';
        flags.append(
            createText('h3', 'Internal review flags'),
            createText('p', run.result.internalFlags.join(', '))
        );
        children.push(flags);
    }

    return children;
}

interface SummaryContent {
    children: HTMLElement[];
    studentFeedback: HTMLTextAreaElement;
    internalNote: HTMLTextAreaElement;
    readFinalAssessment: () => StaffAssessmentDraft | undefined;
}

function renderSummaryTab(
    detail: SubmissionDetail,
    assignment: Assignment | null,
    markDirty: () => void
): SummaryContent {
    const { submission } = detail;
    const feedbackRun = detail.feedbackRun!;
    const children: HTMLElement[] = [];

    const strengths = document.createElement('section');
    strengths.className = 'wf-feedback-section';
    strengths.append(createText('h3', 'What works'));
    const strengthList = document.createElement('ul');
    strengthList.className = 'wf-strength-list';
    feedbackRun.result.strengths.forEach((strength) => strengthList.append(createText('li', strength)));
    strengths.append(strengthList);
    children.push(strengths);

    const rubric = rubricForRun(assignment, feedbackRun);
    const revision = latestReview(submission);
    // A lab report is graded on its technical rubric, so the grade column and the model
    // suggestions beside it come from the technical run rather than the writing one. The
    // criterion feedback below still reads the writing rubric, which is what it describes.
    const gradedLens: WritingFeedbackLens = assignment?.isLabReport ? 'technical' : 'linguistic';
    const gradedRun = gradedLens === 'technical' ? detail.technicalFeedbackRun : feedbackRun;
    const gradedRubric = gradedRun ? rubricForRun(assignment, gradedRun, gradedLens) : undefined;
    const gradingEditor = gradedRun && hasSuggestedGrading(gradedRubric)
        ? renderSuggestedGrading(gradedRun, gradedRubric, revision?.finalAssessment, markDirty)
        : null;
    if (gradingEditor) children.push(gradingEditor.element);
    const rubricSection = document.createElement('section');
    rubricSection.className = 'wf-feedback-section';
    rubricSection.append(createText('h3', 'Feedback by rubric criterion'));
    const criterionList = document.createElement('div');
    criterionList.className = 'wf-criterion-list';
    orderedCriterionIds(rubric, feedbackRun.result.criteria).forEach((criterionId) => {
        const criterion = feedbackRun.result.criteria.find((item) => item.criterion === criterionId);
        const definition = rubric?.criteria.find((item) => item.id === criterionId);
        const item = document.createElement('article');
        item.className = 'wf-criterion';
        const criterionHeader = document.createElement('div');
        criterionHeader.className = 'wf-criterion-header';
        const heading = createText('h4', criterionLabel(rubric, criterionId));
        const title = criterionTitle(rubric, criterionId);
        if (title) heading.title = title;
        criterionHeader.append(heading);
        if (criterion) criterionHeader.append(chip(levelLabel(rubric, criterion.suggestedLevel), 'neutral'));
        item.append(criterionHeader);
        const lens = definition?.sflDimension
            ?? (definition?.functionTag ? `${FUNCTION_TAG_LABELS[definition.functionTag]} function` : undefined);
        if (lens) item.append(createText('p', lens, 'wf-sfl-label'));
        if (!criterion) {
            item.append(createText('p', 'No stored feedback was found for this rubric criterion.', 'wf-muted-note'));
            criterionList.append(item);
            return;
        }
        item.append(createText('p', criterion.explanation));
        criterion.evidence.forEach((evidence) => {
            item.append(createText('blockquote', `“${evidence.quote}”`, 'wf-evidence'));
        });
        criterionList.append(item);
    });
    rubricSection.append(criterionList);
    children.push(rubricSection);

    const goalsSection = document.createElement('section');
    goalsSection.className = 'wf-feedback-section';
    goalsSection.append(
        createText('h3', 'Priority revision goals'),
        createText('p', 'At most three high-impact goals. Each guiding question invites the student to think through the change instead of receiving the answer.', 'wf-muted-note')
    );
    feedbackRun.result.revisionGoals.slice(0, 3).forEach((goal) => {
        const goalCard = document.createElement('article');
        goalCard.className = 'wf-goal-card';
        goalCard.append(
            createText('strong', goal.goal),
            createText('p', `Guiding question: ${goal.guidedQuestion}`, 'wf-guided-question'),
            chip(goal.skillTag, 'neutral')
        );
        goalsSection.append(goalCard);
    });
    children.push(goalsSection);

    const mentions = feedbackRun.result.courseMaterialMentions ?? [];
    if (mentions.length) {
        const materialsSection = document.createElement('section');
        materialsSection.className = 'wf-feedback-section';
        materialsSection.append(createText('h3', 'Useful course materials to revisit'));
        const materialList = document.createElement('ul');
        materialList.className = 'wf-strength-list';
        mentions.forEach((mention) => materialList.append(createText('li', mention.label)));
        materialsSection.append(materialList);
        children.push(materialsSection);
    }

    const reviewSection = document.createElement('section');
    reviewSection.className = 'wf-feedback-section';
    reviewSection.append(createText('h3', 'Student-facing feedback'));
    // Start from the newest staff revision when present; otherwise derive an
    // editable draft from model goals without treating that draft as approved.
    const studentFeedback = textAreaControl(
        revision?.studentFeedback
            ?? feedbackRun.result.revisionGoals.map((goal) => `${goal.goal}\n${goal.guidedQuestion}`).join('\n\n'),
        8
    );
    studentFeedback.id = 'wf-student-feedback';
    const internalNote = textAreaControl(revision?.internalNote ?? '', 3);
    internalNote.id = 'wf-internal-note';
    reviewSection.append(
        field(
            'Feedback the student will receive',
            studentFeedback,
            'Guide revision without supplying rewritten sentences or a model answer.'
        ),
        field(
            'Internal staff note',
            internalNote,
            'Visible only to instructors and TAs; excluded from the student PDF.'
        )
    );
    [studentFeedback, internalNote].forEach((control) => control.addEventListener('input', markDirty));
    children.push(reviewSection);

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
                createText('h4', 'Student-facing feedback'),
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

    // Internal flags stay in the staff workspace only. The PDF service and
    // release payload intentionally exclude this section.
    if (feedbackRun.result.internalFlags.length) {
        const flags = document.createElement('section');
        flags.className = 'wf-feedback-section wf-internal-note';
        flags.append(
            createText('h3', 'Internal review flags'),
            createText('p', feedbackRun.result.internalFlags.join(', '))
        );
        children.push(flags);
    }

    const releaseSection = document.createElement('section');
    releaseSection.className = 'wf-feedback-section';
    releaseSection.append(renderReleaseCard(submission, assignment, detail.release));
    children.push(releaseSection);

    return {
        children,
        studentFeedback,
        internalNote,
        readFinalAssessment: gradingEditor?.readAssessment ?? (() => undefined)
    };
}

function renderReleaseCard(
    submission: Submission,
    assignment: Assignment | null,
    priorRelease: SubmissionDetail['release']
): HTMLElement {
    const card = document.createElement('section');
    card.className = 'wf-release-card';
    const workspace = state.workspace!;

    const isDemo = workspace.canvas.mode === 'demo';
    const finalAssessment = latestReview(submission)?.finalAssessment;
    const hasFinalAssessment = Boolean(finalAssessment);
    if (priorRelease?.status === 'released' || priorRelease?.status === 'reconciled' || submission.status === 'released') {
        card.append(
            createText('h3', 'Released to Canvas'),
            createText(
                'p',
                priorRelease?.postManually
                    ? 'The feedback files and grade reached Canvas and remain hidden until the assignment is posted.'
                    : 'The feedback files and grade were confirmed in Canvas.'
            )
        );
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
    const releaseReady = submission.status === 'approved' && hasFinalAssessment && workspace.canvas.canImport;
    card.append(
        createText('h3', isDemo ? 'Canvas release simulation' : 'Release to Canvas'),
        createText(
            'p',
            isDemo
                ? 'Local demo mode creates a release record but never contacts Canvas or a real student.'
                : 'Preview first, then send the approved writing PDF, separate technical PDF when present, and staff-final grade to this exact Canvas attempt.'
        )
    );
    const releaseState = document.createElement('div');
    releaseState.className = 'wf-release-state';
    releaseState.setAttribute('role', 'status');
    releaseState.setAttribute('aria-live', 'polite');
    if (!hasFinalAssessment) releaseState.textContent = 'Release is blocked until a complete staff-final rubric grade is saved.';
    else if (!workspace.canvas.canImport) releaseState.textContent = workspace.canvas.message;
    else if (submission.status !== 'approved') releaseState.textContent = 'Approve the staff-reviewed feedback before release.';
    else if (priorRelease?.status === 'failed') releaseState.textContent = priorRelease.sanitizedError || 'The prior Canvas release failed safely and may be retried.';
    else if (priorRelease?.status === 'feedback_attached') releaseState.textContent = 'Feedback is attached; the Canvas grade still needs confirmation.';
    else if (priorRelease?.status === 'grade_queued') releaseState.textContent = 'Canvas accepted the grade job; check its completion before retrying.';
    else releaseState.textContent = 'Ready for a dry-run preview.';

    const buttons = document.createElement('div');
    buttons.className = 'wf-button-row';
    buttons.append(
        createButton('Preview release', 'secondary', async () => {
            // Preview is a server-side dry run; the UI states explicitly that this
            // path must not create a Canvas comment, grade, rubric rating, or file.
            const preview = await jsonRequest<{ grade?: number; postManually?: boolean }>(
                `/submissions/${encodeURIComponent(submission.id)}/release-preview`,
                'POST'
            );
            releaseState.textContent = preview.grade === undefined
                ? 'Preview created. Release remains blocked until a staff-final grade is saved.'
                : `Preview created with grade ${preview.grade}. No Canvas write occurred. ${preview.postManually
                    ? 'Canvas will keep the result hidden until the assignment is posted.'
                    : 'Canvas will show the result to the student immediately after release.'}`;
            showSuccessToast('Release preview created. Nothing was sent to Canvas.');
        }, !workspace.canvas.canImport),
        createButton(isDemo ? 'Simulate release' : 'Release to Canvas', 'primary', async () => {
            // External delivery (or its visibly synthetic demo equivalent) always
            // requires a second, submission-specific confirmation.
            const confirmation = await showConfirmModal(
                isDemo ? 'Simulate this Canvas release?' : 'Release approved feedback to Canvas?',
                `${submission.studentLabel || 'This student'} · ${assignment?.title || 'Writing assignment'}\n\nThe approved PDF and numeric grade will be included.`,
                isDemo ? 'Simulate release' : 'Release to Canvas',
                'Cancel'
            );
            const expectedAction = isDemo ? 'simulate-release' : 'release-to-canvas';
            if (confirmation.action !== expectedAction) return;
            const released = await jsonRequest<{
                status: string;
                postManually?: boolean;
                sanitizedError?: string;
            }>(
                `/submissions/${encodeURIComponent(submission.id)}/release`,
                'POST'
            );
            if (released.status !== 'released' && released.status !== 'reconciled') {
                releaseState.textContent = released.status === 'reconciliation_required'
                    ? 'Canvas returned an uncertain result. Do not retry; reconcile the Canvas submission first.'
                    : released.sanitizedError || 'Canvas did not confirm the complete release.';
                showErrorToast(releaseState.textContent);
                return;
            }
            showSuccessToast(isDemo
                ? 'Demo release completed without contacting Canvas.'
                : released.postManually
                    ? 'Feedback and grade reached Canvas and remain hidden until the assignment is posted.'
                    : 'Feedback and grade were released to the student in Canvas.');
            await refreshReview(submission.id);
        }, !releaseReady)
    );
    card.append(releaseState, buttons);
    return card;
}
