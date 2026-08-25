/**
 * Writing Feedback Mongo delegate — course-scoped review persistence.
 *
 * Owns collection indexes and append-oriented assignment, rubric, submission,
 * feedback, release, and job records behind the `EngEAI_MongoDB` façade.
 * It never references the RAG/Qdrant data path and never persists PUIDs.
 *
 * @author: @rdschrs
 * @date: 2026-07-22
 * @version: 1.0.0
 * @description: MongoDB persistence, idempotency, provenance, retention, and job leasing for Writing Feedback.
 */

import { randomUUID } from 'crypto';
import type { Collection, Filter, IndexDescriptionInfo, UpdateFilter } from 'mongodb';
import type { MongoDalContext } from './mongo-context';
import type {
    CanvasAssignmentDetails,
    CanvasImportedRubric,
    CanvasRubricRow,
    StaffReviewRevision,
    WritingAssignment,
    WritingFeedbackLens,
    WritingFeedbackRun,
    WritingGlossaryEntry,
    WritingJob,
    WritingRelease,
    WritingRubricDefinition,
    WritingSubmission,
    WritingSubmissionStatus
} from '../../writing-feedback/contracts';
import { buildDefaultWritingAssignment } from '../../writing-feedback/default-rubric-profile';
import { seedRubricForLens } from '../../writing-feedback/rubric-seed';
import type { ImportedRubricShape } from '../../writing-feedback/rubric-seed';
import { rubricFieldPaths } from '../../writing-feedback/rubric-lens';

const ASSIGNMENTS = 'writing-assignments';
const SUBMISSIONS = 'writing-submissions';
const RUNS = 'writing-feedback-runs';
const RELEASES = 'writing-releases';
const JOBS = 'writing-jobs';
const GLOSSARY = 'writing-glossary-entries';
/** Reserved for a future Canvas OAuth integration; no token is written by the MVP. */
const CANVAS_CONNECTIONS = 'canvas-connections';
const CANVAS_ASSIGNMENT_INDEX = 'writing_canvas_assignment_unique';

function assignments(ctx: MongoDalContext): Collection<WritingAssignment> {
    return ctx.db.collection<WritingAssignment>(ASSIGNMENTS);
}
function submissions(ctx: MongoDalContext): Collection<WritingSubmission & { reviews?: StaffReviewRevision[]; approvedAt?: Date; approvedBy?: string }> {
    return ctx.db.collection(SUBMISSIONS);
}
function runs(ctx: MongoDalContext): Collection<WritingFeedbackRun> { return ctx.db.collection(RUNS); }
function releases(ctx: MongoDalContext): Collection<WritingRelease> { return ctx.db.collection(RELEASES); }
function jobs(ctx: MongoDalContext): Collection<WritingJob> { return ctx.db.collection(JOBS); }
function glossary(ctx: MongoDalContext): Collection<WritingGlossaryEntry> { return ctx.db.collection(GLOSSARY); }

let indexesEnsured = false;

function isNamespaceMissing(error: unknown): boolean {
    return typeof error === 'object' && error !== null
        && (('code' in error && (error as { code?: unknown }).code === 26)
            || ('codeName' in error && (error as { codeName?: unknown }).codeName === 'NamespaceNotFound'));
}

function isCanvasAssignmentIndex(index: IndexDescriptionInfo): boolean {
    return index.key?.courseId === 1 && index.key?.canvasAssignmentId === 1;
}

function isCorrectCanvasAssignmentIndex(index: IndexDescriptionInfo): boolean {
    const condition = index.partialFilterExpression?.canvasAssignmentId as { $type?: unknown } | undefined;
    return index.unique === true && !index.sparse && condition?.$type === 'string';
}

/**
 * ensureCanvasAssignmentIndex - reconciles the legacy sparse uniqueness defect.
 *
 * A compound sparse index still includes every record because `courseId` is
 * always present, so it permits only one manual assignment per course. The
 * replacement applies uniqueness only to rows carrying a real Canvas id.
 *
 * @param collection - Writing-assignment collection to inspect and repair
 * @returns When the partial unique Canvas mapping index is active
 */
async function ensureCanvasAssignmentIndex(collection: Collection<WritingAssignment>): Promise<void> {
    let indexes: IndexDescriptionInfo[] = [];
    try {
        indexes = await collection.listIndexes().toArray();
    } catch (error) {
        if (!isNamespaceMissing(error)) throw error;
    }

    const existing = indexes.find(isCanvasAssignmentIndex);
    if (existing && !isCorrectCanvasAssignmentIndex(existing) && existing.name) {
        // Drop only the exact legacy key after resolving its server-reported name.
        await collection.dropIndex(existing.name);
    }
    if (existing && isCorrectCanvasAssignmentIndex(existing)) return;

    await collection.createIndex(
        { courseId: 1, canvasAssignmentId: 1 },
        {
            name: CANVAS_ASSIGNMENT_INDEX,
            unique: true,
            partialFilterExpression: { canvasAssignmentId: { $type: 'string' } }
        }
    );
}

function normalizeRubricRanks(rubric: WritingRubricDefinition): WritingRubricDefinition {
    return {
        ...rubric,
        levels: rubric.levels.map((level, index) => ({
            ...level,
            rank: Number.isInteger(level.rank) && level.rank > 0 ? level.rank : index + 1
        }))
    };
}

