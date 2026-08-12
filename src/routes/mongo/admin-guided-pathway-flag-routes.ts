/**
 * Administrator Guided Pathway flag routes
 *
 * Provides the global anonymous queue, persistent review action, and explicit
 * audited identity reveal. Every response delegates through a safe DTO boundary.
 *
 * @author: EngE-AI Team
 * @date: 2026-08-08
 * @version: 1.0.0
 * @description: Platform-admin APIs for cross-course Guided Pathway alerts.
 */

import { Router, type Request, type Response } from 'express';
import { EngEAI_MongoDB } from '../../db/enge-ai-mongodb';
import {
    GuidedPathwayFlagConflictError,
    GuidedPathwayFlagIdentityUnavailableError,
    GuidedPathwayFlagNotFoundError,
    type GuidedPathwayFlagActor
} from '../../db/mongo/guided-pathway-flag-mongo';
import { routeParam } from '../../helpers/route-params';
import { asyncHandlerWithAuth } from '../../middleware/async-handler';
import { requireAdminGlobal } from '../../middleware/require-course-role';
import type {
    GlobalUser,
    GuidedPathwayFlagReviewState,
    GuidedPathwayFlagStatus
} from '../../types/shared';
import { appLogger } from '../../utils/logger';

const router = Router();
const VALID_STATUSES: GuidedPathwayFlagStatus[] = ['pending', 'escalated', 'dismissed'];
const VALID_REVIEW_STATES: GuidedPathwayFlagReviewState[] = ['needs-review', 'reviewed', 'all'];
const VANCOUVER_TIME_ZONE = 'America/Vancouver';
const VANCOUVER_DATE_TIME_PARTS = new Intl.DateTimeFormat('en-CA', {
    timeZone: VANCOUVER_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
});

