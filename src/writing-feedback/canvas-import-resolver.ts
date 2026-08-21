/**
 * Canvas import gateway resolution — picks the adapter for one staff request
 *
 * Live Canvas import needs two things that only exist per request: the Canvas course this
 * EngE-AI course was imported from, and the signed-in staff member's own Canvas credential.
 * This module answers "which adapter applies right now, and what should the workspace say
 * about it", so the route stays a thin HTTP boundary and the import service stays unaware of
 * Express, sessions, and OAuth.
 *
 * Four states are possible, and they are deliberately distinguishable rather than collapsed
 * into "works / doesn't":
 *
 * | Canvas env | Course `lmsLink` | Staff token | Result                                    |
 * |------------|------------------|-------------|-------------------------------------------|
 * | configured | present          | present     | live — reads the real Canvas course       |
 * | configured | present          | absent      | needs authorization — offers a connect URL |
 * | configured | absent           | —           | local fallback — course is not Canvas-linked |
 * | absent     | —                | —           | local fallback — demo or fail-closed by env |
 *
 * The third row matters: an admin-created course joined by code has no Canvas counterpart, so
 * there is nothing to import from no matter how well Canvas is configured.
 *
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @description: Chooses live or local Canvas import adapters for the current staff request.
 */

import type { Request } from 'express';
import { CANVAS_BASE_PATH, canvasConfig, resolveUserKey } from '../lms/canvas-config';
import type { EngEAI_MongoDB } from '../db/enge-ai-mongodb';
import { appLogger } from '../utils/logger';
import {
    createCanvasImportGateway,
    SafeCanvasImportService,
    UnconfiguredCanvasImportGateway
} from './canvas-import-service';
import { LiveCanvasImportGateway, liveCanvasStatus } from './canvas-live-import-gateway';
import type { CanvasImportGateway, CanvasImportStatus } from './canvas-import-contracts';

/** Where an unauthorized staff member is sent to authorize Canvas, returning here afterwards. */
function connectUrlFor(req: Request): string {
    return `${CANVAS_BASE_PATH}/login?returnTo=${encodeURIComponent(req.originalUrl)}`;
}

/**
 * resolveCanvasCourseId — the Canvas course this EngE-AI course was imported from.
 *
 * @param mongo - Database façade
 * @param courseId - EngE-AI course id
 * @returns Canvas course id, or `null` for a course that did not come from Canvas
 */
export async function resolveCanvasCourseId(
    mongo: EngEAI_MongoDB,
    courseId: string
): Promise<string | null> {
    const course = await mongo.getActiveCourse(courseId);
    const link = course?.lmsLink;
    return link?.provider === 'canvas' && link.courseId ? String(link.courseId) : null;
}

/**
 * hasCanvasAuthorization — whether the signed-in user has a Canvas credential on file.
 *
 * Reads presence only, and never the token's value. Deliberately does not refresh or validate:
 * this answers "should the workspace offer import or offer a connect button", and the
 * package's own `requireAuth` does the real refresh-or-fail when a request actually calls
 * Canvas. An expired-but-refreshable token correctly reads as present here.
 *
 * @param req - Express request carrying the authenticated user
 * @returns True when a stored Canvas authorization exists for this user
 */
export async function hasCanvasAuthorization(req: Request): Promise<boolean> {
    if (!canvasConfig) return false;
    try {
        return (await canvasConfig.tokenStore.get(await resolveUserKey(req))) !== null;
    } catch (error) {
        // A token-store read failure must not present as "connected" — the next real Canvas
        // call would fail anyway, and offering import here would be a worse experience than
        // offering the connect button. The error carries no identifier, so it is safe to log.
        appLogger.error('[WritingFeedback] Canvas authorization check failed:', error);
        return false;
    }
}

