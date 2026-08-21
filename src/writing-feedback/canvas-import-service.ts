/**
 * Safe Canvas import — gateway selection and idempotent local intake
 *
 * Holds the two local adapters — conspicuously synthetic demo data, and a fail-closed
 * unconfigured adapter — plus the orchestration that imports source text into an existing
 * assignment. Neither adapter in this file touches the network; the live one lives in
 * `canvas-live-import-gateway.ts` and is injected by the route, which is the only layer with
 * the per-request Canvas credential.
 *
 * Import is read-then-write-locally in every mode. Nothing here performs OAuth, writes a grade,
 * or sends anything back to Canvas.
 *
 * @author: @rdschrs
 * @date: 2026-07-13
 * @version: 1.1.0
 * @description: Previews and imports Canvas submissions into local records, never writing back.
 */

import { createHash } from 'crypto';
import type {
    CanvasImportAssignmentSummary,
    CanvasImportGateway,
    CanvasImportRequest,
    CanvasImportResult,
    CanvasImportStatus,
    CanvasImportStore,
    CanvasImportSubmissionPreview
} from './canvas-import-contracts';

const DEMO_ASSIGNMENTS: ReadonlyArray<CanvasImportAssignmentSummary> = [
    {
        canvasAssignmentId: 'demo-lled200-a2-description',
        title: '[Synthetic demo] Technical Description Paragraph 1',
        submissionCount: 2,
        pointsPossible: 20,
        dueAt: new Date('2026-09-22T06:59:00.000Z'),
        rubricState: 'canvas_rubric',
        synthetic: true
    },
    {
        canvasAssignmentId: 'demo-lled200-description-revision',
        title: '[Synthetic demo] Technical Description Revision',
        submissionCount: 1,
        pointsPossible: 20,
        dueAt: new Date('2026-10-06T06:59:00.000Z'),
        rubricState: 'no_canvas_rubric',
        synthetic: true
    }
];

const DEMO_SUBMISSIONS: Readonly<Record<string, ReadonlyArray<CanvasImportSubmissionPreview>>> = {
    'demo-lled200-a2-description': [
        {
            sourceRecordKey: 'synthetic-learner-a',
            canvasUserId: 'synthetic-1',
            studentLabel: '[Synthetic] Learner A',
            attempt: 1,
            submittedAt: new Date('2026-09-21T18:15:00.000Z'),
            contentKind: 'text_entry',
            attachments: [],
            synthetic: true,
            text: 'A shell-and-tube heat exchanger transfers thermal energy between two streams without mixing them. Hot fluid enters the shell and flows across metal tube walls. The walls conduct energy to cooler fluid moving inside the tubes. This arrangement provides a large surface area, which improves heat transfer while keeping the fluids separate. An operator can compare inlet and outlet temperatures to determine whether the exchanger is performing as expected. The accompanying diagram identifies the tubes, shell, inlets, outlets, and direction of flow for a reader who has not previously used this equipment.'
        },
        {
            sourceRecordKey: 'synthetic-learner-b',
            canvasUserId: 'synthetic-2',
            studentLabel: '[Synthetic] Learner B',
            attempt: 1,
            submittedAt: new Date('2026-09-21T20:40:00.000Z'),
            contentKind: 'text_entry',
            attachments: [],
            synthetic: true,
            text: 'A centrifugal pump moves liquid by converting rotational motion into fluid pressure. Liquid enters through the eye at the centre of the impeller. Curved blades accelerate the liquid outward into the surrounding casing. The casing gradually widens, so some velocity becomes pressure before the liquid reaches the outlet. A motor and shaft keep the impeller rotating. In the labelled cross-section, arrows show the path from the suction inlet to the discharge outlet. This representation helps a non-specialist connect each visible component with its role in moving the liquid.'
        }
    ],
    'demo-lled200-description-revision': [
        {
            sourceRecordKey: 'synthetic-learner-c',
            canvasUserId: 'synthetic-3',
            studentLabel: '[Synthetic] Learner C',
            attempt: 2,
            submittedAt: new Date('2026-10-05T22:05:00.000Z'),
            contentKind: 'text_entry',
            attachments: [],
            synthetic: true,
            text: 'A pressure relief valve protects a closed system from excessive pressure. Under normal conditions, a spring presses the valve disc against its seat and keeps the outlet closed. When inlet pressure produces a force greater than the spring force, the disc lifts. Fluid then exits through the discharge port, reducing system pressure. As pressure returns to the permitted range, the spring reseats the disc. The cutaway drawing distinguishes the inlet, disc, spring, adjustment screw, and outlet, allowing an educated non-specialist to follow the opening and closing sequence.'
        }
    ]
};

