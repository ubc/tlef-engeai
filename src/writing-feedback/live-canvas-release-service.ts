/**
 * Live Canvas release — exact-attempt PDF attachment followed by grade write-back
 *
 * Previewed bytes and toolkit preflight objects remain server-side. Canvas has no
 * comment idempotency key, so an uncertain comment response is persisted as a
 * reconciliation requirement and is never retried automatically. Grade writes
 * use Canvas's asynchronous bulk-grade endpoint and retain its progress id.
 */

import { canvas } from '@ubc/ubc-genai-toolkit-lms-integration';
import type {
    CanvasReleaseInput,
    CanvasReleaseService,
    WritingRelease,
    WritingReleasePayload
} from './contracts';
import { computeReleaseFingerprint } from './canvas-release-service';
import { planRubricWrite, rubricRefusalMessage, type RubricWritePlan } from './canvas-rubric-write';

type ApiClient = NonNullable<Parameters<typeof canvas.getCourses>[0]>;
type GradeBatch = Parameters<typeof canvas.preflightGradeExport>[1]['batch'];
type FeedbackBatch = Parameters<typeof canvas.preflightSubmissionFeedbackExport>[1]['batch'];
type GradePreflight = Awaited<ReturnType<typeof canvas.preflightGradeExport>>;
type FeedbackPreflight = Awaited<ReturnType<typeof canvas.preflightSubmissionFeedbackExport>>;

const MAX_PDF_BYTES = 10 * 1024 * 1024;
const PREPARED_TTL_MS = 30 * 60 * 1000;
const MAX_PREPARED_OPERATIONS = 500;

interface PreparedRelease {
    createdAt: number;
    courseId: string;
    assignmentId: string;
    userId: string;
    attempt: number;
    artifacts: CanvasReleaseInput['artifacts'];
    gradeBatch: GradeBatch;
    gradePreflight: GradePreflight;
    feedbackPreflight: FeedbackPreflight;
    /** Planned rubric assessment, decided at preview so a refusal happens before any write. */
    rubricPlan: RubricWritePlan;
    /** When Canvas grades from the rubric, writing the assessment already sets the grade. */
    useRubricForGrading: boolean;
}

/** Server-local reviewed operations. A restart deliberately requires a fresh preview. */
const preparedReleases = new Map<string, PreparedRelease>();

/**
 * isDefiniteRejection - whether Canvas refused a write, as opposed to leaving it unknown.
 *
 * Only a 4xx says the request was rejected and nothing changed on Canvas's side. A 5xx, a
 * timeout, a socket error, or anything that is not a Canvas API error at all leaves the outcome
 * genuinely unknown: Canvas may have created the comment, stored the rubric assessment, or
 * queued the grade before the response was lost. Calling those "failed" invites a retry that
 * would duplicate a student's feedback, so they belong in reconciliation instead.
 *
 * A 429 is deliberately uncertain too: the request may have been rejected outright, but Canvas
 * also rate-limits mid-flight, and nothing in the response distinguishes the two.
 *
 * @param error - Whatever the write threw
 * @returns True when the write definitely did not happen
 */
function isDefiniteRejection(error: unknown): boolean {
    if (!(error instanceof canvas.CanvasApiError)) return false;
    const status = error.statusCode;
    return status >= 400 && status < 500 && status !== 429 && status !== 408;
}

/**
 * States a live write may still move a release out of.
 *
 * Passed as the precondition on every status transition below, so a slow or duplicated writer
 * cannot walk a finished release backwards — the update simply does not apply, and the caller
 * sees `null` rather than silently overwriting what a student already received.
 */
const IN_FLIGHT: ReadonlyArray<WritingRelease['status']> = ['previewed', 'feedback_attached', 'grade_queued', 'failed'];

type ReleaseUpdate = Partial<Omit<WritingRelease,
    'id' | 'courseId' | 'submissionId' | 'feedbackRunId' | 'rubricVersion'
    | 'payloadFingerprint' | 'createdAt' | 'updatedAt'>>;

