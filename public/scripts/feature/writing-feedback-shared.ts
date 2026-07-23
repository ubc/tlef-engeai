// public/scripts/feature/writing-feedback-shared.ts
/**
 * Writing Feedback Shared — browser contracts, state, and UI primitives
 *
 * The workspace has three URL-addressable views rendered into sibling containers:
 * landing (assignment cards), rubric (full-page editor), and review (submission
 * detail with general and specific feedback tabs). Sibling modules register their
 * view openers in {@link views} so navigation never creates circular imports.
 *
 * @author: @rdschrs
 * @date: 2026-07-20
 * @version: 1.0.0
 * @description: Defines the frontend domain boundary and reusable navigation, request, and control helpers.
 */

import type { activeCourse } from '../types.js';
import { showConfirmModal, showErrorModal } from '../ui/modal-overlay.js';

/** Lifecycle state displayed in staff queues and enforced by server transitions. */
export type SubmissionStatus = 'imported' | 'verification_needed' | 'generating' | 'draft_ready' | 'approved' | 'released' | 'failed';

/** Fixed A2/SFL criterion identifiers shared by rubric and feedback responses. */
export type A2CriterionId = 'organization' | 'content' | 'interpersonal_positioning' | 'task_constraints';

/** Ordered qualitative levels supported by the Writing Feedback rubric. */
export type A2Level = 'emerging' | 'developing' | 'competent' | 'strong';

/** One instructor-visible criterion in an approved or draft rubric definition. */
export interface RubricCriterion {
    id: A2CriterionId; // stable key used to join rubric criteria to model feedback
    label: string; // student-facing criterion name editable by authorized staff
    description: string; // assignment-specific expectations supplied to generation
    sflDimension: string; // locked linguistic lens enforced by the A2 profile
}

/** One ordinal performance level, optionally participating in numeric release mapping. */
export interface RubricLevel {
    id: A2Level; // stable qualitative value emitted by structured feedback
    label: string; // student-facing name shown in rubric and PDF views
    description: string; // instructor-authored performance expectation
    points?: number; // present for every level or none; partial mappings are invalid
}

/** Versioned rubric snapshot returned by assignment and rubric endpoints. */
export interface RubricDefinition {
    version: number; // immutable version used to detect stale feedback runs
    status: 'draft' | 'approved'; // separates editable work from active generation policy
    title: string; // staff/student display name for the rubric
    task: string; // assignment task context supplied to the feedback pipeline
    audience: string; // intended reader context used to interpret writing choices
    purpose: string; // communicative goal used during evidence-based assessment
    constraints: string[]; // explicit task requirements; never inferred by the model
    learningOutcomes: string[]; // instructor-approved outcomes governing feedback
    gradingIntent: string; // states formative/summative intent and grading boundaries
    criteria: RubricCriterion[]; // fixed supported criteria with editable descriptions
    levels: RubricLevel[]; // complete ordinal scale and optional point mapping
    updatedAt: string; // server timestamp shown in rubric provenance/history
}

/** Assignment summary used by the landing queue and current rubric context. */
export interface Assignment {
    id: string; // internal assignment key used in course-scoped routes
    title: string; // queue and review heading
    canvasAssignmentId?: string; // external key retained only for Canvas-linked intake/release
    rubricSource: 'internal_profile' | 'canvas'; // provenance label; import never implies approval
    gradeMapping?: Partial<Record<A2Level, number>>; // numeric release mapping derived from approved levels
    rubric: RubricDefinition; // current approved definition used by generation
    rubricDraft?: RubricDefinition; // inactive staff draft, when one exists
    dueAt?: string; // optional deadline used only for queue late-status display
    createdAt: string; // assignment creation timestamp for staff context
    submissionCount?: number; // summary count used before submissions are expanded
}

/** Structured model judgment for one supported rubric criterion. */
export interface CriterionFeedback {
    criterion: A2CriterionId; // joins the result to the approved rubric criterion
    suggestedLevel: A2Level; // model draft level requiring human review
    evidence: Array<{ quote: string; rationale: string }>; // exact verified-text quote and the model's rationale for citing it
    explanation: string; // criterion-level formative explanation
    confidence: number; // staff-only diagnostic excluded from student output
}

