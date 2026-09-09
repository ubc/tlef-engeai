/**
 * LMS integration routes — Canvas (OAuth) and Moodle (pasted web service token)
 *
 * Mounts the `@ubc/ubc-genai-toolkit-lms-integration` auth routers and a pair of
 * read-only course endpoints, plus a secret-free diagnostics endpoint.
 *
 * Two invariants shape this module:
 *
 * 1. **PUID never leaves `active-users`.** The token stores are keyed by
 *    `GlobalUser.userId`, resolved per request from the signed-in user's PUID.
 *    See {@link resolveUserKey}.
 * 2. **Missing configuration disables a provider rather than crashing the app.**
 *    `loadConfigFromEnv` throws when its variables are unset, so each provider is
 *    built behind a configuration check and simply not mounted when absent.
 * 3. **A stored credential is not an authorization.** The providers' own `requireAuth`
 *    proves only that a usable LMS credential exists, never that its holder may act on
 *    a course. Every route below therefore states its own EngE-AI authorization, and
 *    every write re-derives the caller's Canvas enrollment from Canvas rather than
 *    trusting a course id from the browser — see `src/lms/canvas-course-sync.ts`.
 *
 *    Canvas connection was previously instructor-only, on the reasoning that storing an
 *    OAuth token EngE-AI had no feature for was a liability. Course enrollment sync is
 *    that feature: a student connects Canvas to find the courses their instructors have
 *    imported, so the token now backs a student-facing capability. Moodle has no such
 *    feature and stays instructor-only.
 *
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @description: Per-user Canvas and Moodle connections for the signed-in user.
 */

import express, { Request, Response, Router } from 'express';
import {
    canvas,
    moodle,
    createMongoTokenStore,
} from '@ubc/ubc-genai-toolkit-lms-integration';
import { EngEAI_MongoDB } from '../db/enge-ai-mongodb';
import {
    CANVAS_BASE_PATH,
    CANVAS_REQUIRED_ENV,
    canvasConfig,
    canvasTokenCollectionName,
    hasEnv,
    LMS_BASE_PATH,
    mongoDbProvider,
    resolveUserKey,
} from '../lms/canvas-config';
import { requireAuthAPI } from '../middleware/require-auth';
import { asRouteParam } from '../helpers/route-params';
import {
    requireInstructorForCourseAPI,
    requireInstructorGlobal,
    requireRosterManageAPI,
} from '../middleware/require-course-role';
import {
    CanvasIdentityError,
    CanvasStudentPathRemovedError,
    connectCanvasCourse,
    listCanvasCourseOptions,
} from '../lms/canvas-course-sync';
import { RosterSyncUnavailableError, syncCanvasCourseRoster } from '../lms/canvas-roster-sync';
import type { CourseRosterSyncSummary, GlobalUser } from '../types/shared';
import { appLogger } from '../utils/logger';

/** Moodle connect/disconnect router mount. */
const MOODLE_BASE_PATH = `${LMS_BASE_PATH}/moodle/auth`;

/** Environment variables Moodle requires before its provider is mounted. */
const MOODLE_REQUIRED_ENV = ['MOODLE_DOMAIN'] as const;

/** Moodle configuration, or `null` when the provider is not configured. */
const moodleConfig = hasEnv(MOODLE_REQUIRED_ENV)
    ? moodle.loadConfigFromEnv({
          tokenStore: createMongoTokenStore(mongoDbProvider, {
              collectionName: process.env.MOODLE_TOKEN_COLLECTION_NAME || 'moodle_tokens',
          }),
          getUserKey: resolveUserKey,
          basePath: MOODLE_BASE_PATH,
      })
    : null;

/**
 * handleCanvasIdentityError — shared response for a failed Canvas identity check.
 *
 * On a genuine `mismatch` the stored token is deleted before responding. Keeping it would trap
 * the user: every retry hits the same wrong Canvas account, and "reconnect" cannot help while
 * the bad credential is still on file. Deleting it makes the next attempt a real re-authorization.
 *
 * The other two reasons deliberately keep the token. `identifiers_withheld` means Canvas declined
 * to serialize `integration_id` — the credential may be perfectly correct, and discarding it would
 * punish an instructor for an account permission they do not control. `no_puid` is an EngE-AI-side
 * gap that reconnecting cannot fix either.
 *
 * Exported for testing: which reasons discard a credential is the security-relevant decision in
 * this module, and it is not otherwise reachable without standing up the whole OAuth flow.
 *
 * @returns `true` when the error was handled and a response has been sent.
 */
