/**
 * Scenario Questions Mongo — CRUD, embedded responses, and solution gate
 *
 * Domain logic for `{courseName}_scenario_questions`. Student submissions are embedded on
 * each sub-question as immutable `studentResponses[]`. Solution gating derives from those
 * records (no CourseUser.scenarioProgress).
 *
 * SQ-001: lazy collection provision. SQ-002: difficulty/time/LO/type backfill.
 * SQ-003: subQuestionId + studentResponses + structured learningObjectives backfill.
 *
 * @author: @gatahcha
 * @date: 2026-07-03
 * @version: 2.0.0
 * @description: Scenario question CRUD, embedded response writes, projections, and gate helpers.
 */

import type { Collection } from 'mongodb';
import {
    activeCourse,
    ScenarioDifficulty,
    ScenarioLearningObjectiveSnapshot,
    ScenarioMode,
    ScenarioQuestion,
    ScenarioQuestionForStudent,
    ScenarioQuestionStatus,
    ScenarioStudentResponse,
    ScenarioSubQuestion,
    defaultExpectedTimeMinutes,
    inferSubQuestionTypeFromPartId,
} from '../../types/shared';
import { getCollectionNames } from './collection-registry-mongo';
import { activeCourseListCollection } from './mongo-collections';
import type { MongoDalContext } from './mongo-context';
import { fetchActiveCourseDocById } from './active-course-queries-mongo';
import { createScenarioQuestionIndexes } from './scenario-indexes';
import { appLogger } from '../../utils/logger';

/** Soft ceiling before Mongo's 16 MiB document limit — reject writes with a clear error. */
export const SCENARIO_DOCUMENT_GROWTH_GUARD_BYTES = 14 * 1024 * 1024;

/** Input accepted by `createScenarioQuestion` — server computes id, sortOrder, timestamps, status. */
export interface CreateScenarioQuestionInput {
    courseId: string;
    courseName: string;
    topicOrWeekId: string;
    title: string;
    sourcePrompt: string;
    questionBody: string;
    solutionBody: string;
    /** May omit subQuestionId/studentResponses — server assigns them. */
    subQuestions: Array<{
        subQuestionId?: string;
        partId?: string;
        subQuestionType?: ScenarioSubQuestion['subQuestionType'];
        prompt: string;
        modelAnswer: string;
        points?: number;
        studentResponses?: ScenarioStudentResponse[];
    }>;
    generatedBy: 'instructor' | 'ai';
    aiGenerationJobId?: string;
    createdByUserId: string;
    difficulty?: ScenarioDifficulty;
    expectedTimeMinutes?: number;
    learningObjectives?: ScenarioLearningObjectiveSnapshot[];
}

/**
 * normalizeScenarioSubQuestions — assign subQuestionId / studentResponses / type for persist.
 * Existing subQuestionId values are preserved (reorder-safe).
 */
export function normalizeScenarioSubQuestions(
    subQuestions: CreateScenarioQuestionInput['subQuestions'],
    questionId: string,
    idGenerator: MongoDalContext['idGenerator'],
    now: Date = new Date()
): ScenarioSubQuestion[] {
    return subQuestions.map((sub, index) => {
        const partId = sub.partId;
        const subQuestionType =
            sub.subQuestionType ??
            (partId ? inferSubQuestionTypeFromPartId(partId) : 'calculation');
        return {
            subQuestionId:
                sub.subQuestionId?.trim() ||
                idGenerator.scenarioSubQuestionID(questionId, index, now),
            ...(partId ? { partId } : {}),
            prompt: sub.prompt,
            modelAnswer: sub.modelAnswer,
            points: sub.points,
            subQuestionType,
            studentResponses: Array.isArray(sub.studentResponses) ? sub.studentResponses : [],
        };
    });
}

async function getScenarioQuestionsCollection(ctx: MongoDalContext, courseName: string): Promise<Collection> {
    const collections = await getCollectionNames(ctx, courseName);
    return ctx.db.collection(collections.scenarioQuestions);
}

/**
 * ensureScenarioQuestionsCollection — SQ-001 lazy migration for pre-feature courses.
 */
