// instructor-prompt-mongo.ts
/**
 * instructor-prompt-mongo.ts
 * @author @gatahcha (refactor)
 * @description Instructor-editable prompts stored **inline** on each `active-course-list` document:
 *
 * - **`collectionOfInitialAssistantPrompts`** — first-assistant / welcome copy (selectable default).
 * - **`collectionOfSystemPromptItems`** — composable system prompt stack (base block, learning objectives token, struggle tokens, custom append blocks).
 *
 * All mutations are `getActiveCourse` → modify array in memory → `$set` entire array (legacy pattern).
 */

import type { activeCourse, InitialAssistantPrompt, SystemPromptItem } from '../../types/shared';
import {
    DEFAULT_PROMPT_ID,
    DEFAULT_BASE_PROMPT_ID,
    DEFAULT_LEARNING_OBJECTIVES_ID,
    DEFAULT_STRUGGLE_TOPICS_ID
} from '../../types/shared';
import { INITIAL_ASSISTANT_MESSAGE, SYSTEM_PROMPT } from '../../chat/chat-prompts';
import { activeCourseListCollection } from './mongo-collections';
import { getActiveCourse } from './course-mongo';
import type { MongoDalContext } from './mongo-context';
import { appLogger } from '../../utils/logger';

/**
 * getInitialAssistantPrompts
 *
 * Returns the raw welcome-message array embedded on the course catalog row.
 *
 * @param ctx - MongoDalContext
 * @param courseId - string — equals `activeCourse.id`
 *
 * @returns `InitialAssistantPrompt[]` — empty array when field absent
 *
 * @throws When course id unknown
 */
export async function getInitialAssistantPrompts(
    ctx: MongoDalContext,
    courseId: string
): Promise<InitialAssistantPrompt[]> {
    const course = await getActiveCourse(ctx, courseId);
    if (!course) {
        throw new Error(`Course with id ${courseId} not found`);
    }
    return (course as unknown as activeCourse).collectionOfInitialAssistantPrompts || [];
}

/**
 * getSelectedInitialAssistantPrompt
 *
 * Uses MongoDB positional projection (`collectionOfInitialAssistantPrompts.$`) so only the selected element ships over the wire.
 *
 * @param ctx - MongoDalContext
 * @param courseId - string
 *
 * @returns Matching prompt or `null` when none flagged `isSelected`
 */
export async function getSelectedInitialAssistantPrompt(
    ctx: MongoDalContext,
    courseId: string
): Promise<InitialAssistantPrompt | null> {
    const course = await activeCourseListCollection(ctx.db).findOne(
        {
            id: courseId,
            'collectionOfInitialAssistantPrompts.isSelected': true
        },
        {
            projection: {
                'collectionOfInitialAssistantPrompts.$': 1
            }
        }
    );

    if (!course) return null;

    const courseData = course as unknown as activeCourse;
    const prompts = courseData.collectionOfInitialAssistantPrompts || [];
    return prompts.length > 0 ? prompts[0] : null;
}

/**
 * createInitialAssistantPrompt
 *
 * Appends another welcome prompt definition then persists the entire array snapshot.
 * 
 * @param ctx - MongoDalContext
 * @param courseId - string
 * @param prompt - InitialAssistantPrompt
 * @returns Promise<void>
 */
export async function createInitialAssistantPrompt(
    ctx: MongoDalContext,
    courseId: string,
    prompt: InitialAssistantPrompt
): Promise<void> {
    const course = await getActiveCourse(ctx, courseId);
    if (!course) {
        throw new Error(`Course with id ${courseId} not found`);
    }

    const prompts = (course as unknown as activeCourse).collectionOfInitialAssistantPrompts || [];
    prompts.push(prompt);

    await activeCourseListCollection(ctx.db).updateOne(
        { id: courseId },
        { $set: { collectionOfInitialAssistantPrompts: prompts } }
    );
}

/**
 * updateInitialAssistantPrompt
 *
 * Locate `promptId` in-memory, shallow-merge `updates`, write back wholesale.
 * 
 * @param ctx - MongoDalContext
 * @param courseId - string
 * @param promptId - string
 * @param updates - Partial<InitialAssistantPrompt>
 * @returns Promise<void>
 *
 * @throws When id missing from array
 */
