/**
 * student-view-route-contract.test.ts
 *
 * Pins who may drive Student View. The guard is the product decision under test, so it runs
 * for real: faculty instructors of the course, its teaching assistants and platform admins
 * pass; students and faculty from outside the course are refused.
 */

import express from 'express';
import request from 'supertest';

const course = {
    id: 'course-1',
    courseName: 'DemoCourse',
    instructors: [{ userId: 'prof-1' }],
    teachingAssistants: [{ userId: 'ta-1' }, { userId: 'ta-2' }]
};

const globalUsers: Record<string, Record<string, unknown>> = {
    PROF: { userId: 'prof-1', puid: 'PROF', affiliation: 'faculty', name: 'Prof' },
    TA: { userId: 'ta-1', puid: 'TA', affiliation: 'faculty', name: 'Teaching Assistant' },
    OUTSIDE_FACULTY: { userId: 'prof-2', puid: 'OUTSIDE_FACULTY', affiliation: 'faculty', name: 'Other Prof' },
    STUDENT_AFFILIATED_TA: { userId: 'ta-2', puid: 'STUDENT_AFFILIATED_TA', affiliation: 'student', name: 'Grad TA' },
    STUDENT: { userId: 'stu-1', puid: 'STUDENT', affiliation: 'student', name: 'Student' },
    ADMIN: { userId: 'admin-1', puid: 'ADMIN', affiliation: 'staff', name: 'Admin', isAdmin: true }
};

const ensureTestStudent = jest.fn(async () => ({
    userId: 'ts-user-1',
    courseId: 'course-1',
    ownerUserId: 'prof-1'
}));
const findTestStudent = jest.fn(async () => ({
    userId: 'ts-user-1',
    courseId: 'course-1',
    ownerUserId: 'prof-1'
}));
const purgeTestStudent = jest.fn(async () => undefined);

jest.mock('../../db/enge-ai-mongodb', () => ({
    EngEAI_MongoDB: {
        getInstance: async () => ({
            getActiveCourse: async () => course,
            findGlobalUserByPUID: async (puid: string) => globalUsers[puid] ?? null,
            ensureTestStudent: (...args: unknown[]) => (ensureTestStudent as any)(...args),
            findTestStudent: (...args: unknown[]) => (findTestStudent as any)(...args),
            purgeTestStudent: (...args: unknown[]) => (purgeTestStudent as any)(...args)
        })
    }
}));

jest.mock('../../jobs/scheduled-publish-runner', () => ({
    runDueScheduledPublishTasksThrottled: async () => undefined
}));

import studentViewRoutes from '../route-student-view';

/** An app whose every request is already authenticated as one known person. */
function appAs(puid: string) {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
        (req as unknown as Record<string, unknown>).user = { puid };
        (req as unknown as Record<string, unknown>).session = {};
        (req as unknown as Record<string, unknown>).isAuthenticated = () => true;
        next();
    });
    app.use('/api/course', studentViewRoutes);
    return app;
}

describe('student view route contract', () => {
    it('lets a faculty instructor of the course enter', async () => {
        const res = await request(appAs('PROF')).post('/api/course/course-1/student-view/enter');

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ success: true, redirectTo: '/course/course-1/student' });
    });

    it('lets a platform admin enter', async () => {
        const res = await request(appAs('ADMIN')).post('/api/course/course-1/student-view/enter');

        expect(res.status).toBe(200);
    });

    it('lets a teaching assistant enter with a test student of their own', async () => {
        const res = await request(appAs('TA')).post('/api/course/course-1/student-view/enter');

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ success: true, redirectTo: '/course/course-1/student' });
        expect(ensureTestStudent).toHaveBeenCalledWith(course, 'ta-1');
    });

    it('lets a teaching assistant with a student affiliation enter', async () => {
        const res = await request(appAs('STUDENT_AFFILIATED_TA')).post('/api/course/course-1/student-view/enter');

        expect(res.status).toBe(200);
        expect(ensureTestStudent).toHaveBeenCalledWith(course, 'ta-2');
    });

    it('refuses faculty who are not on this course', async () => {
        const res = await request(appAs('OUTSIDE_FACULTY')).post('/api/course/course-1/student-view/enter');

        expect(res.status).toBe(403);
    });

    it('refuses a student', async () => {
        const res = await request(appAs('STUDENT')).post('/api/course/course-1/student-view/enter');

        expect(res.status).toBe(403);
        expect(ensureTestStudent).not.toHaveBeenCalled();
    });

    it('exit returns the instructor dashboard', async () => {
        const res = await request(appAs('PROF')).post('/api/course/course-1/student-view/exit');

        expect(res.status).toBe(200);
        expect(res.body.redirectTo).toBe('/course/course-1/instructor/dashboard');
    });

    it('lets a teaching assistant exit back to the instructor dashboard', async () => {
        const res = await request(appAs('TA')).post('/api/course/course-1/student-view/exit');

        expect(res.status).toBe(200);
        expect(res.body.redirectTo).toBe('/course/course-1/instructor/dashboard');
    });

    it('resets only the teaching assistant\'s own test student', async () => {
        const res = await request(appAs('TA')).post('/api/course/course-1/student-view/reset');

        expect(res.status).toBe(200);
        expect(findTestStudent).toHaveBeenCalledWith('course-1', 'ta-1');
    });

    it('reset purges the existing test student before recreating it', async () => {
        const res = await request(appAs('PROF')).post('/api/course/course-1/student-view/reset');

        expect(res.status).toBe(200);
        expect(purgeTestStudent).toHaveBeenCalledWith(course, 'ts-user-1');
        expect(ensureTestStudent).toHaveBeenCalled();
        expect(res.body.testStudentUserId).toBe('ts-user-1');
    });

    it('refuses a student a reset', async () => {
        const res = await request(appAs('STUDENT')).post('/api/course/course-1/student-view/reset');

        expect(res.status).toBe(403);
        expect(purgeTestStudent).not.toHaveBeenCalled();
    });
});
