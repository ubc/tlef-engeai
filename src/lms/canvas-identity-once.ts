/**
 * Canvas identity, once per connection — proves a staff member's connected Canvas account is theirs
 *
 * Connecting Canvas authorizes whichever Canvas account the browser is signed in to, so the stored
 * connection may belong to someone else. Writing Feedback imports and releases with that
 * connection, so it must be checked before first use. The check reads the course's teaching-team
 * roster, which costs two Canvas calls, so it runs once for each connection rather than on every
 * request: the Canvas user id that passed is remembered on the staff member's `active-users`
 * record, and a later request whose stored connection names the same Canvas user skips Canvas
 * entirely. Reconnecting as a different Canvas account changes that id, and the check runs again.
 *
 * @author: Kathleen Tom
 * @date: 2026-09-15
 * @version: 1.0.0
 * @description: Runs assertInstructorIdentity at most once per Canvas connection.
 */

import type { EngEAI_MongoDB } from '../db/enge-ai-mongodb';
import { canvasConfig } from './canvas-config';
import { assertInstructorIdentity } from './canvas-course-sync';

/** Canvas enrolments whose holders operate Writing Feedback in a course; TAs have full parity (D-049). */
export const STAFF_ENROLLMENT_TYPES: readonly string[] = ['teacher', 'ta'];

/**
 * ensureCanvasIdentityVerified - refuses a connected Canvas account that is not the signed-in staff member's.
 *
 * @param input - Authenticated Canvas client, database façade, the user's internal id, and the linked Canvas course
 * @throws {CanvasIdentityError} From {@link assertInstructorIdentity} when the account cannot be confirmed
 * @throws Error when the signed-in user has no `active-users` record
 */
export async function ensureCanvasIdentityVerified(input: {
    api: Parameters<typeof assertInstructorIdentity>[0];
    mongo: EngEAI_MongoDB;
    userKey: string;
    canvasCourseId: string;
}): Promise<void> {
    const { api, mongo, userKey, canvasCourseId } = input;

    // Step 1: which Canvas account the stored connection names, as recorded when it was authorized.
    const tokens = canvasConfig ? await canvasConfig.tokenStore.get(userKey) : null;
    const connectedCanvasUserId = tokens?.canvasUserId === undefined || tokens?.canvasUserId === null
        ? ''
        : String(tokens.canvasUserId);
    const globalUser = await mongo.findGlobalUserByUserId(userKey);
    if (!globalUser) {
        // Deliberately names no identifier.
        throw new Error('No active-users record for the signed-in user');
    }

    // Step 2: this connection's account was already proven to be this person.
    if (connectedCanvasUserId && globalUser.canvasVerifiedUserId === connectedCanvasUserId) return;

    // Step 3: prove it against the course's teachers and TAs, then remember the account that passed.
    const verifiedCanvasUserId = await assertInstructorIdentity(api, canvasCourseId, globalUser, STAFF_ENROLLMENT_TYPES);
    // Remembered only when it is the account the stored connection names; a connection that
    // records no Canvas user id cannot be recognized later, so it is simply checked each time.
    if (connectedCanvasUserId && verifiedCanvasUserId === connectedCanvasUserId) {
        await mongo.recordVerifiedCanvasAccount(userKey, verifiedCanvasUserId);
    }
}
