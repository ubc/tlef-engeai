/**
 * Writing Feedback production compatibility — assignments stored before rubrics from material
 *
 * Courses already use Writing Feedback, with Canvas-imported assignments and approved rubrics
 * stored before rubric versions recorded their own source (`gridSource`) and before cells and
 * criteria recorded who wrote them. These tests load an assignment shaped exactly like those
 * records and check that instructors can keep working as before: the page reads the grid as
 * Canvas's, saving and approving behave as they did, and filling the details leaves the grid
 * and its points alone.
 *
 * Course RBAC and the capability gate pass through here (they are tested where they live), and
 * the model call is replaced.
 *
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @description: Checks that pre-existing Writing Feedback records keep working unchanged.
 */

import express from 'express';
import request from 'supertest';
import type { WritingAssignment, WritingRubricDefinition } from '../../writing-feedback/contracts';

const mongo = {
    getWritingAssignment: jest.fn(),
    listWritingSourceMaterials: jest.fn(),
    saveWritingRubricDraft: jest.fn(),
    approveWritingRubricDraft: jest.fn(),
    discardWritingRubricDraft: jest.fn()
};
const proposeRubricFromInstructions = jest.fn();

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
jest.mock('../../writing-feedback/rubric/rubric-autofill', () => ({
    ...jest.requireActual('../../writing-feedback/rubric/rubric-autofill'),
    proposeRubricFromInstructions: (...args: unknown[]) => proposeRubricFromInstructions(...args)
}));

// Imported after the mocks so the router binds to them.
import router from '../route-writing-feedback';
import { buildDefaultWritingAssignment } from '../../writing-feedback/rubric/default-rubric-profile';
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

/**
 * An imported assignment as production stores it today: a Canvas rubric, approved as v1, with
 * no `gridSource` on the version and no `origin` or `descriptionOrigin` markers anywhere.
 */
function productionAssignment(): WritingAssignment {
    const approved: WritingRubricDefinition = {
        ...buildStaffedWritingRubric('user-1'),
        version: 1,
        status: 'approved',
        approvedAt: new Date('2026-09-01T00:00:00Z'),
        approvedBy: 'user-1'
    };
    const base = buildDefaultWritingAssignment('course-1', 'assignment-1', 'Descriptive report', 'Write a descriptive report.');
    return {
        ...base,
        rubricSource: 'canvas',
        rubric: approved,
        canvasAssignmentId: '88',
        canvasRubricImport: {
            shape: { criteria: approved.criteria, levels: approved.levels },
            ids: Object.fromEntries(approved.criteria.map((criterion) => [criterion.id, { criterionId: `_${criterion.id}`, ratingIds: {} }])),
            importedAt: new Date('2026-08-30T00:00:00Z')
        },
        canvasDetails: { descriptionText: 'Write a descriptive report.', importedAt: new Date('2026-08-30T00:00:00Z') },
        assignmentTypePending: false
    };
}

/** What the editor sends on save: the draft's content, as the page builds it from the form. */
function editorPayload(rubric: WritingRubricDefinition) {
    const { version: _version, status: _status, updatedAt: _updatedAt, updatedBy: _updatedBy, approvedAt: _approvedAt, approvedBy: _approvedBy, ...content } = rubric;
    return content;
}

describe('assignments stored before rubrics from material', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mongo.listWritingSourceMaterials.mockResolvedValue([]);
        mongo.saveWritingRubricDraft.mockImplementation(async (_course, _assignment, draft) => ({ id: 'assignment-1', rubricDraft: draft }));
        mongo.approveWritingRubricDraft.mockResolvedValue({ id: 'assignment-1' });
    });

    it('reads the approved grid as the Canvas rubric, with nothing waiting', async () => {
        mongo.getWritingAssignment.mockResolvedValue(productionAssignment());
        const response = await request(app()).get(`${ASSIGNMENT}/autofill-sources`);

        expect(response.status).toBe(200);
        expect(response.body.data.rubric).toMatchObject({ lens: 'linguistic', current: 'canvas', replaceNeedsConfirmation: true });
        expect(response.body.data.rubric.uploaded).toBeUndefined();
        expect(response.body.data.rubric.pending).toBeUndefined();
        expect(response.body.data.sources.map((source: { label: string }) => source.label))
            .toEqual(['Canvas assignment description (as imported)']);
    });

    it('saves an edited draft as before, adding no source the approved version did not have', async () => {
        const assignment = productionAssignment();
        mongo.getWritingAssignment.mockResolvedValue(assignment);
        const edited = editorPayload({ ...assignment.rubric, task: 'Write a short descriptive report.' });
        const response = await request(app()).put(`${ASSIGNMENT}/rubric-draft`).send(edited);

        expect(response.status).toBe(200);
        const saved = mongo.saveWritingRubricDraft.mock.calls[0][2];
        expect(saved).toMatchObject({ status: 'draft', version: 2, task: 'Write a short descriptive report.' });
        expect(saved.gridSource).toBeUndefined();
    });

    it('approves an edited draft without asking about suggestions it does not have', async () => {
        const assignment = productionAssignment();
        assignment.rubricDraft = { ...assignment.rubric, status: 'draft', version: 2, task: 'Write a short descriptive report.' };
        mongo.getWritingAssignment.mockResolvedValue(assignment);
        const response = await request(app()).post(`${ASSIGNMENT}/rubric-draft/approve`);

        expect(response.status).toBe(200);
        expect(mongo.approveWritingRubricDraft.mock.calls[0][2]).toMatchObject({ status: 'approved', version: 2 });
    });

    it('fills the details from the instructions and leaves the Canvas grid and its points alone', async () => {
        const assignment = productionAssignment();
        mongo.getWritingAssignment.mockResolvedValue(assignment);
        proposeRubricFromInstructions.mockResolvedValue({
            title: 'Descriptive report', task: 'Describe a science concept.', audience: 'A non-expert reader.',
            purpose: 'To inform.', constraints: ['350–450 words'], learningOutcomes: ['Define a concept'],
            gradingIntent: 'Formative.',
            criteria: assignment.rubric.criteria.map((criterion) => ({ ...criterion, points: 1, description: 'Rewritten by the model' }))
        });
        const response = await request(app()).post(`${ASSIGNMENT}/rubric-draft/fill`);

        expect(response.status).toBe(200);
        expect(response.body.data.grid).toBe('unchanged');
        const saved: WritingRubricDefinition = mongo.saveWritingRubricDraft.mock.calls[0][2];
        expect(saved.task).toBe('Describe a science concept.');
        expect(saved.criteria).toEqual(assignment.rubric.criteria);
        expect(saved.levels).toEqual(assignment.rubric.levels);
    });
});
