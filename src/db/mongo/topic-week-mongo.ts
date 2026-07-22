// topic-week-mongo.ts
/**
 * topic-week-mongo.ts
 * @author @gatahcha (refactor)
 * @description Mutations and reads for **embedded** topic/week graphs on `active-course-list` documents (`topicOrWeekInstances`, LOs, materials).
 *
 * Uses positional `arrayFilters` for deep updates; `addContentItem` still does read-modify-write for legacy reasons.
 */

import type {
    activeCourse,
    AdditionalMaterial,
    InstructorStruggleTopic,
    InstructorStruggleTopicForDisplay,
    LearningObjective,
    LearningObjectiveForDisplay,
    TopicOrWeekInstance
} from '../../types/shared';
import type { MongoDalContext } from './mongo-context';

/** Result of a catalog mutation that may no-op when nothing changed. */
export type CatalogWriteResult<T> = {
    changed: boolean;
    data: T;
};

function orderedIdsMatch(currentIds: string[], orderedIds: string[]): boolean {
    return (
        currentIds.length === orderedIds.length &&
        currentIds.every((id, index) => id === orderedIds[index])
    );
}
import { activeCourseListCollection } from './mongo-collections';
import { getActiveCourse, updateActiveCourse } from './course-mongo';
import { appLogger } from '../../utils/logger';

/**
 * addLearningObjective
 *
 * `$push` one learning objective onto a specific content item within a topic/week instance.
 *
 * @param ctx - MongoDalContext
 * @param courseId - string — `activeCourse.id`
 * @param topicOrWeekId - string — nested `topicOrWeekInstances.id`
 * @param contentId - string — nested `items.id`
 * @param learningObjective - `any` — payload stored in `learningObjectives[]` (legacy typed loose)
 *
 * @returns `findOneAndUpdate` result (post-update document per driver options)
 *
 * Actions:
 * - Match course + topic + item path, push into `learningObjectives`, set top-level `updatedAt`.
 */
export async function addLearningObjective(
    ctx: MongoDalContext,
    courseId: string,
    topicOrWeekId: string,
    contentId: string,
    learningObjective: any
) {
    appLogger.log('🎯 [MONGODB] addLearningObjective called with:', {
        courseId,
        topicOrWeekId,
        contentId,
        learningObjective
    });
    const result = await activeCourseListCollection(ctx.db).findOneAndUpdate(
        {
            id: courseId,
            'topicOrWeekInstances.id': topicOrWeekId,
            'topicOrWeekInstances.items.id': contentId
        },
        {
            $push: {
                'topicOrWeekInstances.$[instance].items.$[item].learningObjectives': learningObjective
            },
            $set: { updatedAt: Date.now().toString() }
        },
        {
            arrayFilters: [{ 'instance.id': topicOrWeekId }, { 'item.id': contentId }],
            returnDocument: 'after'
        }
    );
    appLogger.log('✅ [MONGODB] addLearningObjective result:', result);
    return result;
}

/**
 * updateLearningObjective
 *
 * Patches the textual `LearningObjective` field and objective-level `updatedAt` for one LO id.
 *
 * @param ctx - MongoDalContext
 * @param courseId - string
 * @param topicOrWeekId - string
 * @param contentId - string
 * @param objectiveId - string — LO id inside `learningObjectives`
 * @param updateData - `any` — expects at least `{ LearningObjective }` (legacy shape)
 *
 * @returns `findOneAndUpdate` post image
 */
