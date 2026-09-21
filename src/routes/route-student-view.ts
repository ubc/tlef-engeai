// route-student-view.ts
/**
 * route-student-view.ts
 * @description Student View controls: enter, exit and reset a staff member's private test student.
 *
 * These three endpoints are the only ones exempt from `studentViewImpersonation`, so their
 * guard always authorizes the real staff member — including while they are already previewing.
 * Authority is `requireRosterManageAPI`: faculty instructors of the course and platform
 * admins. Teaching assistants are refused; admitting them later is a change of guard here.
 */

import express, { Request, Response } from 'express';
import { EngEAI_MongoDB } from '../db/enge-ai-mongodb';
import { asRouteParam } from '../helpers/route-params';
import { asyncHandlerWithAuth } from '../middleware/async-handler';
import { requireRosterManageAPI } from '../middleware/require-course-role';
import type { StudentViewSession } from '../middleware/student-view';
import type { activeCourse, GlobalUser } from '../types/shared';
import { appLogger } from '../utils/logger';

const router = express.Router();

type StudentViewSessionStore = {
    studentView?: StudentViewSession;
    globalUser?: GlobalUser;
};

/**
 * Resolve the course and the acting staff member, after the guard has already proved
 * both exist and that this person may manage the course.
 */
async function loadActor(req: Request): Promise<{
    mongoDB: EngEAI_MongoDB;
    course: activeCourse;
    courseId: string;
    globalUser: GlobalUser | null;
}> {
    const courseId = asRouteParam(req.params.courseId);
    const mongoDB = await EngEAI_MongoDB.getInstance();
    const course = (await mongoDB.getActiveCourse(courseId)) as unknown as activeCourse;
    const actorPuid = (req as unknown as { user: { puid: string } }).user.puid;
    const globalUser = await mongoDB.findGlobalUserByPUID(actorPuid);
    return { mongoDB, course, courseId, globalUser };
}

/**
 * POST /:courseId/student-view/enter — begin previewing as this staff member's test student.
 *
 * Creates the test student on first use and reuses it afterwards, so chats survive leaving
 * and re-entering. Entering for a second course replaces the first session outright: the
 * session holds exactly one Student View at a time.
 *
 * @returns `{ success, redirectTo }` — the student shell for this course
 */
router.post(
    '/:courseId/student-view/enter',
    requireRosterManageAPI(['params']),
    asyncHandlerWithAuth(async (req: Request, res: Response) => {
        const { mongoDB, course, courseId, globalUser } = await loadActor(req);
        if (!globalUser) {
            return res.status(401).json({ error: 'User not found' });
        }

        const identity = await mongoDB.ensureTestStudent(course, globalUser.userId);
        const session = req.session as unknown as StudentViewSessionStore;
        session.studentView = { courseId, testStudentUserId: identity.userId };

        appLogger.log(`[STUDENT-VIEW] entered for course ${courseId}`);
        return res.json({ success: true, redirectTo: `/course/${courseId}/student` });
    })
);

/**
 * POST /:courseId/student-view/exit — stop previewing and return to the instructor dashboard.
 *
 * Restores the session's cached `globalUser` to the staff member so the very next request
 * is theirs again, rather than waiting for the middleware's repair path.
 *
 * @returns `{ success, redirectTo }` — the instructor dashboard for this course
 */
router.post(
    '/:courseId/student-view/exit',
    requireRosterManageAPI(['params']),
    asyncHandlerWithAuth(async (req: Request, res: Response) => {
        const { courseId, globalUser } = await loadActor(req);
        const session = req.session as unknown as StudentViewSessionStore;

        delete session.studentView;
        if (globalUser) {
            session.globalUser = globalUser;
        }

        appLogger.log(`[STUDENT-VIEW] exited for course ${courseId}`);
        return res.json({ success: true, redirectTo: `/course/${courseId}/instructor/dashboard` });
    })
);

/**
 * POST /:courseId/student-view/reset — delete everything the test student produced, then recreate it.
 *
 * The purge asserts `isTestStudent` before deleting anything, so a real student is
 * unreachable from here. The session is repointed at the recreated student, and only while
 * it is this course that is being previewed.
 *
 * @returns `{ success, testStudentUserId }`
 */
router.post(
    '/:courseId/student-view/reset',
    requireRosterManageAPI(['params']),
    asyncHandlerWithAuth(async (req: Request, res: Response) => {
        const { mongoDB, course, courseId, globalUser } = await loadActor(req);
        if (!globalUser) {
            return res.status(401).json({ error: 'User not found' });
        }

        const existing = await mongoDB.findTestStudent(courseId, globalUser.userId);
        if (existing) {
            await mongoDB.purgeTestStudent(course, existing.userId);
        }
        const identity = await mongoDB.ensureTestStudent(course, globalUser.userId);

        const session = req.session as unknown as StudentViewSessionStore;
        if (session.studentView?.courseId === courseId) {
            session.studentView = { courseId, testStudentUserId: identity.userId };
        }

        appLogger.log(`[STUDENT-VIEW] reset for course ${courseId}`);
        return res.json({ success: true, testStudentUserId: identity.userId });
    })
);

export default router;
