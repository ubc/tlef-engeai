/**
 * Safe Canvas release — preview fingerprints and idempotent external submission
 *
 * Separates a mock Canvas adapter from the release coordinator that requires staff
 * approval and an instructor-authored numeric mapping. Persistence callbacks keep
 * this service independent of Mongo while fingerprints prevent duplicate release.
 *
 * @author: @rdschrs
 * @date: 2026-07-12
 * @version: 1.0.0
 * @description: Previews, deduplicates, and finalizes approved Canvas feedback releases.
 */

import { createHash } from 'crypto';
import type {
    CanvasGateway,
    CanvasReleaseService,
    WritingAssignment,
    WritingFeedbackRun,
    WritingRelease,
    WritingSubmission
} from './contracts';
import { resolveNumericGrade } from './feedback-schema';

/** Local adapter used until a scoped Canvas OAuth connection is approved. */
export class MockCanvasGateway implements CanvasGateway {
    /** Computes the release fingerprint locally without contacting Canvas. */
    async previewRelease(input: { submissionId: string; pdf: Buffer; grade?: number }): Promise<{ payloadFingerprint: string }> {
        return { payloadFingerprint: createHash('sha256').update(input.submissionId).update(input.pdf).update(String(input.grade ?? '')).digest('hex') };
    }

    /** Returns deterministic synthetic Canvas identifiers for local workflow testing. */
    async release(input: { submissionId: string; pdf: Buffer; grade: number; payloadFingerprint: string }): Promise<{ canvasCommentId: string; canvasSubmissionId: string }> {
        return {
            canvasCommentId: `mock-comment-${input.payloadFingerprint.slice(0, 12)}`,
            canvasSubmissionId: `mock-submission-${input.submissionId}`
        };
    }
}

/**
 * Coordinates preview and release while enforcing approval, grade, and idempotency rules.
 *
 * Injected persistence callbacks own atomic storage; this class never handles OAuth
 * credentials or performs raw Canvas HTTP requests.
 */
export class SafeCanvasReleaseService implements CanvasReleaseService {
    /**
     * Creates a release coordinator over adapter and persistence callbacks.
     *
     * @param gateway - Approved or mock Canvas release adapter
     * @param findByFingerprint - Idempotency lookup for prior previews/releases
     * @param saveRelease - Persists a new preview record
     * @param finalizeRelease - Atomically records terminal remote identifiers
     */
    constructor(
        private readonly gateway: CanvasGateway,
        private readonly findByFingerprint: (fingerprint: string) => Promise<WritingRelease | null>,
        private readonly saveRelease: (release: Omit<WritingRelease, 'id' | 'createdAt' | 'updatedAt'>) => Promise<WritingRelease>,
        private readonly finalizeRelease: (
            fingerprint: string,
            update: Pick<WritingRelease, 'status' | 'canvasCommentId' | 'canvasSubmissionId'>
        ) => Promise<WritingRelease | null>
    ) {}

    /**
     * Persists or reuses a release preview identified by the exact payload fingerprint.
     *
     * @param input - Rubric context and student-safe PDF payload
     * @returns Existing or newly persisted preview record
     */
    async preview(input: { submission: WritingSubmission; assignment: WritingAssignment; feedbackRun: WritingFeedbackRun; pdf: Buffer }): Promise<WritingRelease> {
        const grade = resolveNumericGrade(input.feedbackRun.result, input.assignment.gradeMapping);
        const { payloadFingerprint } = await this.gateway.previewRelease({ submissionId: input.submission.id, pdf: input.pdf, grade });
        // Fingerprint lookup makes repeated previews and release retries reuse one record.
        const existing = await this.findByFingerprint(payloadFingerprint);
        if (existing) return existing;
        return this.saveRelease({
            courseId: input.submission.courseId,
            submissionId: input.submission.id,
            feedbackRunId: input.feedbackRun.id,
            rubricVersion: input.feedbackRun.rubricVersion,
            payloadFingerprint,
            status: 'previewed',
            grade
        });
    }

    /**
     * Releases an approved, numerically mapped payload exactly once.
     *
     * @param input - Submission, rubric context, immutable run, and student-safe PDF
     * @returns Finalized release or the prior terminal record on retry
     * @throws Error when approval/mapping is missing or reconciliation cannot be persisted
     */
    async release(input: { submission: WritingSubmission; assignment: WritingAssignment; feedbackRun: WritingFeedbackRun; pdf: Buffer }): Promise<WritingRelease> {
        if (input.submission.status !== 'approved') throw new Error('Staff approval is required before Canvas release');
        const grade = resolveNumericGrade(input.feedbackRun.result, input.assignment.gradeMapping);
        if (grade === undefined) throw new Error('Numeric release is blocked until an instructor-approved grade mapping exists');
        const preview = await this.preview(input);
        // A terminal fingerprint is authoritative; never repeat the external write.
        if (preview.status === 'released' || preview.status === 'reconciled') return preview;
        const remote = await this.gateway.release({
            submissionId: input.submission.id,
            pdf: input.pdf,
            grade,
            payloadFingerprint: preview.payloadFingerprint
        });
        const finalized = await this.finalizeRelease(preview.payloadFingerprint, {
            status: 'released',
            canvasCommentId: remote.canvasCommentId,
            canvasSubmissionId: remote.canvasSubmissionId
        });
        if (!finalized) throw new Error('Release reconciliation record was not found');
        return finalized;
    }
}
