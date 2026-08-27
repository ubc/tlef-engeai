/**
 * Live Canvas import gateway — read-only submission intake from a linked Canvas course
 *
 * Implements {@link CanvasImportGateway} against a real Canvas course through the signed-in
 * user's own OAuth client. It reads assignments, reads submissions, and downloads submission
 * attachments. It performs **no** Canvas writes: no grades, no comments, no rubric assessments,
 * no files.
 *
 * **Why the raw `ApiClient` rather than a package resource.** The LMS toolkit normalizes
 * courses, rosters, files, and grades, but has no submissions resource — `getGrades` returns
 * scores, not transcripts or attachments. The two endpoints below are therefore called through
 * the package's generic authenticated client. The {@link CanvasImportGateway} seam means
 * swapping in a future `canvas.getSubmissions` is a change to this file alone.
 *
 * **Identifiers.** Only Canvas's own `user_id` and the student's display name leave this module.
 * `integration_id` (the PUID), `sis_user_id` (the student number), and `login_id` (the CWL) are
 * never requested, never read off a payload, and never logged — the submissions endpoint is
 * called without any SIS include, so Canvas does not serialize them in the first place.
 *
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @description: Reads real Canvas assignments and submissions for staff-initiated import.
 */

import type { canvas } from '@ubc/ubc-genai-toolkit-lms-integration';
import type {
    CanvasAssignmentDetails,
    CanvasImportedRubric,
    CanvasRubricRating,
    CanvasRubricRow
} from './contracts';
import type {
    CanvasImportAssignmentSummary,
    CanvasImportAttachment,
    CanvasImportContentKind,
    CanvasImportGateway,
    CanvasImportStatus,
    CanvasImportSubmissionPreview
} from './canvas-import-contracts';
import type { DocumentExtractionService } from './contracts';
import { LocalDocumentExtractionService } from './document-extraction-service';

/** The package's authenticated Canvas client, as `canvas.requireAuth` puts it on the request. */
type ApiClient = NonNullable<Parameters<typeof canvas.getCourses>[0]>;

/**
 * Ceiling for one downloaded submission attachment.
 *
 * Writing submissions are prose. 25 MB is far above any legitimate essay and far below
 * anything that would strain the parser or the request's memory, so it rejects mistakes
 * (a video dropped into the wrong assignment) without ever refusing real work.
 */
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/**
 * Page-follow ceiling for the two list endpoints.
 *
 * At the client's default `per_page=100` this is 5,000 assignments or submissions — beyond any
 * real course, while still bounding a pathological response rather than following pages until
 * the request times out.
 */
const MAX_PAGES = 50;

/** Extensions {@link LocalDocumentExtractionService} can actually parse. */
const PARSEABLE_EXTENSIONS = new Set(['txt', 'docx', 'pdf', 'html', 'htm']);

/** Canvas submission types this gateway can derive a transcript from. */
const TEXT_ENTRY_TYPE = 'online_text_entry';
const FILE_UPLOAD_TYPE = 'online_upload';

/** The subset of Canvas's assignment payload this module reads. */
interface CanvasAssignmentPayload {
    id: number | string;
    name?: string;
    points_possible?: number | null;
    due_at?: string | null;
    submission_types?: string[];
    has_submitted_submissions?: boolean;
    published?: boolean;
    rubric?: CanvasRubricCriterionPayload[];
    rubric_settings?: {
        id?: number | string;
        title?: string | null;
        points_possible?: number | null;
    } | null;
    /** Canvas rich-editor HTML for the assignment brief. */
    description?: string | null;
    /** True while Canvas is withholding student identity for anonymous grading. */
    anonymize_students?: boolean;
}

/** One rubric row as Canvas serializes it inside an assignment payload. */
interface CanvasRubricCriterionPayload {
    id?: number | string;
    description?: string | null;
    long_description?: string | null;
    points?: number | null;
    ratings?: Array<{
        id?: number | string;
        description?: string | null;
        long_description?: string | null;
        points?: number | null;
    }> | null;
}

