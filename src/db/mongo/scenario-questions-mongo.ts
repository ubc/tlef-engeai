// scenario-questions-mongo.ts
/**
 * scenario-questions-mongo.ts
 * @author @gatahcha
 * @description Practice Scenarios / Scenario Questions — CRUD, publish validation, and the
 * per-student check-answer progress gate stored in each course's `{courseName}_scenario_questions`
 * collection (questions) and `{courseName}_users` collection (`CourseUser.scenarioProgress`, gate
 * only — see planner/improved-scenario-generation-deliverables.md §5.5).
 *
 * SQ-001 lazy migration: `ensureScenarioQuestionsCollection` provisions the collection and
 * `activeCourse.collections.scenarioQuestions` on first access for courses created before this
 * feature shipped. New courses get it eagerly in `postActiveCourse` (course-mongo.ts).
 */

import type { Collection } from 'mongodb';
import {
    activeCourse,
    REQUIRED_SCENARIO_PART_IDS,
    ScenarioAnswerVerdict,
    ScenarioPartId,
    ScenarioPracticeProgress,
    ScenarioQuestion,
    ScenarioQuestionForStudent,
    ScenarioQuestionStatus
} from '../../types/shared';
import { getCollectionNames } from './collection-registry-mongo';
import { getCourseUsersMongoCollection } from './course-user-mongo';
import { activeCourseListCollection } from './mongo-collections';
import type { MongoDalContext } from './mongo-context';
import { fetchActiveCourseDocById } from './active-course-queries-mongo';
import { appLogger } from '../../utils/logger';

/** Input accepted by `createScenarioQuestion` — server computes id, sortOrder, timestamps, status. */
export interface CreateScenarioQuestionInput {
    courseId: string;
    courseName: string;
    topicOrWeekId: string;
    title: string;
    sourcePrompt: string;
    questionBody: string;
    solutionBody: string;
    subQuestions: ScenarioQuestion['subQuestions'];
    generatedBy: 'instructor' | 'ai';
    aiGenerationJobId?: string;
    createdByUserId: string;
}

/**
 * getScenarioQuestionsCollection
 *
 * Resolves the `{courseName}_scenario_questions` collection via `getCollectionNames`.
 *
 * @internal
 */
async function getScenarioQuestionsCollection(ctx: MongoDalContext, courseName: string): Promise<Collection> {
    const collections = await getCollectionNames(ctx, courseName);
    return ctx.db.collection(collections.scenarioQuestions);
}

/**
 * createScenarioQuestionIndexes
 *
 * Best-effort index creation — failures are logged, never thrown (collection still usable).
 *
 * @internal
 */
async function createScenarioQuestionIndexes(ctx: MongoDalContext, courseName: string): Promise<void> {
    try {
        const collection = await getScenarioQuestionsCollection(ctx, courseName);
        await collection.createIndex({ id: 1 }, { name: 'id_unique', unique: true, background: true });
        await collection.createIndex(
            { topicOrWeekId: 1, status: 1, sortOrder: 1 },
            { name: 'chapter_status_sort', background: true }
        );
        await collection.createIndex({ status: 1 }, { name: 'status', background: true });
    } catch (error) {
        appLogger.warn(`[scenario-questions] Index creation warning for ${courseName}:`, error);
    }
}

/**
 * ensureScenarioQuestionsCollection
 *
 * SQ-001 lazy migration: creates `{courseName}_scenario_questions` and persists
 * `activeCourse.collections.scenarioQuestions` the first time any scenario-questions API is hit for
 * a course that predates this feature. Idempotent — no-op once the field is set.
 *
 * @param ctx - MongoDalContext
 * @param courseId - `activeCourse.id`
 * @returns The resolved `courseName` for convenience (callers already have it in most call sites).
 */
export async function ensureScenarioQuestionsCollection(ctx: MongoDalContext, courseId: string): Promise<string> {
    const course = (await fetchActiveCourseDocById(ctx.db, courseId)) as activeCourse | null;
    if (!course) {
        throw new Error(`Course with id ${courseId} not found`);
    }

    const courseName = course.courseName;
    if (course.collections?.scenarioQuestions) {
        return courseName;
    }

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

    await createScenarioQuestionIndexes(ctx, courseName);
    return courseName;
}

