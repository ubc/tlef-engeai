/**
 * Assignment type — the one-time writing / lab report choice (D-123)
 *
 * A new assignment is created with its type pending. Staff answer once; the answer is recorded
 * atomically and, for a lab report, the imported Canvas grid moves to the technical rubric
 * while the writing rubric returns to the default profile. The type never changes afterwards.
 *
 * @author: @rdschrs
 * @date: 2026-09-13
 * @version: 1.0.0
 * @description: Records the assignment type and applies lab-report rubric routing.
 */

import type { EngEAI_MongoDB } from '../db/enge-ai-mongodb';
import type { WritingAssignment } from './contracts';
import { routeRubricsForLabReport } from './rubric-seed';

/** Answer to "What kind of assignment is this?". */
export type AssignmentTypeChoice = 'writing' | 'lab_report';

export const TYPE_ALREADY_CHOSEN_MESSAGE = 'The assignment type has already been chosen';
export const NOT_LAB_REPORT_MESSAGE = 'Only a lab report has a technical rubric';
export const CHOOSE_TYPE_BEFORE_APPROVAL_MESSAGE = 'Choose the assignment type before approving its rubric';
const NOT_FOUND_MESSAGE = 'Writing assignment not found';

/** Persistence the service needs; the Mongo façade satisfies it. */
export type AssignmentTypeStore = Pick<
    EngEAI_MongoDB,
    'getWritingAssignment' | 'chooseWritingAssignmentType' | 'applyLabReportRubricRouting'
>;

/**
 * isAssignmentTypeChoice - narrows an untrusted request value to a valid answer.
 *
 * @param value - Raw request body field
 * @returns True only for `'writing'` or `'lab_report'`
 */
export function isAssignmentTypeChoice(value: unknown): value is AssignmentTypeChoice {
    return value === 'writing' || value === 'lab_report';
}

/**
 * assignmentTypeErrorStatus - HTTP status for an error thrown by this service.
 *
 * @param error - Anything the service threw
 * @returns 404 for a missing assignment, 409 for a refused state change, 400 otherwise
 */
export function assignmentTypeErrorStatus(error: unknown): 404 | 409 | 400 {
    const message = error instanceof Error ? error.message : '';
    if (message === NOT_FOUND_MESSAGE) return 404;
    if (message === TYPE_ALREADY_CHOSEN_MESSAGE || message === NOT_LAB_REPORT_MESSAGE) return 409;
    return 400;
}

/** Records the one-time assignment type and keeps the lab report's technical rubric seeded. */
export class AssignmentTypeService {
    /**
     * @param mongo - Course-scoped assignment persistence
     */
    constructor(private readonly mongo: AssignmentTypeStore) {}

    /**
     * choose - records the answer and applies lab-report routing when it is a lab report.
     *
     * @param courseId - Owning course id
     * @param assignmentId - Assignment being classified
     * @param type - Staff answer
     * @param actorUserId - Staff member answering; stamped on seeded rubric drafts
     * @returns The assignment as stored after the choice
     * @throws Error `Writing assignment not found`, or `The assignment type has already been chosen`
     */
    async choose(
        courseId: string,
        assignmentId: string,
        type: AssignmentTypeChoice,
        actorUserId: string
    ): Promise<WritingAssignment> {
        // Step 1: refuse cheaply when the answer was already given.
        const assignment = await this.mongo.getWritingAssignment(courseId, assignmentId);
        if (!assignment) throw new Error(NOT_FOUND_MESSAGE);
        if (assignment.assignmentTypePending !== true) throw new Error(TYPE_ALREADY_CHOSEN_MESSAGE);

        // Step 2: the conditional write is the real guard; a concurrent answer matches nothing.
        const isLabReport = type === 'lab_report';
        const chosen = await this.mongo.chooseWritingAssignmentType(courseId, assignmentId, isLabReport);
        if (!chosen) throw new Error(TYPE_ALREADY_CHOSEN_MESSAGE);
        if (!isLabReport || chosen.technicalRubric || chosen.technicalRubricDraft) return chosen;

        // Step 3: a pending assignment has no approved rubric and no feedback (approval is
        // refused while pending), so a Canvas-seeded writing grid can always be reset here.
        const routing = routeRubricsForLabReport({
            canvasRubricImport: chosen.canvasRubricImport,
            actorUserId
        });
        const routed = await this.mongo.applyLabReportRubricRouting(
            courseId,
            assignmentId,
            routing,
            chosen.rubricSource === 'canvas'
        );
        return routed ?? chosen;
    }

    /**
     * seedTechnicalRubric - gives a lab report a technical draft when it has none.
     *
     * Idempotent: an assignment that already holds a technical draft or approval is returned
     * unchanged. Never resets the writing rubric.
     *
     * @param courseId - Owning course id
     * @param assignmentId - Lab report missing its technical rubric
     * @param actorUserId - Staff member seeding it
     * @returns The assignment as stored after seeding
     * @throws Error `Writing assignment not found`, or `Only a lab report has a technical rubric`
     */
    async seedTechnicalRubric(courseId: string, assignmentId: string, actorUserId: string): Promise<WritingAssignment> {
        const assignment = await this.mongo.getWritingAssignment(courseId, assignmentId);
        if (!assignment) throw new Error(NOT_FOUND_MESSAGE);
        if (assignment.isLabReport !== true) throw new Error(NOT_LAB_REPORT_MESSAGE);
        if (assignment.technicalRubric || assignment.technicalRubricDraft) return assignment;

        const routing = routeRubricsForLabReport({
            canvasRubricImport: assignment.canvasRubricImport,
            actorUserId
        });
        const routed = await this.mongo.applyLabReportRubricRouting(courseId, assignmentId, routing, false);
        return routed ?? assignment;
    }
}
