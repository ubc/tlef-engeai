/**
 * academic-period-routes.ts
 *
 * Admin CRUD for `academic-periods`. Mounted at `/api/academic-periods`.
 */

import { Router, Request, Response } from 'express';
import { asyncHandlerWithAuth } from '../../middleware/async-handler';
import { requireAdminGlobal } from '../../middleware/require-course-role';
import { requireAuthAPI } from '../../middleware/require-auth';
import { EngEAI_MongoDB } from '../../db/enge-ai-mongodb';
import { AcademicPeriodValidationError } from '../../db/mongo/academic-period-mongo';
import { routeParam } from '../../helpers/route-params';

const router = Router();

function handleValidationError(res: Response, error: unknown): boolean {
    if (error instanceof AcademicPeriodValidationError) {
        res.status(400).json({ success: false, error: error.message });
        return true;
    }
    return false;
}

router.get(
    '/',
    requireAdminGlobal,
    asyncHandlerWithAuth(async (_req: Request, res: Response) => {
        const mongo = await EngEAI_MongoDB.getInstance();
        const data = await mongo.listAcademicPeriods();
        res.json({ success: true, data });
    })
);

router.post(
    '/',
    requireAdminGlobal,
    asyncHandlerWithAuth(async (req: Request, res: Response) => {
        try {
            const { title, startDate, endDate } = req.body ?? {};
            const mongo = await EngEAI_MongoDB.getInstance();
            const data = await mongo.createAcademicPeriod({ title, startDate, endDate });
            res.status(201).json({ success: true, data });
        } catch (error) {
            if (handleValidationError(res, error)) {
                return;
            }
            throw error;
        }
    })
);

/**
 * GET /selectable
 *
 * The academic periods any signed-in user may assign a course to, newest first.
 *
 * Separate from `GET /` because that route is admin-only, while an instructor importing a course
 * from Canvas has to name the term it belongs to. Only the naming fields are returned — a term
 * title and its dates say nothing about who is enrolled where — so nothing here needs the admin
 * gate that guards period membership and CRUD.
 *
 * Declared before `/:id` so the literal path is not swallowed by the parameterised one.
 */
router.get(
    '/selectable',
    requireAuthAPI,
    asyncHandlerWithAuth(async (_req: Request, res: Response) => {
        const mongo = await EngEAI_MongoDB.getInstance();
        const periods = await mongo.listAcademicPeriods();
        res.json({
            success: true,
            data: periods.map((period) => ({
                id: period.id,
                title: period.title,
                startDate: period.startDate,
                endDate: period.endDate,
            })),
        });
    })
);

router.get(
    '/:id',
    requireAdminGlobal,
    asyncHandlerWithAuth(async (req: Request, res: Response) => {
        const mongo = await EngEAI_MongoDB.getInstance();
        const data = await mongo.getAcademicPeriodById(routeParam(req.params, 'id'));
        if (!data) {
            return res.status(404).json({ success: false, error: 'Academic period not found' });
        }
        res.json({ success: true, data });
    })
);

router.put(
    '/:id',
    requireAdminGlobal,
    asyncHandlerWithAuth(async (req: Request, res: Response) => {
        try {
            const { title, startDate, endDate } = req.body ?? {};
            const mongo = await EngEAI_MongoDB.getInstance();
            const data = await mongo.updateAcademicPeriod(routeParam(req.params, 'id'), { title, startDate, endDate });
            if (!data) {
                return res.status(404).json({ success: false, error: 'Academic period not found' });
            }
            res.json({ success: true, data });
        } catch (error) {
            if (handleValidationError(res, error)) {
                return;
            }
            throw error;
        }
    })
);

export default router;
