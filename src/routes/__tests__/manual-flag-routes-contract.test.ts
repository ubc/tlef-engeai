/**
 * Manual flag route contract tests
 *
 * Pins course-scoped authorization and route-matching order for the inherited
 * manual flag endpoint family in `route-mongo.ts`. These contracts must hold
 * before the family is extracted into its own module.
 *
 * @author: EngE-AI Team
 * @date: 2026-08-17
 * @version: 1.0.0
 * @description: RBAC and route-order regression coverage for manual flag endpoints.
 */

import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

/**
 * Toggles the stubbed course guards between deny and pass-through.
 *
 * Authorization logic lives in `middleware/__tests__/require-course-role.test.ts`.
 * Denying proves a guard is mounted at all; passing through lets a test observe
 * which handler Express actually selected.
 */
const guardState = { deny: true };

jest.mock('../../middleware/async-handler', () => ({
    asyncHandler: (handler: (req: Request, res: Response, next: NextFunction) => unknown) =>
        (req: Request, res: Response, next: NextFunction) =>
            Promise.resolve(handler(req, res, next)).catch(next),
    asyncHandlerWithAuth: (handler: (req: Request, res: Response, next: NextFunction) => unknown) =>
        (req: Request, res: Response, next: NextFunction) =>
            Promise.resolve(handler(req, res, next)).catch(next)
}));

jest.mock('../../middleware/require-course-role', () => {
    const courseGuard = () => (_req: Request, res: Response, next: NextFunction) => {
        if (guardState.deny) {
            return res.status(403).json({ success: false, error: 'Course access required' });
        }
        return next();
    };
    const passThroughGuard = () => (_req: Request, _res: Response, next: NextFunction) => next();
    return {
        requireAdminForCourseAPI: passThroughGuard,
        requireCourseFeatureAPI: passThroughGuard,
        requireInstructorForCourseAPI: courseGuard,
        requireSelfOrInstructorForCourseAPI: courseGuard,
        requireInstructorGlobal: passThroughGuard(),
        requireInstructorOrAdminForCourseAPI: passThroughGuard,
        requirePostPeriodAnalyticsAPI: passThroughGuard,
        requireRosterManageAPI: passThroughGuard,
        requireAdminGlobal: passThroughGuard()
    };
});

jest.mock('../../db/enge-ai-mongodb', () => ({
    EngEAI_MongoDB: { getInstance: jest.fn() }
}));

jest.mock('../../utils/logger', () => ({
    appLogger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));

jest.mock('../../rag/rag-app', () => ({ RAGApp: { getInstance: jest.fn() } }));
jest.mock('../../memory-agent/memory-agent', () => ({ memoryAgent: {} }));
jest.mock('../../jobs/scheduled-publish-audit', () => ({ scheduledPublishAudit: { record: jest.fn() } }));

// `scenario-service` builds a live LLM provider at module load, and `route-mongo`
// imports it transitively when it mounts the scenario-question routes. Stubbing the
// module keeps that import side effect out of a pure route-contract test.
jest.mock('../../scenario-generation/scenario-service', () => ({
    generateScenarioQuestions: jest.fn(),
    submitScenarioStudentResponse: jest.fn(),
    submitScenarioExam: jest.fn(),
    getScenarioService: jest.fn()
}));

import { EngEAI_MongoDB } from '../../db/enge-ai-mongodb';
import mongodbRoutes from '../route-mongo';

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/courses', mongodbRoutes);
    return app;
}

/** Stubs the singleton so each test only supplies the delegates its route needs. */
function mockMongo(delegates: Record<string, unknown>) {
    (EngEAI_MongoDB.getInstance as jest.Mock).mockResolvedValue({
        getActiveCourse: jest.fn().mockResolvedValue({ id: 'course-1', courseName: 'CHBE 241' }),
        ...delegates
    });
}

describe('manual flag route contracts', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        guardState.deny = true;
    });

    it('guards one student flag history behind course-scoped authorization', async () => {
        const getAllFlagReports = jest.fn();
        mockMongo({ getAllFlagReports });

        const response = await request(buildApp()).get('/api/courses/course-1/flags/student/student-9');

        expect(response.status).toBe(403);
        expect(getAllFlagReports).not.toHaveBeenCalled();
    });

    it('guards flag statistics behind course-scoped authorization', async () => {
        const getFlagStatistics = jest.fn();
        mockMongo({ getFlagStatistics });

        const response = await request(buildApp()).get('/api/courses/course-1/flags/statistics');

        expect(response.status).toBe(403);
        expect(getFlagStatistics).not.toHaveBeenCalled();
    });

    it('routes flags/statistics to the statistics handler rather than the flag-id handler', async () => {
        guardState.deny = false;
        const getFlagStatistics = jest.fn().mockResolvedValue({ total: 0 });
        const getFlagReportById = jest.fn();
        mockMongo({ getFlagStatistics, getFlagReportById });

        await request(buildApp()).get('/api/courses/course-1/flags/statistics');

        // `/:courseId/flags/:flagId` also matches this URL, so declaration order decides.
        expect(getFlagReportById).not.toHaveBeenCalled();
        expect(getFlagStatistics).toHaveBeenCalledWith('CHBE 241');
    });

    it('routes flags/validate to the validation handler rather than the flag-id handler', async () => {
        guardState.deny = false;
        const validateFlagCollection = jest.fn().mockResolvedValue({ valid: true });
        const getFlagReportById = jest.fn();
        mockMongo({ validateFlagCollection, getFlagReportById });

        await request(buildApp()).get('/api/courses/course-1/flags/validate');

        expect(getFlagReportById).not.toHaveBeenCalled();
        expect(validateFlagCollection).toHaveBeenCalled();
    });
});
