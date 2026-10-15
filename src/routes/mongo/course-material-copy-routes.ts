/**
 * course-material-copy-routes.ts
 *
 * Copying one course's materials into another. Mounted from route-mongo.ts under /api/courses.
 *
 * @description Lists the courses a user may copy from, and runs a copy that replaces the target's
 * materials. Both courses must be ones the caller instructs (or the caller is a platform admin):
 * a copy replaces a whole course's documents, so TAs are not allowed.
 */

import { Router, Request, Response } from 'express';
import { asyncHandlerWithAuth } from '../../middleware/async-handler';
import { requireInstructorOrAdminForCourseAPI } from '../../middleware/require-course-role';
import { EngEAI_MongoDB } from '../../db/enge-ai-mongodb';
import { RAGApp } from '../../rag/rag-app';
import { normalizeRouteParams } from '../../helpers/route-params';
import { canManageCourseRoster } from '../../utils/course-staff';
import { appLogger } from '../../utils/logger';
import type { activeCourse, GlobalUser } from '../../types/shared';
import {
    buildCourseMaterialCopyDeps,
    copyCourseMaterials,
    instructorFilterFor,
    listMaterialCopySources,
    MaterialCopyInProgressError,
    MaterialCopyLeaseLostError
} from '../../services/course-material-copy-service';

async function loadCaller(req: Request): Promise<GlobalUser | null> {
    const puid = (req as any).user?.puid;
    if (!puid) return null;
    const mongo = await EngEAI_MongoDB.getInstance();
    return (await mongo.findGlobalUserByPUID(puid)) as GlobalUser | null;
}

/**
 * Registers material-copy routes on the courses router.
 */
export function mountCourseMaterialCopyRoutes(router: Router): void {
    /**
     * GET /:courseId/material-copy-sources — courses the caller may copy materials from.
     *
     * @response 200 - `{ success: true, data: MaterialCopySourceCourse[] }`
     */
    router.get(
        '/:courseId/material-copy-sources',
        requireInstructorOrAdminForCourseAPI(['params']),
        asyncHandlerWithAuth(async (req: Request, res: Response) => {
            const { courseId } = normalizeRouteParams(req.params);
            const globalUser = await loadCaller(req);
            if (!globalUser) {
                return res.status(401).json({ success: false, error: 'User not found' });
            }
            const mongo = await EngEAI_MongoDB.getInstance();
            const candidates = await mongo.listCoursesForMaterialCopy(instructorFilterFor(globalUser));
            res.json({ success: true, data: listMaterialCopySources(candidates, globalUser, courseId) });
        })
    );

    /**
     * POST /:courseId/copy-materials — replace this course's materials with a copy of another course's.
     *
     * Body: `{ sourceCourseId: string }`.
     *
     * @response 200 - `{ success: true, data: CopyCourseMaterialsResult }`
     * @response 400 - Missing source, or source is the target
     * @response 403 - Caller does not instruct the source course
     * @response 404 - Source course not found
     * @response 409 - Target has not finished course setup, or a copy is already running
     */
    router.post(
        '/:courseId/copy-materials',
        requireInstructorOrAdminForCourseAPI(['params']),
        asyncHandlerWithAuth(async (req: Request, res: Response) => {
            const { courseId } = normalizeRouteParams(req.params);
            const sourceCourseId = typeof req.body?.sourceCourseId === 'string' ? req.body.sourceCourseId.trim() : '';
            if (!sourceCourseId) {
                return res.status(400).json({ success: false, error: 'sourceCourseId is required' });
            }
            if (sourceCourseId === courseId) {
                return res.status(400).json({ success: false, error: 'Choose a different course to copy from' });
            }

            const globalUser = await loadCaller(req);
            if (!globalUser) {
                return res.status(401).json({ success: false, error: 'User not found' });
            }

            const mongo = await EngEAI_MongoDB.getInstance();
            const [source, target] = await Promise.all([
                mongo.getActiveCourse(sourceCourseId) as Promise<activeCourse | null>,
                mongo.getActiveCourse(courseId) as Promise<activeCourse | null>
            ]);
            if (!source) {
                return res.status(404).json({ success: false, error: 'Source course not found' });
            }
            // The middleware only checked the target; reading another course's documents needs the same standing there.
            if (!canManageCourseRoster(source, globalUser)) {
                return res.status(403).json({ success: false, error: 'You must be an instructor of the course you copy from' });
            }
            if (!target?.courseSetup) {
                return res.status(409).json({ success: false, error: 'Finish course setup before copying materials into this course' });
            }

            try {
                const rag = await RAGApp.getInstance();
                const deps = buildCourseMaterialCopyDeps(mongo, rag, mongo.idGenerator);
                const data = await copyCourseMaterials(deps, source, courseId);
                appLogger.info('[MATERIAL-COPY] Copied course materials', {
                    sourceCourseId,
                    targetCourseId: courseId,
                    copiedBy: globalUser.userId,
                    materialsCopied: data.materialsCopied,
                    chunksCopied: data.chunksCopied,
                    replacedMaterialCount: data.replacedMaterialCount,
                    skippedCount: data.skippedMaterials.length
                });
                res.json({ success: true, data });
            } catch (error) {
                if (error instanceof MaterialCopyInProgressError || error instanceof MaterialCopyLeaseLostError) {
                    return res.status(409).json({ success: false, error: error.message });
                }
                appLogger.error('[MATERIAL-COPY] Copy failed', { sourceCourseId, targetCourseId: courseId, error });
                res.status(500).json({
                    success: false,
                    error: 'Copying materials failed. This course\'s materials were not changed.'
                });
            }
        })
    );
}
