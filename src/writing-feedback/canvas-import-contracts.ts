/**
 * Canvas import contracts — safe boundary between source adapters and local persistence
 *
 * Describes the honest integration state, staff previews, idempotent import request,
 * and narrow gateway/store ports used by the import service. These contracts deliberately
 * exclude OAuth tokens, institutional identifiers, grading, and Canvas write operations.
 *
 * @author: @rdschrs
 * @date: 2026-07-13
 * @version: 1.0.0
 * @description: Defines read-only Canvas import and local storage interfaces.
 */

import type {
    CanvasAssignmentDetails,
    CanvasImportedRubric,
    WritingAssignment,
    WritingSubmission
} from './contracts';

/**
 * Honest capability state returned before staff can browse or import Canvas data.
 *
 * `mode` and `integration` move together and must never be inferred from each other by callers:
 * `live` is the only value that reads a real Canvas course; any later write-back
 * still requires the separate release preview and release routes.
 */
export interface CanvasImportStatus {
    /**
     * `demo` serves synthetic fixtures, `live` reads the linked Canvas course through the
     * signed-in user's OAuth token, and `not_configured` fails closed.
     */
    mode: 'demo' | 'live' | 'not_configured';
    /** Adapter identity. `canvas` claims real connectivity; `mock_canvas` explicitly does not. */
    integration: 'mock_canvas' | 'canvas' | 'none';
    connected: boolean; // true only for `live`, where a usable Canvas credential was resolved
    canImport: boolean; // gates chooser and import operations in the staff workspace
    syntheticDataOnly: boolean; // requires prominent demo-data disclosure
    label: string; // concise status heading safe for staff display
    message: string; // durable explanation of current integration behavior
    nextStep?: string; // actionable setup or demo guidance when available
    /**
     * Where the staff member must go to authorize Canvas, present only when that is the one
     * thing standing between them and a working import. Always an EngE-AI-relative path.
     */
    connectUrl?: string;
}

/** Assignment metadata safe to show in the Canvas import chooser. */
export interface CanvasImportAssignmentSummary {
    canvasAssignmentId: string; // opaque source key used only for the selected import
    title: string; // staff-facing chooser label
    description?: string; // raw assignment directions available for local rubric setup
    /**
     * Eligible submissions, when the source can report it without a per-assignment round trip.
     * Canvas cannot: its assignment payload carries no submitted count, only
     * `has_submitted_submissions`. Rather than fire one request per assignment to fill a number
     * the staff member has not asked for yet, the live adapter leaves this undefined and the
     * exact count arrives with the preview.
     */
    submissionCount?: number;
    pointsPossible?: number; // optional context, never an inferred local grade mapping
    dueAt?: Date; // source deadline shown for assignment disambiguation
    rubricState: 'canvas_rubric' | 'no_canvas_rubric'; // provenance hint, not approval state
    synthetic: boolean; // prevents demo fixtures from appearing live
}

/**
 * How one source submission carries its content, which decides the local intake path.
 *
 * `text_entry` arrives already extracted and needs no verification. `file_upload` carries only
 * metadata at preview time; the bytes are fetched during import and parsed locally, landing as
 * staff-verifiable text. `unsupported` covers everything with no extractable transcript —
 * URL submissions, media recordings — which are surfaced so staff can see they were skipped
 * rather than silently dropped.
 */
export type CanvasImportContentKind = 'text_entry' | 'file_upload' | 'unsupported';

/** One file attached to a source submission, described without fetching its bytes. */
export interface CanvasImportAttachment {
    /** Provider-scoped file id, used only to re-resolve the attachment during import. */
    attachmentId: string;
    fileName: string; // staff-facing name shown in the preview
    contentType?: string; // reported media type, used to reject unparseable uploads early
    size?: number; // reported byte size, checked against the download ceiling before fetching
    /** Canvas-owned download URL. Never rendered as a link and never persisted. */
    url: string;
}

/**
 * Which submission an attachment belongs to.
 *
 * Passed alongside the attachment because a download URL proves only that it points at Canvas.
 * Naming the assignment and the student lets the provider resolve the file through Canvas's own
 * course- and assignment-scoped submission endpoint, so Canvas — not our payload — decides which
 * bytes come back.
 */
export interface CanvasAttachmentContext {
    canvasAssignmentId: string;
    canvasUserId: string;
}

/** Read-only preview of a submission before staff starts an import. */
export interface CanvasImportSubmissionPreview {
    sourceRecordKey: string; // ephemeral source identity used to derive a privacy-safe local key
    /**
     * Provider-scoped Canvas user id for this submission.
     *
     * Retained because it is the only key Canvas accepts to address a submission on write-back,
     * and the local `studentId` is a one-way hash. It is **not** an institutional identifier:
     * `integration_id` (the PUID), `sis_user_id` (student number), and `login_id` (CWL) are
     * never read into this shape, never persisted, and never logged.
     */
    canvasUserId: string;
    studentLabel: string; // staff-only label for explicit selection and review
    attempt: number; // participates in idempotency for repeated submissions
    submittedAt: Date; // source timestamp shown during preview
    contentKind: CanvasImportContentKind; // selects the intake path taken at import time
    text: string; // extracted transcript; empty for uploads, which are fetched during import
    attachments: CanvasImportAttachment[]; // populated only for `file_upload`
    synthetic: boolean; // keeps the preview visibly separated from real student data
}