function releasePayload(input: CanvasReleaseInput): WritingReleasePayload {
    return {
        submissionId: input.submission.id,
        feedbackRunId: input.feedbackRun.id,
        rubricVersion: input.feedbackRun.rubricVersion,
        grade: input.finalAssessment?.totalPoints,
        studentFeedback: input.studentFeedback,
        technicalFeedbackRunId: input.technicalFeedbackRun?.id,
        finalAssessment: input.finalAssessment
    };
}

function assertPdfArtifacts(artifacts: CanvasReleaseInput['artifacts']): void {
    if (artifacts.length < 1 || artifacts.length > 2) {
        throw new Error('Canvas release requires one writing PDF and at most one technical PDF');
    }
    const kinds = new Set<string>();
    for (const artifact of artifacts) {
        if (kinds.has(artifact.kind)) throw new Error('Canvas release contains a duplicate feedback PDF');
        kinds.add(artifact.kind);
        if (!artifact.filename.toLowerCase().endsWith('.pdf') || /[/\\\u0000-\u001f\u007f]/.test(artifact.filename)) {
            throw new Error('Canvas release contains an invalid feedback PDF filename');
        }
        if (!artifact.data.length || artifact.data.length > MAX_PDF_BYTES) {
            throw new Error('Canvas release feedback PDF exceeds the 10 MB limit');
        }
        const signature = artifact.data.subarray(0, Math.min(1029, artifact.data.length)).indexOf('%PDF-');
        if (signature < 0 || signature >= 1024) {
            throw new Error('Canvas release feedback file is not a valid PDF');
        }
    }
    if (!kinds.has('writing')) throw new Error('Canvas release requires the writing feedback PDF');
}

function cleanPrepared(): void {
    const cutoff = Date.now() - PREPARED_TTL_MS;
    for (const [fingerprint, prepared] of preparedReleases) {
        if (prepared.createdAt < cutoff) preparedReleases.delete(fingerprint);
    }
    while (preparedReleases.size >= MAX_PREPARED_OPERATIONS) {
        const oldest = preparedReleases.keys().next().value as string | undefined;
        if (!oldest) break;
        preparedReleases.delete(oldest);
    }
}

function submissionPath(courseId: string, assignmentId: string, userId: string): string {
    return `/courses/${encodeURIComponent(courseId)}/assignments/${encodeURIComponent(assignmentId)}`
        + `/submissions/${encodeURIComponent(userId)}`;
}

/** Live coordinator bound to one authenticated staff member's Canvas client. */
export class LiveCanvasReleaseService implements CanvasReleaseService {
    constructor(
        private readonly client: ApiClient,
        private readonly canvasCourseId: string,
        private readonly findByFingerprint: (fingerprint: string) => Promise<WritingRelease | null>,
        private readonly saveRelease: (release: Omit<WritingRelease, 'id' | 'createdAt' | 'updatedAt'>) => Promise<WritingRelease>,
        private readonly updateRelease: (
            fingerprint: string,
            update: ReleaseUpdate,
            expectedStatuses?: ReadonlyArray<WritingRelease['status']>
        ) => Promise<WritingRelease | null>
    ) {}

