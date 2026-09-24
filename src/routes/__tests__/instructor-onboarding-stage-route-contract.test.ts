/**
 * Instructor onboarding stage route contract tests
 *
 * Pins the accepted stage set, the reject-without-write behaviour, and the session
 * refresh for `PATCH /api/user/onboarding/instructor-stage`.
 *
 * Tutorial progress lives on the user rather than the course (OB-002), and the three
 * feature tutorials record through this same route. The accepted set is therefore the
 * contract the browser depends on: a stage missing from it silently fails to persist,
 * and the tutorial is served again on the next course entry.
 *
 * @author: @rdschrs
 * @description: Stage-set, validation, and session coverage for per-user tutorial progress.
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

// Mounting an Express app per case is fast alone but contends with the other suites in a
// full parallel run, where the default 5s budget is spent before the first request lands.
jest.setTimeout(30000);

/** Every stage the browser may report, inherited tutorials and feature tutorials alike. */
const ACCEPTED_STAGES = [
    'contentSetup',
    'flagSetup',
    'monitorSetup',
    'scenarioGeneration',
    'writingFeedback',
    'guidedPathway'
] as const;

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

function mockMongo(completeInstructorOnboardingStage: jest.Mock) {
    (EngEAI_MongoDB.getInstance as jest.Mock).mockResolvedValue({ completeInstructorOnboardingStage });
}

describe('PATCH /api/user/onboarding/instructor-stage', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it.each(ACCEPTED_STAGES)('records %s against the caller PUID', async (stage) => {
        const complete = jest.fn().mockResolvedValue({ instructorOnboarding: { [stage]: true } });
        mockMongo(complete);
        const session = { globalUser: { puid: 'p-1', userId: 'u-1' } };

        const response = await request(buildApp(session))
            .patch('/api/user/onboarding/instructor-stage')
            .send({ stage });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(complete).toHaveBeenCalledWith('p-1', stage);
        // The session copy is refreshed so a later read in the same request cycle
        // does not re-serve a tutorial that was just completed.
        expect((session.globalUser as any).instructorOnboarding).toEqual({ [stage]: true });
    });

    it.each([
        ['courseSetup', 'course configuration, which stays on the course document'],
        ['memoryAgent', 'a capability with no tutorial'],
        [undefined, 'a missing stage']
    ])('rejects %s without writing', async (stage, _why) => {
        const complete = jest.fn();
        mockMongo(complete);

        const response = await request(buildApp({ globalUser: { puid: 'p-1', userId: 'u-1' } }))
            .patch('/api/user/onboarding/instructor-stage')
            .send(stage === undefined ? {} : { stage });

        expect(response.status).toBe(400);
        expect(complete).not.toHaveBeenCalled();
    });

    it('requires an authenticated caller', async () => {
        const complete = jest.fn();
        mockMongo(complete);

        const response = await request(buildApp({}))
            .patch('/api/user/onboarding/instructor-stage')
            .send({ stage: 'writingFeedback' });

        expect(response.status).toBe(401);
        expect(complete).not.toHaveBeenCalled();
    });

    it('reports 404 when no user matches the PUID', async () => {
        mockMongo(jest.fn().mockResolvedValue(null));

        const response = await request(buildApp({ globalUser: { puid: 'p-gone', userId: 'u-gone' } }))
            .patch('/api/user/onboarding/instructor-stage')
            .send({ stage: 'guidedPathway' });

        expect(response.status).toBe(404);
    });
});