export async function handleCanvasIdentityError(
    error: unknown,
    req: Request,
    res: Response
): Promise<boolean> {
    if (!(error instanceof CanvasIdentityError)) {
        return false;
    }

    if (error.reason === 'mismatch' && canvasConfig) {
        try {
            await canvasConfig.tokenStore.delete(await resolveUserKey(req));
        } catch (deleteError) {
            // The user still needs the 403 explaining what went wrong; a failed cleanup makes
            // their next attempt repeat, it does not make this response less correct.
            appLogger.error('[LMS] Failed to clear mismatched Canvas token:', deleteError);
        }
    }

    // `reason` only — the message names no identifier, and the values behind this decision are
    // PUIDs that must not reach logs.
    appLogger.log(`[LMS] Canvas identity check refused: ${error.reason}`);
    res.status(403).json({ error: error.message, reason: error.reason });
    return true;
}

const router: Router = express.Router();

/**
 * @route GET /api/lms/status
 * @description Reports which providers are enabled, for setup diagnostics.
 * Emits configuration presence only — never a domain secret, client secret or token.
 * @access Authenticated users — deliberately not instructor-gated, unlike the
 * connect and course routes: it exposes nothing sensitive and is useful to anyone
 * debugging a deployment.
 */
router.get('/status', requireAuthAPI, (_req: Request, res: Response) => {
    res.json({
        packageLoaded: true,
        providers: {
            canvas: {
                enabled: canvasConfig !== null,
                basePath: CANVAS_BASE_PATH,
                tokenCollection: canvasTokenCollectionName,
                missingEnv: CANVAS_REQUIRED_ENV.filter((name) => !process.env[name]),
            },
            moodle: {
                enabled: moodleConfig !== null,
                basePath: MOODLE_BASE_PATH,
                tokenCollection: process.env.MOODLE_TOKEN_COLLECTION_NAME || 'moodle_tokens',
                missingEnv: MOODLE_REQUIRED_ENV.filter((name) => !process.env[name]),
            },
        },
    });
});

