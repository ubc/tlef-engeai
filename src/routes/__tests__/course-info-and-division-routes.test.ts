/**
 * Course info and division route tests
 *
 * Pins two Documents/Advanced Settings fixes in `route-mongo.ts`:
 * - #208: `GET /api/courses/:id` gives course staff a faculty-only `instructorDisplay`
 *   (no platform admins, no TAs), matching the course selection card.
 * - #689: a new week/topic gets the next "Week N" by position, not a number read
 *   from hash ids.
 */

import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

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
import { RAGApp } from '../../rag/rag-app';

/** Builds the router with an optional session user (`req.user.puid`). */
function buildApp(puid?: string) {
    const app = express();
    app.use(express.json());
    app.use((req: Request, _res: Response, next: NextFunction) => {
        if (puid) (req as unknown as { user: { puid: string } }).user = { puid };
        next();
    });
    app.use('/api/courses', mongodbRoutes);
    return app;
}

const course = {
    id: 'course-1',
    courseName: 'CHBE 241',
    frameType: 'byWeek',
    instructors: [
        { userId: 'u-faculty', name: 'Dana Faculty' },
        { userId: 'u-admin', name: 'Ari Admin' },
        { userId: 'u-ta', name: 'Tess TA' }
    ],
    teachingAssistants: [{ userId: 'u-ta', name: 'Tess TA' }],
    topicOrWeekInstances: [] as unknown[]
};

const users: Record<string, Record<string, unknown>> = {
    'p-faculty': { userId: 'u-faculty', affiliation: 'faculty' },
    'p-student': { userId: 'u-student', affiliation: 'student' }
};

/** Stubs the Mongo singleton for the course, its viewers, and one platform admin. */
function mockMongo(overrides: Record<string, unknown> = {}) {
    const delegates = {
        getActiveCourse: jest.fn().mockResolvedValue(course),
        findGlobalUserByPUID: jest.fn(async (puid: string) => users[puid] ?? null),
        findAdminGlobalUsers: jest.fn().mockResolvedValue([{ userId: 'u-admin', isAdmin: true }]),
        updateActiveCourse: jest.fn().mockResolvedValue(undefined),
        ...overrides
    };
    (EngEAI_MongoDB.getInstance as jest.Mock).mockResolvedValue(delegates);
    return delegates;
}

describe('GET /api/courses/:id instructorDisplay (#208)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        guardState.deny = false;
    });

    it('lists faculty instructors only for course staff', async () => {
        mockMongo();
        const response = await request(buildApp('p-faculty')).get('/api/courses/course-1');

        expect(response.status).toBe(200);
        expect(response.body.data.instructorDisplay).toBe('Dana Faculty');
    });

    it('omits instructorDisplay for a non-staff viewer', async () => {
        const delegates = mockMongo();
        const response = await request(buildApp('p-student')).get('/api/courses/course-1');

        expect(response.status).toBe(200);
        expect(response.body.data.instructorDisplay).toBeUndefined();
        expect(delegates.findAdminGlobalUsers).not.toHaveBeenCalled();
    });
});

describe('POST /api/courses/:courseId/topic-or-week-instances default title (#689)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        guardState.deny = false;
    });

    it('names the week after the last one even when ids are hashes', async () => {
        const weeks = Array.from({ length: 11 }, (_, i) => ({
            id: `${2829 + i}ab4f9e1c`,
            title: `Week ${i + 1}`,
            items: []
        }));
        const delegates = mockMongo({
            getActiveCourse: jest.fn().mockResolvedValue({ ...course, topicOrWeekInstances: weeks })
        });

        const response = await request(buildApp('p-faculty'))
            .post('/api/courses/course-1/topic-or-week-instances')
            .send({});

        expect(response.status).toBe(201);
        expect(response.body.data.title).toBe('Week 12');
        expect(response.body.data.items[0].topicOrWeekTitle).toBe('Week 12');
        expect(delegates.updateActiveCourse).toHaveBeenCalledTimes(1);
    });

    it('keeps an explicit title from the request', async () => {
        mockMongo();
        const response = await request(buildApp('p-faculty'))
            .post('/api/courses/course-1/topic-or-week-instances')
            .send({ title: 'Reading week' });

        expect(response.body.data.title).toBe('Reading week');
    });
});

describe('Documents route guards and the reserved syllabus title', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        guardState.deny = false;
    });

    it.each([
        ['patch', '/api/courses/course-1/topic-or-week-instances/w1/title'],
        ['patch', '/api/courses/course-1/topic-or-week-instances/w1/published'],
        ['patch', '/api/courses/course-1/topic-or-week-instances/w1/items/i1/title'],
        ['delete', '/api/courses/course-1/topic-or-week-instances/w1/items/i1']
    ] as const)('%s %s is behind the course-scoped instructor guard', async (method, url) => {
        guardState.deny = true;
        const delegates = mockMongo();

        const response = await request(buildApp('p-student'))[method](url).send({ title: 'Renamed', published: true });

        expect(response.status).toBe(403);
        expect(delegates.getActiveCourse).not.toHaveBeenCalled();
    });

    it('refuses a new week titled Course Syllabus', async () => {
        const delegates = mockMongo();
        const response = await request(buildApp('p-faculty'))
            .post('/api/courses/course-1/topic-or-week-instances')
            .send({ title: ' course  syllabus ' });

        expect(response.status).toBe(400);
        expect(delegates.updateActiveCourse).not.toHaveBeenCalled();
    });

    it('refuses renaming a week to Course Syllabus', async () => {
        const delegates = mockMongo();
        const response = await request(buildApp('p-faculty'))
            .patch('/api/courses/course-1/topic-or-week-instances/w1/title')
            .send({ title: 'Course Syllabus' });

        expect(response.status).toBe(400);
        expect(delegates.getActiveCourse).not.toHaveBeenCalled();
    });
});

describe('DELETE /api/courses/:courseId/documents/all', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        guardState.deny = false;
    });

    it('clears week and syllabus documents and reports a per-document breakdown', async () => {
        const stored = {
            ...course,
            topicOrWeekInstances: [{ id: 'w1', items: [{ id: 'i1', additionalMaterials: [{ id: 'm1', name: 'Notes', qdrantChunkIds: ['c1', 'c2'] }] }] }],
            syllabusMaterials: [{ id: 's1', name: 'Outline', qdrantChunkIds: ['s-c1'] }]
        };
        const delegates = mockMongo({
            getActiveCourse: jest.fn().mockResolvedValue(stored),
            updateActiveCourse: jest.fn().mockResolvedValue({ acknowledged: true })
        });
        (RAGApp.getInstance as jest.Mock).mockResolvedValue({
            deleteAllDocumentsForCourse: jest.fn().mockResolvedValue({ deletedCount: 3, errors: [] })
        });

        const response = await request(buildApp('p-faculty')).delete('/api/courses/course-1/documents/all');

        expect(response.status).toBe(200);
        expect(response.body.data).toMatchObject({
            deletedCount: 2,
            deletedDocuments: [
                { name: 'Notes', chunksDeleted: 2 },
                { name: 'Outline', chunksDeleted: 1 }
            ],
            totalChunksDeleted: 3
        });
        const saved = delegates.updateActiveCourse.mock.calls[0][1];
        expect(saved.syllabusMaterials).toEqual([]);
        expect(saved.topicOrWeekInstances[0].items[0].additionalMaterials).toEqual([]);
    });
});
