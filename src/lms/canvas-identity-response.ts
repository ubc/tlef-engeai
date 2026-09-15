/**
 * Canvas identity response — how any route answers a refused Canvas identity check
 *
 * Shared by the LMS course routes and the Writing Feedback Canvas routes, so both answer a
 * refused credential the same way.
 *
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @description: 403 response for CanvasIdentityError; the stored token is never deleted.
 */

import type { Request, Response } from 'express';
import { CANVAS_BASE_PATH } from './canvas-config';
import { CanvasIdentityError } from './canvas-course-sync';
import { appLogger } from '../utils/logger';

/**
 * handleCanvasIdentityError — shared response for a failed Canvas identity check.
 *
 * Answers `403 { error, reason }` and leaves the stored token in place for every reason,
 * `mismatch` included. The refusal already stops this request from using the credential, and
 * reconnecting overwrites it, so deleting it gains nothing. Deleting it would also break roster
 * sync, which runs under the importing instructor's token for every course they imported, after
 * a single wrong-account request.
 *
 * A `mismatch` also carries `connectUrl`. Connecting again with the right account is the fix, and
 * because the refused connection still exists, the workspace's usual "not connected" prompt would
 * never appear without it. The other reasons are not fixed by reconnecting, so they carry no link.
 *
 * @param error - Anything a Canvas-backed handler threw
 * @param req - Request whose URL the connect link returns to
 * @param res - Response to answer on
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

    // `reason` only — the message names no identifier, and the values behind this decision are
    // PUIDs that must not reach logs.
    appLogger.log(`[LMS] Canvas identity check refused: ${error.reason}`);
    res.status(403).json({
        error: error.message,
        reason: error.reason,
        ...(error.reason === 'mismatch'
            ? { connectUrl: `${CANVAS_BASE_PATH}/login?returnTo=${encodeURIComponent(req.originalUrl)}` }
            : {}),
    });
    return true;
}