if (canvasConfig) {
    /**
     * Canvas OAuth: `/login`, `/callback`, `/logout`.
     *
     * `requireAuthAPI` runs first so the user is signed into EngE-AI before any
     * OAuth state is created — `getUserKey` cannot resolve otherwise. The
     * package's router relies on `req.session`, which `server.ts` mounts well
     * before this router.
     *
     * Open to students as well as instructors: both connect Canvas to resolve their
     * own course enrollment. What each may then *do* differs, and is enforced per
     * route below rather than at the connection.
     */
    router.use('/canvas/auth', requireAuthAPI, canvas.createAuthRouter(canvasConfig));

    /**
     * @route GET /api/lms/canvas/courses
     * @description Raw Canvas course list for the signed-in user. Diagnostics only.
     * @access Instructors and admins with a stored Canvas authorization
     *
     * Kept instructor-only because it returns each course's provider `raw` payload
     * verbatim. `/canvas/available-courses` is the route the UI uses.
     *
     * Uses the package's `requireAuth` (JSON 401 carrying `connectUrl`) rather
     * than `ensureAuth`, because a redirect is not actionable for a fetch/XHR
     * caller. A browser-facing LMS **page** route should use
     * `canvas.ensureAuth(canvasConfig)` instead, which redirects to `/login`.
     */
    router.get(
        '/canvas/courses',
        requireAuthAPI,
        requireInstructorGlobal,
        canvas.requireAuth(canvasConfig),
        async (req: Request, res: Response) => {
            try {
                res.json(await canvas.getCourses(req.canvasApi!));
            } catch (error) {
                appLogger.error('[LMS] Canvas course fetch failed:', error);
                res.status(502).json({ error: 'Could not retrieve Canvas courses' });
            }
        }
    );

    /**
     * @route GET /api/lms/canvas/available-courses
     * @description The signed-in user's Canvas courses, annotated with whether EngE-AI
     * already has each one. Instructors see courses they teach; students see courses
     * they are enrolled in. Drives the "Connect to Canvas" picker.
     * @access Any authenticated user with a stored Canvas authorization
     *
     * Returns only normalized fields — never the provider `raw` payload, which carries
     * Canvas internals the browser has no use for.
     */
    router.get(
        '/canvas/available-courses',
        requireAuthAPI,
        canvas.requireAuth(canvasConfig),
        async (req: Request, res: Response) => {
            try {
                const globalUser = (req.session as any).globalUser as GlobalUser | undefined;
                if (!globalUser) {
                    return res.status(401).json({ error: 'Authentication required' });
                }

                const mongoDB = await EngEAI_MongoDB.getInstance();
                const courses = await listCanvasCourseOptions(req.canvasApi!, mongoDB, globalUser);
                res.json({ success: true, courses });
            } catch (error) {
                // Identity is checked here, not only at import: this response would otherwise
                // disclose the course names of whoever the stored token actually belongs to.
                if (error instanceof CanvasStudentPathRemovedError) {
                    return res.status(403).json({ error: error.message, reason: 'student_path_removed' });
                }
                if (await handleCanvasIdentityError(error, req, res)) {
                    return;
                }
                appLogger.error('[LMS] Canvas available-course listing failed:', error);
                res.status(502).json({ error: 'Could not retrieve your Canvas courses' });
            }
        }
    );

    /**
     * @route POST /api/lms/canvas/connect-course
     * @description Connects one Canvas course for the signed-in user. An instructor
     * imports it (or joins the EngE-AI course already imported from it); a student is
     * enrolled in the course their instructor imported.
     * @access Any authenticated user with a stored Canvas authorization
     * @param {string} canvasCourseId - Canvas course id (body)
     *
     * The body id is untrusted: `connectCanvasCourse` re-reads the caller's enrollments
     * from Canvas and refuses anything absent from them, so a forged id cannot import a
     * course the caller does not teach.
     *
     * `409` covers the two "your data is fine, the setup is not" cases — a name collision
     * with an unlinked EngE-AI course, and a Canvas course already claimed by a different
     * EngE-AI course. Both need a human decision rather than a retry.
     */
    router.post(
        '/canvas/connect-course',
        requireAuthAPI,
        canvas.requireAuth(canvasConfig),
        async (req: Request, res: Response) => {
            const globalUser = (req.session as any).globalUser as GlobalUser | undefined;
            if (!globalUser) {
                return res.status(401).json({ error: 'Authentication required' });
            }

            const canvasCourseId = req.body?.canvasCourseId;
            if (typeof canvasCourseId !== 'string' || canvasCourseId.trim() === '') {
                return res.status(400).json({ error: 'canvasCourseId is required' });
            }

            const academicPeriodId =
                typeof req.body?.academicPeriodId === 'string' && req.body.academicPeriodId.trim() !== ''
                    ? req.body.academicPeriodId.trim()
                    : undefined;

            try {
                const mongoDB = await EngEAI_MongoDB.getInstance();
                const result = await connectCanvasCourse(
                    req.canvasApi!,
                    mongoDB,
                    globalUser,
                    canvasCourseId.trim(),
                    academicPeriodId
                );
                res.json({ success: true, ...result });
            } catch (error) {
                if (error instanceof CanvasStudentPathRemovedError) {
                    return res.status(403).json({ error: error.message, reason: 'student_path_removed' });
                }
                if (await handleCanvasIdentityError(error, req, res)) {
                    return;
                }

                const message = error instanceof Error ? error.message : 'Unknown error';
                appLogger.error('[LMS] Canvas course connect failed:', { message });

                if (
                    message.includes('not listed as an instructor') ||
                    message.includes('not enrolled in')
                ) {
                    return res.status(403).json({ error: message });
                }
                if (message.includes('already')) {
                    return res.status(409).json({ error: message });
                }
                res.status(502).json({ error: 'Could not connect that Canvas course' });
            }
        }
    );

    /**
     * @route GET /api/lms/canvas/courses/:courseId/roster-status
     * @description When this course's Canvas roster last synced, and how it went. Drives the
     * dashboard control's resting state so staff can see the roster's age without running a sync.
     * @access Course staff (`requireInstructorForCourseAPI`) — read-only, so TAs are included;
     * a TA fielding "why can't I see this course?" needs the roster's age to answer it.
     * @param {string} courseId - EngE-AI course id (path)
     *
     * Returns `{ success: true, summary: null }` for a Canvas-linked course that has never been
     * synced. Null is the honest answer there and the client renders its own first-run copy —
     * inventing a zero-count summary would claim a sync happened and found nobody.
     *
     * Projects the stored snapshot to counts and status. `entries` are never returned: they are
     * roster identities, and no browser has a use for them.
     */
    router.get(
        '/canvas/courses/:courseId/roster-status',
        requireAuthAPI,
        requireInstructorForCourseAPI(['params']),
        async (req: Request, res: Response) => {
            try {
                const mongoDB = await EngEAI_MongoDB.getInstance();
                const snapshot = await mongoDB.getCourseLmsRosterSnapshot(asRouteParam(req.params.courseId));
                if (!snapshot) {
                    return res.json({ success: true, summary: null });
                }

                const summary: CourseRosterSyncSummary = {
                    courseId: snapshot.courseId,
                    status: snapshot.status,
                    syncedAt: snapshot.syncedAt,
                    rosterSize: snapshot.rosterSize,
                    identifiedCount: snapshot.identifiedCount,
                    message: '',
                };
                res.json({ success: true, summary });
            } catch (error) {
                appLogger.error('[LMS] Canvas roster status read failed:', error);
                res.status(502).json({ error: 'Could not read the roster status for that course' });
            }
        }
    );

    /**
     * @route POST /api/lms/canvas/courses/:courseId/sync-roster
     * @description Re-reads the linked Canvas course's student roster and stores it as matchable
     * identities, so enrolled students see the course when they next sign in to EngE-AI.
     * @access Course instructors and platform admins (`requireRosterManageAPI`) — TAs excluded,
     * matching the existing rule that TAs are course staff but cannot change roster membership.
     * @param {string} courseId - EngE-AI course id (path)
     *
     * The caller's own Canvas token is deliberately *not* used. The read runs under the
     * credential of the instructor who imported the course (`lmsLink.linkedBy`), because an
     * EngE-AI admin holds no Canvas enrollment and could never read a roster with their own
     * authorization. Authorization to trigger the sync and the credential it runs under are
     * separate questions; only the first is decided here.
     *
     * Returns 200 with a `CourseRosterSyncSummary` even when the sync produced nothing usable —
     * a revoked credential or a withheld SIS identifier is a real, reportable outcome that the
     * instructor needs to see and act on, not a transport error. Only a course that cannot be
     * synced in principle is refused: 409 when it has no Canvas link (an admin must not be able
     * to sync an unlinked course, which is the first step toward connecting Canvas on an
     * instructor's behalf), and 503 when the deployment has no roster hashing salt configured.
     */
    router.post(
        '/canvas/courses/:courseId/sync-roster',
        requireAuthAPI,
        requireRosterManageAPI(['params']),
        async (req: Request, res: Response) => {
            const globalUser = (req.session as any).globalUser as GlobalUser | undefined;
            if (!globalUser) {
                return res.status(401).json({ error: 'Authentication required' });
            }

            try {
                const mongoDB = await EngEAI_MongoDB.getInstance();
                // The middleware proved the course exists and the caller may manage its roster;
                // it does not hand the document over, so it is re-read here.
                const course = await mongoDB.getActiveCourse(asRouteParam(req.params.courseId));
                if (!course) {
                    return res.status(404).json({ error: 'Course not found' });
                }

                const summary = await syncCanvasCourseRoster(mongoDB, course, globalUser.userId);
                res.json({ success: true, summary });
            } catch (error) {
                if (error instanceof RosterSyncUnavailableError) {
                    return res
                        .status(error.reason === 'not_linked' ? 409 : 503)
                        .json({ error: error.message, reason: error.reason });
                }

                appLogger.error('[LMS] Canvas roster sync failed:', error);
                res.status(502).json({ error: 'Could not sync the roster for that course' });
            }
        }
    );

    appLogger.log(`[LMS] Canvas provider enabled at ${CANVAS_BASE_PATH}`);
} else {
    appLogger.log(
        `[LMS] Canvas provider disabled — unset: ${CANVAS_REQUIRED_ENV.filter((n) => !process.env[n]).join(', ')}`
    );
}

