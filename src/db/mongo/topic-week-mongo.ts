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
    InstructorStruggleTopicForDisplay,
    LearningObjectiveForDisplay
} from '../../types/shared';
import type { MongoDalContext } from './mongo-context';
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
) {
    return await activeCourseListCollection(ctx.db).findOneAndUpdate(
        {
            id: courseId,
            'topicOrWeekInstances.id': topicOrWeekId,
            'topicOrWeekInstances.items.id': contentId,
            'topicOrWeekInstances.items.learningObjectives.id': objectiveId
        },
        {
            $set: {
                'topicOrWeekInstances.$[instance].items.$[item].learningObjectives.$[objective].LearningObjective':
                    updateData.LearningObjective,
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
) {
    appLogger.log('🗑️ [MONGODB] deleteLearningObjective called with:', {
        courseId,
        topicOrWeekId,
        contentId,
        objectiveId
    });
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
    return result;
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
) {
    return await activeCourseListCollection(ctx.db).findOneAndUpdate(
        {
            id: courseId,
            'topicOrWeekInstances.id': topicOrWeekId,
            'topicOrWeekInstances.items.id': contentId,
            'topicOrWeekInstances.items.instructorStruggleTopics.id': struggleTopicId
        },
        {
            $set: {
                'topicOrWeekInstances.$[instance].items.$[item].instructorStruggleTopics.$[topic].struggleTopic':
                    updateData.struggleTopic,
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
) {
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
    return result;
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
