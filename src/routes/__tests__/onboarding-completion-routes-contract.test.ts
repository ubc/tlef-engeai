/**
 * Feature onboarding completion route contract tests
 *
 * Pins authorization, kebab-to-camel feature mapping, idempotence, and
 * route-match order for `PATCH /:courseId/onboarding/features/:feature/complete`.
 *
 * Route order matters here for the same reason it did for the manual flag family
 * (D-041): `route-mongo.ts` declares several `/:courseId/...` captures, and a
 * mis-ordered declaration silently swallows a new path.
 *
 * @author: @rdschrs
 * @date: 2026-08-17
 * @version: 1.0.0
 * @description: RBAC, mapping, and route-order coverage for feature onboarding completion.
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
        requireInstructorForCourseAPI: passThroughGuard,
        requireSelfOrInstructorForCourseAPI: passThroughGuard,
        requireInstructorGlobal: passThroughGuard(),
        requireInstructorOrAdminForCourseAPI: courseGuard,
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
// imports it transitively when it mounts the scenario-question routes.
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
function mockMongo(delegates: Record<string, unknown>, course: Record<string, unknown> = {}) {
    (EngEAI_MongoDB.getInstance as jest.Mock).mockResolvedValue({
        getActiveCourse: jest.fn().mockResolvedValue({
            id: 'course-1',
            courseName: 'CHBE 241',
            ...course
        }),
        ...delegates
    });
}

describe('feature onboarding completion route contracts', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        guardState.deny = true;
    });

    it('guards completion behind instructor-or-admin course authorization', async () => {
        const updateActiveCourse = jest.fn();
        mockMongo({ updateActiveCourse });

        const response = await request(buildApp())
            .patch('/api/courses/course-1/onboarding/features/writing-feedback/complete');

        expect(response.status).toBe(403);
        expect(updateActiveCourse).not.toHaveBeenCalled();
    });

    it.each([
        ['scenario-generation', 'featureOnboarding.scenarioGeneration'],
        ['writing-feedback', 'featureOnboarding.writingFeedback'],
        ['guided-pathway', 'featureOnboarding.guidedPathway']
    ])('maps %s to a single dotted %s write', async (slug, dottedPath) => {
        guardState.deny = false;
        const updateActiveCourse = jest.fn().mockResolvedValue({ id: 'course-1' });
        mockMongo({ updateActiveCourse });

        const response = await request(buildApp())
            .patch(`/api/courses/course-1/onboarding/features/${slug}/complete`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        // A dotted path leaves sibling tutorial flags untouched; a whole-object
        // write would clobber progress saved by a concurrent tab.
        expect(updateActiveCourse).toHaveBeenCalledWith('course-1', { [dottedPath]: true });
    });

    it('rejects an unknown feature slug without writing', async () => {
        guardState.deny = false;
        const updateActiveCourse = jest.fn();
        mockMongo({ updateActiveCourse });

        const response = await request(buildApp())
            .patch('/api/courses/course-1/onboarding/features/memory-agent/complete');

        expect(response.status).toBe(400);
        expect(updateActiveCourse).not.toHaveBeenCalled();
    });

    it('is idempotent when the tutorial is already complete', async () => {
        guardState.deny = false;
        const updateActiveCourse = jest.fn().mockResolvedValue({ id: 'course-1' });
        mockMongo({ updateActiveCourse }, { featureOnboarding: { guidedPathway: true } });

        const response = await request(buildApp())
            .patch('/api/courses/course-1/onboarding/features/guided-pathway/complete');

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
    });

    it('is not shadowed by the generic course update capture', async () => {
        guardState.deny = false;
        const updateActiveCourse = jest.fn().mockResolvedValue({ id: 'course-1' });
        mockMongo({ updateActiveCourse });

        await request(buildApp())
            .patch('/api/courses/course-1/onboarding/features/scenario-generation/complete');

        // A `/:id`-style capture declared above would receive the whole path and
        // write nothing, or write the wrong field.
        expect(updateActiveCourse).toHaveBeenCalledTimes(1);
        expect(updateActiveCourse).toHaveBeenCalledWith('course-1', {
            'featureOnboarding.scenarioGeneration': true
        });
    });

    it('returns 404 when the course does not exist', async () => {
        guardState.deny = false;
        const updateActiveCourse = jest.fn();
        (EngEAI_MongoDB.getInstance as jest.Mock).mockResolvedValue({
            getActiveCourse: jest.fn().mockResolvedValue(null),
            updateActiveCourse
        });

        const response = await request(buildApp())
            .patch('/api/courses/missing/onboarding/features/writing-feedback/complete');

        expect(response.status).toBe(404);
        expect(updateActiveCourse).not.toHaveBeenCalled();
    });
});