export async function ensureScenarioQuestionsCollection(ctx: MongoDalContext, courseId: string): Promise<string> {
    const course = (await fetchActiveCourseDocById(ctx.db, courseId)) as activeCourse | null;
    if (!course) {
        throw new Error(`Course with id ${courseId} not found`);
    }

    const courseName = course.courseName;

    // Collection already provisioned — run lazy backfills and return
    if (course.collections?.scenarioQuestions) {
        await backfillScenarioQuestionExtendedFields(ctx, courseName);
        await backfillScenarioSubQuestionIds(ctx, courseName);
        return courseName;
    }

    // SQ-001: create collection, register on active course, provision indexes
    const collectionName = `${courseName}_scenario_questions`;
    try {
        await ctx.db.createCollection(collectionName);
    } catch (error: any) {
        if (error?.codeName !== 'NamespaceExists') throw error;
    }

    await activeCourseListCollection(ctx.db).updateOne(
        { id: courseId },
        { $set: { 'collections.scenarioQuestions': collectionName } }
    );
    ctx.collectionNamesCache.delete(courseName);
    appLogger.log(`[scenario-questions] SQ-001 lazy migration: provisioned ${collectionName} for course ${courseName}`);

    const collection = await getScenarioQuestionsCollection(ctx, courseName);
    await createScenarioQuestionIndexes(collection, courseName);
    await backfillScenarioQuestionExtendedFields(ctx, courseName);
    await backfillScenarioSubQuestionIds(ctx, courseName);
    return courseName;
}

const sq002BackfilledCourses = new Set<string>();
const sq003BackfilledCourses = new Set<string>();

/**
 * SQ-002 — backfill difficulty / expectedTimeMinutes / learningObjectives / subQuestionType.
 */
export async function backfillScenarioQuestionExtendedFields(ctx: MongoDalContext, courseName: string): Promise<void> {
    if (sq002BackfilledCourses.has(courseName)) return;
    sq002BackfilledCourses.add(courseName);

    try {
        const collection = await getScenarioQuestionsCollection(ctx, courseName);
        const docs = await collection
            .find({
                $or: [
                    { difficulty: { $exists: false } },
                    { expectedTimeMinutes: { $exists: false } },
                    { learningObjectives: { $exists: false } },
                    { 'subQuestions.subQuestionType': { $exists: false } },
                ],
            })
            .toArray();

        for (const doc of docs) {
            const question = doc as unknown as ScenarioQuestion;
            const difficulty: ScenarioDifficulty = question.difficulty ?? 'medium';
            const learningObjectives = normalizeLearningObjectives(question.learningObjectives);
            const subQuestions = normalizeScenarioSubQuestions(
                (question.subQuestions ?? []).map((s: any) => ({
                    subQuestionId: s.subQuestionId,
                    partId: s.partId,
                    prompt: s.prompt ?? '',
                    modelAnswer: s.modelAnswer ?? '',
                    points: s.points,
                    subQuestionType: s.subQuestionType,
                    studentResponses: s.studentResponses,
                })),
                question.id,
                ctx.idGenerator
            );
            await collection.updateOne(
                { id: question.id },
                {
                    $set: {
                        difficulty,
                        expectedTimeMinutes:
                            question.expectedTimeMinutes ?? defaultExpectedTimeMinutes(difficulty, subQuestions.length),
                        learningObjectives,
                        subQuestions,
                    },
                }
            );
        }
        if (docs.length > 0) {
            appLogger.log(`[scenario-questions] SQ-002 backfill: patched ${docs.length} question(s) for ${courseName}`);
        }
    } catch (error) {
        sq002BackfilledCourses.delete(courseName);
        appLogger.warn(`[scenario-questions] SQ-002 backfill warning for ${courseName}:`, error);
    }
}

/**
 * SQ-003 — assign subQuestionId and empty studentResponses on legacy parts; coerce LO shape.
 */