export async function updateLearningObjective(
    ctx: MongoDalContext,
    courseId: string,
    topicOrWeekId: string,
    contentId: string,
    objectiveId: string,
    updateData: any
): Promise<CatalogWriteResult<LearningObjective | null>> {
    const course = await getActiveCourse(ctx, courseId);
    const contentItem = course?.topicOrWeekInstances
        ?.find((d) => d.id === topicOrWeekId)
        ?.items?.find((item) => item.id === contentId);
    const existing = contentItem?.learningObjectives?.find((o) => o.id === objectiveId);

    if (!existing) {
        return { changed: false, data: null };
    }

    const nextText = (updateData.LearningObjective ?? '').toString().trim();
    if (existing.LearningObjective === nextText) {
        return { changed: false, data: existing };
    }

    const result = await activeCourseListCollection(ctx.db).findOneAndUpdate(
        {
            id: courseId,
            'topicOrWeekInstances.id': topicOrWeekId,
            'topicOrWeekInstances.items.id': contentId,
            'topicOrWeekInstances.items.learningObjectives.id': objectiveId
        },
        {
            $set: {
                'topicOrWeekInstances.$[instance].items.$[item].learningObjectives.$[objective].LearningObjective':
                    nextText,
                'topicOrWeekInstances.$[instance].items.$[item].learningObjectives.$[objective].updatedAt':
                    Date.now().toString(),
                updatedAt: Date.now().toString()
            }
        },
        {
            arrayFilters: [
                { 'instance.id': topicOrWeekId },
                { 'item.id': contentId },
                { 'objective.id': objectiveId }
            ],
            returnDocument: 'after'
        }
    );

    const courseAfter = result as activeCourse | null;
    const updated =
        courseAfter?.topicOrWeekInstances
            ?.find((d) => d.id === topicOrWeekId)
            ?.items?.find((item) => item.id === contentId)
            ?.learningObjectives?.find((o) => o.id === objectiveId) ?? null;

    return { changed: true, data: updated };
}

/**
 * deleteLearningObjective
 *
 * Removes one learning objective row via `$pull`.
 *
 * @param ctx - MongoDalContext
 * @param courseId - string
 * @param topicOrWeekId - string
 * @param contentId - string
 * @param objectiveId - string — id to pull from `learningObjectives`
 *
 * @returns `findOneAndUpdate` post image
 */
export async function deleteLearningObjective(
    ctx: MongoDalContext,
    courseId: string,
    topicOrWeekId: string,
    contentId: string,
    objectiveId: string
): Promise<CatalogWriteResult<activeCourse | null>> {
    appLogger.log('🗑️ [MONGODB] deleteLearningObjective called with:', {
        courseId,
        topicOrWeekId,
        contentId,
        objectiveId
    });

    const course = await getActiveCourse(ctx, courseId);
    const contentItem = course?.topicOrWeekInstances
        ?.find((d) => d.id === topicOrWeekId)
        ?.items?.find((item) => item.id === contentId);
    const exists = contentItem?.learningObjectives?.some((o) => o.id === objectiveId) ?? false;

    if (!exists) {
        appLogger.log('✅ [MONGODB] deleteLearningObjective no-op (id not found)');
        return { changed: false, data: course ?? null };
    }

    const result = await activeCourseListCollection(ctx.db).findOneAndUpdate(
        {
            id: courseId,
            'topicOrWeekInstances.id': topicOrWeekId,
            'topicOrWeekInstances.items.id': contentId
        },
        {
            $pull: {
                'topicOrWeekInstances.$[instance].items.$[item].learningObjectives': { id: objectiveId }
            } as any,
            $set: { updatedAt: Date.now().toString() }
        },
        {
            arrayFilters: [{ 'instance.id': topicOrWeekId }, { 'item.id': contentId }],
            returnDocument: 'after'
        }
    );
    appLogger.log('✅ [MONGODB] deleteLearningObjective result:', result);
    return { changed: true, data: (result as activeCourse | null) };
}

/** Thrown when `orderedIds` is not an exact permutation of current learning objective ids. */
export class InvalidLearningObjectiveReorderError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'InvalidLearningObjectiveReorderError';
    }
}

/**
 * reorderLearningObjectives
 *
 * Rewrites `learningObjectives[]` in the order given by `orderedIds`.
 */
