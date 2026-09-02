// canvas-roster-sync.ts
/**
 * canvas-roster-sync.ts
 *
 * Reads an imported course's Canvas student roster and stores it as matchable identities.
 *
 * This is the half of enrollment that runs on staff action. Its counterpart runs at login: a
 * student signs in, their PUID is hashed, and the snapshot this module wrote tells EngE-AI which
 * courses to show them. **The student never authorizes Canvas.** That is the point — a student's
 * own OAuth token could not read SIS identifiers anyway (Canvas grants `read_sis` through a
 * teacher enrollment), and requiring one is what let a browser still signed in to another
 * student's Canvas account import that person's courses.
 *
 * ## Whose credential this runs under
 *
 * The course's, never the caller's. `lmsLink.linkedBy` names the instructor who imported the
 * course, and their stored token is what reads the roster whether an instructor pressed sync, an
 * admin did, or the scheduled job ran. An EngE-AI admin holds no Canvas enrollment, so any design
 * that used the caller's token would work for instructors and fail confusingly for admins.
 *
 * One consequence is worth stating plainly: `assertInstructorIdentity` does **not** run here. It
 * cannot — there is no signed-in user to compare a PUID against on the scheduled path. Identity
 * was proven once, at import, by the instructor who created the link; this module inherits that
 * proof rather than re-establishing it.
 *
 * ## What is stored
 *
 * Only a keyed digest of each student's PUID and their Canvas user id — no names, no
 * `integration_id`, no `sis_user_id`, no `login_id`. Recognizing someone and addressing them are
 * different problems and this module solves only the first. Writing feedback or a grade back to
 * Canvas addresses a student through the `canvasUserId` stamped on their imported *submission*,
 * which exists whether or not they have ever opened EngE-AI, so the roster is not on that path.
 *
 * ## The failure that must never look like success
 *
 * Canvas withholds `integration_id` from callers without `read_sis`. The result is a roster full
 * of rows where nobody carries an identifier — indistinguishable, if you only count matches, from
 * a course in which nobody is enrolled. Treating that as a real empty roster would replace a good
 * snapshot with nothing and silently strand a class. {@link syncCanvasCourseRoster} checks
 * coverage before writing and reports `identifiers_withheld`, keeping the previous snapshot.
 *
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @description: Reads a linked Canvas course's student roster into matchable stored identities.
 */

import { canvas, rosterFieldCoverage } from '@ubc/ubc-genai-toolkit-lms-integration';
import type { LmsRosterUser } from '@ubc/ubc-genai-toolkit-lms-integration';
import type { EngEAI_MongoDB } from '../db/enge-ai-mongodb';
import type {
    activeCourse,
    CourseRosterEntry,
    CourseRosterSnapshot,
    CourseRosterSyncSummary,
} from '../types/shared';
import { hashRosterPuid, isRosterIdentityConfigured, ROSTER_SALT_ENV } from '../utils/roster-identity';
import { resolveCanvasApiForUser, type CanvasApiClient } from './canvas-credential';
import { appLogger } from '../utils/logger';

/** The provider this module reads. Matches `canvas-course-sync.ts`. */
const PROVIDER = 'canvas' as const;

/**
 * Raised when a course cannot be synced at all, as opposed to a sync that ran and produced
 * nothing usable.
 *
 * The distinction drives the response: these are 4xx conditions the caller stated wrongly (no
 * link, feature not configured), whereas a `RosterSyncStatus` other than `'ok'` is a 200 with an
 * honest report of what Canvas said.
 */
export class RosterSyncUnavailableError extends Error {
    constructor(
        message: string,
        /** Which refusal this is; callers map it to a status rather than matching on wording. */
        readonly reason: 'not_linked' | 'not_configured'
    ) {
        super(message);
        this.name = 'RosterSyncUnavailableError';
    }
}

/** Seams for tests, so a sync can run without a Canvas server or a token store. */
export interface RosterSyncDeps {
    /** Resolves the course's stored Canvas credential. Defaults to the real token store. */
    resolveApi?: (userKey: string) => Promise<CanvasApiClient | null>;
    /** Reads one course's roster. Defaults to the package's paginated `getCourseUsers`. */
    fetchRoster?: (api: CanvasApiClient, lmsCourseId: string) => Promise<LmsRosterUser[]>;
}

/**
 * fetchStudentRoster — the course's active student roster.
 *
 * `enrollmentTypes: ['student']` is passed explicitly even though it matches the package default,
 * because the default is the package's to change and a silent widening here would start pulling
 * teacher and observer rows into student enrollment.
 */
async function fetchStudentRoster(api: CanvasApiClient, lmsCourseId: string): Promise<LmsRosterUser[]> {
    return canvas.getCourseUsers(api, lmsCourseId, { enrollmentTypes: ['student'] });
}

/**
 * syncCanvasCourseRoster — reads and stores one course's Canvas student roster.
 *
 * Never throws for an ordinary bad outcome. A revoked credential, a withheld identifier, or a
 * Canvas outage each produce a summary whose `status` says what happened and leave the previous
 * snapshot in place; only a course that cannot be synced *in principle* raises
 * {@link RosterSyncUnavailableError}.
 *
 * @param mongoDB - connected `EngEAI_MongoDB` singleton
 * @param course - the EngE-AI course to sync; must carry an `lmsLink`
 * @param triggeredBy - `GlobalUser.userId` who pressed sync; omit for the scheduled job
 * @param deps - test seams; production callers pass nothing
 *
 * @returns A staff-safe summary carrying counts and a message, never roster contents.
 *
 * @throws {RosterSyncUnavailableError} When the course has no Canvas link, or when
 * `ROSTER_HASH_SALT` is unset so no identity could be computed.
 */