/**
 * toStudentProjection
 *
 * Strips `solutionBody` and every `modelAnswer` — the only place instructor-only content is
 * removed before a document reaches a student response.
 */
export function toStudentProjection(question: ScenarioQuestion): ScenarioQuestionForStudent {
    const { solutionBody, subQuestions, ...rest } = question;
    return {
        ...rest,
        subQuestions: subQuestions.map(({ modelAnswer, ...sub }) => ({ ...sub }))
    };
}

/**
 * validatePublishScenarioQuestion
 *
 * Pure server-side publish gate (T-B06–T-B09): parts (a)(b)(c) must exist with non-empty
 * `prompt` + `modelAnswer`; `questionBody` must be non-empty. Part (d) is optional (E-08).
 *
 * @returns `null` when valid, otherwise a human-readable error message.
 */
export function validatePublishScenarioQuestion(question: Pick<ScenarioQuestion, 'questionBody' | 'subQuestions'>): string | null {
    if (!question.questionBody?.trim()) {
        return 'Question narrative must not be empty before publishing.';
    }
    for (const part of REQUIRED_SCENARIO_PART_IDS) {
        const sub = question.subQuestions.find((s) => s.partId === part);
        if (!sub || !sub.prompt?.trim() || !sub.modelAnswer?.trim()) {
            return `Part (${part}) must have a prompt and model answer before publishing.`;
        }
    }
    return null;
}

/**
 * listScenarioQuestions
 *
 * Instructor list — all statuses; optional `status` / `topicOrWeekId` filters (§7).
 */
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
    return docs as unknown as ScenarioQuestion[];
}

/**
 * listPublishedScenarioQuestionsForStudent
 *
 * Student list — `status: 'published'` only (T-B01); optionally scoped to one chapter.
 */
export async function listPublishedScenarioQuestionsForStudent(
    ctx: MongoDalContext,
    courseName: string,
    topicOrWeekId?: string
): Promise<ScenarioQuestionForStudent[]> {
    const collection = await getScenarioQuestionsCollection(ctx, courseName);
    const query: Record<string, unknown> = { status: 'published' };
    if (topicOrWeekId) query.topicOrWeekId = topicOrWeekId;
    const docs = await collection.find(query).sort({ topicOrWeekId: 1, sortOrder: 1 }).toArray();
    return (docs as unknown as ScenarioQuestion[]).map(toStudentProjection);
}

/** Raw fetch (instructor) — no status filtering. `null` when not found. */
export async function getScenarioQuestionById(
    ctx: MongoDalContext,
    courseName: string,
    questionId: string
): Promise<ScenarioQuestion | null> {
    const collection = await getScenarioQuestionsCollection(ctx, courseName);
    const doc = await collection.findOne({ id: questionId });
    return (doc as unknown as ScenarioQuestion) ?? null;
}

/**
 * getPublishedScenarioQuestionForStudent
 *
 * Student single-question fetch. Returns `null` for missing **or draft/rejected** questions so
 * callers can respond 404 either way (D5/E-01 — never leak draft existence via 403 vs 404).
 */
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

/** Creates a new question document (draft by default) — used by both manual create and AI generation. */
export async function createScenarioQuestion(
    ctx: MongoDalContext,
    input: CreateScenarioQuestionInput
): Promise<ScenarioQuestion> {
    const collection = await getScenarioQuestionsCollection(ctx, input.courseName);
    const now = new Date();
    const sortOrder = await collection.countDocuments({ topicOrWeekId: input.topicOrWeekId });

    const question: ScenarioQuestion = {
        id: ctx.idGenerator.scenarioQuestionID(input.title, input.topicOrWeekId, input.courseName, now),
        courseId: input.courseId,
        courseName: input.courseName,
        topicOrWeekId: input.topicOrWeekId,
        title: input.title,
        status: 'draft',
        sourcePrompt: input.sourcePrompt,
        questionBody: input.questionBody,
        solutionBody: input.solutionBody,
        subQuestions: input.subQuestions,
        generatedBy: input.generatedBy,
        aiGenerationJobId: input.aiGenerationJobId,
        sortOrder,
        createdAt: now,
        updatedAt: now,
        publishedAt: null,
        createdByUserId: input.createdByUserId
    };

    await collection.insertOne(question as any);
    return question;
}