function stringQuery(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function positiveIntegerQuery(value: unknown, fallback: number): number | null {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function vancouverMidnight(year: number, month: number, day: number): Date {
    const targetAsUtc = Date.UTC(year, month - 1, day);
    let instant = targetAsUtc;

    // Iteratively align the formatted Vancouver civil time with the requested midnight.
    for (let attempt = 0; attempt < 4; attempt += 1) {
        const parts = VANCOUVER_DATE_TIME_PARTS.formatToParts(new Date(instant));
        const pick = (type: Intl.DateTimeFormatPart['type']): number =>
            Number(parts.find((part) => part.type === type)?.value ?? 0);
        const representedAsUtc = Date.UTC(
            pick('year'),
            pick('month') - 1,
            pick('day'),
            pick('hour'),
            pick('minute'),
            pick('second')
        );
        const adjustment = targetAsUtc - representedAsUtc;
        instant += adjustment;
        if (adjustment === 0) break;
    }
    return new Date(instant);
}

/** Parses an admin date filter; date-only values use DST-aware Vancouver day boundaries. */
export function parseGuidedPathwayFlagDateQuery(
    value: unknown,
    endOfDay: boolean
): Date | null | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== 'string' || !value.trim()) return null;

    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (dateOnly) {
        const year = Number(dateOnly[1]);
        const month = Number(dateOnly[2]);
        const day = Number(dateOnly[3]);
        const calendarCheck = new Date(Date.UTC(year, month - 1, day));
        if (
            calendarCheck.getUTCFullYear() !== year ||
            calendarCheck.getUTCMonth() !== month - 1 ||
            calendarCheck.getUTCDate() !== day
        ) {
            return null;
        }
        if (!endOfDay) return vancouverMidnight(year, month, day);

        const nextCalendarDay = new Date(Date.UTC(year, month - 1, day + 1));
        return new Date(vancouverMidnight(
            nextCalendarDay.getUTCFullYear(),
            nextCalendarDay.getUTCMonth() + 1,
            nextCalendarDay.getUTCDate()
        ).getTime() - 1);
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function actorFromSession(req: Request): GuidedPathwayFlagActor {
    const actor = (req.session as any)?.globalUser as GlobalUser | undefined;
    if (!actor?.userId || !actor.name) {
        throw new Error('Authenticated administrator identity is unavailable');
    }
    return { userId: actor.userId, name: actor.name };
}

function safeErrorMetadata(error: unknown): { errorName: string; errorCode?: string | number } {
    const errorName = error instanceof Error ? error.name : typeof error;
    const code = error && typeof error === 'object' ? (error as { code?: unknown }).code : undefined;
    return {
        errorName,
        ...(typeof code === 'string' || typeof code === 'number' ? { errorCode: code } : {})
    };
}

function handleMutationError(res: Response, error: unknown): boolean {
    if (error instanceof GuidedPathwayFlagNotFoundError) {
        res.status(404).json({ success: false, error: error.message });
        return true;
    }
    if (error instanceof GuidedPathwayFlagConflictError) {
        res.status(409).json({ success: false, error: error.message });
        return true;
    }
    if (error instanceof GuidedPathwayFlagIdentityUnavailableError) {
        res.status(404).json({ success: false, error: error.message });
        return true;
    }
    return false;
}

router.get(
    '/',
    requireAdminGlobal,
    asyncHandlerWithAuth(async (req: Request, res: Response) => {
        const page = positiveIntegerQuery(req.query.page, 1);
        const pageSize = positiveIntegerQuery(req.query.pageSize, 50);
        const status = stringQuery(req.query.status);
        const reviewState = stringQuery(req.query.reviewState) ?? 'all';
        const dateFrom = parseGuidedPathwayFlagDateQuery(req.query.dateFrom, false);
        const dateTo = parseGuidedPathwayFlagDateQuery(req.query.dateTo, true);

        if (page === null || pageSize === null) {
            return res.status(400).json({
                success: false,
                error: 'page and pageSize must be positive integers'
            });
        }
        if (status && !VALID_STATUSES.includes(status as GuidedPathwayFlagStatus)) {
            return res.status(400).json({ success: false, error: 'Invalid status filter' });
        }
        if (!VALID_REVIEW_STATES.includes(reviewState as GuidedPathwayFlagReviewState)) {
            return res.status(400).json({ success: false, error: 'Invalid reviewState filter' });
        }
        if (reviewState !== 'all' && status && status !== 'escalated') {
            return res.status(400).json({
                success: false,
                error: 'Admin review filters apply only to escalated alerts'
            });
        }
        if (dateFrom === null || dateTo === null || (dateFrom && dateTo && dateFrom > dateTo)) {
            return res.status(400).json({ success: false, error: 'Invalid date range' });
        }

        try {
            const mongo = await EngEAI_MongoDB.getInstance();
            const academicPeriodId = stringQuery(req.query.academicPeriodId);
            let courseIds: string[] | undefined;
            if (academicPeriodId) {
                const period = await mongo.getAcademicPeriodById(academicPeriodId);
                if (!period) {
                    return res.status(404).json({ success: false, error: 'Academic period not found' });
                }
                courseIds = period.courseIds;
            }

            const data = await mongo.listGuidedPathwayFlagsForAdmin({
                page,
                pageSize,
                status: status as GuidedPathwayFlagStatus | undefined,
                reviewState: reviewState as GuidedPathwayFlagReviewState,
                courseId: stringQuery(req.query.courseId),
                courseIds,
                pathwayId: stringQuery(req.query.pathwayId),
                reviewer: stringQuery(req.query.reviewer),
                dateFrom,
                dateTo,
                escalatedFirst: true,
                includeFacets: true
            });
            res.json({ success: true, data });
        } catch (error) {
            appLogger.error(
                '[guided-pathway-flags] Failed to list administrator alerts',
                safeErrorMetadata(error)
            );
            res.status(500).json({ success: false, error: 'Failed to load Guided Pathway alerts' });
        }
    })
);

router.patch(
    '/:courseId/:flagId/review',
    requireAdminGlobal,
    asyncHandlerWithAuth(async (req: Request, res: Response) => {
        try {
            const mongo = await EngEAI_MongoDB.getInstance();
            const data = await mongo.markGuidedPathwayFlagAdminReviewed(
                routeParam(req.params, 'courseId'),
                routeParam(req.params, 'flagId'),
                actorFromSession(req)
            );
            res.json({ success: true, data });
        } catch (error) {
            if (handleMutationError(res, error)) return;
            appLogger.error(
                '[guided-pathway-flags] Failed to mark administrator review',
                safeErrorMetadata(error)
            );
            res.status(500).json({ success: false, error: 'Failed to review Guided Pathway alert' });
        }
    })
);

router.post(
    '/:courseId/:flagId/reveal-identity',
    requireAdminGlobal,
    asyncHandlerWithAuth(async (req: Request, res: Response) => {
        try {
            const mongo = await EngEAI_MongoDB.getInstance();
            const data = await mongo.revealGuidedPathwayFlagIdentity(
                routeParam(req.params, 'courseId'),
                routeParam(req.params, 'flagId'),
                actorFromSession(req)
            );
            res.json({ success: true, data });
        } catch (error) {
            if (handleMutationError(res, error)) return;
            appLogger.error(
                '[guided-pathway-flags] Failed to reveal audited identity',
                safeErrorMetadata(error)
            );
            res.status(500).json({ success: false, error: 'Failed to reveal student identity' });
        }
    })
);

export default router;