/** Immutable model-run snapshot displayed as the starting point for staff review. */
export interface FeedbackRun {
    id: string; // provenance key attached to subsequent staff revisions
    rubricVersion?: number; // approved rubric version used to detect stale runs
    createdAt: string; // generation timestamp shown in review provenance
    result: {
        criteria: CriterionFeedback[]; // supported criterion judgments with exact evidence
        strengths: string[]; // positive observations included in student-facing output
        revisionGoals: Array<{ skillTag: string; goal: string; guidedQuestion: string }>; // up to three actionable, Socratic priorities
        internalFlags: string[]; // staff-only warnings excluded from PDF/release payloads
    }; // validated structured result; never edited in place by the browser
}

/** Academic Writing Matrix function used to categorize staff annotations. */
export type WfFunctionTag = 'content' | 'interpersonal' | 'organizational';

/** Textual scope used to categorize staff annotations. */
export type WfLevelTag = 'text' | 'section' | 'clause_word';

/** Staff triage priority used for filtering; not a student grade. */
export type WfPriority = 'high' | 'medium' | 'low';

/** Exact verified-text annotation stored in model seeds and staff revision snapshots. */
export interface AnchoredComment {
    id: string; // stable identity used to diff comments across review revisions
    criterion?: A2CriterionId; // optional rubric link retained from a model seed
    quote: string; // exact substring copied from the verified submission text
    startOffset: number; // inclusive UTF-16 offset into the verified text snapshot
    endOffset: number; // exclusive UTF-16 offset paired with the exact quote
    comment: string; // feedback exposed to the student after approval/release
    howToImprove?: string; // optional concrete revision direction
    courseMaterialLink?: string; // optional staff-selected learning resource
    glossaryDefinition?: { term: string; definition: string }; // optional disciplinary-language support
    origin: 'model_seed' | 'staff'; // provenance label preserved in review history
    /** Staff-facing triage metadata (Academic Writing Matrix taxonomy); excluded from the student PDF. */
    functionTag?: WfFunctionTag;
    levelTag?: WfLevelTag;
    priority?: WfPriority;
    /** Read-time flag from the server: the verified text drifted from this anchor. */
    stale?: boolean;
}

/** Human-readable labels for Academic Writing Matrix function filters. */
export const FUNCTION_TAG_LABELS: Record<WfFunctionTag, string> = {
    content: 'Content',
    interpersonal: 'Interpersonal',
    organizational: 'Organizational'
};

/** Human-readable labels for annotation scope filters. */
export const LEVEL_TAG_LABELS: Record<WfLevelTag, string> = {
    text: 'Text level',
    section: 'Section level',
    clause_word: 'Clause & word'
};

/** Human-readable labels for staff annotation priorities. */
export const PRIORITY_LABELS: Record<WfPriority, string> = {
    high: 'High priority',
    medium: 'Medium priority',
    low: 'Low priority'
};

/** Append-only staff review snapshot returned with a submission. */
export interface ReviewRevision {
    staffUserId: string; // audit identity for the staff member who saved the revision
    studentFeedback: string; // summary text eligible for approved student output
    internalNote?: string; // staff-only note explicitly excluded from student output
    comments?: AnchoredComment[]; // complete annotation snapshot at save time
    createdAt: string; // server timestamp used to order immutable revisions
}

const DIFF_FIELDS: Array<keyof AnchoredComment> = [
    'quote', 'comment', 'howToImprove', 'courseMaterialLink', 'glossaryDefinition',
    'functionTag', 'levelTag', 'priority'
];

function commentsDiffer(a: AnchoredComment, b: AnchoredComment): boolean {
    return DIFF_FIELDS.some((field) => JSON.stringify(a[field]) !== JSON.stringify(b[field]));
}

/**
 * diffReviewComments - compares adjacent annotation snapshots for audit display
 *
 * @param previous - Earlier revision comments, or no comments for the first revision
 * @param current - Later revision comments, or no comments when cleared
 * @returns Added, removed, and edited comments keyed by stable comment id
 */