function cloneAssignment(assignment: CanvasImportAssignmentSummary): CanvasImportAssignmentSummary {
    return { ...assignment, dueAt: assignment.dueAt ? new Date(assignment.dueAt) : undefined };
}

function clonePreview(preview: CanvasImportSubmissionPreview): CanvasImportSubmissionPreview {
    return { ...preview, submittedAt: new Date(preview.submittedAt) };
}

/** Local-only gateway with conspicuously synthetic data and no network code path. */
export class LocalDemoCanvasImportGateway implements CanvasImportGateway {
    /** Returns an explicit demo state that never claims live Canvas connectivity. */
    async getStatus(): Promise<CanvasImportStatus> {
        return {
            mode: 'demo',
            integration: 'mock_canvas',
            connected: false,
            canImport: true,
            syntheticDataOnly: true,
            label: 'Local Canvas demo',
            message: 'This workspace uses synthetic assignments and submissions. No request is sent to Canvas.',
            nextStep: 'Choose a synthetic assignment to test the staff review workflow.'
        };
    }

    /** Returns defensive copies of the static synthetic assignment fixtures. */
    async listAssignments(): Promise<CanvasImportAssignmentSummary[]> {
        return DEMO_ASSIGNMENTS.map(cloneAssignment);
    }

    /**
     * Lists defensive copies of synthetic submission fixtures.
     *
     * @param canvasAssignmentId - Demo assignment key selected by staff
     * @returns Preview-only submissions whose text is known synthetic data
     * @throws Error when the demo assignment key is unknown
     */
    async listSubmissionPreviews(canvasAssignmentId: string): Promise<CanvasImportSubmissionPreview[]> {
        const previews = DEMO_SUBMISSIONS[canvasAssignmentId];
        if (!previews) throw new Error('Canvas demo assignment not found');
        return previews.map(clonePreview);
    }
}

/** Production-safe gateway that reports the missing institutional connection and does nothing else. */
export class UnconfiguredCanvasImportGateway implements CanvasImportGateway {
    /** Returns a fail-closed status with approved-connection guidance. */
    async getStatus(): Promise<CanvasImportStatus> {
        return {
            mode: 'not_configured',
            integration: 'none',
            connected: false,
            canImport: false,
            syntheticDataOnly: false,
            label: 'Canvas is not connected',
            message: 'Live Canvas import is unavailable until institutional OAuth, privacy review, and scoped permissions are configured.',
            nextStep: 'An instructor or platform administrator must complete the approved Canvas connection setup.'
        };
    }

    /** Returns no assignments because no approved source connection exists. */
    async listAssignments(): Promise<CanvasImportAssignmentSummary[]> {
        return [];
    }

    /** Always rejects preview access while Canvas import is unconfigured. */
    async listSubmissionPreviews(_canvasAssignmentId: string): Promise<CanvasImportSubmissionPreview[]> {
        throw new Error('Canvas import is not configured');
    }
}

/**
 * Selects the local, network-free gateway for a context with no Canvas credential.
 *
 * This is the fallback, not the whole selection. Live import needs the signed-in user's OAuth
 * client and the course's Canvas id, neither of which exists at module scope, so the route
 * constructs {@link LiveCanvasImportGateway} itself and only falls back here when the course is
 * not Canvas-linked or the user has not authorized Canvas. Unknown modes fail closed.
 *
 * @param env - Integration-mode inputs, injectable for deterministic startup tests
 * @returns Synthetic demo adapter or fail-closed unconfigured adapter
 */
export function createCanvasImportGateway(
    env: Partial<Pick<NodeJS.ProcessEnv, 'CANVAS_INTEGRATION_MODE' | 'NODE_ENV'>> = process.env
): CanvasImportGateway {
    const configuredMode = env.CANVAS_INTEGRATION_MODE?.trim().toLowerCase();
    if (configuredMode === 'mock') return new LocalDemoCanvasImportGateway();
    if (configuredMode) return new UnconfiguredCanvasImportGateway();
    return env.NODE_ENV === 'production'
        ? new UnconfiguredCanvasImportGateway()
        : new LocalDemoCanvasImportGateway();
}

/**
 * Per-integration hash domain and local id prefix.
 *
 * Demo and live ids must never collide or be mistaken for one another: a synthetic fixture and
 * a real student could otherwise hash into the same `studentId` within one assignment, and the
 * prefix is what makes a stored record's provenance readable without a join. Changing either
 * string re-keys every future import, so they are versioned rather than edited.
 */
const IDENTITY_DOMAINS = {
    mock_canvas: { domain: 'writing-feedback-canvas-demo-v1', prefix: 'canvas-demo' },
    canvas: { domain: 'writing-feedback-canvas-live-v1', prefix: 'canvas' }
} as const;

