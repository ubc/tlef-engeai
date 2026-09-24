// src/helpers/session-teardown.ts

/**
 * session-teardown — passport logout, session destroy, and cookie clear
 *
 * Shared by inactivity expiry (401 JSON) and GET /auth/logout so teardown is
 * complete even when req.user is already gone after an API destroy.
 *
 * @author: EngE-AI Team
 * @date: 2026-08-17
 * @version: 1.0.0
 * @description: Authoritative session teardown for logout and inactivity expiry.
 */

import type { Request, Response } from 'express';

export const SESSION_COOKIE_NAME = 'engeai.sid';

/** Cookie options matching src/middleware/session.ts for clearCookie. */
export function getSessionCookieClearOptions(): {
    httpOnly: boolean;
    sameSite: 'lax';
    secure: boolean;
} {
    const isLocalDevelopment = process.env.NODE_ENV === 'development';
    return {
        httpOnly: true,
        sameSite: 'lax',
        secure: !isLocalDevelopment,
    };
}

/** clearSessionCookie - expires engeai.sid on the response */
export function clearSessionCookie(res: Response): void {
    res.clearCookie(SESSION_COOKIE_NAME, getSessionCookieClearOptions());
}

type RequestWithAuth = Request & {
    isAuthenticated?: () => boolean;
    logout: (callback: (err?: Error) => void) => void;
};

/**
 * teardownSession - passport logout (if authenticated), session destroy, clear cookie
 *
 * @param req - Express request
 * @param res - Express response (cookie cleared before done)
 * @param done - callback when teardown finishes
 */
export function teardownSession(
    req: Request,
    res: Response,
    done: (err?: Error) => void
): void {
    const reqAuth = req as RequestWithAuth;

    const finish = (err?: Error) => {
        clearSessionCookie(res);
        done(err);
    };

    const destroySession = () => {
        if (req.session) {
            req.session.destroy((destroyErr) => {
                finish(destroyErr ?? undefined);
            });
            return;
        }
        finish();
    };

    if (typeof reqAuth.isAuthenticated === 'function' && reqAuth.isAuthenticated()) {
        reqAuth.logout((logoutErr) => {
            if (logoutErr) {
                finish(logoutErr);
                return;
            }
            destroySession();
        });
        return;
    }

    destroySession();
}