export function diffReviewComments(
    previous: AnchoredComment[] | undefined,
    current: AnchoredComment[] | undefined
): { added: AnchoredComment[]; removed: AnchoredComment[]; edited: Array<{ before: AnchoredComment; after: AnchoredComment }> } {
    const previousById = new Map((previous ?? []).map((c) => [c.id, c]));
    const currentById = new Map((current ?? []).map((c) => [c.id, c]));

    const added = [...currentById.values()].filter((c) => !previousById.has(c.id));
    const removed = [...previousById.values()].filter((c) => !currentById.has(c.id));
    const edited = [...currentById.values()]
        .filter((c) => previousById.has(c.id) && commentsDiffer(previousById.get(c.id)!, c))
        .map((after) => ({ before: previousById.get(after.id)!, after }));

    return { added, removed, edited };
}

/** Submission summary plus staff-only review history used in queue and review views. */
export interface Submission {
    id: string; // internal submission key used by review/generation/release routes
    assignmentId: string; // parent assignment used to resolve approved rubric context
    studentId: string; // course-local learner reference; never a PUID
    studentLabel?: string; // optional staff-visible display label
    attempt: number; // assignment attempt used for idempotent Canvas import
    sourceType: 'manual' | 'canvas_text' | 'digital_file' | 'paper_scan'; // intake provenance controlling verification
    originalText: string; // parser/OCR output retained for staff comparison
    verifiedText?: string; // staff-confirmed source of truth for evidence offsets
    requiresVerification: boolean; // blocks generation until transcript confirmation
    status: SubmissionStatus; // server lifecycle state controlling available actions
    reviews?: ReviewRevision[]; // append-only staff revision audit history
    createdAt: string; // submission/import timestamp used for queue ordering and lateness
}

/** Complete review payload combining a submission, model run, and annotation sources. */
export interface SubmissionDetail {
    submission: Submission; // current server-authoritative submission and reviews
    feedbackRun: FeedbackRun | null; // latest immutable model result, if generated
    comments: AnchoredComment[]; // newest saved staff comment snapshot
    seedComments: AnchoredComment[]; // model-derived fallback used before the first save
}

/** Canvas integration truth shown before any import or release action is offered. */
export interface CanvasStatus {
    mode: 'demo' | 'not_configured'; // visibly separates synthetic data from unavailable live OAuth
    integration: 'mock_canvas' | 'none'; // adapter identity reported by the backend
    connected: boolean; // whether the current adapter has an active connection
    canImport: boolean; // authoritative UI gate for import/preview operations
    syntheticDataOnly: boolean; // prevents demo data from being described as production Canvas
    label: string; // concise mode heading for staff
    message: string; // durable explanation shown in workspace/import panels
    nextStep?: string; // configuration guidance when import is unavailable
}

/** Assignment candidate returned by the Canvas preview/list adapter. */
export interface CanvasAssignment {
    canvasAssignmentId: string; // external selection key submitted to the import endpoint
    title: string; // Canvas-provided assignment label shown before import
    submissionCount: number; // eligible candidate count shown in the picker
    pointsPossible?: number; // informational Canvas value; never inferred as rubric mapping
    dueAt?: string; // external due date preview
    rubricState: 'canvas_rubric' | 'no_canvas_rubric'; // provenance notice; no silent rubric import
    synthetic: boolean; // marks local demo records as non-production data
}

/** Course-scoped permissions and integration mode loaded before workspace routing. */
export interface WorkspaceContext {
    permissions: { canManageRubric: boolean }; // controls instructor/admin rubric affordances
    canvas: CanvasStatus; // gates and labels Canvas-related actions
}

/** Approved/draft rubric pair and history returned to the rubric page. */
export interface RubricResponse {
    approved: RubricDefinition; // active rubric used by generation and release
    draft?: RubricDefinition; // inactive editable candidate, when present
    history: RubricDefinition[]; // immutable prior versions available for provenance
    permissions: { canEdit: boolean }; // server-derived mutation permission for the current staff user
}

