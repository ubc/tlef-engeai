/**
 * Guided Pathway flag service
 *
 * A failed optional flag write is returned as data instead of interrupting the
 * predefined pathway response shown to the chat sender.
 *
 * @author: EngE-AI Team
 * @date: 2026-08-17
 * @version: 1.0.0
 * @description: Failure-isolated orchestration for automatic pathway-trigger flags.
 */

import type {
    GuidedPathwayFlagTriggerActor,
    GuidedPathwayFlagWriter,
} from './guided-pathway-flag-contracts';
import type { PathwayTriggerSnapshot } from '../guided-pathways/pathway-schema';

/** Trigger context used to decide whether an automatic flag should be written. */
export interface PersistGuidedPathwayFlagInput {
    writer: GuidedPathwayFlagWriter;
    trigger: PathwayTriggerSnapshot | null;
    courseId?: string;
    courseName: string;
    messageText: string;
    actor: GuidedPathwayFlagTriggerActor | null;
    chatId: string;
    clientMessageId: string;
}

/** Safe outcome returned to the chat route without carrying the original database error. */
export type PersistGuidedPathwayFlagResult =
    | { status: 'skipped' }
    | { status: 'created' }
    | { status: 'failed'; errorCode?: string | number };

function safeErrorCode(error: unknown): string | number | undefined {
    if (!error || typeof error !== 'object') return undefined;
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' || typeof code === 'number' ? code : undefined;
}

/**
 * persistGuidedPathwayFlagSafely - Persists a notification-enabled automatic flag.
 *
 * Both production students and listed course instructors use the same failure-
 * isolated write path. The actor origin remains explicit so an instructor test
 * can never be mistaken for a student-authored escalation.
 *
 * @param input - Winning pathway snapshot, server-derived actor, transport identity, and writer port
 * @returns `skipped`, `created`, or a sanitized `failed` result; never throws a storage error
 */
export async function persistGuidedPathwayFlagSafely(
    input: PersistGuidedPathwayFlagInput
): Promise<PersistGuidedPathwayFlagResult> {
    const { trigger, courseId } = input;
    if (
        trigger?.notifyInstructorOnTrigger !== true ||
        !courseId ||
        !input.actor
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
            actor: input.actor,
            chatId: input.chatId,
            clientMessageId: input.clientMessageId,
        });
        return { status: 'created' };
    } catch (error) {
        return { status: 'failed', errorCode: safeErrorCode(error) };
    }
}
