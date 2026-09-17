// public/scripts/feature/writing-feedback-review.ts
/**
 * Writing Feedback Review — staff review and release workspace
 *
 * Left: the submission as a single readable annotated document (verification
 * textarea only while staff confirmation is pending). Right: a sticky Feedback
 * panel in three steps (D-124): Annotations (text-anchored, editable comments with
 * function/level filters), then Summary (editable strengths, criterion feedback with a
 * final grade on each card, and goals), then Review and release (grade summary, rubric
 * grid, PDFs, internal note, history, approve, release). Next redrafts the summary from
 * changed annotations (D-125). Approval and release stay separate actions; nothing
 * reaches a student without explicit staff approval.
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
    autoGrow,
    CanvasAccountMismatchError,
    CriterionFeedback,
    FeedbackRun,
    FUNCTION_TAG_LABELS,
    ReviewRevision,
    RubricDefinition,
    StaffAssessmentDraft,
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
    queryState,
    refreshIcons,
    request,
    scrollingAncestor,
    setQueryState,
    returnToLanding,
    runButtonAction,
    setView,
    state,
    textAreaControl,
    views
} from './writing-feedback-shared.js';
import { getWorkingComments, initAnchorWorkingSet, renderAnnotations } from './writing-feedback-anchors.js';
import { connectUrlReturningTo } from './writing-feedback-canvas-connect.js';
import { renderReplacementNotice } from './writing-feedback-replacement.js';
import { GradeEntry } from './writing-feedback-grade-entry.js';
import { describeApprovalBlocker, type GradeProgress } from './writing-feedback-grade-progress.js';
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

function hasSuggestedGrading(rubric: RubricDefinition | undefined): rubric is RubricDefinition {
    return Boolean(rubric?.criteria.length
        && rubric.criteria.every((criterion) => criterion.points !== undefined && criterion.points > 0));
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
    /** Valid grades entered so far, carried across a summary redraft. */
    grades?: StaffAssessmentDraft;
    /** Connect link offered after Canvas refused the connected account as someone else's. */
    canvasReconnectUrl?: string;
}

let pendingReviewState: PendingReviewState | null = null;

/**
 * savedGrades - the grades the criterion cards start from.
 *
 * Unsaved grades carried across a redraft come first, then the latest revision's complete
 * grade, then its partial one. Grades saved against another rubric version are dropped, since
 * their criteria and maximums may no longer match.
 *
 * @param rubric - Rubric version the cards grade against
 * @param preserved - State carried across the last re-render
 * @param latest - Newest saved staff revision
 * @returns Grades to seed, or undefined
 */
function savedGrades(
    rubric: RubricDefinition,
    preserved: PendingReviewState | null,
    latest: ReviewRevision | undefined
): StaffAssessmentDraft | undefined {
    const candidates: Array<StaffAssessmentDraft | undefined> = [preserved?.grades, latest?.finalAssessment, latest?.assessmentDraft];
    return candidates.find((grades) => grades?.rubricVersion === rubric.version);
}

/** Query marker on the Canvas authorization return address that reopens the Review and release step. */
const RELEASE_RETURN_PARAM = 'wfReviewStep';

/**
 * The review page staff are on, as the same-site path Canvas authorization should return to.
 *
 * Carries {@link RELEASE_RETURN_PARAM} so the review reopens on step 3: staff connected Canvas
 * in order to release, and would otherwise land back on the annotations step.
 */