    async preview(input: CanvasReleaseInput): Promise<WritingRelease> {
        const assessment = input.finalAssessment;
        if (!assessment) throw new Error('Canvas release requires a complete staff-final rubric assessment');
        if (!input.assignment.canvasAssignmentId || !input.submission.canvasUserId) {
            throw new Error('Canvas release requires a submission imported from Canvas');
        }
        assertPdfArtifacts(input.artifacts);

        const payloadFingerprint = computeReleaseFingerprint(releasePayload(input));
        const existing = await this.findByFingerprint(payloadFingerprint);
        if (existing?.status === 'released' || existing?.status === 'reconciled') return existing;

        const assignmentId = input.assignment.canvasAssignmentId;
        const userId = input.submission.canvasUserId;
        const gradeBatch: GradeBatch = {
            courseId: this.canvasCourseId,
            gradeItemId: assignmentId,
            writes: [{ userId, postedGrade: assessment.totalPoints }],
            unresolved: []
        };
        // Every artifact, so the preflight cannot drift from what attachFeedback uploads.
        const feedbackBatch: FeedbackBatch = {
            courseId: this.canvasCourseId,
            gradeItemId: assignmentId,
            maxBytesPerFile: MAX_PDF_BYTES,
            writes: input.artifacts.map((artifact) => ({
                feedbackId: `${payloadFingerprint}-${artifact.kind}`,
                userId,
                attempt: input.submission.attempt,
                filename: artifact.filename,
                data: artifact.data,
                textComment: 'Your approved writing feedback is attached.'
            })),
            unresolved: []
        };

        const [gradePreflight, feedbackPreflight] = await Promise.all([
            canvas.preflightGradeExport(this.client, {
                courseId: this.canvasCourseId,
                gradeItemId: assignmentId,
                batch: gradeBatch
            }),
            canvas.preflightSubmissionFeedbackExport(this.client, {
                courseId: this.canvasCourseId,
                gradeItemId: assignmentId,
                batch: feedbackBatch
            })
        ]);
        if (gradePreflight.maxScore === undefined || gradePreflight.maxScore !== assessment.maxPoints) {
            throw new Error('Canvas assignment points do not match the approved Writing Feedback rubric total');
        }
        if (gradePreflight.postManually !== feedbackPreflight.postManually) {
            throw new Error('Canvas returned inconsistent posting policy during release preflight');
        }

        // The instructor's live Canvas rubric, read now rather than trusted from import time.
        // The toolkit exposes no rubric API, so both of these come from the raw client.
        const liveAssignment = await this.client.get<{
            rubric?: Array<{ id?: string | number }>;
            use_rubric_for_grading?: boolean;
        }>(`/courses/${encodeURIComponent(this.canvasCourseId)}/assignments/${encodeURIComponent(assignmentId)}`);

        const rubricPlan = planRubricWrite({
            assessment,
            rubric: input.gradedRubric,
            ids: input.assignment.canvasRubricImport?.ids,
            liveCanvasCriterionIds: (liveAssignment.rubric ?? []).map((row) => String(row.id))
        });
        // A rubric that was never imported from Canvas has nothing to fill, and that is a
        // legitimate release: the total grade goes over on its own. A *broken* mapping is
        // different — it stops the release before a single Canvas write, because a partially
        // filled rubric looks complete to a student and says nothing about what is missing.
        if (rubricPlan.refusal && rubricPlan.refusal !== 'no_id_map') {
            throw new Error(rubricRefusalMessage(rubricPlan.refusal));
        }

        cleanPrepared();
        preparedReleases.set(payloadFingerprint, {
            createdAt: Date.now(),
            courseId: this.canvasCourseId,
            assignmentId,
            userId,
            attempt: input.submission.attempt,
            artifacts: input.artifacts.map((artifact) => ({ ...artifact, data: Buffer.from(artifact.data) })),
            gradeBatch,
            gradePreflight,
            feedbackPreflight,
            rubricPlan,
            useRubricForGrading: liveAssignment.use_rubric_for_grading === true
        });

        // Re-previewing the same payload keeps the record it already has — the fingerprint is
        // unique, and a queued or part-way release must not be reset to `previewed`. What the
        // re-preview is for is the prepared bytes and preflight rebuilt just above, which is
        // how the worker recovers state that a preview left in another process's memory.
        if (existing) return existing;

        return this.saveRelease({
            courseId: input.submission.courseId,
            submissionId: input.submission.id,
            feedbackRunId: input.feedbackRun.id,
            rubricVersion: input.feedbackRun.rubricVersion,
            payloadFingerprint,
            status: 'previewed',
            grade: assessment.totalPoints,
            integration: 'canvas',
            postManually: gradePreflight.postManually,
            ...(input.revision !== undefined ? { revision: input.revision } : {})
        });
    }

