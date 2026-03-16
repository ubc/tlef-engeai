/**
 * Version API route
 * Exposes unified app version for display in the UI.
 */

import { Router, Request, Response } from 'express';
import { appVersion } from '../utils/app-version';

const router = Router();

/**
 * GET /
 * Returns unified app version for display in the UI.
 *
 * @route GET /api/version
 * @returns {object} { version: string }
 * @response 200 - Success
 */
router.get('/', (_req: Request, res: Response) => {
    res.status(200).json({ version: appVersion });
});

export default router;
