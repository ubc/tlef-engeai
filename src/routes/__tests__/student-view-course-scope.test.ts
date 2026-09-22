/**
 * student-view-course-scope.test.ts
 *
 * A test student has `affiliation: 'student'`, and `joinsCourseAsStudent` lets a student
 * join any course by id or code. Found in the 2026-09-21 browser pass: without a guard, a
 * staff member previewing their own course held a student identity that could enter courses
 * they are not staff of — something they cannot do as themselves. The test student belongs
 * to exactly one course, and these pin that.
 */

import express from 'express';
import request from 'supertest';

const courses: Record<string, { id: string; courseName: string; courseCode?: string }> = {
    'course-1': { id: 'course-1', courseName: 'Owned', courseCode: 'AAAAAA' },
    'course-2': { id: 'course-2', courseName: 'Other', courseCode: 'BBBBBB' }
};

jest.mock('../../db/enge-ai-mongodb', () => ({
    EngEAI_MongoDB: {
        getInstance: async () => ({
            getActiveCourse: async (id: string) => courses[id] ?? null,
            getActiveCourseByCode: async (code: string) =>
                Object.values(courses).find((c) => c.courseCode === code) ?? null,
            findStudentByUserId: async () => null,
            createStudent: async () => ({}),
            initializeMemoryAgentForUser: async () => undefined,
            addCourseToGlobalUser: async () => undefined,
            findGlobalUserByPUID: async () => null
        })
    }
}));

jest.mock('../../jobs/scheduled-publish-runner', () => ({
    runDueScheduledPublishTasksThrottled: async () => undefined
}));

import courseEntryRoutes from '../route-course-entry';

/** An app authenticated as a test student that belongs to `course-1`. */
function appAsTestStudent() {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
        (req as unknown as Record<string, unknown>).user = {
            puid: 'test-student:course-1:owner-9'
        };
        (req as unknown as Record<string, unknown>).session = {
            globalUser: {
                userId: 'ts-user-1',
                puid: 'test-student:course-1:owner-9',
                name: 'Test student',
                affiliation: 'student',
                coursesEnrolled: ['course-1'],
                isTestStudent: true,
                testStudentOwnerUserId: 'owner-9'
            }
        };
        (req as unknown as Record<string, unknown>).isAuthenticated = () => true;
        next();
    });
    app.use('/api/course', courseEntryRoutes);
    return app;
}

describe('a test student is confined to its own course', () => {
    it('is refused another course by id', async () => {
        const res = await request(appAsTestStudent())
            .post('/api/course/enter')
            .send({ courseId: 'course-2' });

        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/Student View is limited to the course/);
    });

    it('is refused another course by code', async () => {
        const res = await request(appAsTestStudent())
            .post('/api/course/enter-by-code')
            .send({ courseCode: 'BBBBBB' });

        expect(res.status).toBe(403);
    });

    it('is not refused its own course', async () => {
        const res = await request(appAsTestStudent())
            .post('/api/course/enter')
            .send({ courseId: 'course-1' });

        expect(res.status).not.toBe(403);
    });
});
