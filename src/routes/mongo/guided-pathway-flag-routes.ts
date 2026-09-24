/**
 * Guided Pathway flag course routes
 *
 * Provides the anonymous course queue and immutable instructor decision API.
 * Persistence and privacy projection remain in the Mongo delegate.
 *
 * @author: EngE-AI Team
 * @date: 2026-08-08
 * @version: 1.0.0
 * @description: Instructor/admin course APIs for Guided Pathway trigger alerts.
 */

import type { Request, Response, Router } from 'express';
import { EngEAI_MongoDB } from '../../db/enge-ai-mongodb';
import type { GuidedPathwayFlagReviewActor } from '../../flags/guided-pathway-flag-contracts';
import {
    GuidedPathwayFlagConflictError,
    GuidedPathwayFlagNotFoundError
} from '../../flags/guided-pathway-flag-errors';
import { normalizeRouteParams } from '../../helpers/route-params';
import { asyncHandlerWithAuth } from '../../middleware/async-handler';
import { requireInstructorOrAdminForCourseAPI } from '../../middleware/require-course-role';
import type {
    GlobalUser,
    GuidedPathwayFlagDecision,
    GuidedPathwayFlagStatus
} from '../../types/shared';
import { appLogger } from '../../utils/logger';

const VALID_STATUSES: GuidedPathwayFlagStatus[] = ['pending', 'escalated', 'dismissed'];
const VALID_DECISIONS: GuidedPathwayFlagDecision[] = ['escalate', 'dismiss'];

function parsePositiveInteger(value: unknown, fallback: number): number | null {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function actorFromSession(req: Request): GuidedPathwayFlagReviewActor {
    const actor = (req.session as any)?.globalUser as GlobalUser | undefined;
    if (!actor?.userId || !actor.name) {
        throw new Error('Authenticated staff identity is unavailable');
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
    return false;
}

/** Registers course-scoped anonymous Guided Pathway alert routes. */
export function mountGuidedPathwayFlagRoutes(router: Router): void {
    router.get(
        '/:courseId/guided-pathway-flags',
        requireInstructorOrAdminForCourseAPI(['params']),
        asyncHandlerWithAuth(async (req: Request, res: Response) => {
            const { courseId } = normalizeRouteParams(req.params);
            const page = parsePositiveInteger(req.query.page, 1);
            const pageSize = parsePositiveInteger(req.query.pageSize, 50);
            const rawStatus = req.query.status;
            if (page === null || pageSize === null) {
                return res.status(400).json({
                    success: false,
                    error: 'page and pageSize must be positive integers'
                });
            }
            if (
                rawStatus !== undefined &&
                (typeof rawStatus !== 'string' || !VALID_STATUSES.includes(rawStatus as GuidedPathwayFlagStatus))
            ) {
                return res.status(400).json({ success: false, error: 'Invalid status filter' });
            }

            try {
                const mongo = await EngEAI_MongoDB.getInstance();
                const data = await mongo.listGuidedPathwayFlagsForCourse(courseId, {
                    page,
                    pageSize,
                    status: rawStatus as GuidedPathwayFlagStatus | undefined
                });
                res.json({ success: true, data });
            } catch (error) {
                appLogger.error(
                    '[guided-pathway-flags] Failed to list course alerts',
                    safeErrorMetadata(error)
                );
                res.status(500).json({ success: false, error: 'Failed to load Guided Pathway alerts' });
            }
        })
    );

    router.patch(
        '/:courseId/guided-pathway-flags/:flagId/decision',
        requireInstructorOrAdminForCourseAPI(['params']),
        asyncHandlerWithAuth(async (req: Request, res: Response) => {
            const { courseId, flagId } = normalizeRouteParams(req.params);
            const decision = req.body?.decision;
            if (typeof decision !== 'string' || !VALID_DECISIONS.includes(decision as GuidedPathwayFlagDecision)) {
                return res.status(400).json({
                    success: false,
                    error: 'decision must be escalate or dismiss'
                });
            }

            try {
                const mongo = await EngEAI_MongoDB.getInstance();
                const data = await mongo.decideGuidedPathwayFlag(
                    courseId,
                    flagId,
                    decision as GuidedPathwayFlagDecision,
                    actorFromSession(req)
                );
                res.json({ success: true, data });
            } catch (error) {
                if (handleMutationError(res, error)) return;
                appLogger.error(
                    '[guided-pathway-flags] Failed to record instructor decision',
                    safeErrorMetadata(error)
                );
                res.status(500).json({ success: false, error: 'Failed to record Guided Pathway alert decision' });
            }
        })
    );
}
