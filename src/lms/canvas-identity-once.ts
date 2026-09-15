/**
 * Canvas identity, once per connection — proves a staff member's connected Canvas account is theirs
 *
 * Connecting Canvas authorizes whichever Canvas account the browser is signed in to, so the stored
 * connection may belong to someone else. Writing Feedback imports and releases with that
 * connection, so it must be checked before first use. It is checked once for each connection
 * rather than on every request: the Canvas user id that passed is remembered on the staff member's
 * `active-users` record, and a later request whose stored connection names the same Canvas user
 * skips the check. Reconnecting as a different Canvas account changes that id, and it runs again.
 *
 * A TA is recognized from the course's synced roster (`canvas-roster-sync.ts`), which the linking
 * instructor's credential read with SIS identifiers, so the TA's own Canvas permissions do not
 * matter. Anyone the roster does not settle is checked live against the course's teachers and TAs,
 * which needs the connected account to be allowed to read SIS identifiers.
 *
 * @author: Kathleen Tom
 * @date: 2026-09-15
 * @version: 1.1.0
 * @description: Runs the Canvas account check at most once per connection, roster first.
 */

import type { EngEAI_MongoDB } from '../db/enge-ai-mongodb';
import { canvasConfig } from './canvas-config';
import { assertInstructorIdentity, CANVAS_ACCOUNT_MISMATCH_MESSAGE, CanvasIdentityError } from './canvas-course-sync';
import { hashRosterPuid, isRosterIdentityConfigured } from '../utils/roster-identity';

/** Canvas enrolments whose holders operate Writing Feedback in a course; TAs have full parity (D-049). */
export const STAFF_ENROLLMENT_TYPES: readonly string[] = ['teacher', 'ta'];

/** Replaces Canvas's "ask your administrator" when the live check cannot read SIS identifiers. */
export const IDENTIFIERS_WITHHELD_STAFF_MESSAGE =
    'Canvas did not let EngE-AI confirm that the connected Canvas account is yours. If you are a TA, ' +
    'ask an instructor to sync the course roster with Canvas, then try again. Instructors: ask your ' +
    'Canvas administrator to grant the SIS Data - read permission.';

/**
 * ensureCanvasIdentityVerified - refuses a connected Canvas account that is not the signed-in staff member's.
 *
 * @param input - Authenticated Canvas client, database façade, the user's internal id, the EngE-AI
 *   course, and the Canvas course it is linked to
 * @throws {CanvasIdentityError} When the account is someone else's or cannot be confirmed
 * @throws Error when the signed-in user has no `active-users` record
 */
export async function ensureCanvasIdentityVerified(input: {
    api: Parameters<typeof assertInstructorIdentity>[0];
    mongo: EngEAI_MongoDB;
    userKey: string;
    courseId: string;
    canvasCourseId: string;
}): Promise<void> {
    const { api, mongo, userKey, courseId, canvasCourseId } = input;

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

    // Step 3: the course's synced roster may already say whose Canvas account this is.
    if (connectedCanvasUserId && globalUser.puid && isRosterIdentityConfigured()) {
        const snapshot = await mongo.getCourseLmsRosterSnapshot(courseId);
        const entry = snapshot?.lmsCourseId === canvasCourseId
            ? snapshot.entries.find((row) => row.lmsUserId === connectedCanvasUserId)
            : undefined;
        if (entry) {
            if (entry.puidHash !== hashRosterPuid(globalUser.puid)) {
                throw new CanvasIdentityError(CANVAS_ACCOUNT_MISMATCH_MESSAGE, 'mismatch');
            }
            if (entry.role === 'ta') {
                await mongo.recordVerifiedCanvasAccount(userKey, connectedCanvasUserId);
                return;
            }
            // Listed as this person but only as a student: the live check below decides staff standing.
        }
    }

    // Step 4: ask Canvas, against the course's teachers and TAs.
    let verifiedCanvasUserId: string;
    try {
        verifiedCanvasUserId = await assertInstructorIdentity(api, canvasCourseId, globalUser, STAFF_ENROLLMENT_TYPES);
    } catch (error) {
        // A TA can fix this by getting the roster synced, which the generic message never mentions.
        if (error instanceof CanvasIdentityError && error.reason === 'identifiers_withheld') {
            throw new CanvasIdentityError(IDENTIFIERS_WITHHELD_STAFF_MESSAGE, 'identifiers_withheld');
        }
        throw error;
    }
    // Remembered only when it is the account the stored connection names; a connection that
    // records no Canvas user id cannot be recognized later, so it is simply checked each time.
    if (connectedCanvasUserId && verifiedCanvasUserId === connectedCanvasUserId) {
        await mongo.recordVerifiedCanvasAccount(userKey, verifiedCanvasUserId);
    }
}
