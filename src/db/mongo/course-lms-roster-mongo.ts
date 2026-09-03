// course-lms-roster-mongo.ts
/**
 * course-lms-roster-mongo.ts
 *
 * @description Reads and writes the **`course-lms-rosters`** collection — one snapshot per
 * EngE-AI course of the roster its linked LMS course reported.
 *
 * Distinct from `course-roster-mongo.ts`, which mutates EngE-AI's own course roles (student ↔ TA)
 * on the catalog document. This module never touches roles: it stores what the *LMS* said about
 * enrollment, and enrollment is granted elsewhere by `enrollUserInCourse`.
 *
 * This is the collection that lets a student's courses appear without the student ever
 * authorizing Canvas. An instructor's import reads the roster under their own credential (only a
 * teacher may read SIS identifiers), and each row is reduced to a keyed one-way digest before it
 * is stored. At login, the signed-in user's PUID is hashed the same way and looked up here.
 *
 * Two properties of that design shape everything below:
 *
 * 1. **No PUID at rest.** Rows carry `puidHash` and the LMS's own user id, never an
 *    `integration_id` and never a name. `active-users` remains the only collection holding an
 *    institutional identifier in the clear. See `src/utils/roster-identity.ts`.
 * 2. **A snapshot describes one moment.** {@link saveCourseLmsRosterSnapshot} replaces the whole
 *    document rather than merging entries, so the stored roster always means "what the LMS said
 *    at `syncedAt`". Replacing it never un-enrolls anyone — enrollment accrues, and only
 *    `enrollUserInCourse` grants it.
 *
 * A failed or permission-blocked sync must not destroy the last good roster, so failures are
 * recorded through {@link recordLmsRosterSyncOutcome}, which touches status fields only.
 *
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @description: Per-course LMS roster snapshots and the login-time enrollment lookup.
 */

import type { CourseRosterSnapshot, RosterSyncStatus } from '../../types/shared';
import { courseLmsRostersCollection } from './mongo-collections';
import type { MongoDalContext } from './mongo-context';
import { appLogger } from '../../utils/logger';

/**
 * Indexes backing the two access patterns.
 *
 * `courseId` is unique because a course has exactly one current roster; the snapshot is a
 * replacement, not an append-only log, and a duplicate would make "the roster" ambiguous.
 *
 * `entries.puidHash` is multikey and exists for the login path, which runs on **every** sign-in
 * and must not degrade into a collection scan as courses accumulate. Without it, the check that
 * was sold as cheap quietly becomes the most expensive thing in the login handler.
 */
export const COURSE_LMS_ROSTER_INDEXES = [
    {
        keys: { courseId: 1 },
        options: { name: 'course_lms_roster_course_unique', unique: true, background: true },
    },
    {
        keys: { 'entries.puidHash': 1 },
        options: { name: 'course_lms_roster_puid_hash', background: true },
    },
] as const;

/**
 * createCourseLmsRosterIndexes — best-effort provisioning of {@link COURSE_LMS_ROSTER_INDEXES}.
 *
 * Warns rather than throws, matching `createCourseLmsLinkIndex` and the flag index helpers: a
 * failed index build must not stop the application from booting. Correctness does not depend on
 * these — the unique index is a safety net over a single-document upsert, and the hash index is
 * a performance guard.
 */
export async function createCourseLmsRosterIndexes(ctx: MongoDalContext): Promise<void> {
    for (const index of COURSE_LMS_ROSTER_INDEXES) {
        try {
            await courseLmsRostersCollection(ctx.db).createIndex(
                index.keys as Record<string, 1>,
                index.options as any
            );
        } catch (error) {
            appLogger.warn(`[lms-roster] Index creation warning (${index.options.name}):`, error);
        }
    }
}

/**
 * saveCourseLmsRosterSnapshot — stores the roster read by a successful sync.
 *
 * Replaces the course's entire snapshot. Callers must not use this to record a *failed* sync:
 * doing so would overwrite a good roster with an empty one and silently strand the class. Use
 * {@link recordLmsRosterSyncOutcome} for that.
 *
 * @param ctx - MongoDalContext
 * @param snapshot - the roster to store; `courseId` identifies the document
 *
 * @returns Nothing. Idempotent — re-running one sync converges on the same document.
 */
export async function saveCourseLmsRosterSnapshot(
    ctx: MongoDalContext,
    snapshot: CourseRosterSnapshot
): Promise<void> {
    await courseLmsRostersCollection(ctx.db).replaceOne(
        { courseId: snapshot.courseId },
        snapshot as unknown as Record<string, unknown>,
        { upsert: true }
    );

    // Counts only. The roster's contents are the thing this module exists to keep out of reach,
    // and a log line is the easiest place for them to leak back out.
    appLogger.log(
        `[lms-roster] Stored ${snapshot.entries.length} roster identities for course ${snapshot.courseId}`
    );
}