/** Generic instructor edit (title, chapter, narrative, parts, …) — does not itself change `status`. */
export async function updateScenarioQuestion(
    ctx: MongoDalContext,
    courseName: string,
    questionId: string,
    patch: Partial<Pick<ScenarioQuestion, 'title' | 'topicOrWeekId' | 'questionBody' | 'solutionBody' | 'subQuestions'>>,
    editedByUserId?: string
): Promise<ScenarioQuestion | null> {
    const collection = await getScenarioQuestionsCollection(ctx, courseName);
    const update: Record<string, unknown> = { ...patch, updatedAt: new Date() };
    if (editedByUserId) update.lastEditedByUserId = editedByUserId;

    const result = await collection.findOneAndUpdate(
        { id: questionId },
        { $set: update },
        { returnDocument: 'after' }
    );
    return (result as unknown as ScenarioQuestion) ?? null;
}

/**
 * patchScenarioQuestionStatus
 *
 * `draft` / `published` / `rejected` transitions. Publishing re-runs
 * `validatePublishScenarioQuestion` server-side (never trust the client) and stamps
 * `publishedAt` on first publish only.
 */
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
    return { question: result as unknown as ScenarioQuestion };
}

/** Hard delete — instructor only (route enforces RBAC). */
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
// Practice progress — solution reveal gate (CourseUser.scenarioProgress)
// =====================================================

/** Returns the student's progress entry for one question, or `null` when never attempted. */
export async function getScenarioProgress(
    ctx: MongoDalContext,
    courseName: string,
    userId: string,
    questionId: string
): Promise<ScenarioPracticeProgress | null> {
    const usersCollection = await getCourseUsersMongoCollection(ctx, courseName);
    const doc = await usersCollection.findOne(
        { userId },
        { projection: { scenarioProgress: 1 } }
    );
    const progress = (doc as any)?.scenarioProgress as ScenarioPracticeProgress[] | undefined;
    return progress?.find((p) => p.questionId === questionId) ?? null;
}

/**
 * True once every part in {@link REQUIRED_SCENARIO_PART_IDS} has been checked at least once —
 * powers the gated `/solution` endpoint (T-B17, E-12). Flexible order: any part may be checked
 * first (locked product decision), so this only checks set membership, not sequence.
 */
export function hasCheckedAllRequiredParts(progress: ScenarioPracticeProgress | null): boolean {
    if (!progress) {
        return false;
    }
    const checked = new Set(progress.checkedPartIds);
    return REQUIRED_SCENARIO_PART_IDS.every((part) => checked.has(part));
}

/**
 * recordScenarioPartCheck
 *
 * Upserts the student's progress for one part after a check-answer call (E-04: latest verdict
 * wins, allowed to re-check). Two-step update (match existing array element, else push a new one)
 * — acceptable race window for this ungraded, per-student, low-contention practice feature.
 */
export async function recordScenarioPartCheck(
    ctx: MongoDalContext,
    courseName: string,
    userId: string,
    questionId: string,
    partId: ScenarioPartId,
    verdict: ScenarioAnswerVerdict
): Promise<void> {
    const usersCollection = await getCourseUsersMongoCollection(ctx, courseName);

    const updateExisting = await usersCollection.updateOne(
        { userId, 'scenarioProgress.questionId': questionId },
        {
            $addToSet: { 'scenarioProgress.$.checkedPartIds': partId },
            $set: { [`scenarioProgress.$.lastVerdictByPart.${partId}`]: verdict }
        }
    );

    if (updateExisting.matchedCount === 0) {
        const newEntry: ScenarioPracticeProgress = {
            questionId,
            checkedPartIds: [partId],
            lastVerdictByPart: { [partId]: verdict }
        };
        await usersCollection.updateOne(
            { userId },
            { $push: { scenarioProgress: newEntry as any } }
        );
    }
}

/** Stamps `solutionViewedAt` the first time a student successfully unlocks the solution reveal. */
export async function markScenarioSolutionViewed(
    ctx: MongoDalContext,
    courseName: string,
    userId: string,
    questionId: string
): Promise<void> {
    const usersCollection = await getCourseUsersMongoCollection(ctx, courseName);
    await usersCollection.updateOne(
        { userId, 'scenarioProgress.questionId': questionId },
        { $set: { 'scenarioProgress.$.solutionViewedAt': new Date() } }
    );
}
