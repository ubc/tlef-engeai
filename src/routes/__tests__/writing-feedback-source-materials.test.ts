/**
 * Writing Feedback source-material routes — files and pastes over HTTP
 *
 * Course RBAC and the capability gate are the router-level pair every Writing Feedback route
 * sits behind, and they are tested where they live; they pass through here so these tests can
 * pin what the routes themselves own: multipart intake for both files and pastes, the refusals
 * staff see, and that nothing is stored for an assignment outside the course.
 *
 * @author: EngE-AI Team
 * @version: 1.0.0
 * @description: HTTP coverage for listing, adding, and removing assignment source materials.
 */

import fs from 'fs';
import path from 'path';
import express from 'express';
import request from 'supertest';

const mongo = {
    getWritingAssignment: jest.fn(),
    listWritingSourceMaterials: jest.fn(),
    addWritingSourceMaterial: jest.fn(),
    deleteWritingSourceMaterial: jest.fn()
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

const BASE = '/api/courses/course-1/writing-feedback/assignments/assignment-1/source-materials';

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

describe('source-material routes', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mongo.getWritingAssignment.mockResolvedValue({ id: 'assignment-1', courseId: 'course-1' });
        mongo.addWritingSourceMaterial.mockImplementation(async (input: object) => ({ ...input, id: 'material-1' }));
    });

    it('stores an uploaded Word file with its table kept', async () => {
        const fixture = path.join(__dirname, '..', '..', 'writing-feedback', '__tests__', 'fixtures', 'sample-rubric-table.docx');
        const response = await request(app()).post(BASE).attach('file', fs.readFileSync(fixture), 'rubric.docx');

        expect(response.status).toBe(201);
        const [stored, max] = mongo.addWritingSourceMaterial.mock.calls[0];
        expect(stored).toMatchObject({
            courseId: 'course-1', assignmentId: 'assignment-1', kind: 'file', fileName: 'rubric.docx', hasTables: true, addedBy: 'user-1'
        });
        expect(stored.text).toContain('| Criterion | Developing | Proficient |');
        expect(max).toBe(5);
    });

    it('stores a paste sent as multipart, preferring its HTML', async () => {
        const response = await request(app()).post(BASE)
            .field('text', 'Criterion Points')
            .field('html', '<table><tr><td>Criterion</td><td>Points</td></tr><tr><td>Content</td><td>10</td></tr></table>');

        expect(response.status).toBe(201);
        expect(mongo.addWritingSourceMaterial.mock.calls[0][0]).toMatchObject({ kind: 'paste', hasTables: true });
        expect(mongo.addWritingSourceMaterial.mock.calls[0][0]).not.toHaveProperty('fileName');
    });

    it('refuses a file the parser cannot read, without the parser\'s own message', async () => {
        const response = await request(app()).post(BASE).attach('file', Buffer.from('not a zip'), 'rubric.docx');

        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/^This file could not be read/);
        expect(mongo.addWritingSourceMaterial).not.toHaveBeenCalled();
    });

    it('refuses an unsupported file type with a message staff can act on', async () => {
        const response = await request(app()).post(BASE).attach('file', Buffer.from('a,b'), 'rubric.xlsx');

        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/^This file type is not supported/);
    });

    it('refuses a paste larger than the field limit', async () => {
        const response = await request(app()).post(BASE).field('html', `<p>${'a'.repeat(2 * 1024 * 1024)}</p>`);

        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/^This paste is too large/);
    });

    it('refuses a material once the assignment holds the maximum', async () => {
        mongo.addWritingSourceMaterial.mockResolvedValue(null);
        const response = await request(app()).post(BASE).field('text', 'Write a memo.');

        expect(response.status).toBe(409);
        expect(response.body.error).toMatch(/^An assignment can hold at most 5/);
    });

    it('stores nothing for an assignment outside the course', async () => {
        mongo.getWritingAssignment.mockResolvedValue(null);
        const response = await request(app()).post(BASE).field('text', 'Write a memo.');

        expect(response.status).toBe(404);
        expect(mongo.addWritingSourceMaterial).not.toHaveBeenCalled();
    });

    it('lists an assignment\'s materials', async () => {
        mongo.listWritingSourceMaterials.mockResolvedValue([{ id: 'material-1' }]);
        const response = await request(app()).get(BASE);

        expect(response.status).toBe(200);
        expect(response.body.data).toEqual([{ id: 'material-1' }]);
        expect(mongo.listWritingSourceMaterials).toHaveBeenCalledWith('course-1', 'assignment-1');
    });

    it('removes a material, and answers 404 for one that is not there', async () => {
        mongo.deleteWritingSourceMaterial.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

        expect((await request(app()).delete(`${BASE}/material-1`)).status).toBe(200);
        expect((await request(app()).delete(`${BASE}/material-2`)).status).toBe(404);
        expect(mongo.deleteWritingSourceMaterial).toHaveBeenCalledWith('course-1', 'assignment-1', 'material-1');
    });
});