/** The subset of Canvas's submission payload this module reads. */
interface CanvasSubmissionPayload {
    id?: number | string;
    user_id?: number | string;
    attempt?: number | null;
    body?: string | null;
    submission_type?: string | null;
    submitted_at?: string | null;
    workflow_state?: string;
    excused?: boolean | null;
    user?: { id?: number | string; name?: string | null } | null;
    attachments?: Array<{
        id?: number | string;
        display_name?: string | null;
        filename?: string | null;
        'content-type'?: string | null;
        content_type?: string | null;
        size?: number | null;
        url?: string | null;
    }> | null;
}

function extensionOf(fileName: string): string {
    const dot = fileName.lastIndexOf('.');
    return dot === -1 ? '' : fileName.slice(dot + 1).toLowerCase();
}

/**
 * Decides how one submission carries its content.
 *
 * Canvas reports `submission_type` per *attempt*, not per assignment, so an assignment that
 * accepts both text and uploads yields a mix. The attachment list is checked as well as the
 * type, because an upload attempt whose files were deleted has nothing left to import.
 */
function classify(submission: CanvasSubmissionPayload): CanvasImportContentKind {
    if (submission.submission_type === TEXT_ENTRY_TYPE) {
        return typeof submission.body === 'string' && submission.body.trim() !== ''
            ? 'text_entry'
            : 'unsupported';
    }
    if (submission.submission_type === FILE_UPLOAD_TYPE) {
        const usable = (submission.attachments ?? []).some(
            (attachment) => attachment?.url && PARSEABLE_EXTENSIONS.has(
                extensionOf(String(attachment.display_name || attachment.filename || ''))
            )
        );
        return usable ? 'file_upload' : 'unsupported';
    }
    // online_url, media_recording, discussion_topic, on_paper, none — no transcript to read.
    return 'unsupported';
}

/** Maps Canvas's attachment shape, keeping the download URL out of anything persisted. */
function toAttachment(raw: NonNullable<CanvasSubmissionPayload['attachments']>[number]): CanvasImportAttachment | null {
    const fileName = String(raw?.display_name || raw?.filename || '').trim();
    if (!raw?.url || fileName === '') return null;
    return {
        attachmentId: String(raw.id ?? ''),
        fileName,
        contentType: raw['content-type'] ?? raw.content_type ?? undefined,
        size: typeof raw.size === 'number' ? raw.size : undefined,
        url: String(raw.url)
    };
}

/**
 * liveCanvasStatus — the integration state a working live connection reports.
 *
 * A standalone function because two callers need it and only one of them has a Canvas client:
 * the resolver reports status for a course whose credential it has merely confirmed exists,
 * and constructing a gateway around an undefined client just to read a constant would be a
 * trap the first time this needed a network call.
 *
 * @returns Live, importable status with no synthetic-data disclosure
 */
export function liveCanvasStatus(): CanvasImportStatus {
    return {
        mode: 'live',
        integration: 'canvas',
        connected: true,
        canImport: true,
        syntheticDataOnly: false,
        label: 'Connected to Canvas',
        message:
            'Assignments and submissions are read from this course in Canvas using your own Canvas authorization. Importing copies submission text into EngE-AI; nothing is written back to Canvas.',
        nextStep: 'Choose an assignment to review its submissions before importing.'
    };
}


/** Canvas serializes rubric text as plain strings; normalize null/undefined to empty. */
function text(value: string | null | undefined): string {
    return typeof value === 'string' ? value.trim() : '';
}

function numberOrUndefined(value: number | null | undefined): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Maps one Canvas rubric row, preserving its own rating list.
 *
 * Ratings stay exactly as Canvas ordered and sized them. Two rows of the same rubric may carry
 * different counts, and normalizing that away would fabricate cells the instructor never wrote.
 *
 * The mapped row carries only what Canvas returned. Nothing EngE-AI-specific is attached here,
 * so the stored rubric stays a faithful mirror of the one the instructor authored in Canvas.
 */