export async function reorderLearningObjectives(
    ctx: MongoDalContext,
    courseId: string,
    topicOrWeekId: string,
    contentId: string,
    orderedIds: string[]
): Promise<CatalogWriteResult<LearningObjective[]>> {
    const course = await getActiveCourse(ctx, courseId);
    if (!course) {
        throw new Error(`Course with id ${courseId} not found`);
    }

    const instance = course.topicOrWeekInstances?.find((d) => d.id === topicOrWeekId);
    if (!instance) {
        throw new Error(`Topic/Week instance with id ${topicOrWeekId} not found`);
    }

    const contentItem = instance.items?.find((item) => item.id === contentId);
    if (!contentItem) {
        throw new Error(`Content item with id ${contentId} not found`);
    }

    const currentObjectives = contentItem.learningObjectives ?? [];

    if (orderedIds.length !== currentObjectives.length) {
        throw new InvalidLearningObjectiveReorderError(
            `orderedIds length (${orderedIds.length}) must match current learning objective count (${currentObjectives.length})`
        );
    }

    if (orderedIds.length === 0) {
        return { changed: false, data: [] };
    }

    const objectiveById = new Map(currentObjectives.map((objective) => [objective.id, objective]));
    const seen = new Set<string>();
    const reordered: LearningObjective[] = [];

    for (const id of orderedIds) {
        if (seen.has(id)) {
            throw new InvalidLearningObjectiveReorderError(`Duplicate id in orderedIds: ${id}`);
        }
        const objective = objectiveById.get(id);
        if (!objective) {
            throw new InvalidLearningObjectiveReorderError(`Unknown learning objective id: ${id}`);
        }
        seen.add(id);
        reordered.push(objective);
    }

    const currentIds = currentObjectives.map((o) => o.id);
    if (orderedIdsMatch(currentIds, orderedIds)) {
        return { changed: false, data: currentObjectives };
    }

    await activeCourseListCollection(ctx.db).findOneAndUpdate(
        {
            id: courseId,
            'topicOrWeekInstances.id': topicOrWeekId,
            'topicOrWeekInstances.items.id': contentId
        },
        {
            $set: {
                'topicOrWeekInstances.$[instance].items.$[item].learningObjectives': reordered,
                updatedAt: Date.now().toString()
            }
        },
        {
            arrayFilters: [{ 'instance.id': topicOrWeekId }, { 'item.id': contentId }],
            returnDocument: 'after'
        }
    );

    return { changed: true, data: reordered };
}

/** Thrown when `orderedIds` is not an exact permutation of current topic/week instance ids. */
export class InvalidTopicOrWeekInstanceReorderError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'InvalidTopicOrWeekInstanceReorderError';
    }
}

/**
 * reorderTopicOrWeekInstances
 *
 * Rewrites `topicOrWeekInstances[]` in the order given by `orderedIds`.
 */
export async function reorderTopicOrWeekInstances(
    ctx: MongoDalContext,
    courseId: string,
    orderedIds: string[]
): Promise<CatalogWriteResult<TopicOrWeekInstance[]>> {
    const course = await getActiveCourse(ctx, courseId);
    if (!course) {
        throw new Error(`Course with id ${courseId} not found`);
    }

    const currentInstances = (course.topicOrWeekInstances ?? []) as TopicOrWeekInstance[];

    if (orderedIds.length !== currentInstances.length) {
        throw new InvalidTopicOrWeekInstanceReorderError(
            `orderedIds length (${orderedIds.length}) must match current topic/week instance count (${currentInstances.length})`
        );
    }

    if (orderedIds.length === 0) {
        return { changed: false, data: [] };
    }

    const instanceById = new Map(currentInstances.map((instance) => [instance.id, instance]));
    const seen = new Set<string>();
    const reordered: TopicOrWeekInstance[] = [];

    for (const id of orderedIds) {
        if (seen.has(id)) {
            throw new InvalidTopicOrWeekInstanceReorderError(`Duplicate id in orderedIds: ${id}`);
        }
        const instance = instanceById.get(id);
        if (!instance) {
            throw new InvalidTopicOrWeekInstanceReorderError(`Unknown topic/week instance id: ${id}`);
        }
        seen.add(id);
        reordered.push(instance);
    }

    const currentIds = currentInstances.map((i) => i.id);
    if (orderedIdsMatch(currentIds, orderedIds)) {
        return { changed: false, data: currentInstances };
    }

    await updateActiveCourse(ctx, courseId, {
        topicOrWeekInstances: reordered as activeCourse['topicOrWeekInstances']
    });

    return { changed: true, data: reordered };
}

