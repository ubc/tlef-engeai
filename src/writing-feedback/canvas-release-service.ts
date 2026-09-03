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
    CanvasReleaseInput,
    CanvasReleaseService,
    WritingRelease,
    WritingReleasePayload
} from './contracts';

/**
 * computeReleaseFingerprint — stable idempotency key for one released payload.
 *
 * Hashes only what changes what a student receives. The rendered PDF is excluded
 * on purpose: each render stamps fresh annotation identifiers and timestamps, so a
 * byte hash would make every retry look like new content and duplicate the external
 * write. Optional fields are length-prefixed and absence is encoded distinctly from
 * an empty string, so no two different payloads can serialize identically.
 *
 * @param payload - Semantic description of the release
 * @returns Hex SHA-256 digest usable as a persisted idempotency key
 */
export function computeReleaseFingerprint(payload: WritingReleasePayload): string {
    const field = (value: string | number | undefined): string =>
        value === undefined ? '\0-' : `\0${String(value).length}:${String(value)}`;
    return createHash('sha256')
        .update('writing-release-v2')
        .update(field(payload.submissionId))
        .update(field(payload.feedbackRunId))
        .update(field(payload.rubricVersion))
        .update(field(payload.grade))
        .update(field(payload.studentFeedback))
        .update(field(payload.technicalFeedbackRunId))
        .update(field(payload.finalAssessment
            ? JSON.stringify({
                ...payload.finalAssessment,
                criteria: [...payload.finalAssessment.criteria]
                    .sort((left, right) => left.criterionId.localeCompare(right.criterionId))
            })
            : undefined))
        .digest('hex');
}

/** Local adapter used until a scoped Canvas OAuth connection is approved. */
export class MockCanvasGateway implements CanvasGateway {
    /** Returns deterministic synthetic Canvas identifiers for local workflow testing. */
    async release(input: {
        submissionId: string;
        artifacts: CanvasReleaseInput['artifacts'];
        grade: number;
        payloadFingerprint: string;
    }): Promise<{ canvasCommentId: string; canvasSubmissionId: string }> {
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
            update: Partial<Omit<WritingRelease, 'id' | 'courseId' | 'submissionId' | 'feedbackRunId' | 'rubricVersion' | 'payloadFingerprint' | 'createdAt' | 'updatedAt'>>
        ) => Promise<WritingRelease | null>
    ) {}

    /**
     * Persists or reuses a release preview identified by the exact payload fingerprint.
     *
     * @param input - Rubric context and student-safe PDF payload
     * @returns Existing or newly persisted preview record
     */
    async preview(input: CanvasReleaseInput): Promise<WritingRelease> {
        const grade = input.finalAssessment?.totalPoints;
        const payloadFingerprint = computeReleaseFingerprint({
            submissionId: input.submission.id,
            feedbackRunId: input.feedbackRun.id,
            rubricVersion: input.feedbackRun.rubricVersion,
            grade,
            studentFeedback: input.studentFeedback,
            technicalFeedbackRunId: input.technicalFeedbackRun?.id,
            finalAssessment: input.finalAssessment
        });
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
            grade,
            integration: 'mock_canvas'
        });
    }

    /**
     * Releases an approved, numerically mapped payload exactly once.
     *
     * @param input - Submission, rubric context, immutable run, and student-safe PDF
     * @returns Finalized release or the prior terminal record on retry
     * @throws Error when approval/mapping is missing or reconciliation cannot be persisted
     */
    async release(input: CanvasReleaseInput): Promise<WritingRelease> {
        if (input.submission.status !== 'approved') throw new Error('Staff approval is required before Canvas release');
        const grade = input.finalAssessment?.totalPoints;
        if (grade === undefined) throw new Error('Numeric release is blocked until staff save a complete final rubric assessment');
        const preview = await this.preview(input);
        // A terminal fingerprint is authoritative; never repeat the external write.
        if (preview.status === 'released' || preview.status === 'reconciled') return preview;
        const remote = await this.gateway.release({
            submissionId: input.submission.id,
            artifacts: input.artifacts,
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
