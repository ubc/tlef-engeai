/**
 * scenario-questions-routes.ts
 *
 * Practice Scenarios (student) / Scenario Questions (instructor) REST API.
 * Mounted from `route-mongo.ts` under `/api/courses`.
 *
 * Business logic lives in `scenario-service.ts` / `scenario-questions-mongo.ts`;
 * this file only does auth, Zod parsing, and response shaping.
 *
 * @author: @gatahcha
 * @date: 2026-07-03
 * @version: 2.0.0
 * @description: Scenario Questions REST routes — generate, check-answer, submit-exam, responses, LOs.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { asyncHandlerWithAuth } from '../../middleware/async-handler';
import { requireInstructorForCourseAPI } from '../../middleware/require-course-role';
import { EngEAI_MongoDB } from '../../db/enge-ai-mongodb';
import { isCourseStaff } from '../../utils/course-staff';
import { normalizeRouteParams } from '../../helpers/route-params';
import { appLogger } from '../../utils/logger';
import type { activeCourse, GlobalUser, ScenarioMode, ScenarioQuestionStatus } from '../../types/shared';
import {
    generateScenarioQuestions,
    getScenarioService,
    submitScenarioExam,
    submitScenarioStudentResponse,
} from '../../scenario-generation/scenario-service';
import { hasCompletedSubQuestion } from '../../db/mongo/scenario-questions-mongo';
import {
    checkScenarioAnswerRequestSchema,
    scenarioGenerateRequestSchema,
    submitScenarioExamRequestSchema,
} from '../../scenario-generation/scenario-schemas';

interface ScenarioRequestContext {
    course: activeCourse;
    globalUser: GlobalUser;
    isInstructor: boolean;
}

function requireCourseMemberForScenarioAPI() {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            // Authenticate session user and resolve global profile
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

            // Allow course staff or enrolled students — deny everyone else
            const isInstructor = isCourseStaff(course as activeCourse, globalUser);
            const isEnrolled = globalUser.coursesEnrolled.includes(courseId);
            if (!isInstructor && !isEnrolled) {
                appLogger.log(`[RBAC] User ${user.puid} denied scenario-questions access for course ${courseId}`);
                return res.status(403).json({ success: false, error: 'Course membership required' });
            }

            (res.locals as any).scenarioCtx = {
                course: course as activeCourse,
                globalUser,
                isInstructor,
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

function parseMode(value: unknown): ScenarioMode | null {
    return value === 'practice' || value === 'exam' ? value : null;
}

/**
 * Registers Practice Scenarios / Scenario Questions routes on the courses router.
 */