if (moodleConfig) {
    /**
     * Moodle: `/connect` (body `{ token }`) and `/disconnect`.
     *
     * `/connect` needs `express.json()`, which `server.ts` mounts before this
     * router. There is no OAuth redirect here — the user pastes a `wstoken`
     * they generated in Moodle, and the package validates it with
     * `core_webservice_get_site_info` before storing.
     */
    router.use(
        '/moodle/auth',
        requireAuthAPI,
        requireInstructorGlobal,
        moodle.createAuthRouter(moodleConfig)
    );

    /**
     * @route GET /api/lms/moodle/courses
     * @description Courses the signed-in user is enrolled in on Moodle.
     * @access Authenticated users with a stored Moodle token
     */
    router.get(
        '/moodle/courses',
        requireAuthAPI,
        requireInstructorGlobal,
        moodle.requireAuth(moodleConfig),
        async (req: Request, res: Response) => {
            try {
                res.json(await moodle.getCourses(req.moodleApi!));
            } catch (error) {
                appLogger.error('[LMS] Moodle course fetch failed:', error);
                res.status(502).json({ error: 'Could not retrieve Moodle courses' });
            }
        }
    );

    appLogger.log(`[LMS] Moodle provider enabled at ${MOODLE_BASE_PATH}`);
} else {
    appLogger.log(
        `[LMS] Moodle provider disabled — unset: ${MOODLE_REQUIRED_ENV.filter((n) => !process.env[n]).join(', ')}`
    );
}

export default router;