/** Backfills level rank only in detached read values; stored legacy records remain untouched. */
export function normalizeWritingAssignment(assignment: WritingAssignment): WritingAssignment {
    return {
        ...assignment,
        rubric: normalizeRubricRanks(assignment.rubric),
        ...(assignment.rubricDraft ? { rubricDraft: normalizeRubricRanks(assignment.rubricDraft) } : {}),
        ...(assignment.rubricHistory
            ? { rubricHistory: assignment.rubricHistory.map(normalizeRubricRanks) }
            : {}),
        ...(assignment.technicalRubric ? { technicalRubric: normalizeRubricRanks(assignment.technicalRubric) } : {}),
        ...(assignment.technicalRubricDraft
            ? { technicalRubricDraft: normalizeRubricRanks(assignment.technicalRubricDraft) }
            : {}),
        ...(assignment.technicalRubricHistory
            ? { technicalRubricHistory: assignment.technicalRubricHistory.map(normalizeRubricRanks) }
            : {})
    };
}

/**
 * ensureWritingFeedbackIndexes — installs uniqueness, lookup, and retention indexes once per process.
 *
 * Canvas mappings, submission attempts, and release fingerprints are protected
 * by unique indexes; `retentionAt` drives MongoDB TTL deletion when configured.
 *
 * @param ctx - Connected Mongo data-layer context
 * @returns When all Writing Feedback indexes are available
 * @throws MongoDB errors; the process-local ready flag remains false on failure
 */
export async function ensureWritingFeedbackIndexes(ctx: MongoDalContext): Promise<void> {
    if (indexesEnsured) return;

    await ensureCanvasAssignmentIndex(assignments(ctx));

    // Build all domain indexes before marking this process as initialized.
    await Promise.all([
        assignments(ctx).createIndex({ courseId: 1, profileVersion: 1 }),
        submissions(ctx).createIndex({ courseId: 1, assignmentId: 1, studentId: 1, attempt: 1 }, { unique: true }),
        submissions(ctx).createIndex({ courseId: 1, assignmentId: 1, status: 1, updatedAt: -1 }),
        submissions(ctx).createIndex({ retentionAt: 1 }, { expireAfterSeconds: 0, sparse: true }),
        runs(ctx).createIndex({ submissionId: 1, createdAt: -1 }),
        releases(ctx).createIndex({ payloadFingerprint: 1 }, { unique: true }),
        jobs(ctx).createIndex({ state: 1, leaseUntil: 1, createdAt: 1 }),
        jobs(ctx).createIndex({ courseId: 1, type: 1, 'payload.submissionId': 1, state: 1 }),
        glossary(ctx).createIndex({ courseId: 1, normalizedTerm: 1 }, { unique: true }),
        ctx.db.collection(CANVAS_CONNECTIONS).createIndex({ courseId: 1 }, { unique: true, sparse: true })
    ]);
    indexesEnsured = true;
}

/**
 * listWritingAssignments — lists all course assignments in creation order.
 *
 * Empty courses remain empty until staff manually create or explicitly import an
 * assignment; listing never creates assessment records as a side effect.
 *
 * @param ctx - Connected Mongo data-layer context
 * @param courseId - Course whose assignments are requested
 * @returns Course-scoped assignments ordered oldest first
 */
export async function listWritingAssignments(ctx: MongoDalContext, courseId: string): Promise<WritingAssignment[]> {
    await ensureWritingFeedbackIndexes(ctx);
    const rows = await assignments(ctx).find({ courseId }).sort({ createdAt: 1 }).toArray();
    return rows.map(normalizeWritingAssignment);
}

/**
 * getWritingAssignment — retrieves one assignment within its course boundary.
 *
 * @param ctx - Connected Mongo data-layer context
 * @param courseId - Owning course id
 * @param assignmentId - Internal assignment id
 * @returns Matching assignment, or `null` when absent or outside the course
 */
export async function getWritingAssignment(ctx: MongoDalContext, courseId: string, assignmentId: string): Promise<WritingAssignment | null> {
    const assignment = await assignments(ctx).findOne({ id: assignmentId, courseId });
    return assignment ? normalizeWritingAssignment(assignment) : null;
}

/**
 * getWritingAssignmentByCanvasId — resolves a local assignment from a Canvas mapping.
 *
 * @param ctx - Connected Mongo data-layer context
 * @param courseId - Owning course id
 * @param canvasAssignmentId - Canvas assignment identifier
 * @returns Matching course-scoped assignment, or `null`
 */
export async function getWritingAssignmentByCanvasId(
    ctx: MongoDalContext,
    courseId: string,
    canvasAssignmentId: string
): Promise<WritingAssignment | null> {
    const assignment = await assignments(ctx).findOne({ courseId, canvasAssignmentId });
    return assignment ? normalizeWritingAssignment(assignment) : null;
}

/**
 * createManualWritingAssignment — inserts a local assignment with a neutral rubric draft.
 *
 * Titles are trimmed and capped at 200 characters; route validation is expected
 * to reject blank input before this persistence boundary.
 *
 * @param ctx - Connected Mongo data-layer context
 * @param courseId - Course that owns the assignment
 * @param title - Staff-provided display title
 * @param instructions - Optional raw assignment directions
 * @param dueAt - Optional assignment deadline
 * @returns Newly persisted assignment
 */
