/**
 * Route-level tests for academic period validation helpers and the selectable-terms contract.
 */

import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

jest.mock('../../middleware/async-handler', () => ({
    asyncHandler: (handler: (req: Request, res: Response, next: NextFunction) => unknown) =>
        (req: Request, res: Response, next: NextFunction) =>
            Promise.resolve(handler(req, res, next)).catch(next),
    asyncHandlerWithAuth: (handler: (req: Request, res: Response, next: NextFunction) => unknown) =>
        (req: Request, res: Response, next: NextFunction) =>
            Promise.resolve(handler(req, res, next)).catch(next)
}));

jest.mock('../../db/enge-ai-mongodb', () => ({
    EngEAI_MongoDB: { getInstance: jest.fn() }
}));

jest.mock('../../utils/logger', () => ({
    appLogger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));

import { EngEAI_MongoDB } from '../../db/enge-ai-mongodb';
import academicPeriodRoutes from '../mongo/academic-period-routes';
import {
    validatePeriodDates,
    AcademicPeriodValidationError
} from '../../db/mongo/academic-period-mongo';

// Mounting an Express app per case contends with the other suites in a full parallel run,
// where the default 5s budget is spent before the first request lands.
jest.setTimeout(30000);

const PERIOD = {
    id: 'period-w26',
    title: 'Winter 2026',
    startDate: new Date('2026-01-05T00:00:00.000Z'),
    endDate: new Date('2026-04-24T00:00:00.000Z'),
    courseIds: ['course-1', 'course-2'],
    createdAt: new Date('2025-11-01T00:00:00.000Z'),
    updatedAt: new Date('2025-11-01T00:00:00.000Z')
};

/**
 * Mounts the router behind a stub session.
 *
 * @param authenticated - what `req.isAuthenticated()` should report
 */
function buildApp(authenticated: boolean) {
    const app = express();
    app.use(express.json());
    app.use((req: Request, _res: Response, next: NextFunction) => {
        (req as any).isAuthenticated = () => authenticated;
        (req as any).session = {};
        next();
    });
    app.use('/api/academic-periods', academicPeriodRoutes);
    return app;
}

describe('GET /api/academic-periods/selectable', () => {
    beforeEach(() => {
        (EngEAI_MongoDB.getInstance as jest.Mock).mockResolvedValue({
            listAcademicPeriods: jest.fn(async () => [PERIOD])
        });
    });

    // The whole point of the separate route: an instructor importing from Canvas has to name a
    // term, and every other route in this file is admin-only.
    it('serves the term list to a non-admin signed-in user', async () => {
        const response = await request(buildApp(true)).get('/api/academic-periods/selectable');

        expect(response.status).toBe(200);
        expect(response.body.data).toEqual([
            {
                id: 'period-w26',
                title: 'Winter 2026',
                startDate: PERIOD.startDate.toISOString(),
                endDate: PERIOD.endDate.toISOString()
            }
        ]);
    });

    // Period membership stays behind the admin gate; only the naming fields are public.
    it('omits course membership from the payload', async () => {
        const response = await request(buildApp(true)).get('/api/academic-periods/selectable');

        expect(response.body.data[0]).not.toHaveProperty('courseIds');
    });

    it('rejects an unauthenticated caller', async () => {
        const response = await request(buildApp(false)).get('/api/academic-periods/selectable');

        expect(response.status).toBe(401);
    });

    // `/selectable` must not fall through to the admin-only `/:id` handler.
    it('does not treat "selectable" as a period id', async () => {
        const getAcademicPeriodById = jest.fn();
        (EngEAI_MongoDB.getInstance as jest.Mock).mockResolvedValue({
            listAcademicPeriods: jest.fn(async () => [PERIOD]),
            getAcademicPeriodById
        });

        await request(buildApp(true)).get('/api/academic-periods/selectable');

        expect(getAcademicPeriodById).not.toHaveBeenCalled();
    });
});

describe('academic period route validation', () => {
    it('rejects equal start and end dates', () => {
        expect(() => validatePeriodDates('2026-01-06', '2026-01-06')).toThrow(
            AcademicPeriodValidationError
        );
    });
});