/**
 * buildCanvasImportIdentity — derives a stable, privacy-safe key for one source attempt.
 *
 * The digest is one-way by design: nothing here is reversible back to a Canvas user. Release
 * write-back therefore reads {@link WritingSubmission.canvasUserId} rather than trying to
 * recover an id from this key.
 *
 * @param input - Integration, course, local/source assignment, source record key, and attempt
 * @returns Pseudonymous local student ID and full idempotency fingerprint
 */
export function buildCanvasImportIdentity(input: {
    integration: 'mock_canvas' | 'canvas';
    courseId: string;
    targetAssignmentId: string;
    canvasAssignmentId: string;
    sourceRecordKey: string;
    attempt: number;
}): { studentId: string; fingerprint: string } {
    // Domain-separate the digest so this identity cannot collide with another hash use.
    const { domain, prefix } = IDENTITY_DOMAINS[input.integration];
    const fingerprint = createHash('sha256')
        .update(`${domain}\0`)
        .update(input.courseId)
        .update('\0')
        .update(input.targetAssignmentId)
        .update('\0')
        .update(input.canvasAssignmentId)
        .update('\0')
        .update(input.sourceRecordKey)
        .update('\0')
        .update(String(input.attempt))
        .digest('hex');
    return { studentId: `${prefix}-${fingerprint.slice(0, 24)}`, fingerprint };
}

/**
 * Longest transcript an imported submission may carry.
 *
 * Matches the limit the manual intake route enforces on pasted text. Canvas import does not go
 * through that validator, so without this an arbitrarily long Canvas document could enter the
 * workspace and break the bound the rest of the feature is documented to keep — anchored
 * comment offsets, review rendering, and PDF generation all assume it.
 */
const MAX_IMPORT_TEXT_CHARS = 30000;

function isDuplicateKey(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 11000;
}

/**
 * Imports verified synthetic Canvas-text fixtures into an existing writing
 * assignment. Existing attempts are skipped, including concurrent duplicates.
 */
export class SafeCanvasImportService {
    /**
     * Creates an importer over narrow source and persistence boundaries.
     *
     * @param store - Local assignment/submission persistence port
     * @param gateway - Read-only source adapter; defaults to environment-safe selection
     */
    constructor(
        private readonly store: CanvasImportStore,
        private readonly gateway: CanvasImportGateway = createCanvasImportGateway()
    ) {}

    /** Returns the adapter's honest capability state without local persistence. */
    async getStatus(): Promise<CanvasImportStatus> {
        return this.gateway.getStatus();
    }

    /** Lists assignments only when the selected adapter explicitly permits import. */
    async listAssignments(): Promise<CanvasImportAssignmentSummary[]> {
        const status = await this.gateway.getStatus();
        return status.canImport ? this.gateway.listAssignments() : [];
    }

    /**
     * Resolves one source assignment and its read-only submission previews.
     *
     * @param canvasAssignmentId - Source assignment selected by staff
     * @returns Matching summary and preview-only submissions
     * @throws Error when import is disabled or the assignment does not exist
     */
    async previewAssignment(canvasAssignmentId: string): Promise<{
        assignment: CanvasImportAssignmentSummary;
        submissions: CanvasImportSubmissionPreview[];
    }> {
        const status = await this.gateway.getStatus();
        if (!status.canImport) throw new Error('Canvas import is not configured');
        const assignments = await this.gateway.listAssignments();
        const assignment = assignments.find((candidate) => candidate.canvasAssignmentId === canvasAssignmentId);
        if (!assignment) throw new Error('Canvas assignment not found');
        const submissions = await this.gateway.listSubmissionPreviews(canvasAssignmentId);
        return { assignment, submissions };
    }

