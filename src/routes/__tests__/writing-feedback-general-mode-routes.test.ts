/**
 * Writing Feedback routes under the analysis-mode switch, over HTTP
 *
 * Course RBAC and the capability gate pass through here (they are tested where they live), so
 * these pin what the mode owns: general analysis has no assignment types and needs no SFL
 * profile, and SFL analysis still requires both.
 *
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @description: HTTP coverage for the assignment-type refusal and rubric approval in each mode.
 */

import express from 'express';
import request from 'supertest';

const mongo = {
    getWritingAssignment: jest.fn(),
    approveWritingRubricDraft: jest.fn()
};

jest.mock('../../db/enge-ai-mongodb', () => ({
    EngEAI_MongoDB: { getInstance: jest.fn(async () => mongo) }
}));
jest.mock('../../middleware/require-course-role', () => ({
    requireInstructorForCourseAPI: () => (_req: unknown, _res: unknown, next: () => void) => next(),
    requireCourseFeatureAPI: () => (_req: unknown, _res: unknown, next: () => void) => next()
}));
jest.mock('../../middleware/async-handler', () => {
    const wrap = (fn: (...args: unknown[]) => Promise<unknown>) =>
        (req: unknown, res: unknown, next: (error?: unknown) => void) => Promise.resolve(fn(req, res, next)).catch(next);
    return { asyncHandler: wrap, asyncHandlerWithAuth: wrap };
});

// Imported after the mocks so the router binds to them.
import router from '../route-writing-feedback';
import { ASSIGNMENT_TYPES_INACTIVE_MESSAGE, CHOOSE_TYPE_BEFORE_APPROVAL_MESSAGE } from '../../writing-feedback/rubric/assignment-type';
import { buildDefaultSflContextProfile } from '../../writing-feedback/rubric/default-rubric-profile';
import { buildStaffedWritingRubric } from '../../writing-feedback/__tests__/helpers/staffed-rubric';

const ASSIGNMENT = '/api/courses/course-1/writing-feedback/assignments/assignment-1';
const originalMode = process.env.WRITING_FEEDBACK_ANALYSIS_MODE;

function app() {
    const server = express();
    server.use(express.json());
    server.use((req: any, _res, next) => {
        req.session = { globalUser: { userId: 'user-1' } };
        next();
    });
    server.use('/api/courses', router);
    return server;
}

/** A complete draft whose SFL profile is still the blank default, as a general-mode rubric has. */
function assignmentWithBlankProfile(overrides: Record<string, unknown> = {}) {
    return {
        id: 'assignment-1',
        courseId: 'course-1',
        rubric: { ...buildStaffedWritingRubric('user-1'), status: 'draft', sflContext: buildDefaultSflContextProfile() },
        ...overrides
    };
}

describe('writing feedback routes by analysis mode', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mongo.getWritingAssignment.mockResolvedValue(assignmentWithBlankProfile());
        mongo.approveWritingRubricDraft.mockResolvedValue({ id: 'assignment-1' });
    });

    afterAll(() => {
        if (originalMode === undefined) delete process.env.WRITING_FEEDBACK_ANALYSIS_MODE;
        else process.env.WRITING_FEEDBACK_ANALYSIS_MODE = originalMode;
    });

    describe('general', () => {
        beforeEach(() => {
            process.env.WRITING_FEEDBACK_ANALYSIS_MODE = 'general';
        });

        it('refuses the assignment-type answer before touching the assignment', async () => {
            const response = await request(app()).put(`${ASSIGNMENT}/type`).send({ type: 'lab_report' });

            expect(response.status).toBe(409);
            expect(response.body.error).toBe(ASSIGNMENT_TYPES_INACTIVE_MESSAGE);
            expect(mongo.getWritingAssignment).not.toHaveBeenCalled();
        });

        it('approves a rubric whose SFL profile is blank', async () => {
            const response = await request(app()).post(`${ASSIGNMENT}/rubric-draft/approve`).send({});

            expect(response.status).toBe(200);
            expect(mongo.approveWritingRubricDraft).toHaveBeenCalledTimes(1);
        });

        it('ignores a leftover pending assignment type at approval', async () => {
            mongo.getWritingAssignment.mockResolvedValue(assignmentWithBlankProfile({ assignmentTypePending: true }));

            const response = await request(app()).post(`${ASSIGNMENT}/rubric-draft/approve`).send({});

            expect(response.status).toBe(200);
        });
    });

    describe('sfl', () => {
        beforeEach(() => {
            process.env.WRITING_FEEDBACK_ANALYSIS_MODE = 'sfl';
        });

        it('lets the assignment-type answer through to its own validation', async () => {
            const response = await request(app()).put(`${ASSIGNMENT}/type`).send({ type: 'poem' });

            expect(response.status).toBe(400);
            expect(response.body.error).toBe('type must be writing or lab_report');
        });

        it('refuses to approve a rubric whose SFL profile is blank', async () => {
            const response = await request(app()).post(`${ASSIGNMENT}/rubric-draft/approve`).send({});

            expect(response.status).toBe(400);
            expect(mongo.approveWritingRubricDraft).not.toHaveBeenCalled();
        });

        it('refuses approval while the assignment type is pending', async () => {
            mongo.getWritingAssignment.mockResolvedValue(assignmentWithBlankProfile({ assignmentTypePending: true }));

            const response = await request(app()).post(`${ASSIGNMENT}/rubric-draft/approve`).send({});

            expect(response.status).toBe(409);
            expect(response.body.error).toBe(CHOOSE_TYPE_BEFORE_APPROVAL_MESSAGE);
        });
    });
});