export async function backfillScenarioSubQuestionIds(ctx: MongoDalContext, courseName: string): Promise<void> {
    if (sq003BackfilledCourses.has(courseName)) return;
    sq003BackfilledCourses.add(courseName);

    try {
        const collection = await getScenarioQuestionsCollection(ctx, courseName);
        const docs = await collection
            .find({
                $or: [
                    { 'subQuestions.subQuestionId': { $exists: false } },
                    { 'subQuestions.studentResponses': { $exists: false } },
                    { 'learningObjectives.0': { $type: 'string' } },
                ],
            })
            .toArray();

        for (const doc of docs) {
            const question = doc as unknown as ScenarioQuestion;
            const subQuestions = normalizeScenarioSubQuestions(
                (question.subQuestions ?? []).map((s: any) => ({
                    subQuestionId: s.subQuestionId,
                    partId: s.partId,
                    prompt: s.prompt ?? '',
                    modelAnswer: s.modelAnswer ?? '',
                    points: s.points,
                    subQuestionType: s.subQuestionType,
                    studentResponses: s.studentResponses,
                })),
                question.id,
                ctx.idGenerator
            );
            await collection.updateOne(
                { id: question.id },
                {
                    $set: {
                        subQuestions,
                        learningObjectives: normalizeLearningObjectives(question.learningObjectives),
                    },
                }
            );
        }
        if (docs.length > 0) {
            appLogger.log(`[scenario-questions] SQ-003 backfill: patched ${docs.length} question(s) for ${courseName}`);
        }
    } catch (error) {
        sq003BackfilledCourses.delete(courseName);
        appLogger.warn(`[scenario-questions] SQ-003 backfill warning for ${courseName}:`, error);
    }
}

/** Coerce legacy string[] LOs or partial objects into snapshot shape (empty source ids when unknown). */
export function normalizeLearningObjectives(raw: unknown): ScenarioLearningObjectiveSnapshot[] {
    if (!Array.isArray(raw)) return [];
    return raw
        .map((item): ScenarioLearningObjectiveSnapshot | null => {
            if (typeof item === 'string') {
                const text = item.trim();
                if (!text) return null;
                return {
                    objectiveId: `legacy-${text.slice(0, 24)}`,
                    text,
                    sourceTopicOrWeekId: '',
                    sourceItemId: '',
                };
            }
            if (item && typeof item === 'object') {
                const obj = item as Record<string, unknown>;
                const objectiveId = String(obj.objectiveId ?? obj.id ?? '').trim();
                const text = String(obj.text ?? obj.LearningObjective ?? '').trim();
                if (!objectiveId || !text) return null;
                return {
                    objectiveId,
                    text,
                    sourceTopicOrWeekId: String(obj.sourceTopicOrWeekId ?? obj.topicOrWeekId ?? ''),
                    sourceItemId: String(obj.sourceItemId ?? obj.itemId ?? ''),
                };
            }
            return null;
        })
        .filter((x): x is ScenarioLearningObjectiveSnapshot => x !== null);
}

/**
 * toStudentProjection — strips solutionBody, modelAnswer, and studentResponses.
 */
export function toStudentProjection(question: ScenarioQuestion): ScenarioQuestionForStudent {
    const { solutionBody, subQuestions, ...rest } = question;
    return {
        ...rest,
        learningObjectives: normalizeLearningObjectives(question.learningObjectives),
        subQuestions: subQuestions.map(({ modelAnswer, studentResponses, ...sub }) => ({ ...sub })),
    };
}

/**
 * validatePublishScenarioQuestion — narrative + ≥1 complete sub-question with subQuestionId.
 */
export function validatePublishScenarioQuestion(
    question: Pick<ScenarioQuestion, 'questionBody' | 'subQuestions'>
): string | null {
    if (!question.questionBody?.trim()) {
        return 'Question narrative must not be empty before publishing.';
    }
    if (!question.subQuestions?.length) {
        return 'At least one subquestion is required before publishing.';
    }
    for (const sub of question.subQuestions) {
        if (!sub.subQuestionId?.trim()) {
            return 'Every subquestion needs a server-assigned subQuestionId before publishing.';
        }
        if (!sub.prompt?.trim() || !sub.modelAnswer?.trim()) {
            return `Sub-question ${sub.subQuestionId} must have a prompt and model answer before publishing.`;
        }
    }
    return null;
}

