/**
 * Onboarding API routes
 *
 * Provides endpoints for the instructor onboarding flow, including demo functionality
 * such as sample chat download used in the monitor setup tutorial.
 *
 * @module routes/route-onboarding
 * @version 1.0.0
 */

import { Router, Request, Response } from 'express';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { asyncHandler } from '../middleware/async-handler';

const router = Router();

/**
 * Path to the sample chat document.
 * Resolves from dist/routes (production) to project_root/src/sample-doc/
 */
const SAMPLE_CHAT_PATH = path.join(__dirname, '..', '..', 'src', 'sample-doc', 'sample-chat.txt');

/**
 * GET /sample-chat/download
 *
 * Serves the sample chat conversation document as a downloadable file.
 * Used by the monitor setup onboarding when instructors click "Download" on
 * demo chat sessions. Returns the content of sample-chat.txt.
 *
 * @route GET /api/onboarding/sample-chat/download
 * @returns {string} Plain text file (Content-Type: text/plain, Content-Disposition: attachment)
 * @response 200 - Success, file download
 * @response 500 - Sample document not found or read error
 */
router.get(
    '/sample-chat/download',
    asyncHandler(async (req: Request, res: Response) => {
        if (!existsSync(SAMPLE_CHAT_PATH)) {
            console.error('[ONBOARDING] Sample chat file not found:', SAMPLE_CHAT_PATH);
            res.status(500).json({
                error: 'Sample chat document not available',
                message: 'The demo sample document could not be loaded.'
            });
            return;
        }

        const content = readFileSync(SAMPLE_CHAT_PATH, 'utf-8');
        const filename = 'sample-chat-conversation.txt';

        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(content);
    })
);

export default router;
