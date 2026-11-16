/**
 * Writing Feedback routes for the per-assignment analysis mode, over HTTP
 *
 * Course RBAC and the capability gate pass through here (they are tested where they live), so
 * these pin what the mode owns: the setting route, the retired assignment type, and a complete
 * "Describe the writing" profile required at approval in both modes.
 *
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @description: HTTP coverage for the approach setting, the assignment-type refusal, and approval in each mode.
 */

import express from 'express';
import request from 'supertest';

const mongo = {
    getWritingAssignment: jest.fn(),
    approveWritingRubricDraft: jest.fn(),
    setWritingAssignmentAnalysisMode: jest.fn()
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
import { ASSIGNMENT_TYPES_INACTIVE_MESSAGE } from '../../writing-feedback/rubric/assignment-type';
import { buildDefaultSflContextProfile } from '../../writing-feedback/rubric/default-rubric-profile';
import { buildStaffedWritingRubric } from '../../writing-feedback/__tests__/helpers/staffed-rubric';

const ASSIGNMENT = '/api/courses/course-1/writing-feedback/assignments/assignment-1';

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

/** A complete draft whose "Describe the writing" profile is still the blank default. */
function assignmentWithBlankProfile(overrides: Record<string, unknown> = {}) {
    return {
        id: 'assignment-1',
        courseId: 'course-1',
        rubric: { ...buildStaffedWritingRubric('user-1'), status: 'draft', sflContext: buildDefaultSflContextProfile() },
        ...overrides
    };
}

/** The same draft with its writing described, as staff leave it before approving. */
function describedAssignment(overrides: Record<string, unknown> = {}) {
    return {
        id: 'assignment-1',
        courseId: 'course-1',
        rubric: { ...buildStaffedWritingRubric('user-1'), status: 'draft' },
        ...overrides
    };
}

describe('writing feedback routes by analysis mode', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mongo.getWritingAssignment.mockResolvedValue(assignmentWithBlankProfile());
        mongo.approveWritingRubricDraft.mockResolvedValue({ id: 'assignment-1' });
        mongo.setWritingAssignmentAnalysisMode.mockResolvedValue({ id: 'assignment-1', analysisMode: 'sfl' });
    });

    it('refuses the retired assignment-type answer before touching the assignment', async () => {
        const response = await request(app()).put(`${ASSIGNMENT}/type`).send({ type: 'lab_report' });

        expect(response.status).toBe(409);
        expect(response.body.error).toBe(ASSIGNMENT_TYPES_INACTIVE_MESSAGE);
        expect(mongo.getWritingAssignment).not.toHaveBeenCalled();
    });

    describe.each(['general', 'sfl'] as const)('approval in %s mode', (analysisMode) => {
        it('refuses a rubric whose writing description is blank', async () => {
            mongo.getWritingAssignment.mockResolvedValue(assignmentWithBlankProfile({ analysisMode }));

            const response = await request(app()).post(`${ASSIGNMENT}/rubric-draft/approve`).send({});

            expect(response.status).toBe(400);
            expect(response.body.error).toBe('Complete "Describe the writing" before approving the writing rubric');
            expect(mongo.approveWritingRubricDraft).not.toHaveBeenCalled();
        });

        it('approves a rubric once the writing is described, ignoring a leftover pending type', async () => {
            mongo.getWritingAssignment.mockResolvedValue(describedAssignment({ analysisMode, assignmentTypePending: true }));

            const response = await request(app()).post(`${ASSIGNMENT}/rubric-draft/approve`).send({});

            expect(response.status).toBe(200);
            expect(mongo.approveWritingRubricDraft).toHaveBeenCalledTimes(1);
        });
    });

    describe('the feedback approach setting', () => {
        it('saves the approach staff chose', async () => {
            const response = await request(app()).put(`${ASSIGNMENT}/analysis-mode`).send({ analysisMode: 'sfl' });

            expect(response.status).toBe(200);
            expect(mongo.setWritingAssignmentAnalysisMode).toHaveBeenCalledWith('course-1', 'assignment-1', 'sfl');
            expect(response.body.data.analysisMode).toBe('sfl');
        });

        it('refuses anything but general or sfl', async () => {
            const response = await request(app()).put(`${ASSIGNMENT}/analysis-mode`).send({ analysisMode: 'lab_report' });

            expect(response.status).toBe(400);
            expect(mongo.setWritingAssignmentAnalysisMode).not.toHaveBeenCalled();
        });

        it('answers 404 for an assignment that is not there', async () => {
            mongo.setWritingAssignmentAnalysisMode.mockResolvedValue(null);

            const response = await request(app()).put(`${ASSIGNMENT}/analysis-mode`).send({ analysisMode: 'general' });

            expect(response.status).toBe(404);
        });
    });
});
