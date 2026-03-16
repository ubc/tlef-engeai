/**
 * Version API route
 * Exposes backend version for display alongside frontend version in the UI.
 */

import { Router, Request, Response } from 'express';
import { backendVersion } from '../utils/backend-version';

const router = Router();

/**
 * GET /
 * Returns backend version for display alongside frontend version in the UI.
 *
 * @route GET /api/version
 * @returns {object} { backendVersion: string }
 * @response 200 - Success
 */
router.get('/', (_req: Request, res: Response) => {
    res.status(200).json({ backendVersion });
});

export default router;