/** Result of an explicit idempotent Canvas-to-local assignment import. */
export interface CanvasImportResult {
    assignment: CanvasAssignment; // external candidate selected by staff
    targetAssignment: Assignment; // local assignment created or reused by import
    importedCount: number; // new local attempts created
    skippedCount: number; // unchanged attempts omitted by idempotency checks
    submissions: Submission[]; // resulting local submission summaries
    rubricImport: 'not_imported'; // explicit guarantee that Canvas rubric data was not activated
}

/** Staff-facing text for each submission lifecycle state. */
export const STATUS_LABELS: Record<SubmissionStatus, string> = {
    imported: 'Imported',
    verification_needed: 'Verification needed',
    generating: 'Generating',
    draft_ready: 'Draft ready',
    approved: 'Approved',
    released: 'Released',
    failed: 'Needs attention'
};

/** Staff-facing intake provenance labels. */
export const SOURCE_LABELS: Record<Submission['sourceType'], string> = {
    manual: 'Pasted text',
    canvas_text: 'Canvas text',
    digital_file: 'Digital file',
    paper_scan: 'Paper scan'
};

/** Supported semantic color treatments for compact workspace chips. */
export type WfChipTone =
    | 'neutral' | 'green' | 'blue' | 'amber' | 'red' | 'purple';

/** Status → chip tone, matching the app's status color semantics. */
export const STATUS_TONES: Record<SubmissionStatus, WfChipTone> = {
    imported: 'blue',
    verification_needed: 'amber',
    generating: 'blue',
    draft_ready: 'blue',
    approved: 'green',
    released: 'green',
    failed: 'red'
};

/** Semantic chip tones for Academic Writing Matrix functions. */
export const FUNCTION_TAG_TONES: Record<WfFunctionTag, WfChipTone> = {
    content: 'blue',
    interpersonal: 'purple',
    organizational: 'green'
};

/** Semantic chip tones used to make annotation priority visible beyond text. */
export const PRIORITY_TONES: Record<WfPriority, WfChipTone> = {
    high: 'red',
    medium: 'amber',
    low: 'green'
};

/**
 * chip - creates a text-labelled semantic status chip
 *
 * @param label - Visible status/category text
 * @param tone - Shared visual meaning applied by Writing Feedback CSS
 * @returns Detached span ready for insertion into the current view
 */
export function chip(label: string, tone: WfChipTone = 'neutral'): HTMLElement {
    const node = document.createElement('span');
    node.className = `wf-chip wf-chip--${tone}`;
    node.textContent = label;
    return node;
}

/** Replaces dynamic Feather placeholders when the global icon library is available. */
export function refreshIcons(): void {
    (window as unknown as { feather?: { replace: () => void } }).feather?.replace();
}

/** URL-addressable child view within the mounted Writing Feedback component. */
export type WfViewName = 'landing' | 'rubric' | 'review';

/** Mutable browser state shared only across Writing Feedback view modules. */
interface WfState {
    course: activeCourse | null;
    workspace: WorkspaceContext | null;
    assignments: Assignment[];
    expandedAssignmentId: string | null;
    currentAssignment: Assignment | null;
    reviewDirty: boolean;
    panelDirty: boolean;
}

/**
 * Current course-scoped workspace state.
 *
 * Reset by {@link initializeWritingFeedback} whenever the instructor shell mounts
 * the component; dirty flags protect unsaved setup and review edits.
 */
export const state: WfState = {
    course: null,
    workspace: null,
    assignments: [],
    expandedAssignmentId: null,
    currentAssignment: null,
    reviewDirty: false,
    panelDirty: false
};

/**
 * Late-bound sibling view openers.
 *
 * Registration during initialization avoids circular imports while giving
 * rubric/review modules a common way to return to the landing view.
 */
export const views = {
    showLanding: async (): Promise<void> => {},
    showRubric: async (_assignmentId: string): Promise<void> => {},
    showReview: async (_submissionId: string): Promise<void> => {}
};