    /**
     * Imports unseen source attempts into an existing local assignment.
     *
     * Each submission is intaken independently. A download or parse failure on one is recorded
     * and the run continues: an import of sixty submissions must not be lost to one corrupt
     * PDF, and because the operation is idempotent, re-running it retries only what failed.
     *
     * Two intake paths land in deliberately different states. Text entries arrive already
     * extracted and are stored verified, ready for feedback. File uploads are parsed from
     * bytes, where extraction can silently mangle or drop content, so they are stored
     * `verification_needed` — a staff member must confirm the transcript before generation.
     *
     * @param input - Course-scoped source-to-target assignment selection
     * @returns Newly imported submissions with retry-visible skip, unsupported, and failure counts
     * @throws Error when import is disabled, the target is absent, or storage fails
     */
    async importAssignment(input: CanvasImportRequest): Promise<CanvasImportResult> {
        // Re-check adapter state at mutation time; a prior preview is never authorization.
        const status = await this.gateway.getStatus();
        if (!status.canImport || status.integration === 'none') {
            throw new Error('Canvas import is not configured');
        }
        const integration = status.integration;
        const target = await this.store.getWritingAssignment(input.courseId, input.targetAssignmentId);
        if (!target) throw new Error('Writing assignment not found');

        // Snapshot existing attempts before writes to make ordinary retries inexpensive.
        const preview = await this.previewAssignment(input.canvasAssignmentId);
        const existing = await this.store.listWritingSubmissions(input.courseId, input.targetAssignmentId);
        const existingAttempts = new Set(existing.map((submission) => `${submission.studentId}:${submission.attempt}`));
        const imported: CanvasImportResult['submissions'] = [];
        let skippedCount = 0;
        let unsupportedCount = 0;
        let failedCount = 0;

        for (const source of preview.submissions) {
            if (source.contentKind === 'unsupported') {
                unsupportedCount += 1;
                continue;
            }

            // Derive a stable privacy-safe identity without retaining the source record key.
            const identity = buildCanvasImportIdentity({
                integration,
                courseId: input.courseId,
                targetAssignmentId: input.targetAssignmentId,
                canvasAssignmentId: input.canvasAssignmentId,
                sourceRecordKey: source.sourceRecordKey,
                attempt: source.attempt
            });
            const attemptKey = `${identity.studentId}:${source.attempt}`;
            if (existingAttempts.has(attemptKey)) {
                skippedCount += 1;
                continue;
            }

            let intake: { text: string; sourceType: 'canvas_text' | 'digital_file' } | null = null;
            try {
                intake = await this.resolveIntake(source);
            } catch {
                // The reason is deliberately not surfaced or logged: it would carry the
                // attachment's file name, and in a parser error sometimes its content.
                failedCount += 1;
                continue;
            }
            // Nothing to review, or more than the workspace is bounded to handle. Both are
            // properties of the submission rather than transient faults, so neither is a
            // failure staff should retry.
            if (!intake || intake.text.trim() === '' || intake.text.length > MAX_IMPORT_TEXT_CHARS) {
                unsupportedCount += 1;
                continue;
            }

            // Parsed bytes are never trusted as final text; only text entries import verified.
            const needsVerification = intake.sourceType === 'digital_file';
            try {
                const stored = await this.store.createWritingSubmission({
                    courseId: input.courseId,
                    assignmentId: input.targetAssignmentId,
                    studentId: identity.studentId,
                    studentLabel: source.studentLabel,
                    // Kept only for a real Canvas record: it is the write-back address, and a
                    // synthetic fixture has nothing meaningful to address.
                    canvasUserId: integration === 'canvas' ? source.canvasUserId : undefined,
                    attempt: source.attempt,
                    sourceType: intake.sourceType,
                    originalText: intake.text,
                    verifiedText: needsVerification ? undefined : intake.text,
                    requiresVerification: needsVerification,
                    status: needsVerification ? 'verification_needed' : 'imported'
                });
                imported.push(stored);
                existingAttempts.add(attemptKey);
            } catch (error) {
                // A unique-index race is an idempotent skip; unrelated storage errors propagate.
                if (!isDuplicateKey(error)) throw error;
                skippedCount += 1;
            }
        }

        return {
            assignment: preview.assignment,
            importedCount: imported.length,
            skippedCount,
            submissions: imported,
            integration,
            unsupportedCount,
            failedCount
        };
    }

    /**
     * Resolves one preview into the text and provenance to persist.
     *
     * Attachment bytes are fetched here — during an explicit import — and never while
     * previewing, so browsing assignments cannot pull student files across the network.
     *
     * @param source - One preview from the current assignment
     * @returns Extracted text and its local source type, or `null` when nothing is importable
     * @throws Error when a download or parse fails, which the caller counts as a failure
     */
    private async resolveIntake(
        source: CanvasImportSubmissionPreview
    ): Promise<{ text: string; sourceType: 'canvas_text' | 'digital_file' } | null> {
        if (source.contentKind === 'text_entry') {
            // An adapter whose previews already carry plain text needs no conversion.
            const text = this.gateway.extractTextEntry
                ? await this.gateway.extractTextEntry(source.text)
                : source.text;
            return { text, sourceType: 'canvas_text' };
        }

        if (source.contentKind === 'file_upload') {
            const [attachment] = source.attachments;
            // A gateway that previews uploads without offering extraction cannot honour them.
            if (!attachment || !this.gateway.extractAttachmentText) return null;
            const text = await this.gateway.extractAttachmentText(attachment);
            return { text, sourceType: 'digital_file' };
        }

        return null;
    }
}