export async function updateInitialAssistantPrompt(
    ctx: MongoDalContext,
    courseId: string,
    promptId: string,
    updates: Partial<InitialAssistantPrompt>
): Promise<void> {
    const course = await getActiveCourse(ctx, courseId);
    if (!course) {
        throw new Error(`Course with id ${courseId} not found`);
    }

    const prompts = (course as unknown as activeCourse).collectionOfInitialAssistantPrompts || [];
    const promptIndex = prompts.findIndex(p => p.id === promptId);

    if (promptIndex === -1) {
        throw new Error(`Prompt with id ${promptId} not found`);
    }

    prompts[promptIndex] = { ...prompts[promptIndex], ...updates };

    await activeCourseListCollection(ctx.db).updateOne(
        { id: courseId },
        { $set: { collectionOfInitialAssistantPrompts: prompts } }
    );
}

/**
 * deleteInitialAssistantPrompt
 *
 * Prevents removing the canonical default (`DEFAULT_PROMPT_ID` / `isDefault`).
 * 
 * @param ctx - MongoDalContext
 * @param courseId - string
 * @param promptId - string
 * @returns Promise<void>
 *
 * Actions:
 * - If deleted prompt was `isSelected`, attempt to re-select the default (via `ensureDefaultPromptExists`) and toggle selection flags.
 * - Otherwise simply filter it out and `$set` the shorter array.
 */
export async function deleteInitialAssistantPrompt(
    ctx: MongoDalContext,
    courseId: string,
    promptId: string
): Promise<void> {
    const course = await getActiveCourse(ctx, courseId);
    if (!course) {
        throw new Error(`Course with id ${courseId} not found`);
    }

    const prompts = (course as unknown as activeCourse).collectionOfInitialAssistantPrompts || [];

    const promptToDelete = prompts.find(p => p.id === promptId);
    if (!promptToDelete) {
        throw new Error(`Prompt with id ${promptId} not found`);
    }

    if (promptToDelete.isDefault || promptToDelete.id === DEFAULT_PROMPT_ID) {
        throw new Error('Cannot delete the default system prompt');
    }

    const wasSelected = promptToDelete.isSelected;

    const filteredPrompts = prompts.filter(p => p.id !== promptId);

    if (wasSelected) {
        const defaultPrompt = filteredPrompts.find(p => p.isDefault || p.id === DEFAULT_PROMPT_ID);
        if (defaultPrompt) {
            await ensureDefaultPromptExists(ctx, courseId, course.courseName);
            const updatedPrompts = filteredPrompts.map(p => ({
                ...p,
                isSelected: (p.isDefault || p.id === DEFAULT_PROMPT_ID) ? true : false
            }));
            await activeCourseListCollection(ctx.db).updateOne(
                { id: courseId },
                { $set: { collectionOfInitialAssistantPrompts: updatedPrompts } }
            );
        } else {
            await activeCourseListCollection(ctx.db).updateOne(
                { id: courseId },
                { $set: { collectionOfInitialAssistantPrompts: filteredPrompts } }
            );
        }
    } else {
        await activeCourseListCollection(ctx.db).updateOne(
            { id: courseId },
            { $set: { collectionOfInitialAssistantPrompts: filteredPrompts } }
        );
    }
}

/**
 * selectInitialAssistantPrompt
 *
 * Forces exactly one welcome prompt `isSelected: true` by rewriting the entire array flags.
 * 
 * @param ctx - MongoDalContext
 * @param courseId - string
 * @param promptId - string
 * @returns Promise<void>
 */
export async function selectInitialAssistantPrompt(
    ctx: MongoDalContext,
    courseId: string,
    promptId: string
): Promise<void> {
    const course = await getActiveCourse(ctx, courseId);
    if (!course) {
        throw new Error(`Course with id ${courseId} not found`);
    }

    const prompts = (course as unknown as activeCourse).collectionOfInitialAssistantPrompts || [];
    const promptIndex = prompts.findIndex(p => p.id === promptId);

    if (promptIndex === -1) {
        throw new Error(`Prompt with id ${promptId} not found`);
    }

    const updatedPrompts = prompts.map((p, index) => ({
        ...p,
        isSelected: index === promptIndex
    }));

    await activeCourseListCollection(ctx.db).updateOne(
        { id: courseId },
        { $set: { collectionOfInitialAssistantPrompts: updatedPrompts } }
    );
}