function toRubricRow(payload: CanvasRubricCriterionPayload, index: number): CanvasRubricRow {
    const ratings: CanvasRubricRating[] = (payload.ratings ?? []).map((rating, ratingIndex) => ({
        canvasRatingId: String(rating?.id ?? `rating-${index}-${ratingIndex}`),
        label: text(rating?.description),
        description: text(rating?.long_description),
        points: numberOrUndefined(rating?.points)
    }));
    return {
        canvasCriterionId: String(payload.id ?? `criterion-${index}`),
        label: text(payload.description) || `Criterion ${index + 1}`,
        description: text(payload.long_description),
        points: numberOrUndefined(payload.points),
        ratings
    };
}

/**
 * Reduces Canvas rich-editor HTML to plain text.
 *
 * A local tag strip rather than the document parser: this runs inside the import request for a
 * single short brief, and writing the brief to a temp file to parse it back would cost more
 * than it returns. Block-level tags become newlines so paragraph and list structure survives.
 */
function htmlToText(html: string): string {
    return html
        .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\s*\/?>/gi, '\n')
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/**
 * Reads a real Canvas course on behalf of one signed-in staff member.
 *
 * Construction is per request, not per process: the client carries that user's access token, so
 * a cached instance would read Canvas as whoever happened to trigger the first import.
 */
export class LiveCanvasImportGateway implements CanvasImportGateway {
    private readonly client: ApiClient;
    private readonly canvasCourseId: string;
    private readonly extractor: DocumentExtractionService;

    /**
     * @param deps.client - Authenticated Canvas client for the current staff member
     * @param deps.canvasCourseId - Canvas course id from the EngE-AI course's `lmsLink`
     * @param deps.extractor - Local parser for attachment bytes; never the RAG pipeline
     */
    constructor(deps: {
        client: ApiClient;
        canvasCourseId: string;
        extractor?: DocumentExtractionService;
    }) {
        this.client = deps.client;
        this.canvasCourseId = deps.canvasCourseId;
        this.extractor = deps.extractor ?? new LocalDocumentExtractionService();
    }

    /**
     * Reports a live, importable connection.
     *
     * Deliberately makes no Canvas request. This is polled every time the workspace or the
     * import panel opens, and the caller has already proven a usable credential exists by
     * passing `canvas.requireAuth` — spending a round trip to re-confirm it would slow every
     * page load to re-learn something the route already knows. A credential that has since
     * been revoked surfaces on the next real call, as a Canvas error rather than a stale
     * "connected" claim acted upon.
     */
    async getStatus(): Promise<CanvasImportStatus> {
        return liveCanvasStatus();
    }

    /**
     * Lists assignments a staff member could usefully import.
     *
     * Three filters apply, each because import would otherwise be impossible rather than merely
     * unhelpful: the assignment must accept text or file submissions, it must actually have
     * submissions, and it must not be anonymized. An anonymized assignment withholds student
     * identity, which leaves no way to label a submission for review or to address it later —
     * {@link listSubmissionPreviews} states that explicitly if one is selected anyway.
     */
    async listAssignments(): Promise<CanvasImportAssignmentSummary[]> {
        const assignments = await this.client.getAll<CanvasAssignmentPayload>(
            `/courses/${encodeURIComponent(this.canvasCourseId)}/assignments`,
            { order_by: 'due_at' },
            { maxPages: MAX_PAGES }
        );

        return assignments
            .filter((assignment) => {
                const types = assignment.submission_types ?? [];
                const accepts = types.includes(TEXT_ENTRY_TYPE) || types.includes(FILE_UPLOAD_TYPE);
                return accepts && assignment.has_submitted_submissions === true && !assignment.anonymize_students;
            })
            .map((assignment) => ({
                canvasAssignmentId: String(assignment.id),
                title: assignment.name?.trim() || 'Untitled Canvas assignment',
                // Canvas serializes the brief as rich-editor HTML on the index response, so it
                // is converted here rather than passed through: the field feeds the local
                // assignment instructions, which staff read and the auto-fill prompt sends to
                // the model, and neither has any use for markup.
                description: text(assignment.description) ? htmlToText(text(assignment.description)) : undefined,
                // Canvas's assignment payload carries no submitted count; the preview reports it.
                submissionCount: undefined,
                pointsPossible: typeof assignment.points_possible === 'number' ? assignment.points_possible : undefined,
                dueAt: assignment.due_at ? new Date(assignment.due_at) : undefined,
                // Provenance only. A Canvas rubric is never read into or merged with the local one.
                rubricState: Array.isArray(assignment.rubric) && assignment.rubric.length > 0
                    ? 'canvas_rubric' as const
                    : 'no_canvas_rubric' as const,
                synthetic: false
            }));
    }