/**
 * getAllLearningObjectives
 *
 * Aggregation that **flattens** every nested LO with parent titles for roster-style UI/API responses.
 *
 * @param ctx - MongoDalContext
 * @param courseId - string
 *
 * @returns Promise<LearningObjectiveForDisplay[]>
 *
 * Actions:
 * - `$match` → `$unwind` instances/items/objectives → `$project` with `topicOrWeekTitle`, `itemTitle`, `LearningObjective` text.
 */
export async function getAllLearningObjectives(
    ctx: MongoDalContext,
    courseId: string
): Promise<LearningObjectiveForDisplay[]> {
    const results = await activeCourseListCollection(ctx.db).aggregate<LearningObjectiveForDisplay>([
        { $match: { id: courseId } },
        { $unwind: '$topicOrWeekInstances' },
        { $unwind: '$topicOrWeekInstances.items' },
        { $unwind: '$topicOrWeekInstances.items.learningObjectives' },
        {
            $project: {
                _id: 0,
                LearningObjective: '$topicOrWeekInstances.items.learningObjectives.LearningObjective',
                topicOrWeekTitle: { $ifNull: ['$topicOrWeekInstances.title', ''] },
                itemTitle: {
                    $ifNull: [
                        '$topicOrWeekInstances.items.itemTitle',
                        { $ifNull: ['$topicOrWeekInstances.items.title', ''] }
                    ]
                }
            }
        }
    ]).toArray();
    return results;
}

/**
 * getAllLearningObjectivesWithIds — flatten every LO with parent titles and catalog objectiveId.
 */
export async function getAllLearningObjectivesWithIds(
    ctx: MongoDalContext,
    courseId: string
): Promise<
    Array<{
        objectiveId: string;
        text: string;
        topicOrWeekTitle: string;
        itemTitle: string;
    }>
> {
    const results = await activeCourseListCollection(ctx.db)
        .aggregate<{
            objectiveId: string;
            text: string;
            topicOrWeekTitle: string;
            itemTitle: string;
        }>([
            { $match: { id: courseId } },
            { $unwind: '$topicOrWeekInstances' },
            { $unwind: '$topicOrWeekInstances.items' },
            { $unwind: '$topicOrWeekInstances.items.learningObjectives' },
            {
                $project: {
                    _id: 0,
                    objectiveId: '$topicOrWeekInstances.items.learningObjectives.id',
                    text: '$topicOrWeekInstances.items.learningObjectives.LearningObjective',
                    topicOrWeekTitle: { $ifNull: ['$topicOrWeekInstances.title', ''] },
                    itemTitle: {
                        $ifNull: [
                            '$topicOrWeekInstances.items.itemTitle',
                            { $ifNull: ['$topicOrWeekInstances.items.title', ''] },
                        ],
                    },
                },
            },
        ])
        .toArray();
    return results.filter((r) => !!r.objectiveId && !!r.text?.trim());
}

/**
 * getLearningObjectivesForTopicOrWeek — flatten LOs for one topic/week for Scenario Questions catalog UI.
 *
 * @returns ScenarioLearningObjectiveOption[] with objectiveId, text, and parent titles
 */
export async function getLearningObjectivesForTopicOrWeek(
    ctx: MongoDalContext,
    courseId: string,
    topicOrWeekId: string
): Promise<
    Array<{
        objectiveId: string;
        text: string;
        topicOrWeekId: string;
        topicOrWeekTitle: string;
        itemId: string;
        itemTitle: string;
    }>