function releaseReturnPath(): string {
    const url = new URL(window.location.href);
    url.searchParams.set(RELEASE_RETURN_PARAM, 'review');
    return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Removes the release-return marker from the address bar and reports whether it was there.
 *
 * Removed before the review renders so a refresh or a copied link opens on the usual first step.
 */
function consumeReleaseReturn(): boolean {
    const url = new URL(window.location.href);
    if (url.searchParams.get(RELEASE_RETURN_PARAM) !== 'review') return false;
    url.searchParams.delete(RELEASE_RETURN_PARAM);
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    return true;
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
    const returningToRelease = consumeReleaseReturn();
    setQueryState({ wfSubmission: submissionId, wfView: null }, 'push');
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
        if (returningToRelease) pendingReviewState = { submissionId, step: 'review' };
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

/**
 * followReviewGeneration - refreshes an open review page once its submission leaves `generating`.
 *
 * Stops quietly when staff have moved to another submission or view. A batch can keep a
 * submission queued for a long time, so this waits without the single-submission deadline.
 *
 * @param submissionId - Submission shown on the page
 */
async function followReviewGeneration(submissionId: string): Promise<void> {
    // Reopening the same submission renders the panel again; one follower is enough.
    if (followedGenerationId === submissionId) return;
    followedGenerationId = submissionId;
    const stillShown = (): boolean => queryState('wfSubmission') === submissionId
        && !element<HTMLDivElement>('wf-view-review').hidden;
    try {
        await waitUntilGenerated(submissionId, stillShown);
    } finally {
        followedGenerationId = null;
    }
}

/** Submission whose generation the review page is currently waiting on. */
let followedGenerationId: string | null = null;

async function waitUntilGenerated(submissionId: string, stillShown: () => boolean): Promise<void> {
    while (true) {
        await delay(5000);
        if (!stillShown()) return;
        let detail: SubmissionDetail;
        try {
            detail = await request<SubmissionDetail>(`/submissions/${encodeURIComponent(submissionId)}`);
        } catch {
            continue;
        }
        if (detail.submission.status === 'generating') continue;
        if (stillShown()) {
            followedGenerationId = null;
            await refreshReview(submissionId);
        }
        return;
    }
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
        await returnToLanding();
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

    // First thing below the header: a newer attempt changes whether any work here is worth doing.
    if (submission.pendingReplacement) {
        const notice = renderReplacementNotice(submission, {
            beforeUseNewer: () => confirmDiscardDirty('review'),
            onResolved: async (decision, active) => {
                if (decision === 'keep_current') {
                    // Nothing on this page changed, so unsaved edits stay where they are.
                    notice.remove();
                    return;
                }
                state.reviewDirty = false;
                await openReview(active.id);
            }
        });
        notice.classList.add('wf-replacement-notice--page');
        root.append(notice);
    }

    // A run is reviewable only against the rubric version that produced it.
    // Version drift blocks annotation display, approval, and release until regeneration --
    // except for released feedback. It was approved and sent against its own rubric version,
    // which rubricForRun still finds in the history, so a newer approved rubric leaves it
    // readable rather than hiding it behind "Regenerate".
    const released = submission.status === 'released';
    // Nothing here can be acted on while generation replaces the draft, so no regenerate warnings.
    const generating = submission.status === 'generating';
    const staleRubric = !released && !generating
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
    const technicalStale = !released && !generating && Boolean(
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
        renderDocPane(submission, feedbackRun !== null && !staleRubric && !generating),
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

    // Batch generation confirmed this text without a person reading it, so say so before anyone
    // relies on feedback quoted from it.
    if (submission.transcriptConfirmedBy === 'batch') {
        const unchecked = createText(
            'div',
            'Transcript not checked by staff. Batch generation confirmed this text automatically from the student\'s file. Compare it with the file in Canvas before approving.',
            'wf-workspace-message'
        );
        unchecked.dataset.tone = 'warning';
        pane.append(unchecked);
    }

    const verifiedText = submission.verifiedText ?? submission.originalText;
    // Confirming a transcript trims its surrounding whitespace, which is not a correction worth showing.
    if (submission.verifiedText !== undefined && submission.verifiedText.trim() !== submission.originalText.trim()) {
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

    // Queued or running generation replaces whatever draft is here, so nothing is editable yet.
    if (submission.status === 'generating') {
        const body = document.createElement('div');
        body.className = 'wf-panel-body';
        const card = document.createElement('div');
        card.setAttribute('role', 'status');
        card.append(
            createText('h4', 'Generating feedback'),
            createText('p', 'This submission is queued or being generated. This page will refresh when its draft is ready. Other submissions can be reviewed in the meantime.', 'wf-muted-note')
        );
        body.append(card);
        panel.append(body);
        void followReviewGeneration(submission.id);
        return panel;
    }

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
    // Assigned once the footer exists: every edit re-states what staff can do next.
    let refreshActions: () => void = () => undefined;
    const markDirty = () => {
        state.reviewDirty = true;
        refreshActions();
    };
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
    const backButton = stepButton('← Back', async () => setStep(step === 'review' ? 'summary' : 'annotations'));
    const nextButton = stepButton('Next →', async () => (step === 'annotations' ? goNext() : setStep('review')));
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

    // Summary step: grading progress, lens tabs, then one panel per lens.
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

    // Review step: approval state, the grade summary, checks, the internal note and history.
    const reviewBody = document.createElement('div');
    reviewBody.className = 'wf-panel-body';
    reviewBody.id = 'wf-step-panel-review';

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
    let gradeEntry: GradeEntry | null = null;
    let gradeEntryLens: WritingFeedbackLens | null = null;
    for (const lens of lenses) {
        const run = lensRuns[lens]!;
        const lensSummary = renderSummaryLens({ assignment, lens, run, editor, markDirty, latest, preserved });
        lensPanels.set(lens, lensSummary.element);
        baselines.set(lens, lensSummary.baseline);
        evidenceRefreshers.push(lensSummary.refreshEvidence);
        if (lensSummary.studentFeedback) studentFeedback = lensSummary.studentFeedback;
        if (lensSummary.gradeEntry) {
            gradeEntry = lensSummary.gradeEntry;
            gradeEntryLens = lens;
        }
        summaryBody.append(lensSummary.element);
    }
    const grading = gradeEntry;
    const gradingLens = gradeEntryLens;

    const shared = renderSummaryShared(detail, markDirty, preserved?.internalNote);
    const isReleased = submission.status === 'released'
        || detail.release?.status === 'released'
        || detail.release?.status === 'reconciled';
    const needsReconciliation = !isReleased && detail.release?.status === 'reconciliation_required';
    const isDemo = state.workspace?.canvas.mode === 'demo';

    const reviewNotice = document.createElement('div');
    reviewNotice.className = 'wf-callout';
    const notice = reviewStatusNotice(submission, detail);
    reviewNotice.hidden = !notice;
    if (notice) reviewNotice.append(createText('strong', notice.title), createText('span', notice.body));

    // Release uses each staff member's own Canvas authorization. When that is what is missing,
    // it is offered here, returning to this step, rather than only inside the import panel.
    const canvasStatus = state.workspace?.canvas;
    // After a refused release the connection still exists, so the link comes from that refusal.
    const reconnectUrl = !isReleased ? preserved?.canvasReconnectUrl : undefined;
    const connectUrl = reconnectUrl
        ?? (!isReleased && canvasStatus && !canvasStatus.canImport ? canvasStatus.connectUrl : undefined);
    const connectCallout = document.createElement('div');
    connectCallout.className = 'wf-callout wf-callout--warning';
    connectCallout.hidden = !connectUrl;
    if (connectUrl) {
        const connectRow = document.createElement('div');
        connectRow.className = 'wf-button-row';
        connectRow.append(createButton('Connect Canvas', 'primary', async () => {
            // Connecting leaves the page, so unsaved edits get the usual warning first.
            if (!(await confirmDiscardDirty('review'))) return;
            state.reviewDirty = false;
            window.location.assign(connectUrlReturningTo(connectUrl, releaseReturnPath()));
        }));
        connectCallout.append(
            createText('strong', reconnectUrl
                ? 'The connected Canvas account is not yours. Sign out of Canvas, then connect your own account to release student feedback and grades:'
                : 'Connect your Canvas account to be able to release student feedback and grades:'),
            // createText('span', 'Release uses your own Canvas account. Connect it once and you will come straight back to this step.'),
            connectRow
        );
    }

    const gradeSection = document.createElement('section');
    gradeSection.className = 'wf-feedback-section';
    const gradeHeaderChip = document.createElement('span');
    const gradeList = document.createElement('ul');
    gradeList.className = 'wf-grade-summary';
    const gradeTotal = createText('p', '', 'wf-grade-summary__total');
    if (grading) {
        const gradeHeader = document.createElement('div');
        gradeHeader.className = 'wf-grade-summary__header';
        gradeHeader.append(createText('h3', 'Final grade'), gradeHeaderChip);
        gradeSection.append(gradeHeader, gradeList, gradeTotal);
    } else {
        gradeSection.append(
            createText('h3', 'Final grade'),
            createText('p', 'This rubric does not have points on every criterion, so there is no grade to enter or send to Canvas.', 'wf-muted-note')
        );
    }

    const checks = document.createElement('div');
    checks.className = 'wf-button-row wf-review-checks';
    if (grading) {
        checks.append(createButton('Open full rubric grid', 'outline', async () => {
            await showGridModal('Rubric grading', grading.gridTable());
        }, false, 'grid'));
    }
    checks.append(renderDownloadMenu(submission));
    // The connect prompt comes last, directly above the footer's disabled Release button it unblocks.
    reviewBody.append(reviewNotice, gradeSection, checks, ...shared.children, connectCallout);

    panel.append(annotationsBody, summaryBody, reviewBody);

    // One footer for steps 2 and 3. Saving snapshots the summary, the annotation working set and
    // the grades as an append-only staff revision; editing never overwrites model provenance.
    // Approve and release appear only on step 3, so nothing is approved from a view that never
    // showed the grade summary.
    const footer = document.createElement('div');
    footer.className = 'wf-panel-footer';
    const footerState = createText('p', '', 'wf-panel-footer__state');
    footerState.setAttribute('role', 'status');
    footerState.setAttribute('aria-live', 'polite');
    // Plain buttons for the step bar's reason: whether they are enabled is refreshActions' decision.
    const actionButton = (label: string, variant: 'primary' | 'secondary', action: () => Promise<void>): HTMLButtonElement => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `wf-button wf-button--${variant}`;
        button.textContent = label;
        button.addEventListener('click', () => {
            void runButtonAction(button, action).then(() => {
                if (button.isConnected) refreshActions();
            });
        });
        return button;
    };
    const saveButton = actionButton('Save draft', 'secondary', saveDraft);
    const approveButton = actionButton('Approve', 'primary', approve);
    const releaseButton = actionButton(isDemo ? 'Simulate release' : 'Release to Canvas', 'primary', releaseToCanvas);
    approveButton.classList.add('wf-panel-footer__primary');
    releaseButton.classList.add('wf-panel-footer__primary');
    const footerActions = document.createElement('div');
    footerActions.className = 'wf-panel-footer__actions';
    footerActions.append(saveButton, approveButton, releaseButton);
    footer.append(footerState, footerActions);
    panel.append(footer);

    let releaseInFlight = '';
    let releaseError = '';

    refreshActions = () => {
        const progress = grading?.progress();

        // Step 1: the Review step's grade summary.
        if (grading && progress) renderGradeSummary(grading, progress);

        // Step 2: which footer buttons this step and status allow.
        const onReview = step === 'review';
        saveButton.hidden = isReleased;
        approveButton.hidden = !onReview || isReleased || needsReconciliation || submission.status === 'approved';
        releaseButton.hidden = !onReview || isReleased || needsReconciliation || submission.status !== 'approved';

        // Step 3: the sentence saying what can happen next, and whether the primary action is enabled.
        let message = '';
        if (isReleased) {
            message = 'Released feedback cannot be edited. To send a correction, add or import a new attempt for this student and review it.';
        } else if (needsReconciliation) {
            message = 'Check this student’s submission and grade in Canvas before any retry; automatic retry is disabled to prevent duplicate feedback.';
        } else if (!onReview) {
            if (state.reviewDirty) {
                message = submission.status === 'approved'
                    ? 'You have unsaved changes. Saving them withdraws approval.'
                    : 'You have unsaved changes.';
            }
        } else if (submission.status === 'approved') {
            const readiness = releaseReadiness(submission, detail);
            releaseButton.disabled = Boolean(releaseInFlight) || state.reviewDirty || Boolean(reconnectUrl) || !readiness.ready;
            message = releaseInFlight
                || (state.reviewDirty
                    ? 'You have unsaved changes. Saving them withdraws approval, so approve again before releasing.'
                    : reconnectUrl
                        ? 'Connect your own Canvas account to release this feedback.'
                        : releaseError || readiness.message);
        } else {
            const blocker = approvalBlocker();
            approveButton.disabled = submission.status !== 'draft_ready' || Boolean(blocker);
            message = submission.status !== 'draft_ready'
                ? 'Approval is available once the feedback draft is ready.'
                : blocker ?? (state.reviewDirty
                    ? 'Approve saves your unsaved changes first. Nothing is sent to Canvas until you release.'
                    : 'Approval does not send anything to Canvas.');
        }
        footerState.textContent = message;
        footerState.hidden = !message;
    };

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
        reviewBody.hidden = step !== 'review';
        footer.hidden = step === 'annotations';
        if (step === 'summary') evidenceRefreshers.forEach((refresh) => refresh());
        selectLens(activeLens);
        refreshActions();
    }

    /** Why Approve is unavailable, or nothing when grading does not stand in the way. */
    function approvalBlocker(): string | undefined {
        return staffCriteriaBlocker() ?? (grading ? describeApprovalBlocker(grading.progress()) : undefined);
    }

    /**
     * staffCriteriaBlocker - why Approve is unavailable while staff feedback is unwritten.
     *
     * The server refuses the same case. Naming it here keeps staff from reaching Approve
     * only to be turned back, and names the criteria rather than the rule.
     *
     * @returns The sentence, or `undefined` when every staff-assessed criterion is written
     */
    function staffCriteriaBlocker(): string | undefined {
        const blank: string[] = [];
        lenses.forEach((lens) => {
            const run = lensRuns[lens];
            if (!run) return;
            const written = editor.writtenCriteria(lens);
            (rubricForRun(assignment, run, lens)?.criteria ?? [])
                .filter((criterion) => criterion.assessedBy === 'staff' && !written.has(criterion.id))
                .forEach((criterion) => blank.push(criterion.label));
        });
        if (!blank.length) return undefined;
        return blank.length <= 3
            ? `Write the feedback for ${blank.join(', ')} in Step 2 to approve.`
            : `Write the feedback for the ${blank.length} criteria the teaching team assesses in Step 2 to approve.`;
    }

    /** Opens the Summary step on one criterion's grade, switching to the graded lens if needed. */
    function goToCriterion(criterionId: string): void {
        if (step !== 'summary') setStep('summary');
        if (gradingLens && activeLens !== gradingLens) selectLens(gradingLens);
        // The summary body may have been hidden until now; let it lay out before scrolling to the card.
        requestAnimationFrame(() => grading?.focus(criterionId));
    }

    /** Rebuilds the Review step's per-criterion rows from what the grade controls hold. */
    function renderGradeSummary(entry: GradeEntry, progress: GradeProgress): void {
        gradeHeaderChip.replaceChildren(chip(`${progress.graded.length} of ${progress.total} graded`, progress.complete ? 'green' : 'amber'));
        gradeList.replaceChildren(...entry.criteria.map((criterion) => {
            const points = entry.points(criterion.id);
            const row = document.createElement('li');
            row.className = 'wf-grade-summary__row';
            const status = points === undefined
                ? chip('Not graded', 'amber')
                : points === null
                    ? chip('Check points', 'red')
                    : chip(entry.earnedLevelLabel(criterion.id) ?? 'Graded', 'green');
            row.append(
                createText('span', criterion.label),
                status,
                createText('span', `${typeof points === 'number' ? points : '—'} / ${criterion.max}`, 'wf-grade-summary__points')
            );
            if (!isReleased) {
                const verb = points === undefined ? 'Grade' : 'Edit';
                const edit = document.createElement('button');
                edit.type = 'button';
                edit.className = 'wf-button wf-button--quiet';
                edit.textContent = verb;
                edit.setAttribute('aria-label', `${verb} ${criterion.label}`);
                edit.addEventListener('click', () => goToCriterion(criterion.id));
                row.append(edit);
            }
            return row;
        }));
        gradeTotal.textContent = progress.complete
            ? `Total ${progress.points} / ${progress.maxPoints}`
            : `${progress.points} / ${progress.maxPoints} so far`;
    }

    /** Appends one staff revision with everything on screen: summary edits, annotations, note and grades. */
    async function saveRevision(): Promise<void> {
        const grades = grading?.read() ?? {};
        await jsonRequest(`/submissions/${encodeURIComponent(submission.id)}/reviews`, 'POST', {
            feedbackRunId: feedbackRun!.id,
            ...(detail.technicalFeedbackRun ? { technicalFeedbackRunId: detail.technicalFeedbackRun.id } : {}),
            studentFeedback: studentFeedback?.value ?? '',
            internalNote: shared.internalNote.value,
            comments: getWorkingComments(),
            ...(grades.complete ? { finalAssessment: grades.complete } : {}),
            ...(grades.draft ? { assessmentDraft: grades.draft } : {}),
            summaryEdits: lenses.map((lens) => editor.readEdit(lens, lensRuns[lens]!.id))
        });
        state.reviewDirty = false;
    }

    async function saveDraft(): Promise<void> {
        // The server returns an approved submission to draft on any save, so say so before it happens.
        if (submission.status === 'approved') {
            const confirmation = await showConfirmModal(
                'Save changes and withdraw approval?',
                'This feedback is approved. Saving your changes returns it to draft, so it must be approved again before it can be released.',
                'Save and withdraw approval',
                'Keep reviewing'
            );
            if (confirmation.action !== 'save-and-withdraw-approval') return;
        }
        await saveRevision();
        showSuccessToast(submission.status === 'approved'
            ? 'Changes saved. Approve the feedback again before releasing it.'
            : 'Draft saved.');
        pendingReviewState = { submissionId: submission.id, step };
        await refreshReview(submission.id);
    }

    async function approve(): Promise<void> {
        const blocker = approvalBlocker();
        if (blocker) throw new Error(blocker);
        // No confirmation: approval writes nothing to Canvas and can be withdrawn by saving again.
        // Release, the external step, keeps its own confirmation.
        // Approval covers what is on screen, so unsaved edits are saved first rather than discarded.
        const savedFirst = state.reviewDirty;
        if (savedFirst) await saveRevision();
        try {
            await jsonRequest(`/submissions/${encodeURIComponent(submission.id)}/approve`, 'POST');
        } catch (error) {
            // The save went through, so reload before reporting: the page must show what the server holds.
            if (savedFirst) {
                pendingReviewState = { submissionId: submission.id, step: 'review' };
                await refreshReview(submission.id);
            }
            throw error;
        }
        showSuccessToast('Feedback approved. Release it to Canvas when you are ready.');
        pendingReviewState = { submissionId: submission.id, step: 'review' };
        await refreshReview(submission.id);
    }

    async function releaseToCanvas(): Promise<void> {
        if (state.reviewDirty || !releaseReadiness(submission, detail).ready) return;
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
        releaseError = '';
        // The server queues the release and returns immediately; the write itself happens in
        // the worker, so this waits on the record rather than on one long request.
        try {
            await jsonRequest<{ status: string; jobId: string }>(
                `/submissions/${encodeURIComponent(submission.id)}/release`,
                'POST'
            );
        } catch (error) {
            // Canvas refused the connected account as someone else's: reopen this step offering to
            // connect again, then report the refusal.
            if (error instanceof CanvasAccountMismatchError) {
                pendingReviewState = { submissionId: submission.id, step: 'review', canvasReconnectUrl: error.connectUrl };
                await refreshReview(submission.id);
            }
            throw error;
        }
        releaseInFlight = isDemo ? 'Simulating the release…' : 'Sending the feedback files and grade to Canvas…';
        refreshActions();
        let released: ReleaseStatus;
        try {
            released = await waitForRelease(submission.id);
        } catch (error) {
            releaseError = error instanceof Error ? error.message : 'Canvas did not confirm the complete release.';
            showErrorToast(releaseError);
            return;
        } finally {
            releaseInFlight = '';
        }
        showSuccessToast(isDemo
            ? 'Demo release completed without contacting Canvas.'
            : released.release?.postManually
                ? 'Feedback and grade reached Canvas and remain hidden until the assignment is posted.'
                : 'Feedback and grade were released to the student in Canvas.');
        pendingReviewState = { submissionId: submission.id, step: 'review' };
        await refreshReview(submission.id);
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
                'You changed annotations after editing the summary. Redrafting replaces your edits to What the student did well, Feedback by rubric criterion, and Priority revision goals. Your internal note and final grades are kept.',
                'Redraft summary',
                'Keep my summary'
            );
            if (confirmation.action !== 'redraft-summary') return setStep('summary');
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
            // A half-typed grade cannot survive the redraft; every valid one does.
            grades: grading?.readValid()
        };
        state.reviewDirty = false;
        await refreshReview(submission.id);
    }

    // Grades carried across a redraft are on screen but not saved, so the page must say so.
    if (preserved?.grades) state.reviewDirty = true;

    // Defer the first render until the document and feedback hosts share the DOM;
    // selection geometry and focus-linked markers depend on both being connected.
    queueMicrotask(() => setStep(step));
    return panel;
}