/**
 * recordLmsRosterSyncOutcome — records a sync that produced no usable roster.
 *
 * Writes status fields and leaves `entries` untouched, so the last good roster keeps working
 * while an instructor sorts out a revoked token or a missing LMS permission. When no snapshot
 * exists yet the document is created with an empty roster, which is honest: there is nothing to
 * match against, and the status says why.
 *
 * @param ctx - MongoDalContext
 * @param courseId - `activeCourse.id`
 * @param status - why the sync produced nothing; never `'ok'`
 * @param lastError - short reason for `'failed'`; must not carry an LMS payload or identifiers
 */
export async function recordLmsRosterSyncOutcome(
    ctx: MongoDalContext,
    courseId: string,
    status: Exclude<RosterSyncStatus, 'ok'>,
    lastError?: string
): Promise<void> {
    await courseLmsRostersCollection(ctx.db).updateOne(
        { courseId },
        {
            $set: {
                status,
                syncedAt: new Date(),
                ...(lastError ? { lastError } : {}),
            },
            $setOnInsert: { courseId, entries: [], rosterSize: 0, identifiedCount: 0 },
        },
        { upsert: true }
    );

    appLogger.warn(`[lms-roster] Sync for course ${courseId} ended as ${status}`);
}

/**
 * getCourseLmsRosterSnapshot — a course's current roster snapshot, or `null` when never synced.
 *
 * Returns the stored document including `entries`. Callers rendering anything for a browser
 * should project to `CourseRosterSyncSummary` instead of forwarding this.
 */
export async function getCourseLmsRosterSnapshot(
    ctx: MongoDalContext,
    courseId: string
): Promise<CourseRosterSnapshot | null> {
    const doc = await courseLmsRostersCollection(ctx.db).findOne({ courseId });
    return (doc as unknown as CourseRosterSnapshot) ?? null;
}

/** One course a roster identity was found in, with the LMS user id that row carried. */
export interface RosterEnrollmentMatch {
    courseId: string;
    /** The matched row's LMS user id — the address for later writeback to the LMS. */
    lmsUserId: string;
}

/**
 * findCoursesByRosterIdentity — every course whose stored roster contains this identity.
 *
 * The login-path query. One indexed read across all courses rather than one read per course, and
 * it returns the matched row's `lmsUserId` alongside the course so the caller can bind the LMS
 * address at the same moment it grants enrollment.
 *
 * The projection uses `$elemMatch` rather than a positional `entries.$` so the returned row is
 * provably the one that matched this hash. These arrays hold a whole class, and a projection that
 * returns "some element" would bind the wrong person's LMS user id — the identifier a later
 * feature uses to post their grade.
 *
 * @param ctx - MongoDalContext
 * @param puidHash - digest from `hashRosterPuid`, computed under the same salt as the snapshot
 *
 * @returns Matches in no particular order; empty when the user is on no stored roster, which is
 * the ordinary case for anyone whose courses were not imported from an LMS.
 */
export async function findCoursesByRosterIdentity(
    ctx: MongoDalContext,
    puidHash: string
): Promise<RosterEnrollmentMatch[]> {
    if (!puidHash) {
        return [];
    }

    const docs = await courseLmsRostersCollection(ctx.db)
        .find(
            { 'entries.puidHash': puidHash },
            { projection: { courseId: 1, entries: { $elemMatch: { puidHash } } } }
        )
        .toArray();

    return docs
        .filter((doc) => Array.isArray(doc.entries) && doc.entries.length > 0)
        .map((doc) => ({
            courseId: doc.courseId as string,
            lmsUserId: String(doc.entries[0].lmsUserId ?? ''),
        }));
}

/**
 * deleteCourseLmsRosterSnapshot — removes a course's roster.
 *
 * **Currently unused. Nothing in the application calls this.** It is kept because a roster whose
 * course is gone describes nothing and cannot be refreshed, so the cleanup will be needed the
 * moment either caller below becomes reachable — but do not read its existence as evidence that
 * they are:
 *
 * - **Course deletion** exists as `DELETE /api/courses/:id` and `DELETE /api/courses/:id/remove`,
 *   but no frontend calls either, so courses are deleted by hand against Mongo or the API. Wire
 *   this in when a deletion flow ships; until then a deleted course leaves its roster orphaned.
 * - **Disconnecting a course from its LMS** does not exist at all. `POST /canvas/auth/logout`
 *   clears one *user's* stored credential; nothing clears `activeCourse.lmsLink`.
 *
 * Orphaned snapshots are stale rather than dangerous — every entry is a keyed digest, useless
 * without the salt and unreachable once no course points at it — but they are retained data
 * nobody is tracking, which is worth closing when there is a real caller to close it from.
 *
 * Not an error when there is nothing to delete.
 */
export async function deleteCourseLmsRosterSnapshot(
    ctx: MongoDalContext,
    courseId: string
): Promise<void> {
    const result = await courseLmsRostersCollection(ctx.db).deleteOne({ courseId });
    if (result.deletedCount > 0) {
        appLogger.log(`[lms-roster] Deleted roster snapshot for course ${courseId}`);
    }
}
