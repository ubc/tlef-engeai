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
}

/** Server-local reviewed operations. A restart deliberately requires a fresh preview. */
const preparedReleases = new Map<string, PreparedRelease>();

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
        private readonly updateRelease: (fingerprint: string, update: ReleaseUpdate) => Promise<WritingRelease | null>
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
        const primary = input.artifacts.find((artifact) => artifact.kind === 'writing')!;
        const feedbackBatch: FeedbackBatch = {
            courseId: this.canvasCourseId,
            gradeItemId: assignmentId,
            maxBytesPerFile: MAX_PDF_BYTES,
            writes: [{
                feedbackId: payloadFingerprint,
                userId,
                attempt: input.submission.attempt,
                filename: primary.filename,
                data: primary.data,
                textComment: 'Your approved writing feedback is attached.'
            }],
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
            feedbackPreflight
        });

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
            postManually: gradePreflight.postManually
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
            });
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
            const definite = error instanceof canvas.CanvasApiError;
            const updated = await this.updateRelease(fingerprint, {
                status: definite ? 'failed' : 'reconciliation_required',
                failureStage: 'feedback',
                sanitizedError: definite
                    ? 'Canvas rejected the feedback comment'
                    : 'Canvas feedback comment outcome is unknown',
                canvasFileIds: fileIds
            });
            if (!updated) throw new Error('Release reconciliation record was not found');
            return updated;
        }

        const updated = await this.updateRelease(fingerprint, {
            status: 'feedback_attached',
            canvasFileIds: fileIds,
            failureStage: undefined,
            sanitizedError: undefined
        });
        if (!updated) throw new Error('Release reconciliation record was not found');
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
            const uncertain = !(error instanceof canvas.CanvasGradeExportError)
                && !(error instanceof canvas.CanvasApiError);
            const updated = await this.updateRelease(fingerprint, {
                status: uncertain ? 'reconciliation_required' : 'failed',
                failureStage: 'grade',
                sanitizedError: uncertain ? 'Canvas grade write outcome is unknown' : 'Canvas rejected the grade write'
            });
            if (!updated) throw new Error('Release reconciliation record was not found');
            return updated;
        }

        const queued = await this.updateRelease(fingerprint, {
            status: 'grade_queued',
            canvasProgressId: posted.progressId,
            postManually: posted.postManually,
            failureStage: undefined,
            sanitizedError: undefined
        });
        if (!queued) throw new Error('Release reconciliation record was not found');
        return this.finishProgress(fingerprint, posted.progressId);
    }

    private async finishProgress(fingerprint: string, progressId: string): Promise<WritingRelease> {
        try {
            const progress = await canvas.waitForProgress(this.client, progressId, { timeoutMs: 60_000 });
            const updated = await this.updateRelease(fingerprint, progress.workflowState === 'completed'
                ? { status: 'released', failureStage: undefined, sanitizedError: undefined }
                : { status: 'failed', failureStage: 'progress', sanitizedError: 'Canvas grade job failed' });
            if (!updated) throw new Error('Release reconciliation record was not found');
            if (updated.status === 'released') preparedReleases.delete(fingerprint);
            return updated;
        } catch {
            const updated = await this.updateRelease(fingerprint, {
                status: 'reconciliation_required',
                failureStage: 'progress',
                sanitizedError: 'Canvas grade job did not reach a confirmed result'
            });
            if (!updated) throw new Error('Release reconciliation record was not found');
            return updated;
        }
    }
}
