/**
 * Canvas force_login — makes Canvas ask who is signing in when EngE-AI connects an account
 *
 * Canvas's authorize page silently reuses whichever Canvas session the browser already holds, so
 * a staff member on a shared browser can connect someone else's Canvas account without seeing a
 * prompt. `force_login=1` makes Canvas show its sign-in step first. The LMS package builds the
 * authorize URL itself and takes no extra parameters, so the redirect its login route sends is
 * amended on the way out rather than rebuilt here, which leaves its OAuth state handling untouched.
 *
 * This lowers the chance of connecting the wrong account; it is not the safeguard. Where Canvas
 * signs in through single sign-on, the identity provider may still reuse its own session.
 * `canvas-identity-once.ts` is what refuses a connected account that belongs to someone else.
 *
 * @author: Kathleen Tom
 * @date: 2026-09-15
 * @version: 1.0.0
 * @description: Adds force_login=1 to the Canvas OAuth authorize redirect.
 */

import type { NextFunction, Request, Response } from 'express';

/** Path of Canvas's OAuth2 authorize endpoint, as the package builds it. */
const AUTHORIZE_PATH = '/login/oauth2/auth';

/**
 * withForceLogin - adds `force_login=1` to a Canvas authorize URL.
 *
 * @param url - Redirect target
 * @returns The authorize URL with `force_login=1`, or any other URL unchanged
 */
export function withForceLogin(url: string): string {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        // A relative redirect is never Canvas's authorize page.
        return url;
    }
    if (!parsed.pathname.endsWith(AUTHORIZE_PATH)) return url;
    parsed.searchParams.set('force_login', '1');
    return parsed.toString();
}

/**
 * forceCanvasLogin - middleware for the Canvas connect route that amends its authorize redirect.
 *
 * Mount on `GET /canvas/auth/login` ahead of the package's auth router. It changes nothing but
 * the URL the following handler redirects to.
 *
 * @param _req - Unused
 * @param res - Response whose `redirect` is wrapped for this request only
 * @param next - Continues to the package's login handler
 */
export function forceCanvasLogin(_req: Request, res: Response, next: NextFunction): void {
    const redirect = res.redirect.bind(res) as (...args: unknown[]) => void;
    res.redirect = ((...args: unknown[]) => {
        // Express accepts `(url)` or `(status, url)`; the target is always last.
        const last = args.length - 1;
        if (typeof args[last] === 'string') args[last] = withForceLogin(args[last] as string);
        redirect(...args);
    }) as Response['redirect'];
    next();
}