    /**
     * Reads the submissions for one assignment, without fetching any attachment bytes.
     *
     * `include[]=user` is the only include requested: it supplies the display name staff need
     * to tell submissions apart. No SIS include is passed, so Canvas does not serialize the
     * PUID, student number, or CWL into the response at all.
     *
     * @param canvasAssignmentId - Canvas assignment id selected by staff
     * @returns One preview per submission that has something to import
     * @throws Error when the assignment is anonymized or unreadable by this user
     */
    async listSubmissionPreviews(canvasAssignmentId: string): Promise<CanvasImportSubmissionPreview[]> {
        // Re-read the assignment: the id arrives from the browser, and an anonymized or
        // unsubmittable assignment must be refused with a reason rather than an empty list.
        const assignment = await this.client.get<CanvasAssignmentPayload>(
            `/courses/${encodeURIComponent(this.canvasCourseId)}/assignments/${encodeURIComponent(canvasAssignmentId)}`
        );
        if (assignment?.anonymize_students) {
            throw new Error(
                'Canvas assignment uses anonymous grading, so submissions cannot be identified for review. Post grades in Canvas to un-anonymize it, then import.'
            );
        }

        const submissions = await this.client.getAll<CanvasSubmissionPayload>(
            `/courses/${encodeURIComponent(this.canvasCourseId)}/assignments/${encodeURIComponent(canvasAssignmentId)}/submissions`,
            { include: ['user'] },
            { maxPages: MAX_PAGES }
        );

        return submissions
            .filter((submission) => {
                // `unsubmitted` placeholder rows exist for every enrolled student; excused work
                // is not the student's text to review.
                if (submission.workflow_state === 'unsubmitted') return false;
                if (submission.excused === true) return false;
                return Boolean(submission.submitted_at) && Boolean(submission.user_id);
            })
            .map((submission) => {
                const contentKind = classify(submission);
                const attachments = contentKind === 'file_upload'
                    ? (submission.attachments ?? [])
                        .map(toAttachment)
                        .filter((attachment): attachment is CanvasImportAttachment =>
                            attachment !== null && PARSEABLE_EXTENSIONS.has(extensionOf(attachment.fileName)))
                    : [];
                return {
                    sourceRecordKey: String(submission.user_id),
                    canvasUserId: String(submission.user_id),
                    studentLabel: submission.user?.name?.trim() || `Canvas user ${submission.user_id}`,
                    // Canvas leaves `attempt` null on some submission shapes; attempt 1 is the
                    // honest reading and keeps the idempotency key well-formed.
                    attempt: typeof submission.attempt === 'number' && submission.attempt > 0 ? submission.attempt : 1,
                    submittedAt: submission.submitted_at ? new Date(submission.submitted_at) : new Date(),
                    contentKind,
                    // Text entry bodies are Canvas RCE HTML; they are converted at import, not here.
                    text: contentKind === 'text_entry' ? String(submission.body ?? '') : '',
                    attachments,
                    synthetic: false
                };
            });
    }

