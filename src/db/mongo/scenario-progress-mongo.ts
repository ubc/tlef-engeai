/**
 * Scenario Progress Mongo — student draft answer storage
 *
 * Domain logic for `{courseName}_scenario_progress`. Drafts are separate from embedded
 * `studentResponses[]` so instructors never see in-progress work.
 *
 * SQ-004: lazy collection provision on first progress API call.
 *
 * @author: @gatahcha
 * @date: 2026-07-21
 * @version: 1.0.0
 * @description: Upsert/get/delete student scenario draft progress per question and mode.
 */

import type { Collection } from 'mongodb';
import {
    activeCourse,
    ScenarioMode,
    ScenarioProgressAnswer,
    ScenarioStudentProgress,
} from '../../types/shared';
import { getCollectionNames } from './collection-registry-mongo';
import { activeCourseListCollection } from './mongo-collections';
import type { MongoDalContext } from './mongo-context';
import { fetchActiveCourseDocById } from './active-course-queries-mongo';
import { createScenarioProgressIndexes } from './scenario-progress-indexes';
import { appLogger } from '../../utils/logger';

export interface UpsertScenarioStudentProgressInput {
    userId: string;
    questionId: string;
    mode: ScenarioMode;
    answers: ScenarioProgressAnswer[];
    validSubQuestionIds: Set<string>;
}

/**
 * filterProgressAnswers — keep only answers whose subQuestionId exists on the published question.
 */
export function filterProgressAnswers(
    answers: ScenarioProgressAnswer[],
    validSubQuestionIds: Set<string>
): ScenarioProgressAnswer[] {
    return answers.filter((a) => validSubQuestionIds.has(a.subQuestionId.trim()));
}

async function getScenarioProgressCollection(ctx: MongoDalContext, courseName: string): Promise<Collection> {
    const collections = await getCollectionNames(ctx, courseName);
    return ctx.db.collection(collections.scenarioProgress);
}

/**
 * ensureScenarioProgressCollection — SQ-004 lazy migration for pre-feature courses.
 */
export async function ensureScenarioProgressCollection(ctx: MongoDalContext, courseId: string): Promise<string> {
    const course = (await fetchActiveCourseDocById(ctx.db, courseId)) as activeCourse | null;
    if (!course) {
        throw new Error(`Course with id ${courseId} not found`);
    }

    const courseName = course.courseName;

    if (course.collections?.scenarioProgress) {
        return courseName;
    }

    const collectionName = `${courseName}_scenario_progress`;
    try {
        await ctx.db.createCollection(collectionName);
    } catch (error: any) {
        if (error?.codeName !== 'NamespaceExists') throw error;
    }

    await activeCourseListCollection(ctx.db).updateOne(
        { id: courseId },
        { $set: { 'collections.scenarioProgress': collectionName } }
    );
    ctx.collectionNamesCache.delete(courseName);
    appLogger.log(`[scenario-progress] SQ-004 lazy migration: provisioned ${collectionName} for course ${courseName}`);

    const collection = await getScenarioProgressCollection(ctx, courseName);
    await createScenarioProgressIndexes(collection, courseName);
    return courseName;
}

/**
 * upsertScenarioStudentProgress - Upsert draft answers for one student+question+mode.
 *
 * Filters answers to valid sub-question ids before persist.
 *
 * @param ctx - MongoDalContext
 * @param courseName - Course namespace
 * @param input - Draft payload with validSubQuestionIds for filtering
 * @returns Persisted progress document
 */
export async function upsertScenarioStudentProgress(
    ctx: MongoDalContext,
    courseName: string,
    input: UpsertScenarioStudentProgressInput
): Promise<ScenarioStudentProgress> {
    const now = new Date();
    const answers = filterProgressAnswers(input.answers, input.validSubQuestionIds);
    const doc: ScenarioStudentProgress = {
        userId: input.userId,
        questionId: input.questionId,
        mode: input.mode,
        answers,
        updatedAt: now,
    };

    const collection = await getScenarioProgressCollection(ctx, courseName);
    await collection.updateOne(
        { userId: input.userId, questionId: input.questionId, mode: input.mode },
        { $set: doc },
        { upsert: true }
    );
    return doc;
}

/**
 * getScenarioStudentProgress - Load one draft document or null when missing.
 */
export async function getScenarioStudentProgress(
    ctx: MongoDalContext,
    courseName: string,
    userId: string,
    questionId: string,
    mode: ScenarioMode
): Promise<ScenarioStudentProgress | null> {
    const collection = await getScenarioProgressCollection(ctx, courseName);
    const doc = await collection.findOne({ userId, questionId, mode });
    if (!doc) return null;
    return doc as unknown as ScenarioStudentProgress;
}

/**
 * deleteScenarioStudentProgress - Remove draft after exam submit or explicit clear.
 */
export async function deleteScenarioStudentProgress(
    ctx: MongoDalContext,
    courseName: string,
    userId: string,
    questionId: string,
    mode: ScenarioMode
): Promise<void> {
    const collection = await getScenarioProgressCollection(ctx, courseName);
    await collection.deleteOne({ userId, questionId, mode });
}
