/**
 * scenario-questions-routes.ts
 *
 * Practice Scenarios (student) / Scenario Questions (instructor) REST API.
 * Mounted from `route-mongo.ts` under `/api/courses` — see
 * planner/improved-scenario-generation-deliverables.md §7 for the frozen contract.
 *
 * Business logic lives in `scenario-questions-mongo.ts` / `scenario-generator.ts` /
 * `scenario-feedback.ts`; this file only does auth, param parsing, and response shaping.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { asyncHandlerWithAuth } from '../../middleware/async-handler';
import { requireInstructorForCourseAPI } from '../../middleware/require-course-role';
import { EngEAI_MongoDB } from '../../db/enge-ai-mongodb';
import { isCourseStaff } from '../../utils/course-staff';
import { normalizeRouteParams } from '../../helpers/route-params';
import { appLogger } from '../../utils/logger';
import type { activeCourse, GlobalUser, ScenarioPartId, ScenarioQuestionStatus } from '../../types/shared';
import { REQUIRED_SCENARIO_PART_IDS, SCENARIO_BATCH_MAX_COUNT } from '../../types/shared';
import { hasCheckedAllRequiredParts } from '../../db/mongo/scenario-questions-mongo';
import { generateScenarioQuestions } from '../../scenario-generation/scenario-generator';
import { checkScenarioAnswer } from '../../scenario-generation/scenario-feedback';

interface ScenarioRequestContext {
    course: activeCourse;
    globalUser: GlobalUser;
    isInstructor: boolean;
}

/**
 * Middleware: require course membership (enrolled student **or** course staff) for
 * scenario-questions read endpoints shared by both roles. Attaches `res.locals.scenarioCtx`.
 */
function requireCourseMemberForScenarioAPI() {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const user = (req as any).user;
            if (!user) {
                return res.status(401).json({ success: false, error: 'Authentication required' });
            }
            const { courseId } = normalizeRouteParams(req.params);
            const instance = await EngEAI_MongoDB.getInstance();
            const globalUser = await instance.findGlobalUserByPUID(user.puid);
            if (!globalUser) {
                return res.status(401).json({ success: false, error: 'User not found' });
            }
            const course = await instance.getActiveCourse(courseId);
            if (!course) {
                return res.status(404).json({ success: false, error: 'Course not found' });
            }

            const isInstructor = isCourseStaff(course as activeCourse, globalUser);
            const isEnrolled = globalUser.coursesEnrolled.includes(courseId);
            if (!isInstructor && !isEnrolled) {
                appLogger.log(`[RBAC] User ${user.puid} denied scenario-questions access for course ${courseId}`);
                return res.status(403).json({ success: false, error: 'Course membership required' });
            }

            (res.locals as any).scenarioCtx = {
                course: course as activeCourse,
                globalUser,
                isInstructor
            } satisfies ScenarioRequestContext;
            next();
        } catch (error) {
            appLogger.error('[RBAC] Error in requireCourseMemberForScenarioAPI:', error);
            res.status(500).json({ success: false, error: 'Internal server error' });
        }
    };
}

function scenarioCtx(res: Response): ScenarioRequestContext {
    return (res.locals as any).scenarioCtx as ScenarioRequestContext;
}

/**
 * Registers Practice Scenarios / Scenario Questions routes on the courses router.
 */
