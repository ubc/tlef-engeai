/**
 * student-view.test.ts
 *
 * Pins the identity swap Student View depends on: the request carries the test student
 * everywhere except the three control endpoints, the real staff member is always
 * recoverable, and a session pointing at a test student that no longer exists heals itself.
 */

import type { NextFunction, Request, Response } from 'express';

const testStudent = {
    userId: 'ts-user-1',
    puid: 'test-student:course-1:owner-9',
    name: 'Test student',
    affiliation: 'student',
    isTestStudent: true
};

const staffGlobalUser = { userId: 'owner-9', puid: 'REAL_STAFF_PUID', affiliation: 'faculty' };

jest.mock('../../db/enge-ai-mongodb', () => ({
    EngEAI_MongoDB: {
        getInstance: async () => ({
            findGlobalUserByUserId: async (userId: string) =>
                userId === 'ts-user-1' ? testStudent : null,
            findGlobalUserByPUID: async (puid: string) =>
                puid === 'REAL_STAFF_PUID' ? staffGlobalUser : null
        })
    }
}));

import { isStudentViewControlPath, studentViewImpersonation } from '../student-view';

type TestRequest = Request & {
    studentViewActor?: { puid?: string; userId?: string };
};

function makeRequest(session: Record<string, unknown>, path = '/api/chat/send'): TestRequest {
    return {
        path,
        session,
        user: { puid: 'REAL_STAFF_PUID', affiliation: 'faculty' }
    } as unknown as TestRequest;
}

async function run(req: TestRequest): Promise<NextFunction> {
    const next = jest.fn() as unknown as NextFunction;
    await studentViewImpersonation(req, {} as Response, next);
    return next;
}

describe('studentViewImpersonation', () => {
    it('leaves the request alone when student view is not active', async () => {
        const req = makeRequest({ globalUser: { userId: 'owner-9' } });

        const next = await run(req);

        expect((req as unknown as { user: { puid: string } }).user.puid).toBe('REAL_STAFF_PUID');
        expect(next).toHaveBeenCalled();
    });

    it('replaces req.user and the session globalUser with the test student', async () => {
        const session: Record<string, unknown> = {
            globalUser: { userId: 'owner-9' },
            studentView: { courseId: 'course-1', testStudentUserId: 'ts-user-1' }
        };
        const req = makeRequest(session);

        await run(req);

        const user = (req as unknown as { user: { puid: string; affiliation: string } }).user;
        expect(user.puid).toBe('test-student:course-1:owner-9');
        expect(user.affiliation).toBe('student');
        expect((session.globalUser as { userId: string }).userId).toBe('ts-user-1');
    });

    it('remembers the real staff member for the request', async () => {
        const req = makeRequest({
            globalUser: { userId: 'owner-9' },
            studentView: { courseId: 'course-1', testStudentUserId: 'ts-user-1' }
        });

        await run(req);

        expect(req.studentViewActor).toEqual({ puid: 'REAL_STAFF_PUID', userId: 'owner-9' });
    });

    it('does not impersonate on the control endpoints, so their guard sees the staff member', async () => {
        const req = makeRequest(
            {
                globalUser: { userId: 'owner-9' },
                studentView: { courseId: 'course-1', testStudentUserId: 'ts-user-1' }
            },
            '/api/course/course-1/student-view/exit'
        );

        await run(req);

        expect((req as unknown as { user: { puid: string } }).user.puid).toBe('REAL_STAFF_PUID');
    });

    it('clears a stale session when the test student no longer exists', async () => {
        const session: Record<string, unknown> = {
            globalUser: { userId: 'owner-9' },
            studentView: { courseId: 'course-1', testStudentUserId: 'gone' }
        };
        const req = makeRequest(session);

        await run(req);

        expect(session.studentView).toBeUndefined();
        expect((req as unknown as { user: { puid: string } }).user.puid).toBe('REAL_STAFF_PUID');
    });

    it('restores the staff globalUser when a session is left holding a test student', async () => {
        const session: Record<string, unknown> = { globalUser: testStudent };
        const req = makeRequest(session);

        await run(req);

        expect((session.globalUser as { userId: string }).userId).toBe('owner-9');
    });
});

describe('isStudentViewControlPath', () => {
    it('recognises the three control endpoints', () => {
        expect(isStudentViewControlPath('/api/course/c1/student-view/enter')).toBe(true);
        expect(isStudentViewControlPath('/api/course/c1/student-view/exit')).toBe(true);
        expect(isStudentViewControlPath('/api/course/c1/student-view/reset')).toBe(true);
    });

    it('does not match the ordinary course endpoints', () => {
        expect(isStudentViewControlPath('/api/course/c1/enter')).toBe(false);
        expect(isStudentViewControlPath('/api/chat/send')).toBe(false);
    });
});