> {
    const results = await activeCourseListCollection(ctx.db)
        .aggregate<{
            objectiveId: string;
            text: string;
            topicOrWeekId: string;
            topicOrWeekTitle: string;
            itemId: string;
            itemTitle: string;
        }>([
            { $match: { id: courseId } },
            { $unwind: '$topicOrWeekInstances' },
            { $match: { 'topicOrWeekInstances.id': topicOrWeekId } },
            { $unwind: '$topicOrWeekInstances.items' },
            { $unwind: '$topicOrWeekInstances.items.learningObjectives' },
            {
                $project: {
                    _id: 0,
                    objectiveId: '$topicOrWeekInstances.items.learningObjectives.id',
                    text: '$topicOrWeekInstances.items.learningObjectives.LearningObjective',
                    topicOrWeekId: '$topicOrWeekInstances.id',
                    topicOrWeekTitle: { $ifNull: ['$topicOrWeekInstances.title', ''] },
                    itemId: '$topicOrWeekInstances.items.id',
                    itemTitle: {
                        $ifNull: [
                            '$topicOrWeekInstances.items.itemTitle',
                            { $ifNull: ['$topicOrWeekInstances.items.title', ''] },
                        ],
                    },
                },
            },
        ])
        .toArray();
    return results.filter((r) => !!r.objectiveId && !!r.text);
}

/**
 * addInstructorStruggleTopic
 *
 * `$push` one instructor struggle topic onto a specific content item within a topic/week instance.
 *
 * @param ctx - MongoDalContext
 * @param courseId - string — `activeCourse.id`
 * @param topicOrWeekId - string — nested `topicOrWeekInstances.id`
 * @param contentId - string — nested `items.id`
 * @param struggleTopic - `InstructorStruggleTopic` payload stored in `instructorStruggleTopics[]`
 *
 * @returns `findOneAndUpdate` result (post-update document per driver options)
 *
 * Actions:
 * - Match course + topic + item path, push into `instructorStruggleTopics`, set top-level `updatedAt`.
 */
export async function addInstructorStruggleTopic(
    ctx: MongoDalContext,
    courseId: string,
    topicOrWeekId: string,
    contentId: string,
    struggleTopic: any
) {
    const result = await activeCourseListCollection(ctx.db).findOneAndUpdate(
        {
            id: courseId,
            'topicOrWeekInstances.id': topicOrWeekId,
            'topicOrWeekInstances.items.id': contentId
        },
        {
            $push: {
                'topicOrWeekInstances.$[instance].items.$[item].instructorStruggleTopics': struggleTopic
            },
            $set: { updatedAt: Date.now().toString() }
        },
        {
            arrayFilters: [{ 'instance.id': topicOrWeekId }, { 'item.id': contentId }],
            returnDocument: 'after'
        }
    );
    return result;
}

/**
 * updateInstructorStruggleTopic
 *
 * Patches the textual `struggleTopic` field and entry-level `updatedAt` for one catalog id.
 *
 * @param ctx - MongoDalContext
 * @param courseId - string
 * @param topicOrWeekId - string
 * @param contentId - string
 * @param struggleTopicId - string — id inside `instructorStruggleTopics`
 * @param updateData - `{ struggleTopic }` — sanitized label text from the API layer
 *
 * @returns `findOneAndUpdate` post image
 */
