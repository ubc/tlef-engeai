import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

jest.mock('../../db/enge-ai-mongodb', () => ({
    EngEAI_MongoDB: { getInstance: jest.fn() }
}));

jest.mock('../../middleware/async-handler', () => ({
    asyncHandlerWithAuth: (handler: (req: Request, res: Response, next: NextFunction) => unknown) =>
        (req: Request, res: Response, next: NextFunction) =>
            Promise.resolve(handler(req, res, next)).catch(next)
}));

jest.mock('../../middleware/require-course-role', () => ({
    requireAdminGlobal: (_req: Request, _res: Response, next: NextFunction) => next()
}));

jest.mock('../../utils/logger', () => ({
    appLogger: { error: jest.fn() }
}));

import { EngEAI_MongoDB } from '../../db/enge-ai-mongodb';
import adminGuidedPathwayFlagRoutes from '../mongo/admin-guided-pathway-flag-routes';

describe('administrator Guided Pathway flag list API', () => {
    it('returns server-provided safe facets and requests facet-wide Mongo queries', async () => {
        const data = {
            items: [],
            page: 1,
            pageSize: 20,
            total: 0,
            facets: {
                pathways: [{ pathwayId: 'pathway-1', pathwayTitle: 'Support' }],
                reviewers: ['Instructor A']
            }
        };
        const listGuidedPathwayFlags = jest.fn().mockResolvedValue(data);
        (EngEAI_MongoDB.getInstance as jest.Mock).mockResolvedValue({
            listGuidedPathwayFlags
        });

        const app = express();
        app.use(express.json());
        app.use('/', adminGuidedPathwayFlagRoutes);

        const response = await request(app).get(
            '/?page=1&pageSize=20&status=escalated&pathwayId=pathway-1&reviewer=Instructor%20A'
        );

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ success: true, data });
        expect(listGuidedPathwayFlags).toHaveBeenCalledWith(expect.objectContaining({
            page: 1,
            pageSize: 20,
            status: 'escalated',
            pathwayId: 'pathway-1',
            reviewer: 'Instructor A',
            escalatedFirst: true,
            includeFacets: true
        }));
        expect(response.body.data.facets).not.toHaveProperty('messageText');
        expect(response.body.data.facets).not.toHaveProperty('studentUserId');
    });

    it('rejects review-state filters combined with a non-escalated decision', async () => {
        const listGuidedPathwayFlags = jest.fn();
        (EngEAI_MongoDB.getInstance as jest.Mock).mockResolvedValue({
            listGuidedPathwayFlags
        });

        const app = express();
        app.use(express.json());
        app.use('/', adminGuidedPathwayFlagRoutes);

        const response = await request(app).get('/?status=dismissed&reviewState=needs-review');

        expect(response.status).toBe(400);
        expect(response.body).toEqual({
            success: false,
            error: 'Admin review filters apply only to escalated alerts'
        });
        expect(listGuidedPathwayFlags).not.toHaveBeenCalled();
    });
});
