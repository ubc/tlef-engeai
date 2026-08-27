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
    beforeEach(() => {
        jest.clearAllMocks();
    });

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
        const listGuidedPathwayFlagsForAdmin = jest.fn().mockResolvedValue(data);
        (EngEAI_MongoDB.getInstance as jest.Mock).mockResolvedValue({
            listGuidedPathwayFlagsForAdmin
        });

        const app = express();
        app.use(express.json());
        app.use('/', adminGuidedPathwayFlagRoutes);

        const response = await request(app).get(
            '/?page=1&pageSize=20&status=escalated&pathwayId=pathway-1&reviewer=Instructor%20A'
        );

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ success: true, data });
        expect(listGuidedPathwayFlagsForAdmin).toHaveBeenCalledWith(expect.objectContaining({
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
        const listGuidedPathwayFlagsForAdmin = jest.fn();
        (EngEAI_MongoDB.getInstance as jest.Mock).mockResolvedValue({
            listGuidedPathwayFlagsForAdmin
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
        expect(listGuidedPathwayFlagsForAdmin).not.toHaveBeenCalled();
    });

    it('uses both course id and flag id for administrator review and reveal mutations', async () => {
        const reviewed = { id: 'shared-flag', courseId: 'course-2', status: 'escalated' };
        const markGuidedPathwayFlagAdminReviewed = jest.fn().mockResolvedValue(reviewed);
        const revealGuidedPathwayFlagIdentity = jest.fn().mockResolvedValue({ studentName: 'Student' });
        (EngEAI_MongoDB.getInstance as jest.Mock).mockResolvedValue({
            markGuidedPathwayFlagAdminReviewed,
            revealGuidedPathwayFlagIdentity
        });

        const app = express();
        app.use(express.json());
        app.use((req, _res, next) => {
            (req as any).session = {
                globalUser: { userId: 'admin-1', name: 'Admin' }
            };
            next();
        });
        app.use('/', adminGuidedPathwayFlagRoutes);

        const reviewResponse = await request(app).patch('/course-2/shared-flag/review');
        const revealResponse = await request(app).post('/course-2/shared-flag/reveal-identity');

        expect(reviewResponse.status).toBe(200);
        expect(revealResponse.status).toBe(200);
        expect(markGuidedPathwayFlagAdminReviewed).toHaveBeenCalledWith(
            'course-2',
            'shared-flag',
            { userId: 'admin-1', name: 'Admin' }
        );
        expect(revealGuidedPathwayFlagIdentity).toHaveBeenCalledWith(
            'course-2',
            'shared-flag',
            { userId: 'admin-1', name: 'Admin' }
        );
    });
});