export async function updateInstructorStruggleTopic(
    ctx: MongoDalContext,
    courseId: string,
    topicOrWeekId: string,
    contentId: string,
    struggleTopicId: string,
    updateData: { struggleTopic: string }
): Promise<CatalogWriteResult<InstructorStruggleTopic | null>> {
    const course = await getActiveCourse(ctx, courseId);
    const contentItem = course?.topicOrWeekInstances
        ?.find((d) => d.id === topicOrWeekId)
        ?.items?.find((item) => item.id === contentId);
    const existing = contentItem?.instructorStruggleTopics?.find((t) => t.id === struggleTopicId);

    if (!existing) {
        return { changed: false, data: null };
    }

    const nextText = updateData.struggleTopic.trim();
    if (existing.struggleTopic === nextText) {
        return { changed: false, data: existing };
    }

    const result = await activeCourseListCollection(ctx.db).findOneAndUpdate(
        {
            id: courseId,
            'topicOrWeekInstances.id': topicOrWeekId,
            'topicOrWeekInstances.items.id': contentId,
            'topicOrWeekInstances.items.instructorStruggleTopics.id': struggleTopicId
        },
        {
            $set: {
                'topicOrWeekInstances.$[instance].items.$[item].instructorStruggleTopics.$[topic].struggleTopic':
                    nextText,
                'topicOrWeekInstances.$[instance].items.$[item].instructorStruggleTopics.$[topic].updatedAt':
                    Date.now().toString(),
                updatedAt: Date.now().toString()
            }
        },
        {
            arrayFilters: [
                { 'instance.id': topicOrWeekId },
                { 'item.id': contentId },
                { 'topic.id': struggleTopicId }
            ],
            returnDocument: 'after'
        }
    );

    const courseAfter = result as activeCourse | null;
    const updated =
        courseAfter?.topicOrWeekInstances
            ?.find((d) => d.id === topicOrWeekId)
            ?.items?.find((item) => item.id === contentId)
            ?.instructorStruggleTopics?.find((t) => t.id === struggleTopicId) ?? null;

    return { changed: true, data: updated };
}

/**
 * deleteInstructorStruggleTopic
 *
 * Removes one instructor struggle topic row via `$pull`.
 *
 * @param ctx - MongoDalContext
 * @param courseId - string
 * @param topicOrWeekId - string
 * @param contentId - string
 * @param struggleTopicId - string — id to pull from `instructorStruggleTopics`
 *
 * @returns `findOneAndUpdate` post image
 */
export async function deleteInstructorStruggleTopic(
    ctx: MongoDalContext,
    courseId: string,
    topicOrWeekId: string,
    contentId: string,
    struggleTopicId: string
): Promise<CatalogWriteResult<activeCourse | null>> {
    const course = await getActiveCourse(ctx, courseId);
    const contentItem = course?.topicOrWeekInstances
        ?.find((d) => d.id === topicOrWeekId)
        ?.items?.find((item) => item.id === contentId);
    const exists = contentItem?.instructorStruggleTopics?.some((t) => t.id === struggleTopicId) ?? false;

    if (!exists) {
        return { changed: false, data: course ?? null };
    }

    const result = await activeCourseListCollection(ctx.db).findOneAndUpdate(
        {
            id: courseId,
            'topicOrWeekInstances.id': topicOrWeekId,
            'topicOrWeekInstances.items.id': contentId
        },
        {
            $pull: {
                'topicOrWeekInstances.$[instance].items.$[item].instructorStruggleTopics': { id: struggleTopicId }
            } as any,
            $set: { updatedAt: Date.now().toString() }
        },
        {
            arrayFilters: [{ 'instance.id': topicOrWeekId }, { 'item.id': contentId }],
            returnDocument: 'after'
        }
    );
    return { changed: true, data: (result as activeCourse | null) };
}

/** Thrown when `orderedIds` is not an exact permutation of current struggle topic ids. */
export class InvalidInstructorStruggleTopicReorderError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'InvalidInstructorStruggleTopicReorderError';
    }
}

/**
 * reorderInstructorStruggleTopics
 *
 * Rewrites `instructorStruggleTopics[]` in the order given by `orderedIds`, preserving each entry's fields.
 *
 * @param ctx - MongoDalContext
 * @param courseId - string — `activeCourse.id`
 * @param topicOrWeekId - string — nested `topicOrWeekInstances.id`
 * @param contentId - string — nested `items.id`
 * @param orderedIds - string[] — exact permutation of current topic ids (same length, all ids exist, no extras)
 *
 * @returns Promise<InstructorStruggleTopic[]> — reordered list after persistence
 *
 * @throws InvalidInstructorStruggleTopicReorderError when `orderedIds` is not a valid permutation
 * @throws Error when course, topic/week instance, or content item is not found
 */
