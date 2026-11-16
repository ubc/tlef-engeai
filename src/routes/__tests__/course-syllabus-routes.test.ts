/**
 * Course Syllabus route tests (#674)
 *
 * Upload: `POST /api/rag/documents/text` with the reserved syllabus scope stores the
 * document on the course, with forced titles and no struggle-topic generation.
 * Delete: `DELETE /api/courses/:courseId/syllabus/materials/:materialId` removes vectors
 * first, then the Mongo record.
 */

import express, { Router, type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const guardState = { deny: false };

jest.mock('../../middleware/async-handler', () => ({
    asyncHandlerWithAuth: (handler: (req: Request, res: Response, next: NextFunction) => unknown) =>
        (req: Request, res: Response, next: NextFunction) =>
            Promise.resolve(handler(req, res, next)).catch(next)
}));

jest.mock('../../middleware/require-course-role', () => {
    const courseGuard = () => (_req: Request, res: Response, next: NextFunction) =>
        guardState.deny ? res.status(403).json({ success: false, error: 'Course access required' }) : next();
    return {
        requireInstructorForCourseAPI: courseGuard,
        requireInstructorGlobal: (_req: Request, _res: Response, next: NextFunction) => next()
    };
});

jest.mock('../../utils/logger', () => ({
    appLogger: { log: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../rag/rag-app', () => ({ RAGApp: { getInstance: jest.fn() } }));
jest.mock('../../db/enge-ai-mongodb', () => ({ EngEAI_MongoDB: { getInstance: jest.fn() } }));
jest.mock('../struggle-generation-upload', () => ({ runPostUploadStruggleGeneration: jest.fn() }));

import { RAGApp } from '../../rag/rag-app';
import { EngEAI_MongoDB } from '../../db/enge-ai-mongodb';
import { runPostUploadStruggleGeneration } from '../struggle-generation-upload';
import ragRoutes from '../route-rag';
import { mountCourseSyllabusRoutes } from '../mongo/course-syllabus-routes';
import { COURSE_SYLLABUS_SCOPE_ID, COURSE_SYLLABUS_TITLE } from '../../types/shared';

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use((req: Request, _res: Response, next: NextFunction) => {
        (req as unknown as { user: { puid: string } }).user = { puid: 'p-instructor' };
        next();
    });
    app.use('/api/rag', ragRoutes);
    const courses = Router();
    mountCourseSyllabusRoutes(courses);
    app.use('/api/courses', courses);
    return app;
}

const syllabusBody = {
    name: 'Outline',
    courseName: 'CHBE 241',
    courseId: 'course-1',
    topicOrWeekTitle: 'Anything the client sent',
    itemTitle: 'Anything the client sent',
    topicOrWeekId: COURSE_SYLLABUS_SCOPE_ID,
    itemId: COURSE_SYLLABUS_SCOPE_ID,
    text: 'Grading: two midterms and a final.'
};

/** Stubs RAGApp for an upload that produced two chunks. */
function mockRagUpload(addSyllabusMaterial: jest.Mock) {
    const uploadDocument = jest.fn(async (doc: Record<string, unknown>) => ({
        ...doc,
        id: 'syl-1',
        uploaded: true,
        qdrantChunkIds: ['c-1', 'c-2'],
        chunksGenerated: 2,
        extractedText: 'Grading: two midterms and a final.'
    }));
    const deleteDocumentsByIds = jest.fn();
    const addAdditionalMaterial = jest.fn();
    (RAGApp.getInstance as jest.Mock).mockResolvedValue({
        uploadDocument,
        mongoDBInstance: { addSyllabusMaterial, addAdditionalMaterial, getActiveCourse: jest.fn() },
        getRagModule: () => ({ deleteDocumentsByIds })
    });
    return { uploadDocument, deleteDocumentsByIds, addAdditionalMaterial };
}

describe('POST /api/rag/documents/text with the Course Syllabus scope', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        guardState.deny = false;
    });

    it('stores the document on the course with syllabus titles and no struggle topics', async () => {
        const addSyllabusMaterial = jest.fn().mockResolvedValue(true);
        const { uploadDocument, addAdditionalMaterial } = mockRagUpload(addSyllabusMaterial);

        const response = await request(buildApp()).post('/api/rag/documents/text').send(syllabusBody);

        expect(response.status).toBe(201);
        expect(uploadDocument).toHaveBeenCalledWith(
            expect.objectContaining({ topicOrWeekTitle: COURSE_SYLLABUS_TITLE, itemTitle: COURSE_SYLLABUS_TITLE })
        );
        expect(addSyllabusMaterial).toHaveBeenCalledWith(
            'course-1',
            expect.objectContaining({ id: 'syl-1', uploadedBy: 'p-instructor' })
        );
        // Neither the file buffer nor extracted text is persisted
        expect(addSyllabusMaterial.mock.calls[0][1]).not.toHaveProperty('extractedText');
        expect(addAdditionalMaterial).not.toHaveBeenCalled();
        expect(runPostUploadStruggleGeneration).not.toHaveBeenCalled();
        expect(response.body.data.struggleGenerationSkipped).toBe(true);
    });

    it('requires a course id', async () => {
        const addSyllabusMaterial = jest.fn();
        const { uploadDocument } = mockRagUpload(addSyllabusMaterial);
        const { courseId: _omit, ...body } = syllabusBody;

        const response = await request(buildApp()).post('/api/rag/documents/text').send(body);

        expect(response.status).toBe(400);
        expect(uploadDocument).not.toHaveBeenCalled();
    });

    it('removes the new chunks and fails when the course record cannot be saved', async () => {
        const addSyllabusMaterial = jest.fn().mockResolvedValue(false);
        const { deleteDocumentsByIds } = mockRagUpload(addSyllabusMaterial);

        const response = await request(buildApp()).post('/api/rag/documents/text').send(syllabusBody);

        expect(response.status).toBe(500);
        expect(response.body.message).toBe('Failed to save syllabus document');
        expect(deleteDocumentsByIds).toHaveBeenCalledWith(['c-1', 'c-2']);
    });
});

describe('DELETE /api/courses/:courseId/syllabus/materials/:materialId', () => {
    const course = {
        id: 'course-1',
        syllabusMaterials: [{ id: 'syl-1', name: 'Outline', qdrantChunkIds: ['c-1'] }]
    };

    beforeEach(() => {
        jest.clearAllMocks();
        guardState.deny = false;
    });

    function mockDelete(overrides: { deleteDocument?: jest.Mock; removeSyllabusMaterial?: jest.Mock } = {}) {
        const deleteDocument = overrides.deleteDocument ?? jest.fn().mockResolvedValue({ deleted: true, materialName: 'Outline', chunksDeleted: 1 });
        const removeSyllabusMaterial = overrides.removeSyllabusMaterial ?? jest.fn().mockResolvedValue(true);
        (EngEAI_MongoDB.getInstance as jest.Mock).mockResolvedValue({
            getActiveCourse: jest.fn().mockResolvedValue(course),
            removeSyllabusMaterial
        });
        (RAGApp.getInstance as jest.Mock).mockResolvedValue({ deleteDocument });
        return { deleteDocument, removeSyllabusMaterial };
    }

    it('is behind the course-scoped instructor guard', async () => {
        guardState.deny = true;
        const { deleteDocument } = mockDelete();

        const response = await request(buildApp()).delete('/api/courses/course-1/syllabus/materials/syl-1');

        expect(response.status).toBe(403);
        expect(deleteDocument).not.toHaveBeenCalled();
    });

    it('deletes vectors, then the record', async () => {
        const { deleteDocument, removeSyllabusMaterial } = mockDelete();

        const response = await request(buildApp()).delete('/api/courses/course-1/syllabus/materials/syl-1');

        expect(response.status).toBe(200);
        expect(deleteDocument).toHaveBeenCalledWith('syl-1', 'course-1', COURSE_SYLLABUS_SCOPE_ID, COURSE_SYLLABUS_SCOPE_ID);
        expect(removeSyllabusMaterial).toHaveBeenCalledWith('course-1', 'syl-1');
        expect(response.body.data).toEqual({ materialId: 'syl-1', deleted: true, materialName: 'Outline', chunksDeleted: 1 });
    });

    it('keeps the record when vector deletion fails', async () => {
        const { removeSyllabusMaterial } = mockDelete({
            deleteDocument: jest.fn().mockRejectedValue(new Error('qdrant down'))
        });

        const response = await request(buildApp()).delete('/api/courses/course-1/syllabus/materials/syl-1');

        expect(response.status).toBe(500);
        expect(removeSyllabusMaterial).not.toHaveBeenCalled();
    });

    it('answers 404 for an unknown document', async () => {
        mockDelete();
        const response = await request(buildApp()).delete('/api/courses/course-1/syllabus/materials/nope');
        expect(response.status).toBe(404);
    });
});