export async function createManualWritingAssignment(
    ctx: MongoDalContext,
    courseId: string,
    title: string,
    instructions?: string,
    dueAt?: Date
): Promise<WritingAssignment> {
    await ensureWritingFeedbackIndexes(ctx);
    const assignment = {
        ...buildDefaultWritingAssignment(
            courseId,
            randomUUID(),
            title.trim().slice(0, 200),
            instructions?.trim() || undefined
        ),
        ...(dueAt ? { dueAt } : {})
    };
    await assignments(ctx).insertOne(assignment);
    return assignment;
}

/**
 * countWritingSubmissionsByAssignment — aggregates queue counts for one course.
 *
 * @param ctx - Connected Mongo data-layer context
 * @param courseId - Course whose submissions are counted
 * @returns Assignment-id-to-submission-count map; assignments with zero rows are omitted
 */
export async function countWritingSubmissionsByAssignment(
    ctx: MongoDalContext,
    courseId: string
): Promise<Record<string, number>> {
    const rows = await submissions(ctx).aggregate<{ _id: string; count: number }>([
        { $match: { courseId } },
        { $group: { _id: '$assignmentId', count: { $sum: 1 } } }
    ]).toArray();
    return Object.fromEntries(rows.map((row) => [row._id, row.count]));
}

/**
 * deleteWritingAssignment — deletes an empty assignment without orphaning submissions.
 *
 * @param ctx - Connected Mongo data-layer context
 * @param courseId - Owning course id
 * @param assignmentId - Assignment requested for deletion
 * @returns Deletion result and blocking submission count
 */
export async function deleteWritingAssignment(
    ctx: MongoDalContext,
    courseId: string,
    assignmentId: string
): Promise<{ deleted: boolean; submissionCount: number }> {
    // Refuse assignment deletion until staff explicitly removes every child submission.
    const submissionCount = await submissions(ctx).countDocuments({ courseId, assignmentId });
    if (submissionCount > 0) {
        return { deleted: false, submissionCount };
    }
    const result = await assignments(ctx).deleteOne({ id: assignmentId, courseId });
    return { deleted: result.deletedCount === 1, submissionCount: 0 };
}

/**
 * createCanvasWritingAssignment — idempotently creates a Canvas-mapped local assignment.
 *
 * When the Canvas assignment carried a rubric, that rubric becomes the new assignment's
 * starting grid instead of the built-in profile — it is the instructor's real rubric, and
 * {@link seedRubricForLens} treats it as taking precedence. It arrives **unapproved**, so it
 * cannot reach the model until an instructor reviews and approves it, and `rubricSource`
 * records where it came from.
 *
 * A duplicate course/Canvas mapping resolves to the existing local record;
 * unrelated insert failures propagate unchanged.
 *
 * @param ctx - Connected Mongo data-layer context
 * @param courseId - Course that owns the imported assignment
 * @param canvasAssignmentId - Stable Canvas assignment identifier
 * @param title - Canvas assignment title, trimmed and capped at 200 characters
 * @param instructions - Optional source assignment directions
 * @param dueAt - Optional Canvas deadline
 * @param canvasRubric - Canvas rubric grid, when it could be represented as a draft
 * @returns Newly inserted or concurrently existing assignment
 * @throws Non-duplicate MongoDB errors
 */
export async function createCanvasWritingAssignment(
    ctx: MongoDalContext,
    courseId: string,
    canvasAssignmentId: string,
    title: string,
    instructions?: string,
    dueAt?: Date,
    canvasRubric?: ImportedRubricShape
): Promise<WritingAssignment> {
    await ensureWritingFeedbackIndexes(ctx);
    const now = new Date();
    const base = buildDefaultWritingAssignment(
        courseId,
        randomUUID(),
        title.trim().slice(0, 200),
        instructions?.trim() || undefined,
        now
    );
    const assignment: WritingAssignment = {
        ...base,
        ...(canvasRubric
            ? {
                  rubric: seedRubricForLens({ lens: 'linguistic', actorUserId: 'platform', canvasRubric, now }),
                  rubricSource: 'canvas' as const
              }
            : {}),
        canvasAssignmentId,
        ...(dueAt ? { dueAt } : {})
    };
    try {
        await assignments(ctx).insertOne(assignment);
        return assignment;
    } catch (error) {
        // Reconcile unique-index races to the canonical mapping instead of duplicating imports.
        if (typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 11000) {
            const existing = await getWritingAssignmentByCanvasId(ctx, courseId, canvasAssignmentId);
            if (existing) return existing;
        }
        throw error;
    }
}

/**
 * saveWritingRubricDraft — replaces only the editable draft for one lens on an assignment.
 *
 * The approved rubric and history remain unchanged until a separate approval.
 * Each lens owns independent draft/approved/history fields (see `rubric-lens.ts`),
 * so saving one lens's draft never touches the other lens's rubric state.
 *
 * @param ctx - Connected Mongo data-layer context
 * @param courseId - Owning course id
 * @param assignmentId - Assignment receiving the draft
 * @param draft - Validated staff-authored rubric draft
 * @param lens - Feedback lens the draft belongs to; defaults to `'linguistic'`
 * @returns Updated assignment, or `null` when the scoped assignment is absent
 */