    /**
     * Downloads one attachment and parses it to text.
     *
     * The extension is re-checked here rather than trusted from the preview, because the
     * preview and the import are separate requests and the parser rejects anything else anyway
     * — failing before the download saves pulling bytes that cannot be used.
     *
     * The package's `download` is what makes passing a payload-supplied URL safe: it requires
     * the first hop to match the configured Canvas origin, drops the bearer token permanently
     * after any off-origin redirect, enforces `maxBytes` against both the declared and the
     * streamed length, and rejects an HTML response (a Canvas login page in place of a file).
     *
     * @param attachment - Attachment metadata from a preview in this same course
     * @returns Extracted transcript, which remains unverified until staff confirm it
     * @throws Error when the type is unsupported, or the download or parse fails
     */
    async extractAttachmentText(attachment: CanvasImportAttachment): Promise<string> {
        const extension = extensionOf(attachment.fileName);
        if (!PARSEABLE_EXTENSIONS.has(extension)) {
            throw new Error(`Unsupported Canvas attachment type: .${extension || 'unknown'}`);
        }
        if (attachment.size !== undefined && attachment.size > MAX_ATTACHMENT_BYTES) {
            throw new Error(`Canvas attachment exceeds the ${MAX_ATTACHMENT_BYTES}-byte import limit`);
        }

        const download = await this.client.download(attachment.url, { maxBytes: MAX_ATTACHMENT_BYTES });
        const extraction = await this.extractor.extract({
            buffer: Buffer.from(download.data),
            fileName: attachment.fileName
        });
        return extraction.text;
    }

    /**
     * Loads the assignment's rubric and brief for staff review.
     *
     * One request: Canvas serializes `rubric`, `rubric_settings`, and `description` inline on
     * the assignment, so no separate rubric endpoint or OAuth scope is involved. The listing
     * path already reads `rubric` to report `rubricState` — this keeps the data instead of
     * discarding it.
     *
     * @param canvasAssignmentId - Canvas assignment id selected by staff
     * @returns The rubric, or `null` when the assignment has none, plus the imported brief
     */
    async loadAssignmentContext(canvasAssignmentId: string): Promise<{
        rubric: CanvasImportedRubric | null;
        details: CanvasAssignmentDetails;
    }> {
        const assignment = await this.client.get<CanvasAssignmentPayload>(
            `/courses/${encodeURIComponent(this.canvasCourseId)}/assignments/${encodeURIComponent(canvasAssignmentId)}`
        );

        const importedAt = new Date();
        const descriptionHtml = text(assignment?.description) || undefined;
        const details: CanvasAssignmentDetails = {
            descriptionHtml,
            descriptionText: descriptionHtml ? htmlToText(descriptionHtml) : undefined,
            pointsPossible: numberOrUndefined(assignment?.points_possible),
            dueAt: assignment?.due_at ? new Date(assignment.due_at) : undefined,
            importedAt
        };

        const rows = (assignment?.rubric ?? []).map(toRubricRow);
        if (rows.length === 0) {
            // No Canvas rubric. The instructor authors one in EngE-AI instead — the existing
            // manual path — so this is an ordinary outcome, not a failure.
            return { rubric: null, details };
        }

        return {
            rubric: {
                canvasRubricId: assignment.rubric_settings?.id !== undefined
                    ? String(assignment.rubric_settings.id)
                    : undefined,
                title: text(assignment.rubric_settings?.title)
                    || text(assignment.name)
                    || 'Canvas rubric',
                pointsPossible: numberOrUndefined(assignment.rubric_settings?.points_possible),
                rows,
                importedAt
            },
            details
        };
    }

    /**
     * Converts one Canvas text-entry body to plain text.
     *
     * Routed through the same local parser as uploaded documents rather than a bespoke tag
     * stripper, so RCE markup — lists, tables, block quotes — degrades to text the same way it
     * does for an uploaded HTML file, and so submission text has exactly one extraction path.
     *
     * @param body - Canvas RCE HTML from `submission.body`
     * @returns Plain-text transcript
     */
    async extractTextEntry(body: string): Promise<string> {
        const extraction = await this.extractor.extract({
            buffer: Buffer.from(body, 'utf8'),
            fileName: 'canvas-text-entry.html'
        });
        return extraction.text;
    }
}