/** Narrow adapter boundary for a future institutionally approved Canvas client. */
export interface CanvasImportGateway {
    /** Reports connectivity and whether import operations are currently permitted. */
    getStatus(): Promise<CanvasImportStatus>;
    /** Lists staff-safe assignment summaries without persisting them locally. */
    listAssignments(): Promise<CanvasImportAssignmentSummary[]>;
    /** Loads read-only source submissions for an explicitly selected assignment. */
    listSubmissionPreviews(canvasAssignmentId: string): Promise<CanvasImportSubmissionPreview[]>;
    /**
     * Fetches one attachment and returns its extracted transcript.
     *
     * Optional because an adapter with no file-upload submissions has nothing to implement —
     * the demo fixtures are all text. Downloading lives behind the gateway rather than in the
     * import service so the authenticated client never escapes the provider adapter, and so
     * the service stays a pure orchestrator over the port.
     *
     * Called only during an explicit import, never while previewing: a preview must not pull
     * student file bytes across the network.
     */
    extractAttachmentText?(
        attachment: CanvasImportAttachment,
        context: CanvasAttachmentContext
    ): Promise<string>;
    /**
     * Converts one source text-entry body to a plain-text transcript.
     *
     * Optional for the same reason as {@link CanvasImportGateway.extractAttachmentText}: an
     * adapter whose previews already carry plain text has nothing to do. The live adapter does,
     * because Canvas serves text entries as rich-editor HTML, and converting during preview
     * would parse every submission in the assignment to answer a question staff have not asked.
     */
    extractTextEntry?(body: string): Promise<string>;
    /**
     * Loads the source assignment's rubric and description for staff review.
     *
     * Optional because the demo adapter has no rubric to serve. Returns `rubric: null` when the
     * assignment genuinely has none in Canvas — the instructor then authors one in EngE-AI,
     * which is the existing manual path and needs no import.
     */
    loadAssignmentContext?(canvasAssignmentId: string): Promise<{
        rubric: CanvasImportedRubric | null;
        details: CanvasAssignmentDetails;
    }>;
}

/** Persistence capabilities used by the import service without coupling it to Mongo. */
export interface CanvasImportStore {
    /** Resolves the existing local assignment that will own imported submissions. */
    getWritingAssignment(courseId: string, assignmentId: string): Promise<WritingAssignment | null>;
    /**
     * Stores the imported Canvas rubric and assignment details on the local assignment.
     *
     * Optional so the demo adapter and existing tests need no rubric persistence. Called once
     * per import, before submissions are written.
     */
    saveCanvasAssignmentContext?(
        courseId: string,
        assignmentId: string,
        context: { rubric: CanvasImportedRubric | null; details: CanvasAssignmentDetails }
    ): Promise<unknown>;
    /** Lists existing attempts used to skip idempotent re-imports. */
    listWritingSubmissions(courseId: string, assignmentId: string): Promise<WritingSubmission[]>;
    /** Creates one local submission without exposing adapter internals to storage. */
    createWritingSubmission(input: Omit<WritingSubmission, 'id' | 'createdAt' | 'updatedAt'>): Promise<WritingSubmission>;
}

/** Explicit staff request mapping one source assignment into an existing local assignment. */
export interface CanvasImportRequest {
    courseId: string; // course boundary enforced by caller and persistence
    targetAssignmentId: string; // local assignment receiving imported records
    canvasAssignmentId: string; // selected source assignment to read
}

/** Import outcome makes retries visible without exposing source-system identifiers. */
export interface CanvasImportResult {
    assignment: CanvasImportAssignmentSummary; // source summary used for this operation
    importedCount: number; // number of new local records created
    skippedCount: number; // existing or concurrently inserted attempts
    submissions: WritingSubmission[]; // newly created records only
    /** Provenance of this import, so a demo result can never be read as live Canvas data. */
    integration: 'mock_canvas' | 'canvas';
    /**
     * Submissions the source returned that could not be reviewed as they stand — no extractable
     * transcript (a URL or media submission, or an upload the parser does not read), or text
     * beyond the 30,000-character review limit. Reported so staff can see what was left behind
     * instead of inferring it from a short count.
     */
    unsupportedCount: number;
    /**
     * Submissions whose download or parse failed. Separate from `unsupportedCount` because the
     * remedy differs: unsupported is a property of the submission, whereas a failure is
     * usually transient and the same import can simply be run again.
     */
    failedCount: number;
}