/**
 * ensureDefaultPromptExists
 *
 * Bootstraps the seeded welcome message pulled from `INITIAL_ASSISTANT_MESSAGE` when missing.
 *
 * Also auto-selects the default when nothing else remains selected — keeps student UX from rendering blank states.
 *
 * @param ctx - MongoDalContext
 * @param courseId - string
 * @param courseName - string
 * @returns Promise<void>
 */
export async function ensureDefaultPromptExists(
    ctx: MongoDalContext,
    courseId: string,
    courseName?: string
): Promise<void> {
    const course = await getActiveCourse(ctx, courseId);
    if (!course) {
        throw new Error(`Course with id ${courseId} not found`);
    }

    const prompts = (course as unknown as activeCourse).collectionOfInitialAssistantPrompts || [];

    const defaultPrompt = prompts.find(p => p.isDefault || p.id === DEFAULT_PROMPT_ID);

    if (!defaultPrompt) {
        const newDefaultPrompt: InitialAssistantPrompt = {
            id: DEFAULT_PROMPT_ID,
            title: 'Default Welcome Message',
            content: INITIAL_ASSISTANT_MESSAGE,
            dateCreated: new Date(),
            isSelected: prompts.length === 0 || !prompts.some(p => p.isSelected),
            isDefault: true
        };

        prompts.push(newDefaultPrompt);

        await activeCourseListCollection(ctx.db).updateOne(
            { id: courseId },
            { $set: { collectionOfInitialAssistantPrompts: prompts } }
        );

        appLogger.log(`✅ Created default prompt for course: ${courseName || courseId}`);
    } else {
        const hasSelectedPrompt = prompts.some(
            p => p.isSelected && !p.isDefault && p.id !== DEFAULT_PROMPT_ID
        );

        if (!hasSelectedPrompt && !defaultPrompt.isSelected) {
            const updatedPrompts = prompts.map(p => ({
                ...p,
                isSelected: (p.isDefault || p.id === DEFAULT_PROMPT_ID) ? true : false
            }));

            await activeCourseListCollection(ctx.db).updateOne(
                { id: courseId },
                { $set: { collectionOfInitialAssistantPrompts: updatedPrompts } }
            );

            appLogger.log(`✅ Auto-selected default prompt for course: ${courseName || courseId}`);
        }
    }
}

/**
 * getSystemPromptItems
 *
 * Returns the full composable system prompt component list (custom + built-ins).
 * 
 * @param ctx - MongoDalContext
 * @param courseId - string
 * @returns Promise<SystemPromptItem[]>
 */
export async function getSystemPromptItems(
    ctx: MongoDalContext,
    courseId: string
): Promise<SystemPromptItem[]> {
    const course = await getActiveCourse(ctx, courseId);
    if (!course) {
        throw new Error(`Course with id ${courseId} not found`);
    }
    return (course as unknown as activeCourse).collectionOfSystemPromptItems || [];
}

/**
 * getBaseSystemPrompt
 *
 * Convenience filter for the non-removable base block (`componentType === 'base'` or default id).
 * 
 * @param ctx - MongoDalContext
 * @param courseId - string
 * @returns Promise<SystemPromptItem | null>
 */
export async function getBaseSystemPrompt(
    ctx: MongoDalContext,
    courseId: string
): Promise<SystemPromptItem | null> {
    const items = await getSystemPromptItems(ctx, courseId);
    return items.find(item => item.componentType === 'base' || item.id === DEFAULT_BASE_PROMPT_ID) || null;
}

/**
 * getAppendedSystemPromptItems
 *
 * Returns only **custom** components currently toggled to append into runtime system text.
 * 
 * @param ctx - MongoDalContext
 * @param courseId - string
 * @returns Promise<SystemPromptItem[]>
 */
