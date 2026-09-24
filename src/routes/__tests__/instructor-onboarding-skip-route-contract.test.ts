/**
 * Instructor onboarding skip route contract tests
 *
 * Pins `POST /api/user/onboarding/skip-remaining`: own-record only, one call into the
 * bulk delegate, a refreshed session copy, and no leak of a failure cause.
 *
 * Skip tutorial is final — it marks every remaining tutorial taught for this person on
 * every course — so the contract that carries it is worth pinning on its own.
 *
 * @author: @rdschrs
 * @description: Auth, success, not-found, and failure coverage for Skip tutorial.
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

jest.mock('../../middleware/session-activity', () => ({
    respondWithSessionIdleStatus: jest.fn(),
    trackSessionActivity: (_req: Request, _res: Response, next: NextFunction) => next()
}));

import { EngEAI_MongoDB } from '../../db/enge-ai-mongodb';
import userManagementRoutes from '../route-user-management';

// Mounting an Express app per case contends with the other suites in a full parallel run.
jest.setTimeout(30000);

/** Progress a successful skip returns: every per-user tutorial taught. */
const ALL_TAUGHT = {
    contentSetup: true,
    flagSetup: true,
    monitorSetup: true,
    scenarioGeneration: true,
    writingFeedback: true,
    guidedPathway: true
};

/**
 * Mounts the router behind a stub session holding an authenticated user.
 *
 * @param session - session contents; omit `globalUser` to exercise the 401 path
 */
function buildApp(session: Record<string, unknown>) {
    const app = express();
    app.use(express.json());
    app.use((req: Request, _res: Response, next: NextFunction) => {
        (req as any).session = session;
        next();
    });
    app.use('/api/user', userManagementRoutes);
    return app;
}

function mockMongo(skipRemainingInstructorOnboardingStages: jest.Mock) {
    (EngEAI_MongoDB.getInstance as jest.Mock).mockResolvedValue({
        skipRemainingInstructorOnboardingStages
    });
}

describe('POST /api/user/onboarding/skip-remaining', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('marks every tutorial taught and returns the refreshed progress', async () => {
        const skip = jest.fn().mockResolvedValue({ puid: 'p-1', instructorOnboarding: ALL_TAUGHT });
        mockMongo(skip);

        const response = await request(buildApp({ globalUser: { puid: 'p-1', userId: 'u-1' } }))
            .post('/api/user/onboarding/skip-remaining')
            .send();

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ success: true, instructorOnboarding: ALL_TAUGHT });
        expect(skip).toHaveBeenCalledWith('p-1');
        expect(skip).toHaveBeenCalledTimes(1);
    });

    it('refreshes the session copy so a later read is not stale', async () => {
        mockMongo(jest.fn().mockResolvedValue({ puid: 'p-1', instructorOnboarding: ALL_TAUGHT }));
        const session = { globalUser: { puid: 'p-1', userId: 'u-1' } };

        await request(buildApp(session)).post('/api/user/onboarding/skip-remaining').send();

        expect((session.globalUser as any).instructorOnboarding).toEqual(ALL_TAUGHT);
    });

    it('requires an authenticated caller', async () => {
        const skip = jest.fn();
        mockMongo(skip);

        const response = await request(buildApp({})).post('/api/user/onboarding/skip-remaining').send();

        expect(response.status).toBe(401);
        expect(response.body).toEqual({ success: false, error: 'User not authenticated' });
        expect(skip).not.toHaveBeenCalled();
    });

    it('reports a missing user as 404', async () => {
        mockMongo(jest.fn().mockResolvedValue(null));

        const response = await request(buildApp({ globalUser: { puid: 'p-gone', userId: 'u-gone' } }))
            .post('/api/user/onboarding/skip-remaining')
            .send();

        expect(response.status).toBe(404);
        expect(response.body).toEqual({ success: false, error: 'User not found' });
    });

    it('reports a delegate failure as 500 without leaking the cause', async () => {
        mockMongo(jest.fn().mockRejectedValue(new Error('mongo down')));

        const response = await request(buildApp({ globalUser: { puid: 'p-1', userId: 'u-1' } }))
            .post('/api/user/onboarding/skip-remaining')
            .send();

        expect(response.status).toBe(500);
        expect(response.body).toEqual({
            success: false,
            error: 'Failed to skip instructor onboarding'
        });
        expect(JSON.stringify(response.body)).not.toContain('mongo down');
    });
});
