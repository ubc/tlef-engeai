/**
 * Queued release adapter — the Canvas coordinator a background job runs with
 *
 * The HTTP path builds its release coordinator from the request: the signed-in staff member's
 * Canvas client hangs off `req`, and the course's integration state was resolved to answer the
 * page that asked. A queued release has neither. It runs minutes later, in a worker tick, for a
 * person who has closed the tab.
 *
 * So the same two adapters are rebuilt from durable state alone: the Canvas course link on the
 * course record, and the queuing staff member's stored OAuth credential. A course that is not
 * linked to Canvas keeps the clearly labelled local mock, exactly as the request path does.
 *
 * Returning `null` means the credential is gone — revoked, or the person lost Canvas access —
 * and the caller fails the job asking them to reconnect. It never falls back to another user's
 * token, and never logs one.
 *
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @description: Rebuilds the Canvas release coordinator for a job with no request behind it.
 */

import type { EngEAI_MongoDB } from '../db/enge-ai-mongodb';
import { canvasConfig } from '../lms/canvas-config';
import { resolveCanvasClientForUser } from './canvas-client-for-user';
import { resolveCanvasCourseId } from './canvas-import-resolver';
import { MockCanvasGateway, SafeCanvasReleaseService } from './canvas-release-service';
import { LiveCanvasReleaseService } from './live-canvas-release-service';
import type { CanvasReleaseService } from './contracts';

/** What a queued release resolved to, so the caller can report the reason it stopped. */
export type QueuedReleaseResolution =
    | { integration: 'canvas' | 'mock_canvas'; service: CanvasReleaseService }
    | { integration: 'none'; service: null; reason: string };

/**
 * resolveQueuedReleaseService - the coordinator a queued release should use.
 *
 * @param mongo - Connected Mongo façade owning release persistence
 * @param courseId - EngE-AI course whose Canvas link decides live or mock
 * @param queuedByUserId - `GlobalUser.userId` whose credential the write acts with
 * @returns A live or mock coordinator, or the reason no write can be attempted
 */
export async function resolveQueuedReleaseService(
    mongo: EngEAI_MongoDB,
    courseId: string,
    queuedByUserId: string
): Promise<QueuedReleaseResolution> {
    const canvasCourseId = canvasConfig ? await resolveCanvasCourseId(mongo, courseId) : null;
    if (!canvasCourseId) {
        // Not a Canvas course, or Canvas is not deployed here: the synthetic adapter is the
        // honest answer and is visibly labelled as such throughout the workspace.
        return {
            integration: 'mock_canvas',
            service: new SafeCanvasReleaseService(
                new MockCanvasGateway(),
                (fingerprint) => mongo.findWritingReleaseByFingerprint(fingerprint),
                (release) => mongo.createWritingRelease(release),
                (fingerprint, update, expectedStatuses) => mongo.finalizeWritingRelease(fingerprint, update, expectedStatuses)
            )
        };
    }

    const client = await resolveCanvasClientForUser(queuedByUserId);
    if (!client) {
        return {
            integration: 'none',
            service: null,
            reason: 'Canvas rejected the stored authorization for the staff member who queued this release. '
                + 'Ask them to reconnect Canvas and release it again.'
        };
    }

    return {
        integration: 'canvas',
        service: new LiveCanvasReleaseService(
            client,
            canvasCourseId,
            (fingerprint) => mongo.findWritingReleaseByFingerprint(fingerprint),
            (release) => mongo.createWritingRelease(release),
            (fingerprint, update, expectedStatuses) => mongo.finalizeWritingRelease(fingerprint, update, expectedStatuses)
        )
    };
}