/**
 * baseUrl - builds the course-scoped Writing Feedback API prefix
 *
 * @returns Encoded API prefix for the active course
 * @throws Error when the component has not been initialized with a course
 */
export function baseUrl(): string {
    if (!state.course) throw new Error('Writing Feedback course context is missing');
    return `/api/courses/${encodeURIComponent(state.course.id)}/writing-feedback`;
}

/**
 * element - resolves a required Writing Feedback DOM node
 *
 * @param id - Static component element id
 * @returns The element narrowed to the caller's expected HTMLElement subtype
 * @throws Error when component markup is missing or not yet mounted
 */
export function element<T extends HTMLElement>(id: string): T {
    const found = document.getElementById(id);
    if (!found) throw new Error(`Writing Feedback element ${id} was not found`);
    return found as T;
}

/**
 * setView - shows exactly one workspace child view
 *
 * Landing-only intake actions are hidden in rubric and review views so actions
 * remain associated with the assignment queue.
 *
 * @param view - Child view to expose
 */
export function setView(view: WfViewName): void {
    element('wf-view-landing').hidden = view !== 'landing';
    element('wf-view-rubric').hidden = view !== 'rubric';
    element('wf-view-review').hidden = view !== 'review';
    // Header intake actions only make sense while browsing assignments.
    element('wf-header-actions').hidden = view !== 'landing';
}

