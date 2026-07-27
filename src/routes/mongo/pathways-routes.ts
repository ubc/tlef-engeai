/**
 * pathways-routes.ts
 *
 * Guided Pathway Library REST API. Mounted from route-mongo.ts under /api/courses.
 *
 * @author: EngE-AI Team
 * @date: 2026-07-24
 * @version: 1.0.0
 * @description: Instructor CRUD for course pathways.
 */

import { Router, Request, Response } from 'express';
import { asyncHandlerWithAuth } from '../../middleware/async-handler';
import { requireInstructorForCourseAPI } from '../../middleware/require-course-role';
import { EngEAI_MongoDB } from '../../db/enge-ai-mongodb';
import { normalizeRouteParams } from '../../helpers/route-params';

/**
 * Registers Guided Pathway Library routes on the courses router.
 */
export function mountPathwaysRoutes(router: Router): void {
    /**
     * GET /:courseId/pathways — list pathways (ensure + seed first).
     */
    router.get(
        '/:courseId/pathways',
        requireInstructorForCourseAPI(['params']),
        asyncHandlerWithAuth(async (req: Request, res: Response) => {
            const { courseId } = normalizeRouteParams(req.params);
            const instance = await EngEAI_MongoDB.getInstance();
            const courseName = await instance.ensurePathwaysCollection(courseId);
            const data = await instance.listPathways(courseName);
            res.json({ success: true, data });
        })
    );

    /**
     * POST /:courseId/pathways — create one pathway.
     */
    router.post(
        '/:courseId/pathways',
        requireInstructorForCourseAPI(['params']),
        asyncHandlerWithAuth(async (req: Request, res: Response) => {
            const { courseId } = normalizeRouteParams(req.params);
            const instance = await EngEAI_MongoDB.getInstance();
            const courseName = await instance.ensurePathwaysCollection(courseId);
            const body = req.body ?? {};
            const data = await instance.createPathway(courseName, {
                title: typeof body.title === 'string' ? body.title : undefined,
                triggerDescription: typeof body.triggerDescription === 'string' ? body.triggerDescription : '',
                assistantResponse: typeof body.assistantResponse === 'string' ? body.assistantResponse : '',
                enabledGlobally: true,
                ctas: Array.isArray(body.ctas) ? body.ctas : [],
            });
            res.status(201).json({ success: true, data });
        })
    );

    /**
     * POST /:courseId/pathways/reset — wipe and re-seed platform defaults.
     * Registered before :pathwayId so "reset" is not captured as an id.
     */
    router.post(
        '/:courseId/pathways/reset',
        requireInstructorForCourseAPI(['params']),
        asyncHandlerWithAuth(async (req: Request, res: Response) => {
            const { courseId } = normalizeRouteParams(req.params);
            const instance = await EngEAI_MongoDB.getInstance();
            const courseName = await instance.ensurePathwaysCollection(courseId);
            const data = await instance.resetPathwaysToDefaults(courseName);
            res.json({ success: true, data });
        })
    );

    /**
     * PUT /:courseId/pathways/reorder — rewrite order from orderedIds.
     * Registered before :pathwayId so "reorder" is not captured as an id.
     */
    router.put(
        '/:courseId/pathways/reorder',
        requireInstructorForCourseAPI(['params']),
        asyncHandlerWithAuth(async (req: Request, res: Response) => {
            const { courseId } = normalizeRouteParams(req.params);
            const orderedIds = req.body?.orderedIds;
            if (!Array.isArray(orderedIds) || orderedIds.some((id: unknown) => typeof id !== 'string')) {
                return res.status(400).json({ success: false, error: 'orderedIds must be a string array' });
            }
            const instance = await EngEAI_MongoDB.getInstance();
            const courseName = await instance.ensurePathwaysCollection(courseId);
            try {
                const data = await instance.reorderPathways(courseName, orderedIds);
                res.json({ success: true, data });
            } catch (error: any) {
                return res.status(400).json({ success: false, error: error?.message || 'Invalid reorder' });
            }
        })
    );

    /**
     * PUT /:courseId/pathways/:pathwayId — update one pathway.
     */
    router.put(
        '/:courseId/pathways/:pathwayId',
        requireInstructorForCourseAPI(['params']),
        asyncHandlerWithAuth(async (req: Request, res: Response) => {
            const { courseId, pathwayId } = normalizeRouteParams(req.params) as {
                courseId: string;
                pathwayId: string;
            };
            if (!pathwayId) {
                return res.status(400).json({ success: false, error: 'pathwayId is required' });
            }
            const instance = await EngEAI_MongoDB.getInstance();
            const courseName = await instance.ensurePathwaysCollection(courseId);
            const body = req.body ?? {};
            const patch: Record<string, unknown> = {};
            if (typeof body.title === 'string') patch.title = body.title;
            if (typeof body.triggerDescription === 'string') patch.triggerDescription = body.triggerDescription;
            if (typeof body.assistantResponse === 'string') patch.assistantResponse = body.assistantResponse;
            // UI no longer exposes enable toggle — keep pathways active when patched from library
            if (typeof body.enabledGlobally === 'boolean') patch.enabledGlobally = body.enabledGlobally;
            if (Array.isArray(body.ctas)) patch.ctas = body.ctas;

            const data = await instance.updatePathway(courseName, pathwayId, patch);
            if (!data) {
                return res.status(404).json({ success: false, error: 'Pathway not found' });
            }
            res.json({ success: true, data });
        })
    );

    /**
     * DELETE /:courseId/pathways/:pathwayId — delete one pathway.
     */
    router.delete(
        '/:courseId/pathways/:pathwayId',
        requireInstructorForCourseAPI(['params']),
        asyncHandlerWithAuth(async (req: Request, res: Response) => {
            const { courseId, pathwayId } = normalizeRouteParams(req.params) as {
                courseId: string;
                pathwayId: string;
            };
            if (!pathwayId) {
                return res.status(400).json({ success: false, error: 'pathwayId is required' });
            }
            const instance = await EngEAI_MongoDB.getInstance();
            const courseName = await instance.ensurePathwaysCollection(courseId);
            const deleted = await instance.deletePathway(courseName, pathwayId);
            if (!deleted) {
                return res.status(404).json({ success: false, error: 'Pathway not found' });
            }
            res.json({ success: true });
        })
    );
}
