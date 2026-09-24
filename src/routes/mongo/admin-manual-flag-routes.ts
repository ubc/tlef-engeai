/**
 * Administrator manual flag escalation routes
 *
 * Cross-course queue for student-reported flags escalated by course staff.
 *
 * @author: EngE-AI Team
 * @date: 2026-08-25
 * @version: 1.0.0
 * @description: Platform-admin APIs for escalated manual flag review.
 */

import { Router, type Request, type Response } from 'express';
import { EngEAI_MongoDB } from '../../db/enge-ai-mongodb';
import {
    FlagReportConflictError,
    FlagReportNotFoundError,
    type ManualFlagAdminListFilters
} from '../../db/mongo/flag-mongo';
import { routeParam } from '../../helpers/route-params';
import { asyncHandlerWithAuth } from '../../middleware/async-handler';
import { requireAdminGlobal } from '../../middleware/require-course-role';
import type { FlagReportActor, GlobalUser } from '../../types/shared';
import { appLogger } from '../../utils/logger';
import { parseGuidedPathwayFlagDateQuery } from './admin-guided-pathway-flag-routes';

const router = Router();
const VALID_REVIEW_STATES = ['needs-review', 'reviewed', 'all'] as const;

function stringQuery(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function positiveIntegerQuery(value: unknown, fallback: number): number | null {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function actorFromSession(req: Request): FlagReportActor {
    const actor = (req.session as any)?.globalUser as GlobalUser | undefined;
    if (!actor?.userId || !actor.name) {
        throw new Error('Authenticated administrator identity is unavailable');
    }
    return { userId: actor.userId, name: actor.name };
}

function handleMutationError(res: Response, error: unknown): boolean {
    if (error instanceof FlagReportNotFoundError) {
        res.status(404).json({ success: false, error: error.message });
        return true;
    }
    if (error instanceof FlagReportConflictError) {
        res.status(409).json({ success: false, error: error.message });
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
        const reviewState = stringQuery(req.query.reviewState) ?? 'all';
        const dateFrom = parseGuidedPathwayFlagDateQuery(req.query.dateFrom, false);
        const dateTo = parseGuidedPathwayFlagDateQuery(req.query.dateTo, true);

        if (page === null || pageSize === null) {
            return res.status(400).json({
                success: false,
                error: 'page and pageSize must be positive integers'
            });
        }
        if (!VALID_REVIEW_STATES.includes(reviewState as (typeof VALID_REVIEW_STATES)[number])) {
            return res.status(400).json({ success: false, error: 'Invalid reviewState filter' });
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

            const filters: ManualFlagAdminListFilters = {
                page,
                pageSize,
                reviewState: reviewState as ManualFlagAdminListFilters['reviewState'],
                courseId: stringQuery(req.query.courseId),
                courseIds,
                dateFrom,
                dateTo
            };
            const data = await mongo.listEscalatedManualFlagsForAdmin(filters);
            res.json({ success: true, data });
        } catch (error) {
            appLogger.error('[manual-flags] Failed to list administrator escalations', {
                errorName: error instanceof Error ? error.name : typeof error
            });
            res.status(500).json({ success: false, error: 'Failed to load manual flag escalations' });
        }
    })
);

router.patch(
    '/:courseId/:flagId/review',
    requireAdminGlobal,
    asyncHandlerWithAuth(async (req: Request, res: Response) => {
        try {
            const mongo = await EngEAI_MongoDB.getInstance();
            const courseId = routeParam(req.params, 'courseId');
            const flagId = routeParam(req.params, 'flagId');
            const course = await mongo.getActiveCourse(courseId);
            if (!course) {
                return res.status(404).json({ success: false, error: 'Course not found' });
            }
            const data = await mongo.markManualFlagAdminReviewed(
                course.courseName,
                flagId,
                actorFromSession(req)
            );
            res.json({ success: true, data });
        } catch (error) {
            if (handleMutationError(res, error)) return;
            appLogger.error('[manual-flags] Failed to mark administrator review', {
                errorName: error instanceof Error ? error.name : typeof error
            });
            res.status(500).json({ success: false, error: 'Failed to review manual flag escalation' });
        }
    })
);

export default router;
