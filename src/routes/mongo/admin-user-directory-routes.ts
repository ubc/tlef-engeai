/**
 * admin-user-directory-routes.ts
 *
 * Platform-admin user directory. Mounted at `/api/admin/user-directory`.
 *
 * Responses carry PUIDs: admin-gated, never cached, and the search text (which may be a PUID) is
 * never logged.
 */

import { Router, Request, Response } from 'express';
import { asyncHandlerWithAuth } from '../../middleware/async-handler';
import { requireAdminGlobal } from '../../middleware/require-course-role';
import { EngEAI_MongoDB } from '../../db/enge-ai-mongodb';
import { parseUserDirectoryQuery, toUserDirectoryEntry } from '../../helpers/user-directory';
import type { UserDirectoryPage } from '../../types/shared';

const router = Router();

/**
 * GET / — one page of users, filtered by `q` (name substring, or exact PUID / userId) and
 * `affiliation`, sorted by name, with each user's course roles and LMS connection presence.
 */
router.get(
    '/',
    requireAdminGlobal,
    asyncHandlerWithAuth(async (req: Request, res: Response) => {
        res.set('Cache-Control', 'no-store');

        const parsed = parseUserDirectoryQuery(req.query as Record<string, unknown>);
        if (!parsed.ok) {
            return res.status(400).json({ success: false, error: parsed.error });
        }

        const mongo = await EngEAI_MongoDB.getInstance();
        const [{ users, total }, courses] = await Promise.all([
            mongo.listGlobalUsersForDirectory(parsed.value),
            mongo.getAllActiveCourses()
        ]);
        // Only this page's users, so the token lookup stays one bounded query per LMS.
        const lms = await mongo.findLmsConnectedUserIds(users.map((user) => user.userId));
        const context = {
            courses: new Map(courses.map((course) => [course.id, course])),
            canvasConnected: lms.canvas,
            moodleConnected: lms.moodle
        };

        const data: UserDirectoryPage = {
            items: users.map((user) => toUserDirectoryEntry(user, context)),
            page: parsed.value.page,
            pageSize: parsed.value.pageSize,
            total
        };
        res.json({ success: true, data });
    })
);

export default router;