export async function listScenarioQuestions(
    ctx: MongoDalContext,
    courseName: string,
    filters?: { status?: ScenarioQuestionStatus; topicOrWeekId?: string }
): Promise<ScenarioQuestion[]> {
    const collection = await getScenarioQuestionsCollection(ctx, courseName);
    const query: Record<string, unknown> = {};
    if (filters?.status) query.status = filters.status;
    if (filters?.topicOrWeekId) query.topicOrWeekId = filters.topicOrWeekId;
    const docs = await collection.find(query).sort({ topicOrWeekId: 1, sortOrder: 1 }).toArray();
    return (docs as unknown as ScenarioQuestion[]).map(hydrateQuestion);
}

export async function listPublishedScenarioQuestionsForStudent(
    ctx: MongoDalContext,
    courseName: string,
    topicOrWeekId?: string
): Promise<ScenarioQuestionForStudent[]> {
    const collection = await getScenarioQuestionsCollection(ctx, courseName);
    const query: Record<string, unknown> = { status: 'published' };
    if (topicOrWeekId) query.topicOrWeekId = topicOrWeekId;
    const docs = await collection.find(query).sort({ topicOrWeekId: 1, sortOrder: 1 }).toArray();
    return (docs as unknown as ScenarioQuestion[]).map((q) => toStudentProjection(hydrateQuestion(q)));
}

export async function getScenarioQuestionById(
    ctx: MongoDalContext,
    courseName: string,
    questionId: string
): Promise<ScenarioQuestion | null> {
    const collection = await getScenarioQuestionsCollection(ctx, courseName);
    const doc = await collection.findOne({ id: questionId });
    if (!doc) return null;
    return hydrateQuestion(doc as unknown as ScenarioQuestion);
}

export async function getPublishedScenarioQuestionForStudent(
    ctx: MongoDalContext,
    courseName: string,
    questionId: string
): Promise<ScenarioQuestionForStudent | null> {
    const question = await getScenarioQuestionById(ctx, courseName, questionId);
    if (!question || question.status !== 'published') {
        return null;
    }
    return toStudentProjection(question);
}

function hydrateQuestion(question: ScenarioQuestion): ScenarioQuestion {
    return {
        ...question,
        learningObjectives: normalizeLearningObjectives(question.learningObjectives),
        subQuestions: (question.subQuestions ?? []).map((s: any) => ({
            ...s,
            subQuestionId: s.subQuestionId || '',
            studentResponses: Array.isArray(s.studentResponses) ? s.studentResponses : [],
            subQuestionType: s.subQuestionType ?? (s.partId ? inferSubQuestionTypeFromPartId(s.partId) : 'calculation'),
        })),
    };
}

export async function createScenarioQuestion(
    ctx: MongoDalContext,
    input: CreateScenarioQuestionInput
): Promise<ScenarioQuestion> {
    const collection = await getScenarioQuestionsCollection(ctx, input.courseName);
    const now = new Date();

    // Append after existing questions in the same topic/week
    const sortOrder = await collection.countDocuments({ topicOrWeekId: input.topicOrWeekId });
    const difficulty: ScenarioDifficulty = input.difficulty ?? 'medium';
    const id = ctx.idGenerator.scenarioQuestionID(input.title, input.topicOrWeekId, input.courseName, now);

    // Server assigns subQuestionId and empty studentResponses — never trust LLM/client ids alone
    const subQuestions = normalizeScenarioSubQuestions(input.subQuestions, id, ctx.idGenerator, now);

    const question: ScenarioQuestion = {
        id,
        courseId: input.courseId,
        courseName: input.courseName,
        topicOrWeekId: input.topicOrWeekId,
        title: input.title,
        status: 'draft',
        sourcePrompt: input.sourcePrompt,
        questionBody: input.questionBody,
        solutionBody: input.solutionBody,
        subQuestions,
        difficulty,
        expectedTimeMinutes: input.expectedTimeMinutes ?? defaultExpectedTimeMinutes(difficulty, subQuestions.length),
        learningObjectives: normalizeLearningObjectives(input.learningObjectives ?? []),
        generatedBy: input.generatedBy,
        aiGenerationJobId: input.aiGenerationJobId,
        sortOrder,
        createdAt: now,
        updatedAt: now,
        publishedAt: null,
        createdByUserId: input.createdByUserId,
    };

    await collection.insertOne(question as any);
    return question;
}