    async release(input: CanvasReleaseInput): Promise<WritingRelease> {
        if (input.submission.status !== 'approved') throw new Error('Staff approval is required before Canvas release');
        const fingerprint = computeReleaseFingerprint(releasePayload(input));
        let release = await this.findByFingerprint(fingerprint);
        if (!release) throw new Error('Preview this exact Canvas release before sending it');
        if (release.status === 'released' || release.status === 'reconciled') return release;
        if (release.status === 'reconciliation_required') {
            throw new Error('Canvas release requires reconciliation before it can be retried');
        }

        if (release.status === 'grade_queued' && release.canvasProgressId) {
            return this.finishProgress(fingerprint, release.canvasProgressId);
        }

        cleanPrepared();
        const prepared = preparedReleases.get(fingerprint);
        if (!prepared) throw new Error('Canvas release preview expired; preview the release again');

        if (release.status !== 'feedback_attached' && !(release.status === 'failed' && release.failureStage === 'grade')) {
            release = await this.attachFeedback(fingerprint, prepared);
            if (release.status !== 'feedback_attached') return release;
        }

        const scored = await this.writeRubricAssessment(fingerprint, prepared);
        if (scored.status !== 'feedback_attached') return scored;

        // When the Canvas rubric grades the assignment, the assessment above already set the
        // grade. Posting a total as well would overwrite it with a number Canvas did not derive.
        if (prepared.useRubricForGrading) return this.finishRubricOnlyRelease(fingerprint);
        return this.writeGrade(fingerprint, prepared);
    }

    private async attachFeedback(fingerprint: string, prepared: PreparedRelease): Promise<WritingRelease> {
        const path = submissionPath(prepared.courseId, prepared.assignmentId, prepared.userId);
        const submission = await this.client.get<{
            assignment_id?: number | string;
            user_id?: number | string;
            attempt?: number | null;
        }>(path, { include: ['submission_history'] });
        if (String(submission.assignment_id) !== prepared.assignmentId
            || String(submission.user_id) !== prepared.userId) {
            throw new Error('Canvas returned a different submission during release verification');
        }
        if (submission.attempt !== prepared.attempt) {
            throw new Error('Canvas has a newer submission attempt; regenerate and approve feedback for the current attempt');
        }

        const fileIds: string[] = [];
        try {
            for (const artifact of prepared.artifacts) {
                const uploaded = await this.client.uploadFile(`${path}/comments/files`, {
                    name: artifact.filename,
                    contentType: 'application/pdf',
                    data: artifact.data
                });
                fileIds.push(uploaded.id);
            }
        } catch {
            const updated = await this.updateRelease(fingerprint, {
                status: 'failed',
                failureStage: 'feedback',
                sanitizedError: 'Canvas PDF upload failed',
                canvasFileIds: fileIds
            }, IN_FLIGHT);
            if (!updated) throw new Error('Release reconciliation record was not found');
            return updated;
        }

        try {
            await this.client.put(path, {
                comment: {
                    file_ids: fileIds,
                    attempt: prepared.attempt,
                    text_comment: 'Your approved writing feedback is attached.'
                }
            });
        } catch (error) {
            const definite = isDefiniteRejection(error);
            const updated = await this.updateRelease(fingerprint, {
                status: definite ? 'failed' : 'reconciliation_required',
                failureStage: 'feedback',
                sanitizedError: definite
                    ? 'Canvas rejected the feedback comment'
                    : 'Canvas feedback comment outcome is unknown',
                canvasFileIds: fileIds
            }, IN_FLIGHT);
            if (!updated) throw new Error('Release reconciliation record was not found');
            return updated;
        }

        const updated = await this.updateRelease(fingerprint, {
            status: 'feedback_attached',
            canvasFileIds: fileIds,
            failureStage: undefined,
            sanitizedError: undefined
        }, IN_FLIGHT);
        if (!updated) throw new Error('Release reconciliation record was not found');
        return updated;
    }