/**
 * renderDownloadMenu - the feedback PDF preview button shown on the Review and release step.
 *
 * @param submission - Submission whose PDF is opened
 * @returns Detached button group
 */
function renderDownloadMenu(submission: Submission): HTMLElement {
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
        button.className = 'wf-button wf-button--outline';
        // Same icon-then-label markup createButton uses, so the two buttons line up.
        const icon = document.createElement('i');
        icon.setAttribute('data-feather', 'file-text');
        icon.setAttribute('aria-hidden', 'true');
        button.append(icon, createText('span', label, 'wf-button-text'));
        button.title = title;
        button.addEventListener('click', () => { void openPdf(label, query); });
        return button;
    };

    // `include=both` renders exactly the document a release attaches: for a lab report the
    // technical feedback, then the writing summary and the annotated text. The route's other
    // modes stay available but are not offered here.
    downloadMenu.append(
        viewerButton('Preview feedback PDF', 'Open the feedback PDF the student will receive', '?include=both')
    );
    return downloadMenu;
}

/** One lens's summary controls, as composed into the Summary step. */
interface LensSummary {
    element: HTMLElement;
    baseline: SummaryBaseline;
    studentFeedback?: HTMLTextAreaElement;
    /** Final grade controls on this lens's criterion cards; only the graded lens has them. */
    gradeEntry: GradeEntry | null;
    /** Re-reads the working annotations into each criterion's evidence (called on entering step 2). */
    refreshEvidence: () => void;
}