export async function saveWritingRubricDraft(
    ctx: MongoDalContext,
    courseId: string,
    assignmentId: string,
    draft: WritingRubricDefinition,
    lens: WritingFeedbackLens = 'linguistic'
): Promise<WritingAssignment | null> {
    const fields = rubricFieldPaths(lens);
    const updated = await assignments(ctx).findOneAndUpdate(
        { id: assignmentId, courseId },
        { $set: { [fields.draft]: draft, updatedAt: new Date() } },
        { returnDocument: 'after' }
    );
    return updated ? normalizeWritingAssignment(updated) : null;
}

/**
 * discardWritingRubricDraft — removes one lens's editable draft without changing active behavior.
 *
 * @param ctx - Connected Mongo data-layer context
 * @param courseId - Owning course id
 * @param assignmentId - Assignment whose draft is discarded
 * @param lens - Feedback lens whose draft is discarded; defaults to `'linguistic'`
 * @returns Updated assignment, or `null` when the scoped assignment is absent
 */
export async function discardWritingRubricDraft(
    ctx: MongoDalContext,
    courseId: string,
    assignmentId: string,
    lens: WritingFeedbackLens = 'linguistic'
): Promise<WritingAssignment | null> {
    const fields = rubricFieldPaths(lens);
    const updated = await assignments(ctx).findOneAndUpdate(
        { id: assignmentId, courseId },
        { $unset: { [fields.draft]: '' }, $set: { updatedAt: new Date() } },
        { returnDocument: 'after' }
    );
    return updated ? normalizeWritingAssignment(updated) : null;
}

/**
 * approveWritingRubricDraft — atomically promotes the expected draft version for one lens.
 *
 * The previously approved rubric for that lens is appended to its history.
 * Version predicates prevent a stale reviewer from overwriting a concurrently
 * changed rubric. A lens with no prior approval (the technical lens on a
 * freshly toggled lab report) has no approved-version predicate to guard —
 * that guard applies only once an approved rubric already exists for the
 * lens. `gradeMapping` is linguistic-only: it is never read or written for
 * the technical lens, regardless of what the caller passes.
 *
 * @param ctx - Connected Mongo data-layer context
 * @param courseId - Owning course id
 * @param assignmentId - Assignment whose draft is being approved
 * @param approvedRubric - Approved form of the currently persisted draft
 * @param gradeMapping - Optional complete ordinal-to-points mapping (linguistic lens only)
 * @param lens - Feedback lens being approved; defaults to `'linguistic'`
 * @returns Updated assignment, or `null` for missing/stale draft state
 */
export async function approveWritingRubricDraft(
    ctx: MongoDalContext,
    courseId: string,
    assignmentId: string,
    approvedRubric: WritingRubricDefinition,
    gradeMapping?: WritingAssignment['gradeMapping'],
    lens: WritingFeedbackLens = 'linguistic'
): Promise<WritingAssignment | null> {
    const fields = rubricFieldPaths(lens);
    const current = await assignments(ctx).findOne({ id: assignmentId, courseId });
    const currentDraft = current?.[fields.draft as 'rubricDraft'] as WritingRubricDefinition | undefined;
    if (!currentDraft || currentDraft.version !== approvedRubric.version) return null;
    const currentApproved = current?.[fields.approved as 'rubric'] as WritingRubricDefinition | undefined;

    // Archive only a previously approved rubric; an initial template is an unapproved draft.
    const update: UpdateFilter<WritingAssignment> = {
        $set: {
            [fields.approved]: approvedRubric,
            updatedAt: new Date(),
            // Only the linguistic rubric drives the released numeric grade today.
            ...(lens === 'linguistic' && gradeMapping ? { gradeMapping } : {})
        },
        ...(currentApproved?.status === 'approved' ? { $push: { [fields.history]: currentApproved } } : {}),
        $unset: {
            [fields.draft]: '',
            ...(lens === 'linguistic' && !gradeMapping ? { gradeMapping: '' } : {})
        }
    } as UpdateFilter<WritingAssignment>;

    const updated = await assignments(ctx).findOneAndUpdate(
        {
            id: assignmentId,
            courseId,
            // A never-approved lens has no version to guard; guard it once one exists.
            ...(currentApproved ? { [`${fields.approved}.version`]: currentApproved.version } : {}),
            [`${fields.draft}.version`]: approvedRubric.version
        },
        update,
        { returnDocument: 'after' }
    );
    return updated ? normalizeWritingAssignment(updated) : null;
}

/**
 * setWritingAssignmentLabReport — marks or clears an assignment as a lab report.
 *
 * Seeding and clearing rules live in the service; this delegate performs only the
 * course-scoped write.
 *
 * @param ctx - Connected Mongo data-layer context
 * @param courseId - Owning course id
 * @param assignmentId - Assignment being marked
 * @param isLabReport - Whether the assignment receives technical feedback
 * @returns Updated assignment, or `null` when the scoped assignment is absent
 */
export async function setWritingAssignmentLabReport(
    ctx: MongoDalContext,
    courseId: string,
    assignmentId: string,
    isLabReport: boolean
): Promise<WritingAssignment | null> {
    const updated = await assignments(ctx).findOneAndUpdate(
        { id: assignmentId, courseId },
        { $set: { isLabReport, updatedAt: new Date() } },
        { returnDocument: 'after' }
    );
    return updated ? normalizeWritingAssignment(updated) : null;
}