export async function updateScenarioQuestion(
    ctx: MongoDalContext,
    courseName: string,
    questionId: string,
    patch: Partial<
        Pick<
            ScenarioQuestion,
            | 'title'
            | 'topicOrWeekId'
            | 'questionBody'
            | 'solutionBody'
            | 'subQuestions'
            | 'difficulty'
            | 'expectedTimeMinutes'
            | 'learningObjectives'
        >
    >,
    editedByUserId?: string
): Promise<ScenarioQuestion | null> {
    const collection = await getScenarioQuestionsCollection(ctx, courseName);
    const existing = await getScenarioQuestionById(ctx, courseName, questionId);
    if (!existing) return null;

    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.title !== undefined) update.title = patch.title;
    if (patch.topicOrWeekId !== undefined) update.topicOrWeekId = patch.topicOrWeekId;
    if (patch.questionBody !== undefined) update.questionBody = patch.questionBody;
    if (patch.solutionBody !== undefined) update.solutionBody = patch.solutionBody;
    if (patch.difficulty !== undefined) update.difficulty = patch.difficulty;
    if (patch.expectedTimeMinutes !== undefined) update.expectedTimeMinutes = patch.expectedTimeMinutes;
    if (patch.learningObjectives !== undefined) {
        update.learningObjectives = normalizeLearningObjectives(patch.learningObjectives);
    }
    if (patch.subQuestions !== undefined) {
        // Preserve existing studentResponses when instructor edits prompts
        const byId = new Map(existing.subQuestions.map((s) => [s.subQuestionId, s]));
        update.subQuestions = normalizeScenarioSubQuestions(
            patch.subQuestions.map((sub, index) => {
                const prior =
                    (sub.subQuestionId && byId.get(sub.subQuestionId)) ||
                    existing.subQuestions[index];
                return {
                    ...sub,
                    subQuestionId: sub.subQuestionId || prior?.subQuestionId,
                    studentResponses: prior?.studentResponses ?? [],
                };
            }),
            questionId,
            ctx.idGenerator
        );
    }
    if (editedByUserId) update.lastEditedByUserId = editedByUserId;

    const result = await collection.findOneAndUpdate(
        { id: questionId },
        { $set: update },
        { returnDocument: 'after' }
    );
    return result ? hydrateQuestion(result as unknown as ScenarioQuestion) : null;
}

export async function patchScenarioQuestionStatus(
    ctx: MongoDalContext,
    courseName: string,
    questionId: string,
    status: ScenarioQuestionStatus
): Promise<{ question?: ScenarioQuestion; error?: string }> {
    const existing = await getScenarioQuestionById(ctx, courseName, questionId);
    if (!existing) {
        return { error: 'Question not found' };
    }

    if (status === 'published') {
        const validationError = validatePublishScenarioQuestion(existing);
        if (validationError) {
            return { error: validationError };
        }
    }

    const collection = await getScenarioQuestionsCollection(ctx, courseName);
    const update: Record<string, unknown> = { status, updatedAt: new Date() };
    if (status === 'published' && !existing.publishedAt) {
        update.publishedAt = new Date();
    }

    const result = await collection.findOneAndUpdate(
        { id: questionId },
        { $set: update },
        { returnDocument: 'after' }
    );
    if (!result) {
        return { error: 'Question not found' };
    }
    return { question: hydrateQuestion(result as unknown as ScenarioQuestion) };
}

export async function deleteScenarioQuestion(
    ctx: MongoDalContext,
    courseName: string,
    questionId: string
): Promise<boolean> {
    const collection = await getScenarioQuestionsCollection(ctx, courseName);
    const result = await collection.deleteOne({ id: questionId });
    return result.deletedCount > 0;
}

// =====================================================
// Embedded studentResponses + solution gate
// =====================================================

/**
 * hasCompletedSubQuestion — at least one response for (studentUserId, mode) on one sub-question.
 */
