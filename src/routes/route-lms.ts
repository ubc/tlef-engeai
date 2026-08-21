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
import type { MongoDbLike } from '@ubc/ubc-genai-toolkit-lms-integration';
import { EngEAI_MongoDB } from '../db/enge-ai-mongodb';
import { requireAuthAPI } from '../middleware/require-auth';
import { requireInstructorGlobal } from '../middleware/require-course-role';
import {
    CanvasIdentityError,
    connectCanvasCourse,
    listCanvasCourseOptions,
} from '../lms/canvas-course-sync';
import type { GlobalUser } from '../types/shared';
import { appLogger } from '../utils/logger';

/** Mount point of this router, and the prefix every `basePath` below builds on. */
const LMS_BASE_PATH = '/api/lms';

/** Canvas OAuth router mount. Must line up with `CANVAS_REDIRECT_URI`'s path. */
const CANVAS_BASE_PATH = `${LMS_BASE_PATH}/canvas/auth`;

/** Moodle connect/disconnect router mount. */
const MOODLE_BASE_PATH = `${LMS_BASE_PATH}/moodle/auth`;

/**
 * Environment variables each provider requires. `loadConfigFromEnv` throws and
 * names the missing ones; these lists let us decide whether to call it at all.
 */
const CANVAS_REQUIRED_ENV = [
    'CANVAS_DOMAIN',
    'CANVAS_CLIENT_ID',
    'CANVAS_CLIENT_SECRET',
    'CANVAS_REDIRECT_URI',
] as const;
const MOODLE_REQUIRED_ENV = ['MOODLE_DOMAIN'] as const;

/** True when every named variable is set to a non-empty value. */
function hasEnv(names: readonly string[]): boolean {
    return names.every((name) => Boolean(process.env[name]));
}

/**
 * resolveUserKey — derives the token-store key for the signed-in user.
 *
 * The LMS package persists this value as the document key in the token
 * collections. It must therefore **never** be the PUID: `active-users` is the
 * only collection permitted to store one. `GlobalUser.userId` is the stable
 * internal identifier and is what gets persisted here.
 *
 * The lookup is asynchronous because `req.user` carries only the PUID; the
 * package accepts `string | Promise<string>` for exactly this case.
 *
 * Exported for testing: the PUID-never-persisted invariant is the single most
 * important behaviour in this module and must be regression-guarded.
 *
 * @param req - Express request carrying the passport-authenticated user
 * @returns The user's internal `GlobalUser.userId`
 * @throws {Error} When no user is signed in, or has no `active-users` record
 */
export async function resolveUserKey(req: Request): Promise<string> {
    const puid = (req as any).user?.puid;
    if (!puid) {
        throw new Error('LMS token lookup attempted without an authenticated user');
    }

    const mongoDB = await EngEAI_MongoDB.getInstance();
    const globalUser = await mongoDB.findGlobalUserByPUID(puid);
    if (!globalUser) {
        // Deliberately does not include the PUID — it must not reach logs.
        throw new Error('No active-users record for the signed-in user');
    }

    return globalUser.userId;
}

/**
 * Resolves the shared `Db` handle lazily, so this module does not force a
 * connect at import time.
 *
 * The cast is necessary and sound. The package models `MongoCollectionLike`
 * structurally and documents that "any real `Collection` instance satisfies
 * this shape as-is" — which does not hold against the mongodb 6.x driver: the
 * package types `createIndex`'s spec as `Record<string, unknown>` while the
 * driver types it `IndexSpecification`, and neither is assignable to the other,
 * so even bivariant method checking rejects it. At runtime the adapter only ever
 * calls `createIndex({ userKey: 1 }, { unique: true })`, which is a valid
 * `IndexSpecification`, so the structural contract genuinely is satisfied.
 */
const mongoDbProvider = async (): Promise<MongoDbLike> =>
    (await EngEAI_MongoDB.getInstance()).db as unknown as MongoDbLike;

/**
 * Canvas configuration, or `null` when the provider is not configured.
 *
 * A separate collection per provider is mandatory: the store is keyed only by
 * `userKey`, with no provider discriminator, so a shared collection would have
 * each provider silently overwrite the other's tokens.
 */
const canvasConfig = hasEnv(CANVAS_REQUIRED_ENV)
    ? canvas.loadConfigFromEnv({
          tokenStore: createMongoTokenStore(mongoDbProvider, {
              collectionName: process.env.CANVAS_TOKEN_COLLECTION_NAME || 'canvas_tokens',
          }),
          getUserKey: resolveUserKey,
          basePath: CANVAS_BASE_PATH,
      })
    : null;

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
                tokenCollection: process.env.CANVAS_TOKEN_COLLECTION_NAME || 'canvas_tokens',
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