/**
 * renderSummaryLens - one lens's editable summary (D-126, D-127).
 *
 * Strengths, criterion cards (each carrying its final grade on the lens the assignment is graded
 * on) with evidence from the final annotations, readings (writing lens), internal flags, and
 * revision goals.
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

    // Step 1: What the student did well.
    element.append(editor.strengthsSection(lens, edit?.strengths ?? run.result.strengths));

    // Step 2: grade controls, on the lens the assignment is graded on — technical for a lab report.
    const gradedLens: WritingFeedbackLens = assignment?.isLabReport ? 'technical' : 'linguistic';
    const gradeEntry = lens === gradedLens && hasSuggestedGrading(rubric)
        ? new GradeEntry(rubric, run, savedGrades(rubric, preserved, latest), markDirty)
        : null;

    // Step 3: criterion feedback, each card carrying its grade. Evidence comes from this lens's
    // final annotations and is re-read every time the Summary step opens, because staff edit
    // annotations on step 1.
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
    if (assignment?.isLabReport && lens !== gradedLens) {
        rubricSection.append(createText('p', 'Not graded. This lab report is graded on the Technical rubric.', 'wf-muted-note'));
    }
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
        const headerChips = document.createElement('div');
        headerChips.className = 'wf-criterion-header__chips';
        // Stays visible once the box is filled, and says why this card has no model feedback or evidence.
        const staffAssessed = definition?.assessedBy === 'staff';
        if (staffAssessed) headerChips.append(chip('Written by staff', 'neutral'));
        // A graded card states whether it has a grade; the suggested level is marked on its buttons instead.
        const gradeControl = gradeEntry?.control(criterionId) ?? null;
        if (gradeEntry && gradeControl) headerChips.append(gradeEntry.statusChip(criterionId));
        // No chip without a level: a criterion course staff assess on an ungraded lens has none.
        else if (criterion?.suggestedLevel !== undefined) {
            headerChips.append(chip(levelLabel(rubric, criterion.criterion, criterion.suggestedLevel), 'neutral'));
        }
        criterionHeader.append(heading, headerChips);
        item.append(criterionHeader);
        const sflLabel = definition?.sflDimension
            ?? (definition?.functionTag ? `${FUNCTION_TAG_LABELS[definition.functionTag]} function` : undefined);
        if (sflLabel) item.append(createText('p', sflLabel, 'wf-sfl-label'));
        if (gradeControl) item.append(gradeControl);
        // A staff-assessed criterion is never generated, so the run carries no row for it.
        // The card is the same card; only the seed text and the note above it differ.
        if (staffAssessed) {
            const staffText = edit?.criterionExplanations.find((entry) => entry.criterion === criterionId)?.explanation ?? '';
            // Approval refuses a blank staff-assessed criterion, so mark it like the final grade.
            item.append(editor.explanationField(lens, criterionId, staffText, {
                required: true,
                prompt: 'EngE-AI doesn\'t assess this criterion. Write the feedback for the student here.'
            }));
            criterionList.append(item);
            return;
        }
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

    // Step 4: readings (writing lens), under the levels they qualify.
    if (lens === 'linguistic') element.append(...renderReadings(run));

    // Step 5: revision goals. Writing keeps the student-feedback textarea and its binding rule.
    const goalsSection = document.createElement('section');
    goalsSection.className = 'wf-feedback-section';
    goalsSection.append(createText('h3', 'Priority revision goals'));
    let studentFeedback: HTMLTextAreaElement | undefined;
    if (lens === 'linguistic') {
        // Staff text applies only while it was saved against this run; after a redraft the
        // goals reseed from the redrafted run, the same rule the student PDF follows.
        const seed = latest && latest.feedbackRunId === run.id ? latest.studentFeedback : baseline.goals;
        const goals = editor.goalsField(lens, seed, 'Goals the student will receive');
        goals.textarea.id = 'wf-student-feedback';
        studentFeedback = goals.textarea;
        goalsSection.append(goals.wrapper);
    } else {
        const goals = editor.goalsField(lens, edit?.revisionGoalsText ?? baseline.goals, 'Technical goals the student will receive');
        goalsSection.append(goals.wrapper);
    }
    element.append(goalsSection);

    refreshEvidence();
    return { element, baseline, studentFeedback, gradeEntry, refreshEvidence };
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
 * renderSummaryShared - internal note and review history, shown once per submission on the Review step.
 *
 * @param detail - Submission detail
 * @param markDirty - Marks the review as having unsaved edits
 * @param preservedNote - Unsaved note carried across a redraft re-render
 * @returns Sections to append and the note control the footer saves
 */
