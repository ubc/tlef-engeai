/**
 * course-syllabus-routes.ts
 *
 * Course Syllabus documents (#674). Mounted from route-mongo.ts under /api/courses.
 *
 * @description Uploads reuse `POST /api/rag/documents/{file,text}` with
 * `topicOrWeekId: 'course-syllabus'`; this module removes one syllabus document from
 * Qdrant and Mongo. Same course-scoped guard as week/topic material deletion.
 */

import { Router, Request, Response } from 'express';
import { asyncHandlerWithAuth } from '../../middleware/async-handler';
import { requireInstructorForCourseAPI } from '../../middleware/require-course-role';
import { EngEAI_MongoDB } from '../../db/enge-ai-mongodb';
import { RAGApp } from '../../rag/rag-app';
import { normalizeRouteParams } from '../../helpers/route-params';
import { materialChunkIds } from '../../migrate/schema-walker';
import { appLogger } from '../../utils/logger';
import { COURSE_SYLLABUS_SCOPE_ID } from '../../types/shared';

/**
 * Registers Course Syllabus routes on the courses router.
 */
export function mountCourseSyllabusRoutes(router: Router): void {
    /**
     * DELETE /:courseId/syllabus/materials/:materialId — remove one Course Syllabus document.
     *
     * Step order matches week/topic material deletion: vectors first, so a Qdrant
     * failure leaves the Mongo record (and the Delete button) in place for a retry.
     *
     * @response 200 - `{ success: true, data: { materialId, deleted, materialName, chunksDeleted } }`
     * @response 404 - Course or syllabus document not found
     * @response 500 - Vector or database deletion failed
     */
    router.delete(
        '/:courseId/syllabus/materials/:materialId',
        requireInstructorForCourseAPI(['params']),
        asyncHandlerWithAuth(async (req: Request, res: Response) => {
            const { courseId, materialId } = normalizeRouteParams(req.params);
            const mongoDB = await EngEAI_MongoDB.getInstance();

            // Step 1: find the document on the course
            const course = await mongoDB.getActiveCourse(courseId);
            if (!course) {
                return res.status(404).json({ success: false, error: 'Course not found' });
            }
            const material = course.syllabusMaterials?.find((m) => m.id === materialId);
            if (!material) {
                return res.status(404).json({ success: false, error: 'Syllabus document not found' });
            }

            // Step 2: remove its vectors
            let chunksDeleted = 0;
            if (materialChunkIds(material).length > 0) {
                try {
                    const ragApp = await RAGApp.getInstance();
                    const result = await ragApp.deleteDocument(
                        materialId,
                        courseId,
                        COURSE_SYLLABUS_SCOPE_ID,
                        COURSE_SYLLABUS_SCOPE_ID
                    );
                    chunksDeleted = result.chunksDeleted;
                } catch (qdrantError) {
                    appLogger.error('Failed to delete syllabus document from Qdrant:', { courseId, materialId, error: qdrantError });
                    return res.status(500).json({ success: false, error: 'Failed to delete document from vector database' });
                }
            }

            // Step 3: remove the Mongo record
            const removed = await mongoDB.removeSyllabusMaterial(courseId, materialId);
            if (!removed) {
                return res.status(500).json({ success: false, error: 'Failed to update course in database' });
            }

            return res.json({
                success: true,
                message: 'Syllabus document deleted successfully',
                data: { materialId, deleted: true, materialName: material.name, chunksDeleted }
            });
        })
    );
}