export async function getAppendedSystemPromptItems(
    ctx: MongoDalContext,
    courseId: string
): Promise<SystemPromptItem[]> {
    const items = await getSystemPromptItems(ctx, courseId);
    return items.filter(item => item.isAppended && item.componentType === 'custom');
}

/**
 * createSystemPromptItem
 *
 * Appends a new `SystemPromptItem` row (use for instructor-authored supplements).
 * 
 * @param ctx - MongoDalContext
 * @param courseId - string
 * @param item - SystemPromptItem
 * @returns Promise<void>
 */
export async function createSystemPromptItem(
    ctx: MongoDalContext,
    courseId: string,
    item: SystemPromptItem
): Promise<void> {
    const course = await getActiveCourse(ctx, courseId);
    if (!course) {
        throw new Error(`Course with id ${courseId} not found`);
    }

    const items = (course as unknown as activeCourse).collectionOfSystemPromptItems || [];
    items.push(item);

    await activeCourseListCollection(ctx.db).updateOne(
        { id: courseId },
        { $set: { collectionOfSystemPromptItems: items } }
    );
}

/**
 * updateSystemPromptItem
 *
 * Guards the shipped **base** component from `title` / `content` edits (platform-owned copy).
 * 
 * @param ctx - MongoDalContext
 * @param courseId - string
 * @param itemId - string
 * @param updates - Partial<SystemPromptItem>
 * @returns Promise<void>
 *
 * @throws When attempting to rename or rewrite body of default base component
 */
export async function updateSystemPromptItem(
    ctx: MongoDalContext,
    courseId: string,
    itemId: string,
    updates: Partial<SystemPromptItem>
): Promise<void> {
    const course = await getActiveCourse(ctx, courseId);
    if (!course) {
        throw new Error(`Course with id ${courseId} not found`);
    }

    const items = (course as unknown as activeCourse).collectionOfSystemPromptItems || [];
    const itemIndex = items.findIndex(item => item.id === itemId);

    if (itemIndex === -1) {
        throw new Error(`System prompt item with id ${itemId} not found`);
    }

    const itemToUpdate = items[itemIndex];
    const isBaseComponent =
        itemToUpdate.componentType === 'base' || itemToUpdate.id === DEFAULT_BASE_PROMPT_ID;
    if (isBaseComponent && (updates.title !== undefined || updates.content !== undefined)) {
        throw new Error('Cannot edit the default base system prompt component');
    }

    items[itemIndex] = { ...items[itemIndex], ...updates };

    await activeCourseListCollection(ctx.db).updateOne(
        { id: courseId },
        { $set: { collectionOfSystemPromptItems: items } }
    );
}

/**
 * deleteSystemPromptItem
 *
 * Blocks deletion of built-in component types (`base`, `learning-objectives`, `struggle-topics`).
 * 
 * @param ctx - MongoDalContext
 * @param courseId - string
 * @param itemId - string
 * @returns Promise<void>
 */
export async function deleteSystemPromptItem(
    ctx: MongoDalContext,
    courseId: string,
    itemId: string
): Promise<void> {
    const course = await getActiveCourse(ctx, courseId);
    if (!course) {
        throw new Error(`Course with id ${courseId} not found`);
    }

    const items = (course as unknown as activeCourse).collectionOfSystemPromptItems || [];

    const itemToDelete = items.find(item => item.id === itemId);
    if (!itemToDelete) {
        throw new Error(`System prompt item with id ${itemId} not found`);
    }

    if (
        itemToDelete.componentType &&
        ['base', 'learning-objectives', 'struggle-topics'].includes(itemToDelete.componentType)
    ) {
        throw new Error(`Cannot delete the default ${itemToDelete.componentType} component`);
    }

    const filteredItems = items.filter(item => item.id !== itemId);

    await activeCourseListCollection(ctx.db).updateOne(
        { id: courseId },
        { $set: { collectionOfSystemPromptItems: filteredItems } }
    );
}

/**
 * toggleSystemPromptItemAppend
 *
 * Thin wrapper — delegates to `updateSystemPromptItem` with `{ isAppended: append }`.
 * 
 * @param ctx - MongoDalContext
 * @param courseId - string
 * @param itemId - string
 * @param append - boolean
 * @returns Promise<void>
 */