function renderSummaryShared(
    detail: SubmissionDetail,
    markDirty: () => void,
    preservedNote?: string
): { children: HTMLElement[]; internalNote: HTMLTextAreaElement } {
    const { submission } = detail;
    const revision = latestReview(submission);
    const children: HTMLElement[] = [];

    const noteSection = document.createElement('section');
    noteSection.className = 'wf-feedback-section';
    // One line until staff write more; it grows with the note rather than reserving space.
    const internalNote = textAreaControl(preservedNote ?? revision?.internalNote ?? '', 1);
    internalNote.id = 'wf-internal-note';
    internalNote.placeholder = 'Visible only to course staff';
    internalNote.addEventListener('input', markDirty);
    autoGrow(internalNote);
    noteSection.append(field('Internal staff note (optional)', internalNote));
    children.push(noteSection);

    if (submission.reviews?.length) {
        // Closed by default: an occasional audit reference, not part of approving and releasing.
        const historySection = document.createElement('details');
        historySection.className = 'wf-feedback-section wf-history-disclosure';
        const historySummary = document.createElement('summary');
        historySummary.textContent = `Review history (${submission.reviews.length})`;
        historySection.append(
            historySummary,
            createText('p', 'Every saved revision is kept here. This is a read-only record — it cannot be restored or reverted.', 'wf-muted-note')
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

            const summary = document.createElement('summary');
            summary.textContent = `Revision ${revisionNumber} · ${formatDate(item.createdAt, true)} · ${staffDisplayName(item.staffUserId)}`;
            entry.append(summary);

            const body = document.createElement('div');
            body.className = 'wf-history-item-body';
            body.append(
                createText('h4', 'Priority revision goals'),
                createText('pre', item.studentFeedback, 'wf-history-text')
            );
            if (item.internalNote) {
                body.append(createText('h4', 'Internal staff note (optional)'), createText('pre', item.internalNote, 'wf-history-text'));
            }
            if (item.finalAssessment) {
                body.append(
                    createText('h4', 'Final rubric assessment'),
                    createText(
                        'p',
                        `${item.finalAssessment.totalPoints} of ${item.finalAssessment.maxPoints} · rubric v${item.finalAssessment.rubricVersion}`
                    )
                );
            } else if (item.assessmentDraft?.criteria.length) {
                body.append(
                    createText('h4', 'Final rubric assessment'),
                    createText('p', `Partly graded: ${item.assessmentDraft.criteria.length} criteria · rubric v${item.assessmentDraft.rubricVersion}`)
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

    return { children, internalNote };
}

/**
 * staffDisplayName - the course roster name for a staff user id.
 *
 * Revisions record only the saver's internal user id. The course's instructor and TA lists
 * carry names for current staff; anyone no longer on them reads as "Course staff".
 *
 * @param userId - `staffUserId` from a review revision
 * @returns Display name, never the raw id
 */
function staffDisplayName(userId: string): string {
    const roster = [...(state.course?.instructors ?? []), ...(state.course?.teachingAssistants ?? [])];
    const match = roster.find((entry) => typeof entry === 'object' && entry.userId === userId);
    return typeof match === 'object' && match.name?.trim() ? match.name.trim() : 'Course staff';
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

/**
 * reviewStatusNotice - the callout at the top of the Review step once feedback has gone to Canvas.
 *
 * @param submission - Submission under review
 * @param detail - Detail payload carrying the latest release record and counts
 * @returns Title and sentence, or null until a release has been attempted
 */
function reviewStatusNotice(submission: Submission, detail: SubmissionDetail): { title: string; body: string } | null {
    const release = detail.release;
    // Feedback reaches Canvas once (D-128). After that the step only reports the release and says
    // a correction means a new attempt; there is no second release of the same attempt.
    if (release?.status === 'released' || release?.status === 'reconciled' || submission.status === 'released') {
        const confirmed = release?.postManually
            ? 'The feedback files and grade reached Canvas and remain hidden until the assignment is posted.'
            : 'The feedback files and grade were confirmed in Canvas.';
        const history = releaseHistoryLine({ released: detail.releaseCount ?? 0, max: detail.maxReleases ?? 0 });
        return {
            title: release?.revision && release.revision > 1 ? `Released to Canvas · revision ${release.revision}` : 'Released to Canvas',
            body: history ? `${confirmed} ${history}` : confirmed
        };
    }
    if (release?.status === 'reconciliation_required') {
        return {
            title: 'Canvas reconciliation required',
            body: 'Canvas returned an uncertain result during release. Check this student’s submission and grade in Canvas before any retry; automatic retry is disabled to prevent duplicate feedback.'
        };
    }
    return null;
}

/**
 * releaseReadiness - whether Release to Canvas can run, and the sentence the footer shows.
 *
 * @param submission - Submission under review
 * @param detail - Detail payload carrying the latest release record and counts
 * @returns Readiness plus the staff-facing reason or description
 */
function releaseReadiness(submission: Submission, detail: SubmissionDetail): { ready: boolean; message: string } {
    const workspace = state.workspace!;
    const isDemo = workspace.canvas.mode === 'demo';
    const priorRelease = detail.release;
    const counts = { released: detail.releaseCount ?? 0, max: detail.maxReleases ?? 0 };
    const hasFinalAssessment = Boolean(latestReview(submission)?.finalAssessment);
    const capReached = counts.max > 0 && counts.released >= counts.max;
    // Release remains unavailable until human approval, a complete numeric
    // mapping, and a usable Canvas adapter are all simultaneously present.
    const ready = submission.status === 'approved' && hasFinalAssessment && workspace.canvas.canImport && !capReached;
    let message: string;
    if (capReached) message = releaseHistoryLine(counts);
    else if (!hasFinalAssessment) message = 'Release is blocked until a complete staff-final rubric grade is saved.';
    else if (!workspace.canvas.canImport) {
        message = workspace.canvas.connectUrl ? 'Connect Canvas to release this feedback.' : workspace.canvas.message;
    }
    else if (submission.status !== 'approved') message = 'Approve the staff-reviewed feedback before release.';
    else if (priorRelease?.releaseLockedAt) message = 'A release is already on its way to Canvas for this submission.';
    else if (priorRelease?.status === 'failed') message = priorRelease.sanitizedError || 'The prior Canvas release failed safely and may be retried.';
    else if (priorRelease?.status === 'feedback_attached') message = 'Feedback is attached; the Canvas grade still needs confirmation.';
    else if (priorRelease?.status === 'grade_queued') message = 'Canvas accepted the grade job; check its completion before retrying.';
    else {
        message = isDemo
            ? 'Local demo mode creates a release record but never contacts Canvas or a real student.'
            : 'Sends the approved feedback PDF and staff-final grade to this Canvas attempt. Feedback can be released only once.';
    }
    return { ready, message };
}