export function mountScenarioQuestionRoutes(router: Router): void {
    /**
     * GET /:courseId/scenario-questions
     * Instructor: all statuses, `?status=` / `?topicOrWeekId=` filters.
     * Student: published only, `?topicOrWeekId=` filter (draft never leaves the server — T-B01).
     */
    router.get(
        '/:courseId/scenario-questions',
        requireCourseMemberForScenarioAPI(),
        asyncHandlerWithAuth(async (req: Request, res: Response) => {
            const { course, isInstructor } = scenarioCtx(res);
            const instance = await EngEAI_MongoDB.getInstance();
            await instance.ensureScenarioQuestionsCollection(course.id);

            const topicOrWeekId = typeof req.query.topicOrWeekId === 'string' ? req.query.topicOrWeekId : undefined;

            if (isInstructor) {
                const status = typeof req.query.status === 'string' ? (req.query.status as ScenarioQuestionStatus) : undefined;
                const data = await instance.listScenarioQuestions(course.courseName, { status, topicOrWeekId });
                return res.json({ success: true, data });
            }

            const data = await instance.listPublishedScenarioQuestionsForStudent(course.courseName, topicOrWeekId);
            res.json({ success: true, data });
        })
    );

    /**
     * GET /:courseId/scenario-questions/:questionId
     * Instructor: full document (any status). Student: 404 unless published (D5/E-01 — no draft leakage).
     */
    router.get(
        '/:courseId/scenario-questions/:questionId',
        requireCourseMemberForScenarioAPI(),
        asyncHandlerWithAuth(async (req: Request, res: Response) => {
            const { course, isInstructor } = scenarioCtx(res);
            const { questionId } = normalizeRouteParams(req.params);
            const instance = await EngEAI_MongoDB.getInstance();
            await instance.ensureScenarioQuestionsCollection(course.id);

            if (isInstructor) {
                const question = await instance.getScenarioQuestionById(course.courseName, questionId);
                if (!question) {
                    return res.status(404).json({ success: false, error: 'Question not found' });
                }
                return res.json({ success: true, data: question });
            }

            const question = await instance.getPublishedScenarioQuestionForStudent(course.courseName, questionId);
            if (!question) {
                return res.status(404).json({ success: false, error: 'Question not found' });
            }
            res.json({ success: true, data: question });
        })
    );

    /**
     * POST /:courseId/scenario-questions
     * Manual instructor create (draft).
     */
    router.post(
        '/:courseId/scenario-questions',
        requireInstructorForCourseAPI(['params']),
        asyncHandlerWithAuth(async (req: Request, res: Response) => {
            const { courseId } = normalizeRouteParams(req.params);
            const instance = await EngEAI_MongoDB.getInstance();
            const course = await instance.getActiveCourse(courseId);
            if (!course) {
                return res.status(404).json({ success: false, error: 'Course not found' });
            }
            await instance.ensureScenarioQuestionsCollection(courseId);

            const { title, topicOrWeekId, sourcePrompt, questionBody, solutionBody, subQuestions } = req.body ?? {};
            if (!title?.trim() || !topicOrWeekId || !questionBody?.trim()) {
                return res.status(400).json({ success: false, error: 'title, topicOrWeekId, and questionBody are required' });
            }
            const chapterExists = (course as activeCourse).topicOrWeekInstances.some((t) => t.id === topicOrWeekId);
            if (!chapterExists) {
                return res.status(400).json({ success: false, error: `Unknown topicOrWeekId: ${topicOrWeekId}` });
            }

            const globalUser = await instance.findGlobalUserByPUID((req as any).user.puid);
            const question = await instance.createScenarioQuestion({
                courseId,
                courseName: (course as activeCourse).courseName,
                topicOrWeekId,
                title: title.trim(),
                sourcePrompt: sourcePrompt ?? '',
                questionBody,
                solutionBody: solutionBody ?? '',
                subQuestions: Array.isArray(subQuestions) ? subQuestions : [],
                generatedBy: 'instructor',
                createdByUserId: globalUser?.userId ?? 'unknown'
            });
            res.status(201).json({ success: true, data: question });
        })
    );

    /**
     * PUT /:courseId/scenario-questions/:questionId
     * Instructor edit (title, chapter, narrative, parts).
     */
    router.put(
        '/:courseId/scenario-questions/:questionId',
        requireInstructorForCourseAPI(['params']),
        asyncHandlerWithAuth(async (req: Request, res: Response) => {
            const { courseId, questionId } = normalizeRouteParams(req.params);
            const instance = await EngEAI_MongoDB.getInstance();
            const course = await instance.getActiveCourse(courseId);
            if (!course) {
                return res.status(404).json({ success: false, error: 'Course not found' });
            }
            const { title, topicOrWeekId, questionBody, solutionBody, subQuestions } = req.body ?? {};
            if (topicOrWeekId) {
                const chapterExists = (course as activeCourse).topicOrWeekInstances.some((t) => t.id === topicOrWeekId);
                if (!chapterExists) {
                    return res.status(400).json({ success: false, error: `Unknown topicOrWeekId: ${topicOrWeekId}` });
                }
            }
            const globalUser = await instance.findGlobalUserByPUID((req as any).user.puid);
            const updated = await instance.updateScenarioQuestion(
                (course as activeCourse).courseName,
                questionId,
                { title, topicOrWeekId, questionBody, solutionBody, subQuestions },
                globalUser?.userId
            );
            if (!updated) {
                return res.status(404).json({ success: false, error: 'Question not found' });
            }
            res.json({ success: true, data: updated });
        })
    );

    /**
     * PATCH /:courseId/scenario-questions/:questionId/status
     * `{ status: 'draft' | 'published' | 'rejected' }` — publish re-validates (a)(b)(c) server-side.
     */
    router.patch(
        '/:courseId/scenario-questions/:questionId/status',
        requireInstructorForCourseAPI(['params']),
        asyncHandlerWithAuth(async (req: Request, res: Response) => {
            const { courseId, questionId } = normalizeRouteParams(req.params);
            const { status } = req.body ?? {};
            const validStatuses: ScenarioQuestionStatus[] = ['draft', 'published', 'rejected'];
            if (!validStatuses.includes(status)) {
                return res.status(400).json({ success: false, error: `status must be one of: ${validStatuses.join(', ')}` });
            }
            const instance = await EngEAI_MongoDB.getInstance();
            const course = await instance.getActiveCourse(courseId);
            if (!course) {
                return res.status(404).json({ success: false, error: 'Course not found' });
            }
            const result = await instance.patchScenarioQuestionStatus((course as activeCourse).courseName, questionId, status);
            if (result.error) {
                const notFound = result.error === 'Question not found';
                return res.status(notFound ? 404 : 400).json({ success: false, error: result.error });
            }
            res.json({ success: true, data: result.question });
        })
    );

    /**
     * DELETE /:courseId/scenario-questions/:questionId
     */
    router.delete(
        '/:courseId/scenario-questions/:questionId',
        requireInstructorForCourseAPI(['params']),
        asyncHandlerWithAuth(async (req: Request, res: Response) => {
            const { courseId, questionId } = normalizeRouteParams(req.params);
            const instance = await EngEAI_MongoDB.getInstance();
            const course = await instance.getActiveCourse(courseId);
            if (!course) {
                return res.status(404).json({ success: false, error: 'Course not found' });
            }
            const deleted = await instance.deleteScenarioQuestion((course as activeCourse).courseName, questionId);
            if (!deleted) {
                return res.status(404).json({ success: false, error: 'Question not found' });
            }
            res.json({ success: true });
        })
    );

    /**
     * POST /:courseId/scenario-questions/generate
     * `{ mode: 'single' | 'batch', sourcePrompt, topicOrWeekId, count? }` — RAG-grounded AI generation.
     */
    router.post(
        '/:courseId/scenario-questions/generate',
        requireInstructorForCourseAPI(['params']),
        asyncHandlerWithAuth(async (req: Request, res: Response) => {
            const { courseId } = normalizeRouteParams(req.params);
            const { mode, sourcePrompt, topicOrWeekId, count } = req.body ?? {};

            if (mode !== 'single' && mode !== 'batch') {
                return res.status(400).json({ success: false, error: "mode must be 'single' or 'batch'" });
            }
            if (!sourcePrompt?.trim() || !topicOrWeekId) {
                return res.status(400).json({ success: false, error: 'sourcePrompt and topicOrWeekId are required' });
            }
            if (mode === 'batch' && count !== undefined && (typeof count !== 'number' || count > SCENARIO_BATCH_MAX_COUNT || count < 1)) {
                return res.status(400).json({ success: false, error: `count must be between 1 and ${SCENARIO_BATCH_MAX_COUNT}` });
            }

            const instance = await EngEAI_MongoDB.getInstance();
            const course = await instance.getActiveCourse(courseId);
            if (!course) {
                return res.status(404).json({ success: false, error: 'Course not found' });
            }
            const chapterExists = (course as activeCourse).topicOrWeekInstances.some((t) => t.id === topicOrWeekId);
            if (!chapterExists) {
                return res.status(400).json({ success: false, error: `Unknown topicOrWeekId: ${topicOrWeekId}` });
            }
            await instance.ensureScenarioQuestionsCollection(courseId);
            const globalUser = await instance.findGlobalUserByPUID((req as any).user.puid);

            const result = await generateScenarioQuestions({
                mode,
                sourcePrompt,
                topicOrWeekId,
                count,
                courseId,
                courseName: (course as activeCourse).courseName,
                createdByUserId: globalUser?.userId ?? 'unknown'
            });

            if (!result.success) {
                return res.status(422).json(result);
            }
            res.status(201).json(result);
        })
    );

    /**
     * POST /:courseId/scenario-questions/:questionId/check-answer
     * `{ partId, studentAnswer }` → `ScenarioPartFeedbackResponse`. Student (or instructor preview).
     */
    router.post(
        '/:courseId/scenario-questions/:questionId/check-answer',
        requireCourseMemberForScenarioAPI(),
        asyncHandlerWithAuth(async (req: Request, res: Response) => {
            const { course, globalUser, isInstructor } = scenarioCtx(res);
            const { questionId } = normalizeRouteParams(req.params);
            const { partId, studentAnswer } = req.body ?? {};

            const validParts: ScenarioPartId[] = ['a', 'b', 'c', 'd'];
            if (!validParts.includes(partId)) {
                return res.status(400).json({ success: false, partId, error: 'Invalid partId' });
            }
            if (!studentAnswer || !String(studentAnswer).trim()) {
                return res.status(400).json({ success: false, partId, error: 'Answer required' });
            }

            const instance = await EngEAI_MongoDB.getInstance();
            await instance.ensureScenarioQuestionsCollection(course.id);
            const question = isInstructor
                ? await instance.getScenarioQuestionById(course.courseName, questionId)
                : await instance.getPublishedScenarioQuestionForStudent(course.courseName, questionId);
            if (!question) {
                return res.status(404).json({ success: false, partId, error: 'Question not found' });
            }
            const fullQuestion = await instance.getScenarioQuestionById(course.courseName, questionId);
            const subQuestion = fullQuestion?.subQuestions.find((s) => s.partId === partId);
            if (!subQuestion) {
                return res.status(404).json({ success: false, partId, error: `Part (${partId}) not found on this question` });
            }

            const feedback = await checkScenarioAnswer({
                questionBody: fullQuestion!.questionBody,
                subQuestion,
                studentAnswer: String(studentAnswer)
            });

            if (!isInstructor) {
                await instance.recordScenarioPartCheck(course.courseName, globalUser.userId, questionId, partId, feedback.verdict);
            }

            res.json(feedback);
        })
    );

    /**
     * GET /:courseId/scenario-questions/:questionId/solution
     * Gated reveal — 403 until all of {@link REQUIRED_SCENARIO_PART_IDS} have been checked (T-B17, E-12).
     */
    router.get(
        '/:courseId/scenario-questions/:questionId/solution',
        requireCourseMemberForScenarioAPI(),
        asyncHandlerWithAuth(async (req: Request, res: Response) => {
            const { course, globalUser, isInstructor } = scenarioCtx(res);
            const { questionId } = normalizeRouteParams(req.params);
            const instance = await EngEAI_MongoDB.getInstance();
            await instance.ensureScenarioQuestionsCollection(course.id);

            const question = await instance.getScenarioQuestionById(course.courseName, questionId);
            if (!question || (!isInstructor && question.status !== 'published')) {
                return res.status(404).json({ success: false, error: 'Question not found' });
            }

            if (!isInstructor) {
                const progress = await instance.getScenarioProgress(course.courseName, globalUser.userId, questionId);
                if (!hasCheckedAllRequiredParts(progress)) {
                    return res.status(403).json({
                        success: false,
                        error: `Check all required parts (${REQUIRED_SCENARIO_PART_IDS.join(', ')}) before viewing the solution`
                    });
                }
                await instance.markScenarioSolutionViewed(course.courseName, globalUser.userId, questionId);
            }

            res.json({
                success: true,
                data: {
                    questionBody: question.questionBody,
                    solutionBody: question.solutionBody,
                    subQuestions: question.subQuestions
                }
            });
        })
    );
}