/**
 * mapWritingAssignmentToCanvas — attaches a Canvas assignment id to a local assignment.
 *
 * The unique course/Canvas index rejects mappings already owned by another
 * assignment; this function does not alter rubric provenance.
 *
 * @param ctx - Connected Mongo data-layer context
 * @param courseId - Owning course id
 * @param assignmentId - Local assignment id
 * @param canvasAssignmentId - Canvas assignment id to persist
 * @returns Updated assignment, or `null` when the scoped assignment is absent
 * @throws MongoDB duplicate-key error when the mapping is already in use
 */
export async function mapWritingAssignmentToCanvas(
    ctx: MongoDalContext,
    courseId: string,
    assignmentId: string,
    canvasAssignmentId: string
): Promise<WritingAssignment | null> {
    const updated = await assignments(ctx).findOneAndUpdate(
        { id: assignmentId, courseId },
        { $set: { canvasAssignmentId, updatedAt: new Date() } },
        { returnDocument: 'after' }
    );
    return updated ? normalizeWritingAssignment(updated) : null;
}

/**
 * saveCanvasAssignmentDetails — stores the assignment brief imported from Canvas.
 *
 * Only the brief. The Canvas *rubric* is not stored beside the assignment: it seeds the
 * assignment's first rubric draft at creation, so there is exactly one rubric concept and no
 * second copy to reconcile.
 *
 * A re-import refreshes the brief, because an instructor who edited the assignment in Canvas
 * expects the current text. It deliberately does not touch `rubric` or `rubricDraft` — once a
 * draft exists it carries staff edits, and silently replacing it from Canvas would discard
 * their work.
 *
 * @param ctx - Connected Mongo data-layer context
 * @param courseId - Course that owns the assignment
 * @param assignmentId - Local assignment receiving the brief
 * @param details - Imported assignment brief
 * @returns Updated assignment, or `null` when it does not exist
 */
export async function saveCanvasAssignmentDetails(
    ctx: MongoDalContext,
    courseId: string,
    assignmentId: string,
    details: CanvasAssignmentDetails
): Promise<WritingAssignment | null> {
    return assignments(ctx).findOneAndUpdate(
        { id: assignmentId, courseId },
        { $set: { canvasDetails: details, updatedAt: new Date() } },
        { returnDocument: 'after' }
    );
}


/**
 * createWritingSubmission — appends a course-scoped review submission.
 *
 * The unique assignment/student/attempt index makes duplicate intake fail
 * explicitly; submission text remains in this restricted Writing Feedback path.
 *
 * @param ctx - Connected Mongo data-layer context
 * @param input - Validated submission fields excluding server provenance
 * @returns Newly persisted submission with generated id and timestamps
 * @throws MongoDB duplicate-key error for repeated student attempts
 */
export async function createWritingSubmission(
    ctx: MongoDalContext,
    input: Omit<WritingSubmission, 'id' | 'createdAt' | 'updatedAt'>
): Promise<WritingSubmission> {
    await ensureWritingFeedbackIndexes(ctx);
    const now = new Date();
    const submission: WritingSubmission = { ...input, id: randomUUID(), createdAt: now, updatedAt: now };
    await submissions(ctx).insertOne(submission);
    return submission;
}

/**
 * getWritingSubmission — retrieves one submission and its staff review history.
 *
 * @param ctx - Connected Mongo data-layer context
 * @param courseId - Owning course id
 * @param submissionId - Internal submission id
 * @returns Scoped submission detail, or `null`
 */
export async function getWritingSubmission(ctx: MongoDalContext, courseId: string, submissionId: string): Promise<(WritingSubmission & { reviews?: StaffReviewRevision[]; approvedAt?: Date; approvedBy?: string }) | null> {
    return submissions(ctx).findOne({ id: submissionId, courseId });
}

/**
 * deleteWritingSubmission — deletes a scoped submission and its dependent workflow records.
 *
 * Deletion is allowed at any status. Child cleanup starts only after the
 * course-scoped parent delete succeeds, preventing cross-course cascades.
 *
 * @param ctx - Connected Mongo data-layer context
 * @param courseId - Owning course id
 * @param submissionId - Submission requested for deletion
 * @returns `true` when the parent and dependents were removed; otherwise `false`
 */
export async function deleteWritingSubmission(
    ctx: MongoDalContext,
    courseId: string,
    submissionId: string
): Promise<boolean> {
    const result = await submissions(ctx).deleteOne({ id: submissionId, courseId });
    if (result.deletedCount !== 1) return false;

    // Cascade immutable runs, release attempts, and queued work after validating ownership.
    await Promise.all([
        runs(ctx).deleteMany({ submissionId }),
        releases(ctx).deleteMany({ submissionId }),
        jobs(ctx).deleteMany({ 'payload.submissionId': submissionId })
    ]);
    return true;
}

/**
 * listWritingSubmissions — returns an assignment's review queue, newest first.
 *
 * @param ctx - Connected Mongo data-layer context
 * @param courseId - Owning course id
 * @param assignmentId - Assignment whose queue is requested
 * @returns Course- and assignment-scoped submissions with embedded review history
 */
export async function listWritingSubmissions(
    ctx: MongoDalContext,
    courseId: string,
    assignmentId: string
): Promise<Array<WritingSubmission & { reviews?: StaffReviewRevision[]; approvedAt?: Date; approvedBy?: string }>> {
    return submissions(ctx).find({ courseId, assignmentId }).sort({ updatedAt: -1 }).toArray();
}