/**
 * isLiveCanvasCourse — whether this request should read Canvas rather than local fixtures.
 *
 * Used to decide whether to apply the package's `requireAuth` middleware. It intentionally
 * ignores whether the user is authorized: a linked course with no credential must reach
 * `requireAuth` and receive its `401` + `connectUrl`, not silently fall back to demo data that
 * looks like the course's real submissions.
 *
 * @param mongo - Database façade
 * @param courseId - EngE-AI course id
 * @returns True when Canvas is configured and this course came from Canvas
 */
export async function isLiveCanvasCourse(mongo: EngEAI_MongoDB, courseId: string): Promise<boolean> {
    if (!canvasConfig) return false;
    return (await resolveCanvasCourseId(mongo, courseId)) !== null;
}

/**
 * resolveCanvasImportService — builds the import service for one staff request.
 *
 * `req.canvasApi` is present only when the route applied the package's `requireAuth`, which
 * happens exactly when {@link isLiveCanvasCourse} was true. Its absence is therefore not an
 * error; it means this course has no Canvas counterpart and the local adapter applies.
 *
 * @param req - Express request, carrying `canvasApi` when Canvas auth ran
 * @param mongo - Database façade, used as both the persistence store and the link lookup
 * @param courseId - EngE-AI course id
 * @returns Import service bound to the live or local adapter as appropriate
 */
export async function resolveCanvasImportService(
    req: Request,
    mongo: EngEAI_MongoDB,
    courseId: string
): Promise<SafeCanvasImportService> {
    const canvasCourseId = canvasConfig ? await resolveCanvasCourseId(mongo, courseId) : null;
    const client = (req as any).canvasApi;

    let gateway: CanvasImportGateway;
    if (canvasCourseId && client) {
        gateway = new LiveCanvasImportGateway({ client, canvasCourseId });
    } else if (canvasCourseId) {
        // Linked to Canvas but no client reached this handler — the auth middleware should have
        // answered 401 first, so this is a wiring fault. Fail closed rather than falling through
        // to the local adapter, which outside production is the demo one: serving synthetic
        // fixtures here would present invented text as this course's real student submissions.
        appLogger.error('[WritingFeedback] Canvas-linked course reached import without a Canvas client');
        gateway = new UnconfiguredCanvasImportGateway();
    } else {
        gateway = createCanvasImportGateway();
    }

    return new SafeCanvasImportService(mongo, gateway);
}

/**
 * resolveCanvasImportStatus — the integration state to show before any import action.
 *
 * Reports the "linked but unauthorized" case itself rather than delegating to an adapter,
 * because no adapter can be constructed in that state: there is no client to build one with.
 * It resolves without calling Canvas, so the workspace header stays cheap to load.
 *
 * @param req - Express request carrying the authenticated user
 * @param mongo - Database façade
 * @param courseId - EngE-AI course id
 * @returns Honest capability state, including a connect URL when authorization is the blocker
 */
export async function resolveCanvasImportStatus(
    req: Request,
    mongo: EngEAI_MongoDB,
    courseId: string
): Promise<CanvasImportStatus> {
    const canvasCourseId = canvasConfig ? await resolveCanvasCourseId(mongo, courseId) : null;
    if (!canvasCourseId) {
        // Not a Canvas course, or Canvas is not deployed: the env-selected local adapter is
        // the honest answer, and already explains itself.
        return createCanvasImportGateway().getStatus();
    }

    if (!(await hasCanvasAuthorization(req))) {
        return {
            mode: 'not_configured',
            integration: 'none',
            connected: false,
            canImport: false,
            syntheticDataOnly: false,
            label: 'Connect your Canvas account',
            message:
                'This course is linked to Canvas, but you have not authorized EngE-AI to read Canvas on your behalf. Submissions are read with your own Canvas permissions, so each staff member connects separately.',
            nextStep: 'Connect Canvas to browse this course’s assignments.',
            connectUrl: connectUrlFor(req)
        };
    }

    return liveCanvasStatus();
}
