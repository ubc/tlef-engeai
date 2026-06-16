/**
 * academic-period-routes.ts
 *
 * Admin CRUD for `academic-periods`. Mounted at `/api/academic-periods`.
 */

import { Router, Request, Response } from 'express';
import { asyncHandlerWithAuth } from '../../middleware/async-handler';
import { requireAdminGlobal } from '../../middleware/require-course-role';
import { EngEAI_MongoDB } from '../../db/enge-ai-mongodb';
import { AcademicPeriodValidationError } from '../../db/mongo/academic-period-mongo';

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

router.get(
    '/:id',
    requireAdminGlobal,
    asyncHandlerWithAuth(async (req: Request, res: Response) => {
        const mongo = await EngEAI_MongoDB.getInstance();
        const data = await mongo.getAcademicPeriodById(req.params.id);
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
            const data = await mongo.updateAcademicPeriod(req.params.id, { title, startDate, endDate });
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