export async function reorderInstructorStruggleTopics(
    ctx: MongoDalContext,
    courseId: string,
    topicOrWeekId: string,
    contentId: string,
    orderedIds: string[]
): Promise<CatalogWriteResult<InstructorStruggleTopic[]>> {
    const course = await getActiveCourse(ctx, courseId);
    if (!course) {
        throw new Error(`Course with id ${courseId} not found`);
    }

    const instance = course.topicOrWeekInstances?.find((d) => d.id === topicOrWeekId);
    if (!instance) {
        throw new Error(`Topic/Week instance with id ${topicOrWeekId} not found`);
    }

    const contentItem = instance.items?.find((item) => item.id === contentId);
    if (!contentItem) {
        throw new Error(`Content item with id ${contentId} not found`);
    }

    const currentTopics = contentItem.instructorStruggleTopics ?? [];

    if (orderedIds.length !== currentTopics.length) {
        throw new InvalidInstructorStruggleTopicReorderError(
            `orderedIds length (${orderedIds.length}) must match current struggle topic count (${currentTopics.length})`
        );
    }

    if (orderedIds.length === 0) {
        return { changed: false, data: [] };
    }

    const topicById = new Map(currentTopics.map((topic) => [topic.id, topic]));
    const seen = new Set<string>();
    const reordered: InstructorStruggleTopic[] = [];

    for (const id of orderedIds) {
        if (seen.has(id)) {
            throw new InvalidInstructorStruggleTopicReorderError(`Duplicate id in orderedIds: ${id}`);
        }
        const topic = topicById.get(id);
        if (!topic) {
            throw new InvalidInstructorStruggleTopicReorderError(`Unknown struggle topic id: ${id}`);
        }
        seen.add(id);
        reordered.push(topic);
    }

    const currentIds = currentTopics.map((t) => t.id);
    if (orderedIdsMatch(currentIds, orderedIds)) {
        return { changed: false, data: currentTopics };
    }

    await activeCourseListCollection(ctx.db).findOneAndUpdate(
        {
            id: courseId,
            'topicOrWeekInstances.id': topicOrWeekId,
            'topicOrWeekInstances.items.id': contentId
        },
        {
            $set: {
                'topicOrWeekInstances.$[instance].items.$[item].instructorStruggleTopics': reordered,
                updatedAt: Date.now().toString()
            }
        },
        {
            arrayFilters: [{ 'instance.id': topicOrWeekId }, { 'item.id': contentId }],
            returnDocument: 'after'
        }
    );

    return { changed: true, data: reordered };
}

/**
 * getAllInstructorStruggleTopics
 *
 * Aggregation that **flattens** every nested instructor struggle topic with parent titles.
 *
 * @param ctx - MongoDalContext
 * @param courseId - string
 *
 * @returns Promise<InstructorStruggleTopicForDisplay[]>
 *
 * Actions:
 * - `$match` → `$unwind` instances/items/topics → `$project` with `topicOrWeekTitle`, `itemTitle`, `struggleTopic` text.
 * - Used by the memory agent to build the allowed label set and prompt catalog XML (not injected into main chat system prompt).
 */
export async function getAllInstructorStruggleTopics(
    ctx: MongoDalContext,
    courseId: string
): Promise<InstructorStruggleTopicForDisplay[]> {
    const results = await activeCourseListCollection(ctx.db).aggregate<InstructorStruggleTopicForDisplay>([
        { $match: { id: courseId } },
        { $unwind: '$topicOrWeekInstances' },
        { $unwind: '$topicOrWeekInstances.items' },
        { $unwind: '$topicOrWeekInstances.items.instructorStruggleTopics' },
        {
            $project: {
                _id: 0,
                struggleTopic: '$topicOrWeekInstances.items.instructorStruggleTopics.struggleTopic',
                topicOrWeekId: '$topicOrWeekInstances.id',
                topicOrWeekTitle: { $ifNull: ['$topicOrWeekInstances.title', ''] },
                itemTitle: {
                    $ifNull: [
                        '$topicOrWeekInstances.items.itemTitle',
                        { $ifNull: ['$topicOrWeekInstances.items.title', ''] }
                    ]
                }
            }
        }
    ]).toArray();
    return results;
}

