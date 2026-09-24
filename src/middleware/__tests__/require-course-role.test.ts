import type { Request, Response, NextFunction } from 'express';
import {
    requireAdminForCourseAPI,
    requireInstructorForCourseAPI,
    requireInstructorOrAdminForCourseAPI,
    requireSelfOrInstructorForCourseAPI
} from '../require-course-role';

jest.mock('../../db/enge-ai-mongodb', () => ({
    EngEAI_MongoDB: {
        getInstance: jest.fn()
    }
}));

jest.mock('../../utils/logger', () => ({
    appLogger: {
        log: jest.fn(),
        error: jest.fn(),
        warn: jest.fn()
    }
}));

import { EngEAI_MongoDB } from '../../db/enge-ai-mongodb';

function mockReqResNext(overrides: Partial<Request> = {}) {
    const req = {
        user: { puid: 'puid-1' },
        params: { courseId: 'course-1' },
        ...overrides
    } as unknown as Request;
    const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
    } as unknown as Response;
    const next = jest.fn() as NextFunction;
    return { req, res, next };
}

describe('require-course-role admin', () => {
    const facultyInstructor = {
        userId: 'user-inst',
        affiliation: 'faculty' as const,
        isAdmin: false
    };
    const platformAdmin = {
        userId: 'user-admin',
        affiliation: 'faculty' as const,
        isAdmin: true
    };
    const course = {
        id: 'course-1',
        instructors: [{ userId: 'user-inst', name: 'Inst' }]
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('requireInstructorForCourseAPI', () => {
        it('allows platform admin not on course instructors list', async () => {
            (EngEAI_MongoDB.getInstance as jest.Mock).mockResolvedValue({
                findGlobalUserByPUID: jest.fn().mockResolvedValue(platformAdmin),
                getActiveCourse: jest.fn().mockResolvedValue(course)
            });

            const { req, res, next } = mockReqResNext();
            await requireInstructorForCourseAPI(['params'])(req, res, next);

            expect(next).toHaveBeenCalled();
            expect(res.status).not.toHaveBeenCalled();
        });

        it('denies non-admin faculty not on instructors list', async () => {
            (EngEAI_MongoDB.getInstance as jest.Mock).mockResolvedValue({
                findGlobalUserByPUID: jest.fn().mockResolvedValue({
                    ...facultyInstructor,
                    userId: 'other-user'
                }),
                getActiveCourse: jest.fn().mockResolvedValue(course)
            });

            const { req, res, next } = mockReqResNext();
            await requireInstructorForCourseAPI(['params'])(req, res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(403);
        });
    });

    describe('requireAdminForCourseAPI', () => {
        it('allows platform admin', async () => {
            (EngEAI_MongoDB.getInstance as jest.Mock).mockResolvedValue({
                findGlobalUserByPUID: jest.fn().mockResolvedValue(platformAdmin),
                getActiveCourse: jest.fn().mockResolvedValue(course)
            });

            const { req, res, next } = mockReqResNext();
            await requireAdminForCourseAPI(['params'])(req, res, next);

            expect(next).toHaveBeenCalled();
        });

        it('returns 403 for instructor who is not admin', async () => {
            (EngEAI_MongoDB.getInstance as jest.Mock).mockResolvedValue({
                findGlobalUserByPUID: jest.fn().mockResolvedValue(facultyInstructor),
                getActiveCourse: jest.fn().mockResolvedValue(course)
            });

            const { req, res, next } = mockReqResNext();
            await requireAdminForCourseAPI(['params'])(req, res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith({ error: 'Admin access required' });
        });
    });

    describe('requireInstructorOrAdminForCourseAPI', () => {
        it('allows a listed faculty instructor', async () => {
            (EngEAI_MongoDB.getInstance as jest.Mock).mockResolvedValue({
                findGlobalUserByPUID: jest.fn().mockResolvedValue(facultyInstructor),
                getActiveCourse: jest.fn().mockResolvedValue(course)
            });

            const { req, res, next } = mockReqResNext();
            await requireInstructorOrAdminForCourseAPI(['params'])(req, res, next);

            expect(next).toHaveBeenCalled();
        });

        it('allows a platform administrator who is not listed on the course', async () => {
            (EngEAI_MongoDB.getInstance as jest.Mock).mockResolvedValue({
                findGlobalUserByPUID: jest.fn().mockResolvedValue(platformAdmin),
                getActiveCourse: jest.fn().mockResolvedValue(course)
            });

            const { req, res, next } = mockReqResNext();
            await requireInstructorOrAdminForCourseAPI(['params'])(req, res, next);

            expect(next).toHaveBeenCalled();
        });

        it('denies a teaching assistant', async () => {
            (EngEAI_MongoDB.getInstance as jest.Mock).mockResolvedValue({
                findGlobalUserByPUID: jest.fn().mockResolvedValue({
                    userId: 'user-ta',
                    affiliation: 'student',
                    isAdmin: false
                }),
                getActiveCourse: jest.fn().mockResolvedValue({
                    ...course,
                    teachingAssistants: [{ userId: 'user-ta', name: 'TA' }]
                })
            });

            const { req, res, next } = mockReqResNext();
            await requireInstructorOrAdminForCourseAPI(['params'])(req, res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith({
                error: 'Instructor or administrator access required'
            });
        });
    });
});

describe('require-course-role self-or-instructor', () => {
    const course = {
        id: 'course-1',
        instructors: [{ userId: 'user-inst', name: 'Inst' }],
        teachingAssistants: [{ userId: 'user-ta', name: 'TA' }]
    };

    /** Wires the middleware's two Mongo lookups for one authenticated caller. */
    function mockCaller(globalUser: Record<string, unknown>) {
        (EngEAI_MongoDB.getInstance as jest.Mock).mockResolvedValue({
            findGlobalUserByPUID: jest.fn().mockResolvedValue(globalUser),
            getActiveCourse: jest.fn().mockResolvedValue(course)
        });
    }

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('allows a student to read their own record', async () => {
        mockCaller({ userId: 'user-student', affiliation: 'student', isAdmin: false });

        const { req, res, next } = mockReqResNext({
            params: { courseId: 'course-1', userId: 'user-student' }
        });
        await requireSelfOrInstructorForCourseAPI('userId', ['params'])(req, res, next);

        expect(next).toHaveBeenCalled();
    });

    it('denies a student reading a different student record', async () => {
        mockCaller({ userId: 'user-student', affiliation: 'student', isAdmin: false });

        const { req, res, next } = mockReqResNext({
            params: { courseId: 'course-1', userId: 'user-other' }
        });
        await requireSelfOrInstructorForCourseAPI('userId', ['params'])(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
    });

    it('allows course staff to read any student record', async () => {
        mockCaller({ userId: 'user-ta', affiliation: 'student', isAdmin: false });

        const { req, res, next } = mockReqResNext({
            params: { courseId: 'course-1', userId: 'user-other' }
        });
        await requireSelfOrInstructorForCourseAPI('userId', ['params'])(req, res, next);

        expect(next).toHaveBeenCalled();
    });

    it('compares numeric and string user ids as the same identity', async () => {
        mockCaller({ userId: 12345, affiliation: 'student', isAdmin: false });

        const { req, res, next } = mockReqResNext({
            params: { courseId: 'course-1', userId: '12345' }
        });
        await requireSelfOrInstructorForCourseAPI('userId', ['params'])(req, res, next);

        expect(next).toHaveBeenCalled();
    });
});