export function hasCompletedSubQuestion(
    question: ScenarioQuestion,
    studentUserId: string,
    mode: ScenarioMode,
    subQuestionId: string
): boolean {
    const sub = question.subQuestions.find((s) => s.subQuestionId === subQuestionId);
    if (!sub) return false;
    return (sub.studentResponses ?? []).some((r) => r.studentUserId === studentUserId && r.mode === mode);
}

/**
 * hasCompletedAllSubQuestions — every sub-question has ≥1 response for (studentUserId, mode).
 */
export function hasCompletedAllSubQuestions(
    question: ScenarioQuestion,
    studentUserId: string,
    mode: ScenarioMode
): boolean {
    if (!question.subQuestions?.length) return false;
    return question.subQuestions.every((sub) =>
        (sub.studentResponses ?? []).some((r) => r.studentUserId === studentUserId && r.mode === mode)
    );
}

/**
 * assertDocumentGrowthAllowance — reject before Mongo 16 MiB hard limit.
 * @throws Error when the document is too large to safely append
 */
export async function assertDocumentGrowthAllowance(
    ctx: MongoDalContext,
    courseName: string,
    questionId: string,
    additionalBytesEstimate: number
): Promise<void> {
    const collection = await getScenarioQuestionsCollection(ctx, courseName);
    const docs = await collection
        .aggregate([{ $match: { id: questionId } }, { $project: { size: { $bsonSize: '$$ROOT' } } }])
        .toArray();
    const size = (docs[0] as any)?.size ?? 0;
    if (size + additionalBytesEstimate > SCENARIO_DOCUMENT_GROWTH_GUARD_BYTES) {
        throw new Error(
            'This scenario question has reached the maximum stored response history size. Contact your instructor.'
        );
    }
}

/**
 * appendStudentResponse — atomic positional $push to matched subQuestionId.
 * Server builds the full record; callers must not supply grade/feedback/ids from the browser.
 */
export async function appendStudentResponse(
    ctx: MongoDalContext,
    courseName: string,
    questionId: string,
    subQuestionId: string,
    response: ScenarioStudentResponse
): Promise<void> {
    // Guard against Mongo 16 MiB document limit before append
    const estimate = Buffer.byteLength(JSON.stringify(response), 'utf8') + 64;
    await assertDocumentGrowthAllowance(ctx, courseName, questionId, estimate);

    // Positional $push targets the sub-question matched by subQuestionId
    const collection = await getScenarioQuestionsCollection(ctx, courseName);
    const result = await collection.updateOne(
        { id: questionId, 'subQuestions.subQuestionId': subQuestionId },
        {
            $push: { 'subQuestions.$.studentResponses': response as any },
            $set: { updatedAt: new Date() },
        }
    );
    if (result.matchedCount === 0) {
        throw new Error(`Sub-question ${subQuestionId} not found on question ${questionId}`);
    }
}

/**
 * appendExamResponses — validate growth once, then push each response (all-or-nothing best effort:
 * grades are already validated before this call; failures after partial push are logged).
 */
export async function appendExamResponses(
    ctx: MongoDalContext,
    courseName: string,
    questionId: string,
    items: Array<{ subQuestionId: string; response: ScenarioStudentResponse }>
): Promise<void> {
    const estimate = items.reduce(
        (acc, item) => acc + Buffer.byteLength(JSON.stringify(item.response), 'utf8') + 64,
        0
    );
    await assertDocumentGrowthAllowance(ctx, courseName, questionId, estimate);

    for (const item of items) {
        await appendStudentResponse(ctx, courseName, questionId, item.subQuestionId, item.response);
    }
}

/**
 * getStudentResponsesForQuestion — returns only the caller's embedded response records.
 */
export async function getStudentResponsesForQuestion(
    ctx: MongoDalContext,
    courseName: string,
    questionId: string,
    studentUserId: string
): Promise<Array<ScenarioStudentResponse & { subQuestionId: string }>> {
    const question = await getScenarioQuestionById(ctx, courseName, questionId);
    if (!question) return [];
    const out: Array<ScenarioStudentResponse & { subQuestionId: string }> = [];
    for (const sub of question.subQuestions) {
        for (const response of sub.studentResponses ?? []) {
            if (response.studentUserId === studentUserId) {
                out.push({ ...response, subQuestionId: sub.subQuestionId });
            }
        }
    }
    return out;
}