/**
 * addContentItem
 *
 * Appends a `TopicOrWeekItem` in memory then persists the whole course document (legacy path).
 *
 * @param ctx - MongoDalContext
 * @param courseId - string
 * @param topicOrWeekId - string
 * @param contentItem - `any` — item payload to push
 *
 * @returns `{ success, data?, error? }` — success checks driver `ok` field when present
 *
 * Actions:
 * - Fetch course, locate instance, ensure `items` array, push, `updateActiveCourse`.
 */
export async function addContentItem(
    ctx: MongoDalContext,
    courseId: string,
    topicOrWeekId: string,
    contentItem: any
) {
    try {
        appLogger.log('📝 Adding content item to course:', courseId, 'topic/week instance:', topicOrWeekId);
        const course = await getActiveCourse(ctx, courseId);
        if (!course) {
            return { success: false, error: 'Course not found' };
        }

        const instance = course.topicOrWeekInstances?.find((d: any) => d.id === topicOrWeekId);
        if (!instance) {
            return { success: false, error: 'Topic/Week instance not found' };
        }

        if (!instance.items) {
            instance.items = [];
        }

        instance.items.push(contentItem);

        const result = await updateActiveCourse(ctx, courseId, course as Partial<activeCourse>);

        if (result && (result as unknown as { ok?: number }).ok) {
            return { success: true, data: contentItem };
        }
        return { success: false, error: 'Failed to save content item to database' };
    } catch (error) {
        appLogger.error('Error adding content item:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * addAdditionalMaterial
 *
 * Pushes an `AdditionalMaterial` record onto one content item using array filters.
 *
 * @param ctx - MongoDalContext
 * @param courseId - string
 * @param topicOrWeekId - string
 * @param itemId - string — target `items.id`
 * @param material - `AdditionalMaterial`
 *
 * @returns `findOneAndUpdate` post image
 */
export async function addAdditionalMaterial(
    ctx: MongoDalContext,
    courseId: string,
    topicOrWeekId: string,
    itemId: string,
    material: AdditionalMaterial
): Promise<any> {
    try {
        appLogger.log(
            '📄 Adding additional material to course:',
            courseId,
            'topic/week instance:',
            topicOrWeekId,
            'item:',
            itemId
        );
        const result = await activeCourseListCollection(ctx.db).findOneAndUpdate(
            {
                id: courseId,
                'topicOrWeekInstances.id': topicOrWeekId,
                'topicOrWeekInstances.items.id': itemId
            },
            {
                $push: {
                    'topicOrWeekInstances.$[instance].items.$[item].additionalMaterials': material as any
                },
                $set: { updatedAt: Date.now().toString() }
            },
            {
                arrayFilters: [{ 'instance.id': topicOrWeekId }, { 'item.id': itemId }],
                returnDocument: 'after'
            }
        );
        appLogger.log('✅ Additional material added successfully');
        return result;
    } catch (error) {
        appLogger.error('Error adding additional material:', error);
        throw error;
    }
}

/**
 * clearAllAdditionalMaterials
 *
 * Strips `additionalMaterials` from **every** item under every topic/week via `$unset` + broad array filters.
 *
 * @param ctx - MongoDalContext
 * @param courseId - string
 *
 * @returns `findOneAndUpdate` post image
 */
export async function clearAllAdditionalMaterials(ctx: MongoDalContext, courseId: string): Promise<any> {
    try {
        appLogger.log('🗑️ Clearing all additional materials from course:', courseId);
        const result = await activeCourseListCollection(ctx.db).findOneAndUpdate(
            { id: courseId },
            {
                $unset: {
                    'topicOrWeekInstances.$[instance].items.$[item].additionalMaterials': 1
                },
                $set: { updatedAt: Date.now().toString() }
            },
            {
                arrayFilters: [
                    { 'instance.id': { $exists: true } },
                    { 'item.id': { $exists: true } }
                ],
                returnDocument: 'after'
            }
        );
        appLogger.log('✅ All additional materials cleared successfully');
        return result;
    } catch (error) {
        appLogger.error('Error clearing additional materials:', error);
        throw error;
    }
}
