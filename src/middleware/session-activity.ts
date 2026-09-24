// src/middleware/session-activity.ts

/**
 * Session activity — server-owned idle thresholds, poll schedule, and client directives.
 *
 * Computes SessionIdleStatus from session.lastActivityAt, builds per-response client
 * instructions (pollAfterMs, uiAction), and bumps activity on authenticated /api/*
 * except GET/POST /api/user/activity (poll-only; POST bumps in route when userActivity).
 *
 * @author: EngE-AI Team
 * @date: 2026-08-14
 * @version: 1.0.0
 * @description: Idle UX middleware and pure helpers for activity routes.
 */

import { Request, Response, NextFunction } from 'express';
import type {
    SessionIdleClientDirective,
    SessionIdleState,
    SessionIdleStatus,
} from '../types/shared';

export const INACTIVITY_EXPIRED_CODE = 'INACTIVITY_EXPIRED';
export const SESSION_LAST_ACTIVITY_AT = 'lastActivityAt';

/**
 * parseEnvMs - parses an environment variable as milliseconds, with fallback
 * @param name - name of the environment variable
 * @param fallback - fallback value if the environment variable is not set
 * @returns the parsed milliseconds
 */
function parseEnvMs(name: string, fallback: number): number {
    const raw = process.env[name];
    if (raw === undefined || raw === '') {
        return fallback;
    }
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/**
 * parseOptionalEnvMs - parses an environment variable as milliseconds, with fallback
 * @param name - name of the environment variable
 * @returns the parsed milliseconds
 */
function parseOptionalEnvMs(name: string): number | undefined {
    const raw = process.env[name];
    if (raw === undefined || raw === '') {
        return undefined;
    }
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** Ms of no activity after lastActivityAt before state → warning. Legacy: INACTIVITY_WARNING_MS */
export const INACTIVITY_IDLE_BEFORE_WARNING_MS = parseEnvMs(
    'INACTIVITY_IDLE_BEFORE_WARNING_MS',
    parseEnvMs('INACTIVITY_WARNING_MS', 240_000)
);

/** Ms of grace after warningAt before state → expired. Legacy: INACTIVITY_LOGOUT_MS */
export const INACTIVITY_GRACE_AFTER_WARNING_MS = parseEnvMs(
    'INACTIVITY_GRACE_AFTER_WARNING_MS',
    parseEnvMs('INACTIVITY_LOGOUT_MS', 60_000)
);

/** @deprecated Use INACTIVITY_IDLE_BEFORE_WARNING_MS */
export const INACTIVITY_WARNING_MS = INACTIVITY_IDLE_BEFORE_WARNING_MS;

/** @deprecated Use INACTIVITY_GRACE_AFTER_WARNING_MS */
export const INACTIVITY_LOGOUT_MS = INACTIVITY_GRACE_AFTER_WARNING_MS;

export const INACTIVITY_POLL_INTERVAL_DURING_GRACE_MS = parseEnvMs(
    'INACTIVITY_POLL_INTERVAL_DURING_GRACE_MS',
    5_000
);

export const INACTIVITY_POLL_JITTER_MS = parseEnvMs('INACTIVITY_POLL_JITTER_MS', 250);

export const INACTIVITY_POLL_MAX_DELAY_MS = parseOptionalEnvMs('INACTIVITY_POLL_MAX_DELAY_MS');

/**
 * ensureSessionLastActivityAt - returns session lastActivityAt, migrating legacy lastActivityTime
 *
 * @param session - Express session object
 * @param now - server epoch ms when initializing a missing timestamp
 * @returns lastActivityAt epoch ms
 */
export function ensureSessionLastActivityAt(session: Record<string, unknown>, now: number = Date.now()): number {
    const existing = session[SESSION_LAST_ACTIVITY_AT];
    if (typeof existing === 'number' && Number.isFinite(existing)) {
        return existing;
    }
    const legacy = session.lastActivityTime;
    if (typeof legacy === 'number' && Number.isFinite(legacy)) {
        session[SESSION_LAST_ACTIVITY_AT] = legacy;
        return legacy;
    }
    session[SESSION_LAST_ACTIVITY_AT] = now;
    return now;
}

/**
 * bumpSessionActivity - sets session lastActivityAt to now (or provided time)
 *
 * @param session - Express session object
 * @param now - epoch ms to record
 */
export function bumpSessionActivity(session: Record<string, unknown>, now: number = Date.now()): void {
    session[SESSION_LAST_ACTIVITY_AT] = now;
}

/**
 * getSessionIdleStatus - idle phase and threshold timestamps from lastActivityAt
 *
 * expiresAt = warningAt + grace (not lastActivityAt + grace).
 *
 * @param lastActivityAt - session activity anchor epoch ms
 * @param now - current server epoch ms
 * @returns SessionIdleStatus snapshot
 */
export function getSessionIdleStatus(lastActivityAt: number, now: number = Date.now()): SessionIdleStatus {
    const warningAt = lastActivityAt + INACTIVITY_IDLE_BEFORE_WARNING_MS;
    const expiresAt = warningAt + INACTIVITY_GRACE_AFTER_WARNING_MS;

    let state: SessionIdleState;
    if (now < warningAt) {
        state = 'active';
    } else if (now < expiresAt) {
        state = 'warning';
    } else {
        state = 'expired';
    }

    return {
        serverTime: now,
        lastActivityAt,
        state,
        warningAt,
        expiresAt,
        remainingMsUntilWarning: Math.max(0, warningAt - now),
        remainingMsUntilGraceExpiry: Math.max(0, expiresAt - now),
    };
}

/**
 * buildSessionIdleClientDirective - poll delay and UI action for one activity response
 *
 * @param idle - snapshot from getSessionIdleStatus
 * @returns client directive for this response only
 */
export function buildSessionIdleClientDirective(idle: SessionIdleStatus): SessionIdleClientDirective {
    if (idle.state === 'active') {
        let pollAfterMs = idle.remainingMsUntilWarning + INACTIVITY_POLL_JITTER_MS;
        if (INACTIVITY_POLL_MAX_DELAY_MS !== undefined) {
            pollAfterMs = Math.min(pollAfterMs, INACTIVITY_POLL_MAX_DELAY_MS);
        }
        return { pollAfterMs, uiAction: 'none' };
    }

    if (idle.state === 'warning') {
        const pollAfterMs = Math.min(
            idle.remainingMsUntilGraceExpiry + INACTIVITY_POLL_JITTER_MS,
            INACTIVITY_POLL_INTERVAL_DURING_GRACE_MS
        );
        const warningCountdownSec = Math.max(1, Math.ceil(idle.remainingMsUntilGraceExpiry / 1000));
        return { pollAfterMs, uiAction: 'show_inactivity_warning', warningCountdownSec };
    }

    return { pollAfterMs: 0, uiAction: 'force_logout' };
}

/**
 * getSessionIdleStatusFromRequest - idle snapshot for the current session
 *
 * @param req - authenticated Express request
 * @returns SessionIdleStatus
 */
export function getSessionIdleStatusFromRequest(req: Request): SessionIdleStatus {
    const now = Date.now();
    const session = req.session as any;
    const lastActivityAt = ensureSessionLastActivityAt(session, now);
    return getSessionIdleStatus(lastActivityAt, now);
}

function isUserActivityRoute(req: Request): boolean {
    return req.path === '/api/user/activity';
}

/**
 * respondExpiredWithoutTeardown - responds with 401 status and session expired due to inactivity
 * @param res - Express response
 * @param idle - SessionIdleStatus
 * @param client - SessionIdleClientDirective
 */
function respondExpiredWithoutTeardown(
    res: Response,
    idle: SessionIdleStatus,
    client: SessionIdleClientDirective
): void {
    res.status(401).json({
        success: false,
        idle,
        client,
        error: 'Session expired due to inactivity',
        code: INACTIVITY_EXPIRED_CODE,
    });
}

/**
 * respondWithSessionIdleStatus - JSON activity response; 401 when expired (teardown deferred to /auth/logout)
 *
 * @param req - authenticated Express request
 * @param res - Express response
 * @param bump - when true, bump lastActivityAt before computing idle
 */
export function respondWithSessionIdleStatus(req: Request, res: Response, bump = false): void {
    const now = Date.now();
    const session = req.session as any;
    if (bump) {
        bumpSessionActivity(session, now);
    }
    const lastActivityAt = ensureSessionLastActivityAt(session, now);
    const idle = getSessionIdleStatus(lastActivityAt, now);
    const client = buildSessionIdleClientDirective(idle);

    if (idle.state === 'expired') {
        respondExpiredWithoutTeardown(res, idle, client);
        return;
    }

    res.json({ success: true, idle, client });
}

/**
 * sessionActivityMiddleware - bump activity on /api/* except poll endpoint; block when expired
 */
export function sessionActivityMiddleware(req: Request, res: Response, next: NextFunction): void {
    const isAuthenticated = typeof (req as Request & { isAuthenticated?: () => boolean }).isAuthenticated === 'function'
        && (req as Request & { isAuthenticated: () => boolean }).isAuthenticated();

    if (!isAuthenticated) {
        next();
        return;
    }

    if (!req.path.startsWith('/api/')) {
        next();
        return;
    }

    // bump activity on authenticated /api/* except GET/POST /api/user/activity
    const now = Date.now();
    const session = req.session as any;
    ensureSessionLastActivityAt(session, now);

    // get idle status from request
    const idle = getSessionIdleStatusFromRequest(req);
    if (idle.state === 'expired') {
        const client = buildSessionIdleClientDirective(idle);
        respondExpiredWithoutTeardown(res, idle, client);
        return;
    }

    if (!isUserActivityRoute(req)) {
        bumpSessionActivity(session, now);
    }

    next();
}

// ponytail: dev-only assert at import — crashes server on misconfigured directive math
if (process.env.NODE_ENV === 'development') {
    const base = 1_000_000;
    const idleBefore = INACTIVITY_IDLE_BEFORE_WARNING_MS;
    const grace = INACTIVITY_GRACE_AFTER_WARNING_MS;

    const active = getSessionIdleStatus(base, base + idleBefore - 1);
    const warning = getSessionIdleStatus(base, base + idleBefore);
    getSessionIdleStatus(base, base + idleBefore + grace - 1);
    getSessionIdleStatus(base, base + idleBefore + grace);

    if (active.state !== 'active' || warning.state !== 'warning') {
        throw new Error('[session-activity] idle state machine misconfigured');
    }

    const freshActive = getSessionIdleStatus(base, base);
    const activeDirective = buildSessionIdleClientDirective(freshActive);
    const warningDirective = buildSessionIdleClientDirective(warning);

    const expectedActivePoll =
        INACTIVITY_POLL_MAX_DELAY_MS !== undefined
            ? Math.min(idleBefore + INACTIVITY_POLL_JITTER_MS, INACTIVITY_POLL_MAX_DELAY_MS)
            : idleBefore + INACTIVITY_POLL_JITTER_MS;

    const expectedWarningPoll = Math.min(
        grace + INACTIVITY_POLL_JITTER_MS,
        INACTIVITY_POLL_INTERVAL_DURING_GRACE_MS
    );

    if (activeDirective.pollAfterMs !== expectedActivePoll) {
        throw new Error(
            `[session-activity] client directive misconfigured: active pollAfterMs ${activeDirective.pollAfterMs} !== ${expectedActivePoll}`
        );
    }
    if (warningDirective.pollAfterMs !== expectedWarningPoll) {
        throw new Error(
            `[session-activity] client directive misconfigured: warning pollAfterMs ${warningDirective.pollAfterMs} !== ${expectedWarningPoll}`
        );
    }
    if (warningDirective.uiAction !== 'show_inactivity_warning') {
        throw new Error('[session-activity] client directive misconfigured: warning uiAction');
    }
}
