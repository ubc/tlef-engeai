import type { Request, Response, NextFunction } from 'express';
import {
    requireAdminForCourseAPI,
    requireInstructorForCourseAPI
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
});
