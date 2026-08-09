/**
 * Guided Pathway alert persistence boundary
 *
 * Keeps optional alert creation isolated from the student-facing pathway response.
 * A failed alert write is reported as data instead of throwing into the chat route.
 *
 * @author: EngE-AI Team
 * @date: 2026-08-08
 * @version: 1.0.0
 * @description: Failure-isolated persistence helper for Guided Pathway trigger alerts.
 */

import type {
    CreateGuidedPathwayFlagInput,
} from '../db/mongo/guided-pathway-flag-mongo';
import type { PathwayTriggerSnapshot } from './pathway-schema';

/** Minimal persistence contract used by the chat route. */
export interface GuidedPathwayFlagWriter {
    createGuidedPathwayFlag(input: CreateGuidedPathwayFlagInput): Promise<unknown>;
}

/** Context needed to decide whether an automatic alert should be written. */
export interface PersistGuidedPathwayAlertInput {
    writer: GuidedPathwayFlagWriter;
    trigger: PathwayTriggerSnapshot | null;
    courseId?: string;
    courseName: string;
    messageText: string;
    studentUserId: string;
    chatId: string;
    clientMessageId: string;
    isEligibleStudent: boolean;
}

/** Safe outcome returned to the route without carrying the original database error. */
export type PersistGuidedPathwayAlertResult =
    | { status: 'skipped' }
    | { status: 'created' }
    | { status: 'failed'; errorCode?: string | number };

function safeErrorCode(error: unknown): string | number | undefined {
    if (!error || typeof error !== 'object') return undefined;
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' || typeof code === 'number' ? code : undefined;
}

/**
 * Persist an alert when the winning pathway and user are eligible.
 *
 * This function never throws for a flag-write failure. That separation ensures
 * the student still receives the pathway's predefined response when MongoDB is
 * temporarily unable to store the instructor alert.
 */
export async function persistGuidedPathwayAlertSafely(
    input: PersistGuidedPathwayAlertInput
): Promise<PersistGuidedPathwayAlertResult> {
    const { trigger, courseId } = input;
    if (
        trigger?.notifyInstructorOnTrigger !== true ||
        !courseId ||
        !input.isEligibleStudent
    ) {
        return { status: 'skipped' };
    }

    try {
        await input.writer.createGuidedPathwayFlag({
            courseId,
            courseName: input.courseName,
            pathwayId: trigger.pathwayId,
            pathwayTitle: trigger.pathwayTitle,
            messageText: input.messageText,
            studentUserId: input.studentUserId,
            chatId: input.chatId,
            clientMessageId: input.clientMessageId,
        });
        return { status: 'created' };
    } catch (error) {
        return { status: 'failed', errorCode: safeErrorCode(error) };
    }
}