export async function toggleSystemPromptItemAppend(
    ctx: MongoDalContext,
    courseId: string,
    itemId: string,
    append: boolean
): Promise<void> {
    await updateSystemPromptItem(ctx, courseId, itemId, { isAppended: append });
}

/**
 * saveSystemPromptAppendChanges
 *
 * Batch updates `isAppended` for many components in one `updateOne` (UI “save toggles” action).
 *
 * @param ctx - MongoDalContext
 * @param courseId - string
 * @param changes - `{ itemId, append }` tuples
 * @returns Promise<void>
 */
export async function saveSystemPromptAppendChanges(
    ctx: MongoDalContext,
    courseId: string,
    changes: Array<{ itemId: string; append: boolean }>
): Promise<void> {
    const course = await getActiveCourse(ctx, courseId);
    if (!course) {
        throw new Error(`Course with id ${courseId} not found`);
    }

    const items = (course as unknown as activeCourse).collectionOfSystemPromptItems || [];

    const changesMap = new Map(changes.map(change => [change.itemId, change.append]));

    const updatedItems = items.map(item => {
        if (changesMap.has(item.id)) {
            return { ...item, isAppended: changesMap.get(item.id)! };
        }
        return item;
    });

    await activeCourseListCollection(ctx.db).updateOne(
        { id: courseId },
        { $set: { collectionOfSystemPromptItems: updatedItems } }
    );
}

/**
 * ensureDefaultSystemPromptComponents
 *
 * Self-heals missing **base**, **learning objectives**, and **struggle topics** placeholder components used by prompt assembly regexes.
 * 
 * @param ctx - MongoDalContext
 * @param courseId - string
 * @param courseName - string
 * @returns Promise<void>
 *
 * Persists only when at least one new component was appended (avoids noisy writes).
 */
export async function ensureDefaultSystemPromptComponents(
    ctx: MongoDalContext,
    courseId: string,
    courseName?: string
): Promise<void> {
    const course = await getActiveCourse(ctx, courseId);
    if (!course) {
        throw new Error(`Course with id ${courseId} not found`);
    }

    const items = (course as unknown as activeCourse).collectionOfSystemPromptItems || [];
    const existingIds = new Set(items.map(item => item.id));
    const dateCreated = new Date();

    if (!existingIds.has(DEFAULT_BASE_PROMPT_ID)) {
        const basePrompt: SystemPromptItem = {
            id: DEFAULT_BASE_PROMPT_ID,
            title: 'Base System Prompt',
            content: SYSTEM_PROMPT,
            dateCreated: dateCreated,
            isAppended: true,
            isDefault: true,
            componentType: 'base'
        };
        items.push(basePrompt);
        appLogger.log(`✅ Created default base system prompt for course: ${courseName || courseId}`);
    }

    if (!existingIds.has(DEFAULT_LEARNING_OBJECTIVES_ID)) {
        const learningObjectives: SystemPromptItem = {
            id: DEFAULT_LEARNING_OBJECTIVES_ID,
            title: 'Learning Objectives',
            content: '<learningobjectives></learningobjectives>',
            dateCreated: dateCreated,
            isAppended: true,
            isDefault: true,
            componentType: 'learning-objectives'
        };
        items.push(learningObjectives);
        appLogger.log(`✅ Created default learning objectives component for course: ${courseName || courseId}`);
    }

    if (!existingIds.has(DEFAULT_STRUGGLE_TOPICS_ID)) {
        const struggleTopics: SystemPromptItem = {
            id: DEFAULT_STRUGGLE_TOPICS_ID,
            title: 'Struggle Topics',
            content: '<strugglewords></strugglewords>',
            dateCreated: dateCreated,
            isAppended: true,
            isDefault: true,
            componentType: 'struggle-topics'
        };
        items.push(struggleTopics);
        appLogger.log(`✅ Created default struggle topics component for course: ${courseName || courseId}`);
    }

    const courseData = course as unknown as activeCourse;
    const existingItems = courseData.collectionOfSystemPromptItems || [];
    if (items.length > existingItems.length) {
        await activeCourseListCollection(ctx.db).updateOne(
            { id: courseId },
            { $set: { collectionOfSystemPromptItems: items } }
        );
    }
}
