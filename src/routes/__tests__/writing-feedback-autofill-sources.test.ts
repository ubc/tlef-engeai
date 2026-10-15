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
    saveWritingRubricDraft: jest.fn(),
    clearPendingRubricExtraction: jest.fn(),
    approveWritingRubricDraft: jest.fn()
};
const proposeRubricFromInstructions = jest.fn();
const extractRubricsFromMaterial = jest.fn();
const proposeCellDescriptions = jest.fn();

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
    mergeAutofill: (draft: { criteria: unknown; levels: unknown; version: number; status: string; gridSource?: unknown }) => ({
        ...jest.requireActual('../../writing-feedback/__tests__/helpers/staffed-rubric').buildStaffedWritingRubric('user-1'),
        criteria: draft.criteria,
        levels: draft.levels,
        version: draft.version,
        status: draft.status,
        ...(draft.gridSource ? { gridSource: draft.gridSource } : {})
    })
}));

jest.mock('../../writing-feedback/source-rubric-extraction', () => ({
    ...jest.requireActual('../../writing-feedback/source-rubric-extraction'),
    extractRubricsFromMaterial: (...args: unknown[]) => extractRubricsFromMaterial(...args)
}));

jest.mock('../../writing-feedback/rubric-cell-proposals', () => ({
    ...jest.requireActual('../../writing-feedback/rubric-cell-proposals'),
    proposeCellDescriptions: (...args: unknown[]) => proposeCellDescriptions(...args)
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
        proposeCellDescriptions.mockImplementation(async (shape: unknown) => ({ shape, proposed: 0 }));
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
            const [, , saved, lens] = mongo.saveWritingRubricDraft.mock.calls[0];
            expect(saved.criteria.map((criterion: { id: string }) => criterion.id)).toEqual(['thesis', 'evidence']);
            expect(lens).toBe('linguistic');
            expect(saved.gridSource).toEqual({ kind: 'canvas' });
        });

        it('keeps an approved grid until staff confirm, still filling the details', async () => {
            const approved = realAssignment();
            approved.rubric = { ...approved.rubric, status: 'approved' };
            mongo.getWritingAssignment.mockResolvedValue(approved);
            const response = await request(app()).post(`${ASSIGNMENT}/rubric-draft/fill`).send({ rubricFrom: 'canvas' });

            expect(response.body.data.grid).toBe('needs_confirmation');
            expect(proposeRubricFromInstructions).toHaveBeenCalledTimes(1);
            const [, , saved] = mongo.saveWritingRubricDraft.mock.calls[0];
            expect(saved.criteria.map((criterion: { id: string }) => criterion.id)).not.toContain('thesis');
            expect(saved.gridSource).toBeUndefined();
        });

        it('replaces an approved grid once staff confirm', async () => {
            const approved = realAssignment();
            approved.rubric = { ...approved.rubric, status: 'approved' };
            mongo.getWritingAssignment.mockResolvedValue(approved);
            const response = await request(app()).post(`${ASSIGNMENT}/rubric-draft/fill`).send({ rubricFrom: 'canvas', replaceGrid: true });

            expect(response.body.data.grid).toBe('applied');
            expect(mongo.saveWritingRubricDraft.mock.calls[0][2].gridSource).toEqual({ kind: 'canvas' });
        });

        it('treats choosing the source the grid already has as keeping it', async () => {
            mongo.getWritingAssignment.mockResolvedValue(realAssignment({ rubricSource: 'canvas' }));
            const response = await request(app()).post(`${ASSIGNMENT}/rubric-draft/fill`).send({ rubricFrom: 'canvas' });

            expect(response.body.data.grid).toBe('unchanged');
            expect(mongo.saveWritingRubricDraft.mock.calls[0][2].gridSource).toBeUndefined();
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

    describe('building the grid from a rubric in staff material', () => {
        const reported = (title: string) => ({
            title, shape: 'grid', notes: ['A model note.'],
            levels: [{ label: 'Weak' }, { label: 'Strong' }],
            criteria: [
                { label: 'Thesis', weight: { value: 10, unit: 'points' }, ratings: [{ levelLabel: 'Weak', descriptor: 'No thesis' }, { levelLabel: 'Strong', descriptor: 'Clear thesis' }] },
                { label: 'Evidence', weight: { value: 20, unit: 'points' }, ratings: [{ levelLabel: 'Weak', descriptor: 'None' }, { levelLabel: 'Strong', descriptor: 'Plenty' }] }
            ],
            deductions: ['Subtract 1 point for each day late.']
        });

        function fresh() {
            return buildDefaultWritingAssignment('course-1', 'assignment-1', 'Essay', 'Write a memo.');
        }

        it('replaces an untouched grid with the one rubric found, recording where it came from', async () => {
            mongo.getWritingAssignment.mockResolvedValue(fresh());
            extractRubricsFromMaterial.mockResolvedValue([reported('Essay rubric')]);
            const response = await request(app()).post(`${ASSIGNMENT}/rubric-draft/fill`).send({ rubricFrom: { sourceId: 'material-1' } });

            expect(response.body.data.grid).toBe('applied');
            expect(extractRubricsFromMaterial.mock.calls[0][0]).toBe('| Criterion | Points |');
            const [, , saved, , provenance] = mongo.saveWritingRubricDraft.mock.calls[0];
            expect(saved.criteria.map((criterion: { label: string; points: number }) => [criterion.label, criterion.points]))
                .toEqual([['Thesis', 10], ['Evidence', 20]]);
            expect(saved.constraints).toContain('Subtract 1 point for each day late.');
            expect(saved.gridSource).toMatchObject({ kind: 'uploaded', label: 'rubric.docx' });
            expect(saved.gridSource.notes[0]).toBe('A model note.');
            expect(provenance).toEqual({ pendingRubricExtraction: null });
        });

        it('holds several versions for staff to choose between, leaving the grid alone', async () => {
            mongo.getWritingAssignment.mockResolvedValue(fresh());
            extractRubricsFromMaterial.mockResolvedValue([reported('Draft rubric'), reported('Final rubric')]);
            const response = await request(app()).post(`${ASSIGNMENT}/rubric-draft/fill`).send({ rubricFrom: { sourceId: 'material-1' } });

            expect(response.body.data.grid).toBe('needs_decision');
            const [, , saved, , provenance] = mongo.saveWritingRubricDraft.mock.calls[0];
            expect(saved.criteria.map((criterion: { id: string }) => criterion.id)).not.toContain('thesis');
            expect(saved.gridSource).toBeUndefined();
            expect(provenance.pendingRubricExtraction.candidates.map((candidate: { title: string }) => candidate.title))
                .toEqual(['Draft rubric', 'Final rubric']);
        });

        it.each([
            ['no rubric is found', async () => [], 'not_found', /^No rubric was found in rubric.docx/],
            ['extraction fails', async () => { throw new Error('model down'); }, 'failed', /^The rubric in rubric.docx could not be read/]
        ])('still fills the details when %s', async (_name, extraction, outcome, message) => {
            mongo.getWritingAssignment.mockResolvedValue(fresh());
            extractRubricsFromMaterial.mockImplementation(extraction);
            const response = await request(app()).post(`${ASSIGNMENT}/rubric-draft/fill`).send({ rubricFrom: { sourceId: 'material-1' } });

            expect(response.status).toBe(200);
            expect(response.body.data.grid).toBe(outcome);
            expect(response.body.data.gridMessage).toMatch(message);
            expect(mongo.saveWritingRubricDraft.mock.calls[0][2].gridSource).toBeUndefined();
        });

        it('extracts nothing while replacing an approved grid waits for confirmation', async () => {
            const approved = fresh();
            approved.rubric = { ...approved.rubric, status: 'approved' };
            mongo.getWritingAssignment.mockResolvedValue(approved);
            const response = await request(app()).post(`${ASSIGNMENT}/rubric-draft/fill`).send({ rubricFrom: { sourceId: 'material-1' } });

            expect(response.body.data.grid).toBe('needs_confirmation');
            expect(extractRubricsFromMaterial).not.toHaveBeenCalled();
        });

        it('refuses a source that is not an upload or paste, before any model call', async () => {
            mongo.getWritingAssignment.mockResolvedValue(fresh());
            const response = await request(app()).post(`${ASSIGNMENT}/rubric-draft/fill`).send({ rubricFrom: { sourceId: 'instructions' } });

            expect(response.status).toBe(409);
            expect(proposeRubricFromInstructions).not.toHaveBeenCalled();
        });

        it('applies the held version staff choose', async () => {
            const { convertExtractedRubric } = jest.requireActual('../../writing-feedback/source-rubric-extraction');
            const converted = convertExtractedRubric(reported('Final rubric'));
            mongo.getWritingAssignment.mockResolvedValue({
                ...buildDefaultWritingAssignment('course-1', 'assignment-1', 'Essay', 'Write a memo.'),
                rubric: { ...jest.requireActual('../../writing-feedback/__tests__/helpers/staffed-rubric').buildStaffedWritingRubric('user-1'), status: 'draft' },
                pendingRubricExtraction: {
                    lens: 'linguistic', sourceLabel: 'rubric.docx', createdAt: new Date(),
                    candidates: [{ title: 'Final rubric', shape: converted.shape, notes: converted.notes, deductions: converted.deductions }]
                }
            });
            const response = await request(app()).post(`${ASSIGNMENT}/rubric-draft/from-extraction`).send({ candidateIndex: 0 });

            expect(response.status).toBe(200);
            const [, , saved, lens, provenance] = mongo.saveWritingRubricDraft.mock.calls[0];
            expect(saved.criteria.map((criterion: { label: string }) => criterion.label)).toEqual(['Thesis', 'Evidence']);
            expect(lens).toBe('linguistic');
            expect(saved.gridSource).toMatchObject({ kind: 'uploaded', label: 'rubric.docx' });
            expect(provenance.pendingRubricExtraction).toBeNull();
        });

        it('refuses to finish an extraction that is not waiting', async () => {
            mongo.getWritingAssignment.mockResolvedValue(fresh());
            const response = await request(app()).post(`${ASSIGNMENT}/rubric-draft/from-extraction`).send({ candidateIndex: 0 });

            expect(response.status).toBe(409);
        });

        it('drops held versions on request', async () => {
            mongo.clearPendingRubricExtraction.mockResolvedValue({ id: 'assignment-1' });
            const response = await request(app()).delete(`${ASSIGNMENT}/rubric-draft/pending-extraction`);

            expect(response.status).toBe(200);
            expect(mongo.clearPendingRubricExtraction).toHaveBeenCalledWith('course-1', 'assignment-1');
        });
    });

    describe('rows the source left undescribed', () => {
        const weightedList = {
            title: 'Breakdown', shape: 'breakdown_only', notes: [],
            criteria: [{ label: 'Introduction', weight: { value: 5, unit: 'points' } }, { label: 'Results', weight: { value: 35, unit: 'points' } }]
        };

        it('gets descriptions proposed for the chosen scale, and a note saying so', async () => {
            mongo.getWritingAssignment.mockResolvedValue(buildDefaultWritingAssignment('course-1', 'assignment-1', 'Essay', 'Write a memo.'));
            extractRubricsFromMaterial.mockResolvedValue([weightedList]);
            proposeCellDescriptions.mockImplementation(async (shape: { criteria: Array<{ cells: Record<string, object> }> }) => ({
                shape: {
                    ...shape,
                    criteria: shape.criteria.map((criterion) => ({
                        ...criterion,
                        cells: Object.fromEntries(Object.entries(criterion.cells).map(([id, cell]) => [id, { ...cell, descriptor: 'Proposed', origin: 'proposed' }]))
                    }))
                },
                proposed: 6
            }));
            const response = await request(app()).post(`${ASSIGNMENT}/rubric-draft/fill`)
                .send({ rubricFrom: { sourceId: 'material-1', scale: 'three_level_met' } });

            expect(response.body.data.grid).toBe('applied');
            const [shape, targets] = proposeCellDescriptions.mock.calls[0];
            expect(shape.levels.map((level: { label: string }) => level.label)).toEqual(['Not met', 'Partly met', 'Met']);
            expect(targets).toEqual({ cells: ['introduction', 'results'], descriptions: ['introduction', 'results'] });
            const saved = mongo.saveWritingRubricDraft.mock.calls[0][2];
            expect(saved.criteria[0].cells.met).toMatchObject({ descriptor: 'Proposed', origin: 'proposed' });
            expect(saved.gridSource.notes.join(' ')).toMatch(/EngE-AI suggested the criterion and rating descriptions/);
        });

        it('still builds the grid when proposing fails, with a note to write them', async () => {
            mongo.getWritingAssignment.mockResolvedValue(buildDefaultWritingAssignment('course-1', 'assignment-1', 'Essay', 'Write a memo.'));
            extractRubricsFromMaterial.mockResolvedValue([weightedList]);
            proposeCellDescriptions.mockRejectedValue(new Error('model down'));
            const response = await request(app()).post(`${ASSIGNMENT}/rubric-draft/fill`).send({ rubricFrom: { sourceId: 'material-1' } });

            expect(response.body.data.grid).toBe('applied');
            expect(mongo.saveWritingRubricDraft.mock.calls[0][2].gridSource.notes.join(' ')).toMatch(/could not suggest criterion and rating descriptions/);
        });
    });

    describe('approving a rubric with suggested descriptions', () => {
        function withProposal() {
            const assignment = buildDefaultWritingAssignment('course-1', 'assignment-1', 'Essay', 'Write a memo.');
            const staffed = jest.requireActual('../../writing-feedback/__tests__/helpers/staffed-rubric').buildStaffedWritingRubric('user-1');
            const [first, ...rest] = staffed.criteria;
            const [levelId] = Object.keys(first.cells);
            assignment.rubric = {
                ...staffed,
                status: 'draft',
                criteria: [{ ...first, cells: { ...first.cells, [levelId]: { ...first.cells[levelId], origin: 'proposed' } } }, ...rest]
            };
            return assignment;
        }

        it('asks staff to confirm before approving', async () => {
            mongo.getWritingAssignment.mockResolvedValue(withProposal());
            const response = await request(app()).post(`${ASSIGNMENT}/rubric-draft/approve`);

            expect(response.status).toBe(409);
            expect(response.body.error).toMatch(/^1 description was suggested by EngE-AI/);
            expect(mongo.approveWritingRubricDraft).not.toHaveBeenCalled();
        });

        it('approves once confirmed, clearing the suggestion markers', async () => {
            mongo.getWritingAssignment.mockResolvedValue(withProposal());
            mongo.approveWritingRubricDraft.mockResolvedValue({ id: 'assignment-1' });
            const response = await request(app()).post(`${ASSIGNMENT}/rubric-draft/approve`).send({ acknowledgeProposed: true });

            expect(response.status).toBe(200);
            const approved = mongo.approveWritingRubricDraft.mock.calls[0][2];
            const origins = approved.criteria.flatMap((criterion: { cells: Record<string, { origin?: string }> }) =>
                Object.values(criterion.cells).map((cell) => cell.origin));
            expect(origins).not.toContain('proposed');
        });
    });
});
