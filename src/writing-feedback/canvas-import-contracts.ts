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

import type { WritingAssignment, WritingSubmission } from './contracts';

/** Honest capability state returned before staff can browse or import Canvas data. */
export interface CanvasImportStatus {
    mode: 'demo' | 'not_configured'; // distinguishes synthetic operation from a disabled live boundary
    integration: 'mock_canvas' | 'none'; // adapter identity shown without implying production connectivity
    connected: boolean; // remains false until an approved live OAuth integration exists
    canImport: boolean; // gates chooser and import operations in the staff workspace
    syntheticDataOnly: boolean; // requires prominent demo-data disclosure
    label: string; // concise status heading safe for staff display
    message: string; // durable explanation of current integration behavior
    nextStep?: string; // actionable setup or demo guidance when available
}

/** Assignment metadata safe to show in the Canvas import chooser. */
export interface CanvasImportAssignmentSummary {
    canvasAssignmentId: string; // opaque source key used only for the selected import
    title: string; // staff-facing chooser label
    submissionCount: number; // preview count before local writes begin
    pointsPossible?: number; // optional context, never an inferred local grade mapping
    dueAt?: Date; // source deadline shown for assignment disambiguation
    rubricState: 'canvas_rubric' | 'no_canvas_rubric'; // provenance hint, not approval state
    synthetic: boolean; // prevents demo fixtures from appearing live
}

/** Read-only preview of a submission before staff starts an import. */
export interface CanvasImportSubmissionPreview {
    sourceRecordKey: string; // ephemeral source identity used to derive a privacy-safe local key
    studentLabel: string; // staff-only label for explicit selection and review
    attempt: number; // participates in idempotency for repeated submissions
    submittedAt: Date; // source timestamp shown during preview
    text: string; // verified synthetic text in the current mock adapter
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
}

/** Persistence capabilities used by the import service without coupling it to Mongo. */
export interface CanvasImportStore {
    /** Resolves the existing local assignment that will own imported submissions. */
    getWritingAssignment(courseId: string, assignmentId: string): Promise<WritingAssignment | null>;
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
    integration: 'mock_canvas'; // prevents results from claiming live Canvas provenance
}
