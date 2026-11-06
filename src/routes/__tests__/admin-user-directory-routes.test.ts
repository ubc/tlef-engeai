/**
 * Admin user directory API
 *
 * @description `GET /api/admin/user-directory` behind the real `requireAdminGlobal` gate: admins get
 * a page of shaped rows with course names and no-store caching; non-admins and anonymous callers
 * are refused before any database call; bad query parameters are rejected with 400.
 */

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

jest.mock('../../utils/logger', () => ({
    appLogger: { log: jest.fn(), error: jest.fn(), warn: jest.fn() }
}));

import { EngEAI_MongoDB } from '../../db/enge-ai-mongodb';
import { appLogger } from '../../utils/logger';
import adminUserDirectoryRoutes from '../mongo/admin-user-directory-routes';

const PUID = 'SYNTHETICPUID0001';

function appAs(globalUser: Record<string, unknown> | null) {
    const app = express();
    app.use((req, _res, next) => {
        (req as any).session = globalUser ? { globalUser } : {};
        next();
    });
    app.use('/api/admin/user-directory', adminUserDirectoryRoutes);
    return app;
}

const admin = { userId: 'admin-1', name: 'Admin User', isAdmin: true, affiliation: 'faculty' };

describe('GET /api/admin/user-directory', () => {
    const listGlobalUsersForDirectory = jest.fn();
    const getAllActiveCourses = jest.fn();
    const findLmsConnectedUserIds = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
        (EngEAI_MongoDB.getInstance as jest.Mock).mockResolvedValue({ listGlobalUsersForDirectory, getAllActiveCourses, findLmsConnectedUserIds });
        listGlobalUsersForDirectory.mockResolvedValue({
            users: [{
                userId: 'user-1', name: 'Synthetic Student', puid: PUID, affiliation: 'student', status: 'active',
                coursesEnrolled: ['course-1', 'course-gone'], createdAt: new Date('2026-09-01T10:00:00Z'),
                updatedAt: new Date('2026-10-01T10:00:00Z'), testStudentOwnerUserId: 'should-not-leak'
            }],
            total: 1
        });
        getAllActiveCourses.mockResolvedValue([{ id: 'course-1', courseName: 'CHBE 241', instructors: [], teachingAssistants: [{ userId: 'user-1', name: 'Synthetic Student' }] }]);
        findLmsConnectedUserIds.mockResolvedValue({ canvas: new Set(['user-1']), moodle: new Set() });
    });

    it('returns shaped rows with course roles and LMS presence, the query passed through, and no caching', async () => {
        const res = await request(appAs(admin)).get(`/api/admin/user-directory?q=${PUID}&affiliation=student&page=2&pageSize=10`);

        expect(res.status).toBe(200);
        expect(res.headers['cache-control']).toBe('no-store');
        expect(listGlobalUsersForDirectory).toHaveBeenCalledWith({ search: PUID, affiliation: 'student', page: 2, pageSize: 10 });
        expect(res.body.data).toMatchObject({ page: 2, pageSize: 10, total: 1 });
        const [row] = res.body.data.items;
        expect(row).toMatchObject({
            userId: 'user-1', puid: PUID, isAdmin: false, createdAt: '2026-09-01T10:00:00.000Z',
            courses: [{ id: 'course-1', courseName: 'CHBE 241', role: 'ta' }, { id: 'course-gone', courseName: null, role: null }],
            lmsConnections: { canvas: true, moodle: false }
        });
        // Token presence is checked for this page's users only.
        expect(findLmsConnectedUserIds).toHaveBeenCalledWith(['user-1']);
        expect(row).not.toHaveProperty('testStudentOwnerUserId');
        // The search text can be a PUID, so nothing about the request is logged.
        expect(JSON.stringify((appLogger.log as jest.Mock).mock.calls)).not.toContain(PUID);
    });

    it('refuses non-admins and anonymous callers before touching the database', async () => {
        const forbidden = await request(appAs({ userId: 'faculty-1', name: 'Faculty', affiliation: 'faculty' })).get('/api/admin/user-directory');
        const anonymous = await request(appAs(null)).get('/api/admin/user-directory');

        expect(forbidden.status).toBe(403);
        expect(anonymous.status).toBe(401);
        expect(EngEAI_MongoDB.getInstance).not.toHaveBeenCalled();
    });

    it('rejects invalid query parameters with 400', async () => {
        for (const query of ['page=0', 'pageSize=abc', 'affiliation=alumni', `q=${'x'.repeat(201)}`]) {
            const res = await request(appAs(admin)).get(`/api/admin/user-directory?${query}`);
            expect(res.status).toBe(400);
        }
        expect(listGlobalUsersForDirectory).not.toHaveBeenCalled();
    });
});
