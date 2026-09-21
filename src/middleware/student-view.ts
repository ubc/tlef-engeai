// student-view.ts
/**
 * student-view.ts
 * @description Per-request impersonation for Student View: while a staff member is previewing
 *              their own course, the request carries the test student's identity instead of theirs.
 *
 * Registered immediately after `passport.session()`. Passport's `serializeUser` and
 * `deserializeUser` are identity functions, so the real staff user always sits in
 * `req.session.passport.user` and is re-assigned to `req.user` before this runs. Overwriting
 * `req.user` is therefore per-request and self-healing, and the real identity cannot be lost.
 */

import type { NextFunction, Request, Response } from 'express';
import { EngEAI_MongoDB } from '../db/enge-ai-mongodb';
import type { GlobalUser } from '../types/shared';
import { appLogger } from '../utils/logger';

/** What Student View stores on the session. The real staff identity stays in `session.passport.user`. */
export interface StudentViewSession {
    /** Course being previewed. */
    courseId: string;
    /** `GlobalUser.userId` of the test student standing in for the staff member. */
    testStudentUserId: string;
}

/** The real staff member behind an impersonated request, for handlers that need to know. */
export interface StudentViewActor {
    puid?: string;
    userId?: string;
}

type StudentViewRequest = Request & {
    user?: Record<string, unknown> & { puid?: string };
    studentViewActor?: StudentViewActor;
};

type StudentViewSessionStore = {
    studentView?: StudentViewSession;
    globalUser?: GlobalUser;
};

/**
 * isStudentViewControlPath — true for the enter / exit / reset endpoints.
 *
 * Those three authorize the real staff member, including while they are already previewing,
 * so they are the one place impersonation must not happen.
 *
 * @param path - Request path
 */
export function isStudentViewControlPath(path: string): boolean {
    return /^\/api\/course\/[^/]+\/student-view\//.test(path);
}

/**
 * Session-user shape Passport stores. Only these fields are read downstream, and `puid`
 * is the synthetic Student View identifier rather than anything issued by CWL.
 */
function testStudentSessionUser(globalUser: GlobalUser): Record<string, unknown> {
    return {
        username: globalUser.name,
        puid: globalUser.puid,
        firstName: 'Test',
        lastName: 'student',
        affiliation: 'student',
        email: '',
        sessionIndex: null,
        nameID: globalUser.userId,
        nameIDFormat: 'student-view'
    };
}

/**
 * studentViewImpersonation — swap identity for the duration of one request.
 *
 * Course scoping needs no check here: the test student is enrolled in exactly one course,
 * so `validateCourseAccess` and `loadCourseContext` refuse every other one on their own.
 *
 * @returns Nothing; always calls `next()`, impersonating only when the session says to
 */
export async function studentViewImpersonation(
    req: Request,
    _res: Response,
    next: NextFunction
): Promise<void> {
    const request = req as StudentViewRequest;
    const session = request.session as unknown as StudentViewSessionStore | undefined;
    const actor = request.user;

    // 1. Not previewing: repair a session left holding a test student, then carry on.
    if (!session?.studentView) {
        if (session?.globalUser?.isTestStudent && actor?.puid) {
            const mongoDB = await EngEAI_MongoDB.getInstance();
            const real = await mongoDB.findGlobalUserByPUID(actor.puid);
            if (real) {
                session.globalUser = real;
            }
        }
        next();
        return;
    }

    // 2. The control endpoints authorize the staff member, so never swap there.
    if (isStudentViewControlPath(request.path)) {
        next();
        return;
    }

    // 3. Load the test student; a missing one means the session is stale.
    const mongoDB = await EngEAI_MongoDB.getInstance();
    const testStudent = await mongoDB.findGlobalUserByUserId(session.studentView.testStudentUserId);
    if (!testStudent || !testStudent.isTestStudent) {
        appLogger.log('[STUDENT-VIEW] stale student view session cleared');
        delete session.studentView;
        next();
        return;
    }

    // 4. Swap. The real identity is remembered for this request only.
    request.studentViewActor = { puid: actor?.puid, userId: session.globalUser?.userId };
    request.user = testStudentSessionUser(testStudent);
    session.globalUser = testStudent;

    next();
}