    /**
     * Fills the instructor's Canvas rubric with the staff-final score for each criterion.
     *
     * Runs after the PDFs are attached and before any total is posted, so a student who opens
     * the rubric sees the same numbers the attached feedback explains. A definite rejection
     * fails the release; an uncertain outcome enters reconciliation rather than being retried,
     * because Canvas offers no idempotency key here either.
     */
    private async writeRubricAssessment(
        fingerprint: string,
        prepared: PreparedRelease
    ): Promise<WritingRelease> {
        const payload = prepared.rubricPlan.payload;
        if (!payload) {
            // Preview refuses on a refusal, so this is only reachable when nothing was planned.
            const unchanged = await this.updateRelease(fingerprint, {});
            if (!unchanged) throw new Error('Release reconciliation record was not found');
            return unchanged;
        }
        try {
            await this.client.put(
                submissionPath(prepared.courseId, prepared.assignmentId, prepared.userId),
                { rubric_assessment: payload }
            );
        } catch (error) {
            const definite = isDefiniteRejection(error);
            const updated = await this.updateRelease(fingerprint, {
                status: definite ? 'failed' : 'reconciliation_required',
                failureStage: 'grade',
                sanitizedError: definite
                    ? 'Canvas rejected the rubric assessment'
                    : 'Canvas rubric assessment outcome is unknown'
            }, IN_FLIGHT);
            if (!updated) throw new Error('Release reconciliation record was not found');
            return updated;
        }
        const updated = await this.updateRelease(fingerprint, { rubricAssessmentWritten: true });
        if (!updated) throw new Error('Release reconciliation record was not found');
        return updated;
    }

    /**
     * Completes a release whose grade came from the rubric assessment itself.
     *
     * Canvas derives the score when the rubric is set to grade the assignment, so there is no
     * bulk-grade job and no progress id to wait on — the release is already done.
     */
    private async finishRubricOnlyRelease(fingerprint: string): Promise<WritingRelease> {
        const updated = await this.updateRelease(fingerprint, {
            status: 'released',
            failureStage: undefined,
            sanitizedError: undefined
        }, IN_FLIGHT);
        if (!updated) throw new Error('Release reconciliation record was not found');
        preparedReleases.delete(fingerprint);
        return updated;
    }

    private async writeGrade(fingerprint: string, prepared: PreparedRelease): Promise<WritingRelease> {
        let posted: Awaited<ReturnType<typeof canvas.postGrades>>;
        try {
            posted = await canvas.postGrades(this.client, {
                courseId: prepared.courseId,
                gradeItemId: prepared.assignmentId,
                batch: prepared.gradeBatch,
                preflight: prepared.gradePreflight
            });
        } catch (error) {
            // A grade export refused before anything is sent is definite by construction: the
            // package stopped it, so Canvas never saw the write.
            const uncertain = !(error instanceof canvas.CanvasGradeExportError)
                && !isDefiniteRejection(error);
            const updated = await this.updateRelease(fingerprint, {
                status: uncertain ? 'reconciliation_required' : 'failed',
                failureStage: 'grade',
                sanitizedError: uncertain ? 'Canvas grade write outcome is unknown' : 'Canvas rejected the grade write'
            }, IN_FLIGHT);
            if (!updated) throw new Error('Release reconciliation record was not found');
            return updated;
        }

        const queued = await this.updateRelease(fingerprint, {
            status: 'grade_queued',
            canvasProgressId: posted.progressId,
            postManually: posted.postManually,
            failureStage: undefined,
            sanitizedError: undefined
        }, IN_FLIGHT);
        if (!queued) throw new Error('Release reconciliation record was not found');
        return this.finishProgress(fingerprint, posted.progressId);
    }

    private async finishProgress(fingerprint: string, progressId: string): Promise<WritingRelease> {
        try {
            const progress = await canvas.waitForProgress(this.client, progressId, { timeoutMs: 60_000 });
            const updated = await this.updateRelease(fingerprint, progress.workflowState === 'completed'
                ? { status: 'released', failureStage: undefined, sanitizedError: undefined }
                : { status: 'failed', failureStage: 'progress', sanitizedError: 'Canvas grade job failed' }, IN_FLIGHT);
            if (!updated) throw new Error('Release reconciliation record was not found');
            if (updated.status === 'released') preparedReleases.delete(fingerprint);
            return updated;
        } catch {
            const updated = await this.updateRelease(fingerprint, {
                status: 'reconciliation_required',
                failureStage: 'progress',
                sanitizedError: 'Canvas grade job did not reach a confirmed result'
            }, IN_FLIGHT);
            if (!updated) throw new Error('Release reconciliation record was not found');
            return updated;
        }
    }
}