/**
 * updateVerifiedWritingText — accepts staff-verified extraction text for generation.
 *
 * Verification clears the blocking flag and returns the submission to imported
 * state; it does not delete the original extraction.
 *
 * @param ctx - Connected Mongo data-layer context
 * @param courseId - Owning course id
 * @param submissionId - Submission being verified
 * @param verifiedText - Staff-confirmed source text
 * @returns Updated submission, or `null` when the scoped record is absent
 */
export async function updateVerifiedWritingText(
    ctx: MongoDalContext,
    courseId: string,
    submissionId: string,
    verifiedText: string
) {
    return submissions(ctx).findOneAndUpdate(
        { id: submissionId, courseId },
        { $set: { verifiedText, requiresVerification: false, status: 'imported', updatedAt: new Date() } },
        { returnDocument: 'after' }
    );
}

/**
 * setWritingSubmissionStatus — transitions a scoped submission to a service-selected status.
 *
 * Business transition validation belongs to `WritingFeedbackService`; this
 * delegate performs the narrow persistence update and refreshes `updatedAt`.
 *
 * @param ctx - Connected Mongo data-layer context
 * @param courseId - Owning course id
 * @param submissionId - Submission to update
 * @param status - Valid Writing Feedback workflow status
 * @returns Updated submission, or `null` when the scoped record is absent
 */
export async function setWritingSubmissionStatus(
    ctx: MongoDalContext,
    courseId: string,
    submissionId: string,
    status: WritingSubmissionStatus
) {
    return submissions(ctx).findOneAndUpdate(
        { id: submissionId, courseId },
        { $set: { status, updatedAt: new Date() } },
        { returnDocument: 'after' }
    );
}

/**
 * createWritingFeedbackRun — appends immutable model-output provenance.
 *
 * Existing runs are never updated or replaced; subsequent generation creates a
 * new record that remains tied to its rubric and verified-text fingerprint.
 *
 * @param ctx - Connected Mongo data-layer context
 * @param input - Completed run data excluding server id and creation time
 * @returns Newly persisted feedback run
 */
export async function createWritingFeedbackRun(
    ctx: MongoDalContext,
    input: Omit<WritingFeedbackRun, 'id' | 'createdAt'>
): Promise<WritingFeedbackRun> {
    const run: WritingFeedbackRun = { ...input, id: randomUUID(), createdAt: new Date() };
    await runs(ctx).insertOne(run);
    return run;
}

/**
 * getLatestWritingFeedbackRun — retrieves the newest generated run for a submission and lens.
 *
 * Runs written before two-lens generation carry no `lens` field at all; those
 * legacy records are treated as linguistic so they keep surfacing as the
 * latest linguistic run instead of silently disappearing from history.
 *
 * @param ctx - Connected Mongo data-layer context
 * @param submissionId - Submission whose model provenance is requested
 * @param lens - Feedback lens whose latest run is requested; defaults to `'linguistic'`
 * @returns Most recent run for the lens, or `null` when feedback has not been generated
 */
export async function getLatestWritingFeedbackRun(
    ctx: MongoDalContext,
    submissionId: string,
    lens: WritingFeedbackLens = 'linguistic'
): Promise<WritingFeedbackRun | null> {
    const lensFilter: Filter<WritingFeedbackRun> = lens === 'linguistic'
        ? { $or: [{ lens: 'linguistic' }, { lens: { $exists: false } }] }
        : { lens };
    return runs(ctx).find({ submissionId, ...lensFilter }).sort({ createdAt: -1 }).limit(1).next();
}

/**
 * countWritingFeedbackRunsByLens — reports whether one lens has ever produced a run.
 *
 * `getLatestWritingFeedbackRun` answers per-submission; unmarking a lab report
 * needs an assignment-scoped answer, because its technical criterion ids may
 * be referenced by runs across many submissions.
 *
 * @param ctx - Connected Mongo data-layer context
 * @param courseId - Owning course id
 * @param assignmentId - Assignment being inspected
 * @param lens - Lens whose runs are counted
 * @returns Number of stored runs for that assignment and lens
 */
export async function countWritingFeedbackRunsByLens(
    ctx: MongoDalContext,
    courseId: string,
    assignmentId: string,
    lens: WritingFeedbackLens
): Promise<number> {
    return runs(ctx).countDocuments({ courseId, assignmentId, lens });
}