/**
 * request - performs a same-origin course-scoped API request
 *
 * @param path - Path relative to the active course Writing Feedback prefix
 * @param init - Optional Fetch configuration
 * @returns The typed `data` member from a successful API envelope
 * @throws Error when transport status or the API success flag indicates failure
 */
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${baseUrl()}${path}`, { credentials: 'same-origin', ...init });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.success) throw new Error(body.error || 'Writing Feedback request failed');
    return body.data as T;
}

/**
 * jsonRequest - sends a JSON mutation through the shared request envelope
 *
 * @param path - Path relative to the course Writing Feedback prefix
 * @param method - Supported mutating HTTP method
 * @param body - Optional value serialized as JSON
 * @returns Typed API response data
 */
export function jsonRequest<T>(path: string, method: 'POST' | 'PUT' | 'DELETE', body?: unknown): Promise<T> {
    return request<T>(path, {
        method,
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body)
    });
}

/**
 * setWorkspaceMessage - updates the persistent, live-region workspace notice
 *
 * @param message - Staff-safe status text
 * @param tone - Semantic status used by the notice styling
 */
export function setWorkspaceMessage(message: string, tone: 'info' | 'success' | 'warning' | 'error' = 'info'): void {
    const region = element<HTMLDivElement>('wf-workspace-message');
    region.textContent = message;
    region.dataset.tone = tone;
}

/**
 * setQueryState - replaces Writing Feedback deep-link parameters without navigation
 *
 * @param values - Parameters to set, or null values to remove
 */
export function setQueryState(values: Partial<Record<'wfAssignment' | 'wfSubmission' | 'wfView', string | null>>): void {
    const url = new URL(window.location.href);
    Object.entries(values).forEach(([key, value]) => {
        if (value) url.searchParams.set(key, value);
        else url.searchParams.delete(key);
    });
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

/**
 * queryState - reads one Writing Feedback deep-link parameter
 *
 * @param key - Supported workspace query key
 * @returns Raw query value, or null when absent
 */
export function queryState(key: 'wfAssignment' | 'wfSubmission' | 'wfView'): string | null {
    return new URL(window.location.href).searchParams.get(key);
}

/**
 * formatDate - formats server timestamps in the staff user's locale
 *
 * @param value - ISO-compatible timestamp
 * @param withTime - Whether to include localized time
 * @returns Localized text, or an em dash for missing/invalid input
 */
export function formatDate(value?: string, withTime = false): string {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat(undefined, withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }).format(date);
}

/**
 * createText - creates an element with text-only content
 *
 * Using `textContent` keeps student writing and server labels out of the HTML parser.
 *
 * @param tag - HTML element name
 * @param text - Untrusted or trusted text to insert safely
 * @param className - Optional CSS class string
 * @returns Detached text element
 */
export function createText(tag: keyof HTMLElementTagNameMap, text: string, className?: string): HTMLElement {
    const node = document.createElement(tag);
    node.textContent = text;
    if (className) node.className = className;
    return node;
}

/**
 * createButton - builds an async action button with standardized busy/error handling
 *
 * @param label - Visible button text
 * @param variant - Visual action hierarchy
 * @param action - Async operation invoked once per enabled click
 * @param disabled - Initial release/capability/validation gate
 * @returns Detached button wired through {@link runButtonAction}
 */
export function createButton(
    label: string,
    variant: 'primary' | 'secondary' | 'quiet' | 'danger',
    action: (button: HTMLButtonElement) => Promise<void>,
    disabled = false
): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `wf-button wf-button--${variant}`;
    button.textContent = label;
    button.disabled = disabled;
    button.addEventListener('click', () => void runButtonAction(button, action));
    return button;
}

/**
 * createIconButton - builds an accessible icon-only async action
 *
 * Handles its own busy state so the
 * icon is never replaced by text, and stops propagation so it can sit inside
 * clickable card headers. Call refreshIcons() after inserting into the DOM.
 *
 * @param iconName - Feather icon identifier
 * @param label - Accessible name and tooltip
 * @param variant - Neutral or destructive visual treatment
 * @param action - Async operation invoked after click propagation is stopped
 * @returns Detached icon button
 */
export function createIconButton(
    iconName: string,
    label: string,
    variant: 'neutral' | 'danger',
    action: (button: HTMLButtonElement) => Promise<void>
): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `wf-icon-button${variant === 'danger' ? ' wf-icon-button--danger' : ''}`;
    button.setAttribute('aria-label', label);
    button.title = label;
    button.innerHTML = `<i data-feather="${iconName}" aria-hidden="true"></i>`;
    button.addEventListener('click', async (event) => {
        event.stopPropagation();
        if (button.disabled) return;
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        try {
            await action(button);
        } catch (error) {
            await handleActionError(error);
        } finally {
            // Async actions may replace their parent view. Restore interaction only
            // when this exact button still belongs to the live DOM.
            if (button.isConnected) {
                button.disabled = false;
                button.removeAttribute('aria-busy');
            }
        }
    });
    return button;
}

const ZOOM_STEPS = [0.75, 0.85, 1, 1.15, 1.3, 1.5, 1.75, 2];
const ZOOM_STORAGE_KEY = 'wf-zoom-level';
const DEFAULT_ZOOM_INDEX = ZOOM_STEPS.indexOf(1);

function readStoredZoomIndex(): number {
    const raw = Number(window.localStorage.getItem(ZOOM_STORAGE_KEY));
    const index = ZOOM_STEPS.indexOf(raw);
    return index === -1 ? DEFAULT_ZOOM_INDEX : index;
}

/**
 * createZoomControl - builds a persistent reading-scale stepper
 *
 * @param target - Element that consumes the `--wf-zoom` custom property
 * @returns Accessible grouped controls using bounded, predefined zoom steps
 */
export function createZoomControl(target: HTMLElement): HTMLElement {
    let index = readStoredZoomIndex();

    const wrap = document.createElement('div');
    wrap.className = 'wf-zoom-control';
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', 'Reading zoom');

    const label = createText('span', 'Aa', 'wf-zoom-label');
    const minus = document.createElement('button');
    minus.type = 'button';
    minus.className = 'wf-icon-button';
    minus.textContent = '−';
    minus.setAttribute('aria-label', 'Zoom out');

    const percent = createText('span', '', 'wf-zoom-percent');

    const plus = document.createElement('button');
    plus.type = 'button';
    plus.className = 'wf-icon-button';
    plus.textContent = '+';
    plus.setAttribute('aria-label', 'Zoom in');

    function apply(): void {
        const level = ZOOM_STEPS[index];
        target.style.setProperty('--wf-zoom', String(level));
        percent.textContent = `${Math.round(level * 100)}%`;
        minus.disabled = index === 0;
        plus.disabled = index === ZOOM_STEPS.length - 1;
        window.localStorage.setItem(ZOOM_STORAGE_KEY, String(level));
    }

    minus.addEventListener('click', () => { index = Math.max(0, index - 1); apply(); });
    plus.addEventListener('click', () => { index = Math.min(ZOOM_STEPS.length - 1, index + 1); apply(); });

    apply();
    wrap.append(label, minus, percent, plus);
    return wrap;
}

/**
 * runButtonAction - executes one action with shared busy and error semantics
 *
 * Prevents duplicate clicks, announces busy state, routes failures to durable
 * and modal feedback, and restores the original label only if the button survives rerendering.
 *
 * @param button - Action button whose interaction state is managed
 * @param action - Async callback to execute
 */
export async function runButtonAction(
    button: HTMLButtonElement,
    action: (button: HTMLButtonElement) => Promise<void>
): Promise<void> {
    if (button.disabled) return;
    const label = button.textContent ?? '';
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.textContent = 'Working…';
    try {
        await action(button);
    } catch (error) {
        setWorkspaceMessage(error instanceof Error ? error.message : 'The action could not be completed.', 'error');
        await showErrorModal(
            'Writing Feedback action failed',
            error instanceof Error ? error.message : 'Please try again.'
        );
    } finally {
        // A successful action often rerenders the view. Avoid mutating a detached
        // control after the awaited operation finishes.
        if (button.isConnected) {
            button.disabled = false;
            button.removeAttribute('aria-busy');
            button.textContent = label;
        }
    }
}

/**
 * field - pairs a form control with a programmatic label and optional help text
 *
 * @param labelText - Visible control label
 * @param control - Input, textarea, or select to label
 * @param help - Optional staff guidance
 * @param wide - Whether the field spans the full form grid
 * @returns Detached labelled field wrapper
 */
export function field(
    labelText: string,
    control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
    help?: string,
    wide = false
): HTMLDivElement {
    const wrapper = document.createElement('div');
    wrapper.className = `wf-field${wide ? ' wf-field--wide' : ''}`;
    if (!control.id) control.id = `wf-field-${crypto.randomUUID()}`;
    const label = document.createElement('label');
    label.htmlFor = control.id;
    label.textContent = labelText;
    wrapper.append(label, control);
    if (help) wrapper.append(createText('small', help));
    return wrapper;
}

/**
 * inputControl - creates a pre-populated input for dynamic forms
 *
 * @param value - Initial control value
 * @param type - Native input type
 * @returns Detached input element
 */
export function inputControl(value = '', type = 'text'): HTMLInputElement {
    const input = document.createElement('input');
    input.type = type;
    input.value = value;
    return input;
}

/**
 * textAreaControl - creates a pre-populated multiline control
 *
 * @param value - Initial text
 * @param rows - Initial visible row count
 * @returns Detached textarea element
 */
export function textAreaControl(value = '', rows = 4): HTMLTextAreaElement {
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.rows = rows;
    return textarea;
}

/**
 * confirmDiscardDirty - protects unsaved review or setup state before navigation
 *
 * @param kind - Dirty flag and user-facing edit category to inspect
 * @returns True when clean or explicitly discarded; false when editing should continue
 */
export async function confirmDiscardDirty(kind: 'review' | 'setup'): Promise<boolean> {
    const dirty = kind === 'review' ? state.reviewDirty : state.panelDirty;
    if (!dirty) return true;
    const result = await showConfirmModal(
        'Discard unsaved changes?',
        `You have unsaved ${kind === 'review' ? 'staff feedback' : 'setup'} changes.`,
        'Discard changes',
        'Keep editing',
        'danger'
    );
    return result.action === 'discard-changes';
}

/**
 * handleActionError - presents a failed workspace action consistently
 *
 * @param error - Unknown rejection or thrown value from an async UI action
 */
export async function handleActionError(error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : 'The action could not be completed.';
    setWorkspaceMessage(message, 'error');
    await showErrorModal('Writing Feedback action failed', message);
}