export async function syncCanvasCourseRoster(
    mongoDB: EngEAI_MongoDB,
    course: activeCourse,
    triggeredBy?: string,
    deps: RosterSyncDeps = {}
): Promise<CourseRosterSyncSummary> {
    const link = course.lmsLink;

    // 1. Refuse what cannot be synced at all. An unlinked course has no roster to read, and
    //    letting an admin sync one would be the first step toward connecting Canvas on an
    //    instructor's behalf — the identity problem this whole design removes.
    if (!link || link.provider !== PROVIDER) {
        throw new RosterSyncUnavailableError('That course is not connected to Canvas', 'not_linked');
    }

    // Checked before the Canvas call, not after: without a salt every row would be unhashable, so
    // fetching a class roster first would read personal data for a sync that cannot store it.
    if (!isRosterIdentityConfigured()) {
        throw new RosterSyncUnavailableError(
            `Roster sync is not configured on this deployment (${ROSTER_SALT_ENV} is unset)`,
            'not_configured'
        );
    }

    // 2. Resolve the course's credential — the importing instructor's, whoever triggered this.
    const resolveApi = deps.resolveApi ?? resolveCanvasApiForUser;
    const api = await resolveApi(link.linkedBy);
    if (!api) {
        await mongoDB.recordLmsRosterSyncOutcome(course.id, 'no_credential');
        return summarize(course.id, 'no_credential', 0, 0,
            'No usable Canvas connection is on file for this course. The instructor who imported ' +
                'it needs to reconnect Canvas before the roster can sync.');
    }

    // 3. Read the roster.
    const fetchRoster = deps.fetchRoster ?? fetchStudentRoster;
    let roster: LmsRosterUser[];
    try {
        roster = await fetchRoster(api, link.courseId);
    } catch (error) {
        // The message, never the payload: a Canvas error body can echo roster rows back.
        const reason = error instanceof Error ? error.message : 'Unknown error';
        appLogger.error(`[roster-sync] Canvas roster read failed for course ${course.id}`);
        await mongoDB.recordLmsRosterSyncOutcome(course.id, 'failed', reason);
        return summarize(course.id, 'failed', 0, 0,
            'Canvas could not be reached for this course. The previous roster is still in use.');
    }

    // 4. The coverage guard. A roster with rows but no identifiers is a Canvas permission gap, and
    //    must not be written as though the class were empty.
    const identified = roster.filter((row) => (row.integrationId ?? '').trim() !== '');
    if (roster.length > 0 && identified.length === 0) {
        const coverage = rosterFieldCoverage(roster);
        appLogger.warn(
            `[roster-sync] Course ${course.id}: ${roster.length} roster rows, ` +
                `${coverage.integrationId} with an identifier`
        );
        await mongoDB.recordLmsRosterSyncOutcome(course.id, 'identifiers_withheld');
        return summarize(course.id, 'identifiers_withheld', roster.length, 0,
            `Canvas returned ${roster.length} students but no SIS identifiers, so none could be ` +
                'matched. Ask your Canvas administrator to grant the "SIS Data - read" permission ' +
                'for instructors. The previous roster is still in use.');
    }

    // 5. Reduce each identified row to what matching needs and nothing else. Rows without an
    //    identifier are dropped rather than stored address-only: nothing consumes them, since
    //    writeback addresses a student through their submission's own Canvas user id.
    const entries: CourseRosterEntry[] = identified.map((row) => ({
        puidHash: hashRosterPuid(row.integrationId!),
        lmsUserId: row.id,
    }));

    const snapshot: CourseRosterSnapshot = {
        courseId: course.id,
        provider: PROVIDER,
        lmsCourseId: link.courseId,
        entries: dedupeByHash(entries),
        syncedAt: new Date(),
        syncCredentialUserId: link.linkedBy,
        ...(triggeredBy ? { triggeredBy } : {}),
        status: 'ok',
        rosterSize: roster.length,
        identifiedCount: identified.length,
    };

    await mongoDB.saveCourseLmsRosterSnapshot(snapshot);

    const unmatched = roster.length - identified.length;
    return summarize(course.id, 'ok', roster.length, identified.length,
        unmatched > 0
            ? `Synced ${identified.length} of ${roster.length} students. ${unmatched} had no SIS ` +
              'identifier in Canvas and will need to join with the course code.'
            : `Synced ${identified.length} students from Canvas.`);
}

/**
 * dedupeByHash — collapses duplicate identities within one roster.
 *
 * Canvas returns one row per *enrollment*, so a student in two sections of a cross-listed course
 * appears twice. Left alone they would both match at login, and the login path would read the
 * first row's `lmsUserId` — arbitrary, though harmless here since both rows describe one person.
 * Collapsing keeps the stored count meaning "students" rather than "enrollments", which is what
 * the number shown to an instructor claims to be.
 */
function dedupeByHash(entries: CourseRosterEntry[]): CourseRosterEntry[] {
    const seen = new Map<string, CourseRosterEntry>();
    for (const entry of entries) {
        if (!seen.has(entry.puidHash)) {
            seen.set(entry.puidHash, entry);
        }
    }
    return [...seen.values()];
}

/** Builds the staff-facing summary. Counts and a message only — never an entry. */
function summarize(
    courseId: string,
    status: CourseRosterSyncSummary['status'],
    rosterSize: number,
    identifiedCount: number,
    message: string
): CourseRosterSyncSummary {
    return { courseId, status, syncedAt: new Date(), rosterSize, identifiedCount, message };
}
