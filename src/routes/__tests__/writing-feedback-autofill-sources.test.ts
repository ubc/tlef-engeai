/**
 * Writing Feedback auto-fill routes — which material "Fill these in for me" reads, over HTTP
 *
 * Course RBAC and the capability gate pass through here (they are the router-level pair and
 * are tested where they live), and the model call is replaced, so these pin what the routes
 * own: the source list staff see, that a fill reads exactly the ticked sources, and that an
 * unusable selection is refused before any model call.
 *
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @description: HTTP coverage for auto-fill source listing and source selection.
 */

import express from 'express';
import request from 'supertest';

const mongo = {
    getWritingAssignment: jest.fn(),
    listWritingSourceMaterials: jest.fn(),
    saveWritingRubricDraft: jest.fn()
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
jest.mock('../../writing-feedback/rubric-autofill', () => ({
    ...jest.requireActual('../../writing-feedback/rubric-autofill'),
    proposeRubricFromInstructions: (...args: unknown[]) => proposeRubricFromInstructions(...args),
    // The proposal is irrelevant here. The details come from a valid staffed rubric, as a real
    // proposal would fill them; the grid is whatever the route handed over.
    mergeAutofill: (draft: { criteria: unknown; levels: unknown; version: number; status: string }) => ({
        ...jest.requireActual('../../writing-feedback/__tests__/helpers/staffed-rubric').buildStaffedWritingRubric('user-1'),
        criteria: draft.criteria,
        levels: draft.levels,
        version: draft.version,
        status: draft.status
    })
}));

// Imported after the mocks so the router binds to them.
import router from '../route-writing-feedback';
import { buildDefaultWritingAssignment } from '../../writing-feedback/default-rubric-profile';

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

const rubricMaterial = {
    id: 'material-1', courseId: 'course-1', assignmentId: 'assignment-1', kind: 'file', fileName: 'rubric.docx',
    text: '| Criterion | Points |', hasTables: true, characterCount: 22, addedAt: new Date(), addedBy: 'user-1'
};

describe('auto-fill source routes', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mongo.getWritingAssignment.mockResolvedValue({
            id: 'assignment-1', courseId: 'course-1', instructions: 'Write a memo.',
            rubricSource: 'internal_profile', rubric: { status: 'draft' }
        });
        mongo.listWritingSourceMaterials.mockResolvedValue([rubricMaterial]);
        mongo.saveWritingRubricDraft.mockImplementation(async () => ({ id: 'assignment-1' }));
        proposeRubricFromInstructions.mockResolvedValue({});
    });

    it('lists the sources with their text and the character limit', async () => {
        const response = await request(app()).get(`${ASSIGNMENT}/autofill-sources`);

        expect(response.status).toBe(200);
        expect(response.body.data.maxCharacters).toBe(60000);
        expect(response.body.data.sources.map((source: { id: string; label: string }) => [source.id, source.label])).toEqual([
            ['instructions', 'Assignment instructions'],
            ['material-1', 'rubric.docx']
        ]);
    });

    it('reads only the ticked sources', async () => {
        await request(app()).post(`${ASSIGNMENT}/rubric-draft/fill`).send({ sourceIds: ['material-1'] });

        expect(proposeRubricFromInstructions).toHaveBeenCalledTimes(1);
        expect(proposeRubricFromInstructions.mock.calls[0][0]).toBe('| Criterion | Points |');
    });

    it('reads every source, labelled, when the request names none', async () => {
        await request(app()).post(`${ASSIGNMENT}/rubric-draft/fill`);

        expect(proposeRubricFromInstructions.mock.calls[0][0]).toContain('=== Source 1 of 2: Assignment instructions ===');
        expect(proposeRubricFromInstructions.mock.calls[0][0]).toContain('=== Source 2 of 2: rubric.docx ===');
    });

    it.each([
        ['nothing is ticked', { sourceIds: [] }, /^Select at least one source/],
        ['a ticked source is gone', { sourceIds: ['material-2'] }, /^One of the selected sources no longer exists/]
    ])('refuses before any model call when %s', async (_name, body, message) => {
        const response = await request(app()).post(`${ASSIGNMENT}/rubric-draft/fill`).send(body);

        expect(response.status).toBe(409);
        expect(response.body.error).toMatch(message);
        expect(proposeRubricFromInstructions).not.toHaveBeenCalled();
    });

    it('refuses an assignment with no material at all', async () => {
        mongo.getWritingAssignment.mockResolvedValue({ id: 'assignment-1', courseId: 'course-1', rubricSource: 'internal_profile' });
        mongo.listWritingSourceMaterials.mockResolvedValue([]);
        const response = await request(app()).post(`${ASSIGNMENT}/rubric-draft/fill`);

        expect(response.status).toBe(409);
        expect(response.body.error).toMatch(/^Add the assignment instructions, or upload or paste/);
    });

    it('rejects a malformed selection', async () => {
        const response = await request(app()).post(`${ASSIGNMENT}/rubric-draft/fill`).send({ sourceIds: 'material-1' });

        expect(response.status).toBe(400);
        expect(proposeRubricFromInstructions).not.toHaveBeenCalled();
    });

    describe('choosing the grid\'s source', () => {
        const canvasShape = {
            criteria: [
                { id: 'thesis', label: 'Thesis', description: 'Thesis description', points: 10, cells: {} },
                { id: 'evidence', label: 'Evidence', description: 'Evidence description', points: 15, cells: {} }
            ],
            levels: [
                { id: 'poor', label: 'Poor', description: 'Poor work', rank: 1 },
                { id: 'good', label: 'Good', description: 'Good work', rank: 2 }
            ]
        };

        function realAssignment(over: Record<string, unknown> = {}) {
            return {
                ...buildDefaultWritingAssignment('course-1', 'assignment-1', 'Essay', 'Write a memo.'),
                canvasRubricImport: { shape: canvasShape, ids: {}, importedAt: new Date() },
                ...over
            };
        }

        it('reports the graded grid\'s source with the sources', async () => {
            mongo.getWritingAssignment.mockResolvedValue(realAssignment());
            const response = await request(app()).get(`${ASSIGNMENT}/autofill-sources`);

            expect(response.body.data.rubric).toEqual({
                lens: 'linguistic', current: 'builtin', canvas: { criteria: 2, points: 25 }, replaceNeedsConfirmation: false
            });
        });

        it('replaces an untouched default grid with the Canvas rubric and records the new source', async () => {
            mongo.getWritingAssignment.mockResolvedValue(realAssignment());
            const response = await request(app()).post(`${ASSIGNMENT}/rubric-draft/fill`).send({ rubricFrom: 'canvas' });

            expect(response.status).toBe(200);
            expect(response.body.data.grid).toBe('applied');
            const [, , saved, lens, gridSource] = mongo.saveWritingRubricDraft.mock.calls[0];
            expect(saved.criteria.map((criterion: { id: string }) => criterion.id)).toEqual(['thesis', 'evidence']);
            expect(lens).toBe('linguistic');
            expect(gridSource).toBe('canvas');
        });

        it('keeps an approved grid until staff confirm, still filling the details', async () => {
            const approved = realAssignment();
            approved.rubric = { ...approved.rubric, status: 'approved' };
            mongo.getWritingAssignment.mockResolvedValue(approved);
            const response = await request(app()).post(`${ASSIGNMENT}/rubric-draft/fill`).send({ rubricFrom: 'canvas' });

            expect(response.body.data.grid).toBe('needs_confirmation');
            expect(proposeRubricFromInstructions).toHaveBeenCalledTimes(1);
            const [, , saved, , gridSource] = mongo.saveWritingRubricDraft.mock.calls[0];
            expect(saved.criteria.map((criterion: { id: string }) => criterion.id)).not.toContain('thesis');
            expect(gridSource).toBeUndefined();
        });

        it('replaces an approved grid once staff confirm', async () => {
            const approved = realAssignment();
            approved.rubric = { ...approved.rubric, status: 'approved' };
            mongo.getWritingAssignment.mockResolvedValue(approved);
            const response = await request(app()).post(`${ASSIGNMENT}/rubric-draft/fill`).send({ rubricFrom: 'canvas', replaceGrid: true });

            expect(response.body.data.grid).toBe('applied');
            expect(mongo.saveWritingRubricDraft.mock.calls[0][4]).toBe('canvas');
        });

        it('treats choosing the source the grid already has as keeping it', async () => {
            mongo.getWritingAssignment.mockResolvedValue(realAssignment({ rubricSource: 'canvas' }));
            const response = await request(app()).post(`${ASSIGNMENT}/rubric-draft/fill`).send({ rubricFrom: 'canvas' });

            expect(response.body.data.grid).toBe('unchanged');
            expect(mongo.saveWritingRubricDraft.mock.calls[0][4]).toBeUndefined();
        });

        it('refuses Canvas when no rubric was imported, before any model call', async () => {
            mongo.getWritingAssignment.mockResolvedValue(realAssignment({ canvasRubricImport: undefined }));
            const response = await request(app()).post(`${ASSIGNMENT}/rubric-draft/fill`).send({ rubricFrom: 'canvas' });

            expect(response.status).toBe(409);
            expect(response.body.error).toBe('This assignment has no imported Canvas rubric');
            expect(proposeRubricFromInstructions).not.toHaveBeenCalled();
        });

        it('refuses a source for the lens that does not carry the grade', async () => {
            mongo.getWritingAssignment.mockResolvedValue(realAssignment({ isLabReport: true }));
            const response = await request(app()).post(`${ASSIGNMENT}/rubric-draft/fill?lens=linguistic`).send({ rubricFrom: 'default' });

            expect(response.status).toBe(400);
            expect(proposeRubricFromInstructions).not.toHaveBeenCalled();
        });

        it('rejects an unknown source', async () => {
            const response = await request(app()).post(`${ASSIGNMENT}/rubric-draft/fill`).send({ rubricFrom: 'upload' });

            expect(response.status).toBe(400);
        });
    });
});
