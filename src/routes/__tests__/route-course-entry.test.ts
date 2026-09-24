/**
 * route-course-entry — enter-by-code faculty auto-enrollment
 */

import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import type { GlobalUser, activeCourse } from '../../types/shared';

jest.mock('../../middleware/async-handler', () => ({
    asyncHandler: (handler: (req: Request, res: Response, next: NextFunction) => unknown) =>
        (req: Request, res: Response, next: NextFunction) =>
            Promise.resolve(handler(req, res, next)).catch(next),
    asyncHandlerWithAuth: (handler: (req: Request, res: Response, next: NextFunction) => unknown) =>
        (req: Request, res: Response, next: NextFunction) =>
            Promise.resolve(handler(req, res, next)).catch(next)
}));

jest.mock('../../helpers/session-global-user', () => ({
    refreshSessionGlobalUser: jest.fn(async (req: Request) => (req.session as { globalUser?: GlobalUser }).globalUser ?? null)
}));

jest.mock('../../utils/logger', () => ({
    appLogger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));

jest.mock('../../db/enge-ai-mongodb', () => ({
    EngEAI_MongoDB: { getInstance: jest.fn() }
}));

import { EngEAI_MongoDB } from '../../db/enge-ai-mongodb';
import courseEntryRoutes from '../route-course-entry';

const COURSE_ID = 'abc123def456';
const COURSE_CODE = 'ABC123';

function makeCourse(overrides: Partial<activeCourse> = {}): activeCourse {
    return {
        id: COURSE_ID,
        date: new Date('2026-01-01T00:00:00.000Z'),
        courseSetup: true,
        courseName: 'APSC 183',
        courseCode: COURSE_CODE,
        instructors: [{ userId: 'fac-1', name: 'Lead Instructor' }],
        teachingAssistants: [],
        frameType: 'byWeek',
        tilesNumber: 12,
        topicOrWeekInstances: [],
        ...overrides
    } as activeCourse;
}

function makeGlobalUser(overrides: Partial<GlobalUser> = {}): GlobalUser {
    return {
        name: 'Test User',
        puid: 'puid-test',
        userId: 'user-test',
        coursesEnrolled: [],
        affiliation: 'faculty',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides
    };
}

function buildApp(globalUser: GlobalUser) {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
        (req as any).session = { globalUser };
        next();
    });
    app.use('/api/course', courseEntryRoutes);
    return app;
}

function mockMongo(delegates: Record<string, unknown> = {}) {
    const course = makeCourse();
    const instance = {
        getActiveCourseByCode: jest.fn().mockResolvedValue(course),
        enrollFacultyInstructorViaCourseCode: jest.fn().mockImplementation(async (_course: activeCourse, user: GlobalUser) =>
            makeCourse({
                instructors: [
                    { userId: 'fac-1', name: 'Lead Instructor' },
                    { userId: user.userId, name: user.name }
                ]
            })
        ),
        findStudentByUserId: jest.fn().mockResolvedValue({
            userId: 'user-test',
            userOnboarding: true,
            affiliation: 'faculty'
        }),
        addCourseToGlobalUser: jest.fn(),
        createStudent: jest.fn(),
        initializeMemoryAgentForUser: jest.fn(),
        ...delegates
    };
    (EngEAI_MongoDB.getInstance as jest.Mock).mockResolvedValue(instance);
    return instance;
}

describe('POST /api/course/enter-by-code', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('auto-enrolls faculty who are not yet on the course roster', async () => {
        const globalUser = makeGlobalUser({ userId: 'fac-2', affiliation: 'faculty' });
        const mongo = mockMongo({});
        const app = buildApp(globalUser);

        const response = await request(app)
            .post('/api/course/enter-by-code')
            .send({ courseCode: COURSE_CODE });

        expect(response.status).toBe(200);
        expect(mongo.enrollFacultyInstructorViaCourseCode).toHaveBeenCalledTimes(1);
        expect(response.body.redirect).toContain(`/course/${COURSE_ID}/instructor/`);
    });

    it('does not call faculty enrollment when the instructor is already listed', async () => {
        const globalUser = makeGlobalUser({ userId: 'fac-1', affiliation: 'faculty' });
        const mongo = mockMongo({});
        const app = buildApp(globalUser);

        const response = await request(app)
            .post('/api/course/enter-by-code')
            .send({ courseCode: COURSE_CODE });

        expect(response.status).toBe(200);
        expect(mongo.enrollFacultyInstructorViaCourseCode).not.toHaveBeenCalled();
        expect(response.body.redirect).toContain(`/course/${COURSE_ID}/instructor/`);
    });

    it('lets staff join by course code as student without faculty enrollment', async () => {
        const globalUser = makeGlobalUser({ userId: 'staff-1', affiliation: 'staff' });
        const createStudent = jest.fn().mockResolvedValue({
            userId: 'staff-1',
            userOnboarding: false,
            affiliation: 'student'
        });
        const mongo = mockMongo({
            findStudentByUserId: jest.fn().mockResolvedValue(null),
            createStudent
        });
        const app = buildApp(globalUser);

        const response = await request(app)
            .post('/api/course/enter-by-code')
            .send({ courseCode: COURSE_CODE });

        expect(response.status).toBe(200);
        expect(mongo.enrollFacultyInstructorViaCourseCode).not.toHaveBeenCalled();
        expect(createStudent).toHaveBeenCalledWith(
            'APSC 183',
            expect.objectContaining({ affiliation: 'student' })
        );
        expect(response.body.redirect).toBe(`/course/${COURSE_ID}/student/onboarding/student`);
    });

    it('still lets students join by course code without faculty enrollment', async () => {
        const globalUser = makeGlobalUser({ userId: 'stu-1', affiliation: 'student' });
        const mongo = mockMongo({
            findStudentByUserId: jest.fn().mockResolvedValue(null),
            createStudent: jest.fn().mockResolvedValue({
                userId: 'stu-1',
                userOnboarding: false,
                affiliation: 'student'
            })
        });
        const app = buildApp(globalUser);

        const response = await request(app)
            .post('/api/course/enter-by-code')
            .send({ courseCode: COURSE_CODE });

        expect(response.status).toBe(200);
        expect(mongo.enrollFacultyInstructorViaCourseCode).not.toHaveBeenCalled();
        expect(response.body.redirect).toBe(`/course/${COURSE_ID}/student/onboarding/student`);
    });
});