export function mountScenarioQuestionRoutes(router: Router): void {
    /**
     * GET /:courseId/scenario-questions/learning-objectives?topicOrWeekId=
     * Topic-scoped LO catalog for instructor generate/editor selectors.
     */
    router.get(
        '/:courseId/scenario-questions/learning-objectives',
        requireInstructorForCourseAPI(['params']),
        asyncHandlerWithAuth(async (req: Request, res: Response) => {
            const { courseId } = normalizeRouteParams(req.params);
            const topicOrWeekId =
                typeof req.query.topicOrWeekId === 'string' ? req.query.topicOrWeekId : '';
            if (!topicOrWeekId) {
                return res.status(400).json({ success: false, error: 'topicOrWeekId query param is required' });
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
            const data = await instance.getLearningObjectivesForTopicOrWeek(courseId, topicOrWeekId);
            res.json({ success: true, data });
        })
    );

    router.get(
        '/:courseId/scenario-questions',
        requireCourseMemberForScenarioAPI(),
        asyncHandlerWithAuth(async (req: Request, res: Response) => {
            const { course, isInstructor } = scenarioCtx(res);
            const instance = await EngEAI_MongoDB.getInstance();
            await instance.ensureScenarioQuestionsCollection(course.id);

            const topicOrWeekId =
                typeof req.query.topicOrWeekId === 'string' ? req.query.topicOrWeekId : undefined;

            if (isInstructor) {
                const status =
                    typeof req.query.status === 'string'
                        ? (req.query.status as ScenarioQuestionStatus)
                        : undefined;
                const data = await instance.listScenarioQuestions(course.courseName, {
                    status,
                    topicOrWeekId,
                });
                return res.json({ success: true, data });
            }

            const data = await instance.listPublishedScenarioQuestionsForStudent(
                course.courseName,
                topicOrWeekId
            );
            res.json({ success: true, data });
        })
    );

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

            const question = await instance.getPublishedScenarioQuestionForStudent(
                course.courseName,
                questionId
            );
            if (!question) {
                return res.status(404).json({ success: false, error: 'Question not found' });
            }
            res.json({ success: true, data: question });
        })
    );

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

            const {
                title,
                topicOrWeekId,
                sourcePrompt,
                questionBody,
                solutionBody,
                subQuestions,
                difficulty,
                expectedTimeMinutes,
                learningObjectives,
            } = req.body ?? {};
            if (!title?.trim() || !topicOrWeekId || !questionBody?.trim()) {
                return res
                    .status(400)
                    .json({ success: false, error: 'title, topicOrWeekId, and questionBody are required' });
            }
            const chapterExists = (course as activeCourse).topicOrWeekInstances.some(
                (t) => t.id === topicOrWeekId
            );
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
                createdByUserId: globalUser?.userId ?? 'unknown',
                difficulty,
                expectedTimeMinutes,
                learningObjectives: Array.isArray(learningObjectives) ? learningObjectives : undefined,
            });
            res.status(201).json({ success: true, data: question });
        })
    );

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
            const {
                title,
                topicOrWeekId,
                questionBody,
                solutionBody,
                subQuestions,
                difficulty,
                expectedTimeMinutes,
                learningObjectives,
            } = req.body ?? {};
            if (topicOrWeekId) {
                const chapterExists = (course as activeCourse).topicOrWeekInstances.some(
                    (t) => t.id === topicOrWeekId
                );
                if (!chapterExists) {
                    return res
                        .status(400)
                        .json({ success: false, error: `Unknown topicOrWeekId: ${topicOrWeekId}` });
                }
            }
            const globalUser = await instance.findGlobalUserByPUID((req as any).user.puid);
            const updated = await instance.updateScenarioQuestion(
                (course as activeCourse).courseName,
                questionId,
                {
                    title,
                    topicOrWeekId,
                    questionBody,
                    solutionBody,
                    subQuestions,
                    difficulty,
                    expectedTimeMinutes,
                    learningObjectives,
                },
                globalUser?.userId
            );
            if (!updated) {
                return res.status(404).json({ success: false, error: 'Question not found' });
            }
            res.json({ success: true, data: updated });
        })
    );

    router.patch(
        '/:courseId/scenario-questions/:questionId/status',
        requireInstructorForCourseAPI(['params']),
        asyncHandlerWithAuth(async (req: Request, res: Response) => {
            const { courseId, questionId } = normalizeRouteParams(req.params);
            const { status } = req.body ?? {};
            const validStatuses: ScenarioQuestionStatus[] = ['draft', 'published', 'rejected'];
            if (!validStatuses.includes(status)) {
                return res
                    .status(400)
                    .json({ success: false, error: `status must be one of: ${validStatuses.join(', ')}` });
            }
            const instance = await EngEAI_MongoDB.getInstance();
            const course = await instance.getActiveCourse(courseId);
            if (!course) {
                return res.status(404).json({ success: false, error: 'Course not found' });
            }
            const result = await instance.patchScenarioQuestionStatus(
                (course as activeCourse).courseName,
                questionId,
                status
            );
            if (result.error) {
                const notFound = result.error === 'Question not found';
                return res.status(notFound ? 404 : 400).json({ success: false, error: result.error });
            }
            res.json({ success: true, data: result.question });
        })
    );

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
            const deleted = await instance.deleteScenarioQuestion(
                (course as activeCourse).courseName,
                questionId
            );
            if (!deleted) {
                return res.status(404).json({ success: false, error: 'Question not found' });
            }
            res.json({ success: true });
        })
    );

    /**
     * POST /:courseId/scenario-questions/generate
     */
    router.post(
        '/:courseId/scenario-questions/generate',
        requireInstructorForCourseAPI(['params']),
        asyncHandlerWithAuth(async (req: Request, res: Response) => {
            const { courseId } = normalizeRouteParams(req.params);
            const parsed = scenarioGenerateRequestSchema.safeParse(req.body ?? {});
            if (!parsed.success) {
                return res.status(400).json({
                    success: false,
                    error: parsed.error.issues[0]?.message || 'Invalid generate request',
                });
            }
            const body = parsed.data;

            const instance = await EngEAI_MongoDB.getInstance();
            const course = await instance.getActiveCourse(courseId);
            if (!course) {
                return res.status(404).json({ success: false, error: 'Course not found' });
            }
            const chapterExists = (course as activeCourse).topicOrWeekInstances.some(
                (t) => t.id === body.topicOrWeekId
            );
            if (!chapterExists) {
                return res
                    .status(400)
                    .json({ success: false, error: `Unknown topicOrWeekId: ${body.topicOrWeekId}` });
            }
            await instance.ensureScenarioQuestionsCollection(courseId);
            const globalUser = await instance.findGlobalUserByPUID((req as any).user.puid);

            try {
                const result = await generateScenarioQuestions({
                    ...body,
                    courseId,
                    courseName: (course as activeCourse).courseName,
                    createdByUserId: globalUser?.userId ?? 'unknown',
                });

                if (!result.success) {
                    return res.status(422).json(result);
                }
                res.status(201).json(result);
            } catch (error) {
                return res.status(400).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Generation failed',
                });
            }
        })
    );

    /**
     * POST /:courseId/scenario-questions/:questionId/check-answer
     * `{ subQuestionId, studentAnswer, mode }` → grade + feedback.
     */
    router.post(
        '/:courseId/scenario-questions/:questionId/check-answer',
        requireCourseMemberForScenarioAPI(),
        asyncHandlerWithAuth(async (req: Request, res: Response) => {
            const { course, globalUser, isInstructor } = scenarioCtx(res);
            const { questionId } = normalizeRouteParams(req.params);
            const parsed = checkScenarioAnswerRequestSchema.safeParse(req.body ?? {});
            if (!parsed.success) {
                return res.status(400).json({
                    success: false,
                    error: parsed.error.issues[0]?.message || 'Invalid check-answer request',
                });
            }

            const instance = await EngEAI_MongoDB.getInstance();
            await instance.ensureScenarioQuestionsCollection(course.id);

            // Instructors may preview grading on drafts; students only see published questions via service
            if (isInstructor) {
                const fullQuestion = await instance.getScenarioQuestionById(course.courseName, questionId);
                if (!fullQuestion) {
                    return res.status(404).json({
                        success: false,
                        subQuestionId: parsed.data.subQuestionId,
                        error: 'Question not found',
                    });
                }
            }

            const feedback = await submitScenarioStudentResponse({
                courseId: course.id,
                courseName: course.courseName,
                questionId,
                subQuestionId: parsed.data.subQuestionId,
                studentAnswer: parsed.data.studentAnswer,
                mode: parsed.data.mode,
                studentUserId: globalUser.userId,
                allowUnpublished: isInstructor,
            });

            if (!feedback.success) {
                const status = feedback.error?.includes('not found') ? 404 : 422;
                return res.status(status).json(feedback);
            }
            res.json(feedback);
        })
    );

    /**
     * POST /:courseId/scenario-questions/:questionId/submit-exam
     */
    router.post(
        '/:courseId/scenario-questions/:questionId/submit-exam',
        requireCourseMemberForScenarioAPI(),
        asyncHandlerWithAuth(async (req: Request, res: Response) => {
            const { course, globalUser, isInstructor } = scenarioCtx(res);
            if (isInstructor) {
                return res.status(403).json({
                    success: false,
                    error: 'Exam submit is for enrolled students only',
                });
            }

            const { questionId } = normalizeRouteParams(req.params);
            const parsed = submitScenarioExamRequestSchema.safeParse(req.body ?? {});
            if (!parsed.success) {
                return res.status(400).json({
                    success: false,
                    error: parsed.error.issues[0]?.message || 'Invalid submit-exam request',
                });
            }

            const instance = await EngEAI_MongoDB.getInstance();
            await instance.ensureScenarioQuestionsCollection(course.id);

            const result = await submitScenarioExam({
                courseId: course.id,
                courseName: course.courseName,
                questionId,
                answers: parsed.data.answers,
                studentUserId: globalUser.userId,
            });

            if (!result.success) {
                const status = result.error?.includes('not found')
                    ? 404
                    : result.error?.includes('Missing') ||
                        result.error?.includes('Duplicate') ||
                        result.error?.includes('Unknown') ||
                        result.error?.includes('Empty')
                      ? 400
                      : 422;
                return res.status(status).json(result);
            }
            res.json(result);
        })
    );

    /**
     * GET /:courseId/scenario-questions/:questionId/responses
     * Returns only the caller's embedded response history.
     */
    router.get(
        '/:courseId/scenario-questions/:questionId/responses',
        requireCourseMemberForScenarioAPI(),
        asyncHandlerWithAuth(async (req: Request, res: Response) => {
            const { course, globalUser } = scenarioCtx(res);
            const { questionId } = normalizeRouteParams(req.params);
            const instance = await EngEAI_MongoDB.getInstance();
            await instance.ensureScenarioQuestionsCollection(course.id);

            const question = await instance.getScenarioQuestionById(course.courseName, questionId);
            if (!question || question.status !== 'published') {
                return res.status(404).json({ success: false, error: 'Question not found' });
            }

            const data = await getScenarioService().getStudentResponseHistory(
                course.courseName,
                questionId,
                globalUser.userId
            );
            res.json({ success: true, data });
        })
    );

    /**
     * GET /:courseId/scenario-questions/:questionId/solution?mode=practice|exam
     * Gated reveal — every sub-question must have a response in the given mode.
     */
    router.get(
        '/:courseId/scenario-questions/:questionId/solution',
        requireCourseMemberForScenarioAPI(),
        asyncHandlerWithAuth(async (req: Request, res: Response) => {
            const { course, globalUser, isInstructor } = scenarioCtx(res);
            const { questionId } = normalizeRouteParams(req.params);
            const mode = parseMode(req.query.mode) ?? 'practice';
            const subQuestionId =
                typeof req.query.subQuestionId === 'string' ? req.query.subQuestionId.trim() : '';
            const instance = await EngEAI_MongoDB.getInstance();
            await instance.ensureScenarioQuestionsCollection(course.id);

            const question = await instance.getScenarioQuestionById(course.courseName, questionId);
            if (!question || (!isInstructor && question.status !== 'published')) {
                return res.status(404).json({ success: false, error: 'Question not found' });
            }

            // Students must complete the requested part (or every part for full reveal).
            // Practice per-part reveal is direct — no prior check-answer required (See the Answer).
            if (!isInstructor) {
                const service = getScenarioService();
                const canReveal = subQuestionId
                    ? mode === 'practice' ||
                      hasCompletedSubQuestion(question, globalUser.userId, mode, subQuestionId)
                    : service.canRevealSolution(question, globalUser.userId, mode);
                if (!canReveal) {
                    return res.status(403).json({
                        success: false,
                        error: subQuestionId
                            ? 'Submit an answer for this part before viewing the solution'
                            : `Submit all parts in ${mode} mode before viewing the solution`,
                    });
                }
            }

            const revealSubs = subQuestionId
                ? question.subQuestions.filter((sub) => sub.subQuestionId === subQuestionId)
                : question.subQuestions;

            if (subQuestionId && revealSubs.length === 0) {
                return res.status(404).json({ success: false, error: 'Sub-question not found' });
            }

            res.json({
                success: true,
                data: {
                    questionBody: question.questionBody,
                    solutionBody: question.solutionBody,
                    // Strip embedded student history from solution payload
                    subQuestions: revealSubs.map(({ studentResponses, ...sub }) => sub),
                },
            });
        })
    );
}