function normalizeGlossaryTerm(term: string): string {
    return term.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

/**
 * listWritingGlossaryEntries — returns reusable course glossary entries.
 *
 * @param ctx - Connected Mongo data-layer context
 * @param courseId - Owning course id
 * @param search - Optional term/definition substring filter
 * @returns Course-scoped glossary entries ordered by term
 */
export async function listWritingGlossaryEntries(
    ctx: MongoDalContext,
    courseId: string,
    search?: string
): Promise<WritingGlossaryEntry[]> {
    await ensureWritingFeedbackIndexes(ctx);
    const filter: Filter<WritingGlossaryEntry> = { courseId };
    const query = search?.trim();
    if (query) {
        filter.$or = [
            { term: { $regex: query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
            { definition: { $regex: query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }
        ];
    }
    return glossary(ctx).find(filter).sort({ normalizedTerm: 1 }).limit(100).toArray();
}

/**
 * createWritingGlossaryEntry — inserts a course-scoped reusable definition.
 *
 * @param ctx - Connected Mongo data-layer context
 * @param input - Validated term, definition, course, and actor
 * @returns Newly persisted glossary entry
 * @throws MongoDB duplicate-key error when the normalized term already exists
 */
export async function createWritingGlossaryEntry(
    ctx: MongoDalContext,
    input: { courseId: string; term: string; definition: string; actorUserId: string }
): Promise<WritingGlossaryEntry> {
    await ensureWritingFeedbackIndexes(ctx);
    const now = new Date();
    const entry: WritingGlossaryEntry = {
        id: randomUUID(),
        courseId: input.courseId,
        term: input.term.trim().replace(/\s+/g, ' '),
        normalizedTerm: normalizeGlossaryTerm(input.term),
        definition: input.definition.trim(),
        version: 1,
        createdAt: now,
        createdBy: input.actorUserId,
        updatedAt: now,
        updatedBy: input.actorUserId
    };
    await glossary(ctx).insertOne(entry);
    return entry;
}

/**
 * updateWritingGlossaryEntry — version-checked update for a reusable definition.
 *
 * The expected version prevents a stale editor from overwriting a newer staff
 * definition. Version increments on any successful term or definition change.
 *
 * @param ctx - Connected Mongo data-layer context
 * @param courseId - Owning course id
 * @param entryId - Glossary entry being updated
 * @param update - New term/definition plus expected version and actor
 * @returns Updated entry, or `null` when the id/version predicate fails
 * @throws MongoDB duplicate-key error when the normalized term is already used
 */
export async function updateWritingGlossaryEntry(
    ctx: MongoDalContext,
    courseId: string,
    entryId: string,
    update: { term: string; definition: string; expectedVersion: number; actorUserId: string }
): Promise<WritingGlossaryEntry | null> {
    await ensureWritingFeedbackIndexes(ctx);
    const updated = await glossary(ctx).findOneAndUpdate(
        { id: entryId, courseId, version: update.expectedVersion },
        {
            $set: {
                term: update.term.trim().replace(/\s+/g, ' '),
                normalizedTerm: normalizeGlossaryTerm(update.term),
                definition: update.definition.trim(),
                updatedAt: new Date(),
                updatedBy: update.actorUserId
            },
            $inc: { version: 1 }
        },
        { returnDocument: 'after' }
    );
    return updated;
}

/**
 * appendWritingReview — appends an immutable staff-authored revision.
 *
 * Every edit receives a new id and timestamp. Appending a revision invalidates
 * prior approval by returning the submission to `draft_ready`.
 *
 * @param ctx - Connected Mongo data-layer context
 * @param courseId - Owning course id
 * @param submissionId - Submission under review
 * @param revision - Validated revision fields excluding server provenance
 * @returns Newly constructed revision
 */
export async function appendWritingReview(
    ctx: MongoDalContext,
    courseId: string,
    submissionId: string,
    revision: Omit<StaffReviewRevision, 'id' | 'createdAt' | 'submissionId'>
) {
    const stored: StaffReviewRevision = {
        ...revision,
        id: randomUUID(),
        submissionId,
        createdAt: new Date()
    };

    // Append rather than replace so staff edits retain a complete audit trail.
    await submissions(ctx).updateOne(
        { id: submissionId, courseId },
        {
            $push: { reviews: stored },
            // Any staff edit after approval requires a new explicit approval.
            $set: { status: 'draft_ready', updatedAt: new Date() }
        }
    );
    return stored;
}

/**
 * approveWritingSubmission — records explicit staff approval of a draft-ready revision.
 *
 * The status predicate prevents approving missing, stale, or already released
 * records. `staffName` is optional display provenance for PDF comments, never a PUID.
 *
 * @param ctx - Connected Mongo data-layer context
 * @param courseId - Owning course id
 * @param submissionId - Draft-ready submission
 * @param staffUserId - Internal approving staff user id
 * @param staffName - Optional roster display name
 * @returns Approved submission, or `null` when the status predicate fails
 */
export async function approveWritingSubmission(ctx: MongoDalContext, courseId: string, submissionId: string, staffUserId: string, staffName?: string) {
    return submissions(ctx).findOneAndUpdate(
        { id: submissionId, courseId, status: 'draft_ready' },
        {
            $set: {
                status: 'approved',
                approvedAt: new Date(),
                approvedBy: staffUserId,
                // Captured for the annotated-PDF popup author; roster display name, never a PUID.
                ...(staffName?.trim() ? { approvedByName: staffName.trim() } : {}),
                updatedAt: new Date()
            }
        },
        { returnDocument: 'after' }
    );
}

/**
 * createWritingRelease — inserts a release attempt with immutable payload provenance.
 *
 * The unique fingerprint index rejects duplicate payloads; callers should first
 * reconcile with {@link findWritingReleaseByFingerprint}.
 *
 * @param ctx - Connected Mongo data-layer context
 * @param release - Release state excluding server id and timestamps
 * @returns Newly persisted release attempt
 * @throws MongoDB duplicate-key error when the payload was already recorded
 */
export async function createWritingRelease(ctx: MongoDalContext, release: Omit<WritingRelease, 'id' | 'createdAt' | 'updatedAt'>): Promise<WritingRelease> {
    const now = new Date();
    const stored: WritingRelease = { ...release, id: randomUUID(), createdAt: now, updatedAt: now };
    await releases(ctx).insertOne(stored);
    return stored;
}

/**
 * findWritingReleaseByFingerprint — reconciles a release retry to prior state.
 *
 * @param ctx - Connected Mongo data-layer context
 * @param payloadFingerprint - Stable hash of the outbound release payload
 * @returns Existing release attempt, or `null`
 */
export async function findWritingReleaseByFingerprint(ctx: MongoDalContext, payloadFingerprint: string): Promise<WritingRelease | null> {
    return releases(ctx).findOne({ payloadFingerprint });
}

/**
 * finalizeWritingRelease — updates provider identifiers for one fingerprinted attempt.
 *
 * @param ctx - Connected Mongo data-layer context
 * @param payloadFingerprint - Stable payload hash identifying the attempt
 * @param update - Final status and returned Canvas identifiers
 * @returns Updated release, or `null` when the fingerprint is unknown
 */
export async function finalizeWritingRelease(
    ctx: MongoDalContext,
    payloadFingerprint: string,
    update: Pick<WritingRelease, 'status' | 'canvasCommentId' | 'canvasSubmissionId'>
): Promise<WritingRelease | null> {
    return releases(ctx).findOneAndUpdate(
        { payloadFingerprint },
        { $set: { ...update, updatedAt: new Date() } },
        { returnDocument: 'after' }
    );
}

/**
 * enqueueWritingJob — appends a retry-bounded background job.
 *
 * @param ctx - Connected Mongo data-layer context
 * @param job - Queued job fields excluding server provenance and attempt count
 * @returns Newly persisted job with zero attempts
 */
export async function enqueueWritingJob(ctx: MongoDalContext, job: Omit<WritingJob, 'id' | 'createdAt' | 'updatedAt' | 'attempts'>): Promise<WritingJob> {
    const now = new Date();
    const stored: WritingJob = { ...job, id: randomUUID(), attempts: 0, createdAt: now, updatedAt: now };
    await jobs(ctx).insertOne(stored);
    return stored;
}

/**
 * findActiveWritingJob — finds queued or leased work for one submission/type.
 *
 * Used by the generate endpoint to make duplicate clicks idempotent while
 * allowing completed or terminally failed jobs to remain historical records.
 *
 * @param ctx - Connected Mongo data-layer context
 * @param courseId - Owning course id
 * @param submissionId - Submission pointer stored in the job payload
 * @param type - Worker handler type
 * @returns Active job, or `null` when none is queued/leased
 */
export async function findActiveWritingJob(
    ctx: MongoDalContext,
    courseId: string,
    submissionId: string,
    type: WritingJob['type']
): Promise<WritingJob | null> {
    return jobs(ctx).findOne({
        courseId,
        type,
        'payload.submissionId': submissionId,
        state: { $in: ['queued', 'leased'] }
    });
}

/**
 * leaseNextWritingJob — atomically claims the oldest runnable job.
 *
 * Queued jobs and expired leases are eligible only while attempts remain.
 * `findOneAndUpdate` performs selection, lease assignment, and attempt increment
 * atomically so concurrent workers cannot claim the same lease.
 *
 * @param ctx - Connected Mongo data-layer context
 * @param leaseMs - Lease duration before another worker may reclaim the job
 * @returns Claimed job, or `null` when no runnable work exists
 */
export async function leaseNextWritingJob(ctx: MongoDalContext, leaseMs: number = 60_000): Promise<WritingJob | null> {
    const now = new Date();

    // Claim and increment in one database operation to enforce single-worker ownership.
    return jobs(ctx).findOneAndUpdate(
        {
            $expr: { $lt: ['$attempts', '$maxAttempts'] },
            $or: [
                { state: 'queued' },
                { state: 'leased', leaseUntil: { $lte: now } }
            ]
        },
        { $set: { state: 'leased', leaseUntil: new Date(now.getTime() + leaseMs), updatedAt: now }, $inc: { attempts: 1 } },
        { sort: { createdAt: 1 }, returnDocument: 'after' }
    );
}

/**
 * completeWritingJob — marks a currently leased job completed and clears its lease.
 *
 * @param ctx - Connected Mongo data-layer context
 * @param jobId - Internal job id
 * @returns When the conditional update completes; missing/non-leased jobs are unchanged
 */
export async function completeWritingJob(ctx: MongoDalContext, jobId: string): Promise<void> {
    await jobs(ctx).updateOne(
        { id: jobId, state: 'leased' },
        { $set: { state: 'completed', updatedAt: new Date() }, $unset: { leaseUntil: '' } }
    );
}

/**
 * failWritingJob — requeues retryable work or records terminal failure.
 *
 * Only a leased job is changed. Error text must already be sanitized because
 * submission content, prompts, and provider secrets cannot enter job records.
 *
 * @param ctx - Connected Mongo data-layer context
 * @param job - Leased job snapshot containing current and maximum attempts
 * @param sanitizedError - Content-safe diagnostic for staff operations
 * @returns When the conditional state transition completes
 */
export async function failWritingJob(ctx: MongoDalContext, job: WritingJob, sanitizedError: string): Promise<void> {
    const terminal = job.attempts >= job.maxAttempts;

    // Release the lease and choose a terminal or retryable state from the attempt budget.
    await jobs(ctx).updateOne(
        { id: job.id, state: 'leased' },
        {
            $set: {
                state: terminal ? 'failed' : 'queued',
                sanitizedError,
                updatedAt: new Date()
            },
            $unset: { leaseUntil: '' }
        }
    );
}
