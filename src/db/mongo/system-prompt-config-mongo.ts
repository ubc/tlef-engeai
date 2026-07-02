/**
 * system-prompt-config-mongo.ts
 *
 * Per-course system prompt configuration (v2) on active-course-list.
 * Lazy migration (SP-001): collectionOfSystemPromptItems → systemPromptConfig, then $unset legacy field.
 * Registry and sunset: documentation/DATA_MIGRATIONS.md (remove SP-001 code by 2026-06-30).
 */

import type {
    activeCourse,
    ConversationModeId,
    CourseSystemPromptConfig,
    ModeSystemPromptState,
    SystemPromptModule,
    SystemPromptItem,
} from '../../types/shared';
import {
    CONVERSATION_MODE_IDS,
    DEFAULT_BASE_PROMPT_ID,
} from '../../types/shared';
import {
    getPlatformDefaultVersion,
    getPlatformInstructorModules,
} from '../../chat/system-prompts/system-prompt-defaults-loader';
import { conversationModePrompts } from '../../chat/compose-system-prompt';
import { activeCourseListCollection } from './mongo-collections';
import { getActiveCourse } from './course-mongo';
import type { MongoDalContext } from './mongo-context';
import { appLogger } from '../../utils/logger';

function nowIso(): string {
    return new Date().toISOString();
}

function seedModeState(mode: ConversationModeId): ModeSystemPromptState {
    return {
        usePlatformDefault: true,
        modules: [],
        updatedAt: nowIso(),
        platformDefaultVersion: getPlatformDefaultVersion(mode),
    };
}

function seedFreshConfig(): CourseSystemPromptConfig {
    const modes = {} as CourseSystemPromptConfig['modes'];
    for (const mode of CONVERSATION_MODE_IDS) {
        modes[mode] = seedModeState(mode);
    }
    return {
        schemaVersion: 1,
        defaultConversationMode: 'socratic',
        modes,
    };
}

/**
 * SP-002 lazy migration: add missing mode states when new conversation modes ship.
 */
function ensureAllModeStates(config: CourseSystemPromptConfig): CourseSystemPromptConfig {
    let patched = false;
    const modes = { ...config.modes };
    for (const mode of CONVERSATION_MODE_IDS) {
        if (!modes[mode]) {
            modes[mode] = seedModeState(mode);
            patched = true;
        }
    }
    if (!patched) {
        return config;
    }
    appLogger.log('[system-prompt-config] SP-002 lazy migration: backfilled missing conversation mode states');
    return { ...config, modes };
}

function legacyDefaultBaseContent(): string {
    return getPlatformInstructorModules('socratic')
        .map((m) => m.body)
        .join('\n\n')
        .trim();
}

function isLegacyDefaultBase(content: string): boolean {
    const normalized = (s: string) => s.replace(/\s+/g, ' ').trim();
    return normalized(content) === normalized(legacyDefaultBaseContent());
}

function migrateFromLegacyItems(items: SystemPromptItem[]): CourseSystemPromptConfig {
    const customAppended = items.filter(
        (i) => i.componentType === 'custom' && i.isAppended
    );
    const baseItem = items.find(
        (i) => i.componentType === 'base' || i.id === DEFAULT_BASE_PROMPT_ID
    );

    const baseContent = baseItem?.content?.trim() ?? '';
    const hasCustomization =
        customAppended.length > 0 ||
        (baseContent.length > 0 && !isLegacyDefaultBase(baseContent));

    if (!hasCustomization) {
        appLogger.log('[system-prompt-config] Lazy migration: legacy items → platform defaults');
        return seedFreshConfig();
    }

    appLogger.log('[system-prompt-config] Lazy migration: legacy customized prompt → Mongo modules');
    const modules: SystemPromptModule[] = [];
    let sortOrder = 0;

    if (baseContent.length > 0 && !isLegacyDefaultBase(baseContent)) {
        modules.push({
            id: 'migrated_base',
            body: baseContent,
            sortOrder: sortOrder++,
        });
    }

    for (const custom of customAppended) {
        modules.push({
            id: custom.id.startsWith('m') ? custom.id : `m_${custom.id.slice(0, 12)}`,
            body: custom.content,
            sortOrder: sortOrder++,
        });
    }

    return {
        schemaVersion: 1,
        defaultConversationMode: 'socratic',
        modes: {
            socratic: {
                usePlatformDefault: false,
                modules,
                updatedAt: nowIso(),
                platformDefaultVersion: getPlatformDefaultVersion('socratic'),
            },
            explanatory: seedModeState('explanatory'),
            'scenario-generation': seedModeState('scenario-generation'),
        },
    };
}

function hasLegacySystemPromptItemsField(courseData: activeCourse): boolean {
    return Object.prototype.hasOwnProperty.call(courseData, 'collectionOfSystemPromptItems');
}

/**
 * SP-001 lazy migration: drop legacy v1 field after v2 config is ensured.
 * See documentation/DATA_MIGRATIONS.md — remove this helper when SP-001 sunsets (2026-06-30).
 */
async function unsetLegacySystemPromptItems(
    ctx: MongoDalContext,
    courseId: string,
    reason: 'cleanup-only' | 'migrate-and-set'
): Promise<void> {
    await activeCourseListCollection(ctx.db).updateOne(
        { id: courseId },
        { $unset: { collectionOfSystemPromptItems: '' } }
    );
    appLogger.log(
        `[system-prompt-config] SP-001 lazy migration: $unset collectionOfSystemPromptItems (courseId=${courseId}, reason=${reason})`
    );
}

/**
 * Ensures systemPromptConfig exists, migrating from legacy collection on first access.
 * SP-001 lazy migration also $unset collectionOfSystemPromptItems when present — see DATA_MIGRATIONS.md.
 */
export async function ensureSystemPromptConfig(
    ctx: MongoDalContext,
    courseId: string
): Promise<CourseSystemPromptConfig> {
    const course = await getActiveCourse(ctx, courseId);
    if (!course) {
        throw new Error(`Course with id ${courseId} not found`);
    }

    const courseData = course as unknown as activeCourse;
    if (courseData.systemPromptConfig?.schemaVersion === 1) {
        if (hasLegacySystemPromptItemsField(courseData)) {
            await unsetLegacySystemPromptItems(ctx, courseId, 'cleanup-only');
        }
        const patched = ensureAllModeStates(courseData.systemPromptConfig);
        if (patched !== courseData.systemPromptConfig) {
            await activeCourseListCollection(ctx.db).updateOne(
                { id: courseId },
                { $set: { systemPromptConfig: patched } }
            );
            appLogger.log(
                `[system-prompt-config] SP-002 lazy migration: $set systemPromptConfig (courseId=${courseId})`
            );
        }
        return patched;
    }

    let config: CourseSystemPromptConfig;
    const legacyItems = courseData.collectionOfSystemPromptItems;
    if (legacyItems && legacyItems.length > 0) {
        config = migrateFromLegacyItems(legacyItems);
    } else {
        config = seedFreshConfig();
    }

    config = ensureAllModeStates(config);

    // SP-001 lazy migration: persist v2 config and drop legacy field in one write (DATA_MIGRATIONS.md).
    await activeCourseListCollection(ctx.db).updateOne(
        { id: courseId },
        {
            $set: { systemPromptConfig: config },
            $unset: { collectionOfSystemPromptItems: '' },
        }
    );
    appLogger.log(
        `[system-prompt-config] SP-001 lazy migration: $set systemPromptConfig (courseId=${courseId}, reason=migrate-and-set)`
    );

    return config;
}

/**
 * Returns config for instructor API (runtime module hidden — not stored in config anyway).
 */
export async function getSystemPromptConfig(
    ctx: MongoDalContext,
    courseId: string
): Promise<CourseSystemPromptConfig> {
    return ensureSystemPromptConfig(ctx, courseId);
}

export interface UpdateModeSystemPromptInput {
    modules?: SystemPromptModule[];
    usePlatformDefault?: boolean;
}

/**
 * Updates one mode's system prompt state (autosave).
 */
export async function updateModeSystemPrompt(
    ctx: MongoDalContext,
    courseId: string,
    mode: ConversationModeId,
    input: UpdateModeSystemPromptInput
): Promise<CourseSystemPromptConfig> {
    const config = await ensureSystemPromptConfig(ctx, courseId);
    const modeState = { ...config.modes[mode] };

    if (input.usePlatformDefault !== undefined) {
        modeState.usePlatformDefault = input.usePlatformDefault;
        if (input.usePlatformDefault && input.modules === undefined) {
            modeState.modules = [];
        }
    }

    // Reset passes platform snapshot with usePlatformDefault: true; custom saves pass usePlatformDefault: false.
    if (input.modules !== undefined && input.usePlatformDefault !== true) {
        modeState.modules = input.modules.map((m, index) => ({
            id: m.id,
            body: m.body,
            sortOrder: index,
        }));
        modeState.usePlatformDefault = false;
    } else if (input.modules !== undefined && input.usePlatformDefault === true) {
        modeState.modules = input.modules.map((m, index) => ({
            id: m.id,
            body: m.body,
            sortOrder: index,
        }));
    }

    modeState.updatedAt = nowIso();
    modeState.platformDefaultVersion = getPlatformDefaultVersion(mode);

    const updated: CourseSystemPromptConfig = {
        ...config,
        modes: {
            ...config.modes,
            [mode]: modeState,
        },
    };

    const writeResult = await activeCourseListCollection(ctx.db).updateOne(
        { id: courseId },
        { $set: { systemPromptConfig: updated } }
    );
    if (writeResult.matchedCount === 0) {
        throw new Error(`Course with id ${courseId} not found`);
    }

    return updated;
}

/**
 * Resets a mode to platform defaults: usePlatformDefault true plus a Mongo snapshot of shipped modules.
 * Chat runtime still resolves live platform JSON when the flag is true; the snapshot powers instructor UI/ops.
 */
export async function resetModeSystemPrompt(
    ctx: MongoDalContext,
    courseId: string,
    mode: ConversationModeId
): Promise<CourseSystemPromptConfig> {
    const platformModules: SystemPromptModule[] = getPlatformInstructorModules(mode).map((m, index) => ({
        id: m.id,
        body: m.body,
        sortOrder: index,
    }));

    return updateModeSystemPrompt(ctx, courseId, mode, {
        usePlatformDefault: true,
        modules: platformModules,
    });
}

/**
 * Sets the default conversation mode for new chats in this course.
 */
export async function setDefaultConversationMode(
    ctx: MongoDalContext,
    courseId: string,
    mode: ConversationModeId
): Promise<CourseSystemPromptConfig> {
    const config = await ensureSystemPromptConfig(ctx, courseId);
    const updated: CourseSystemPromptConfig = {
        ...config,
        defaultConversationMode: mode,
    };

    const writeResult = await activeCourseListCollection(ctx.db).updateOne(
        { id: courseId },
        { $set: { systemPromptConfig: updated } }
    );
    if (writeResult.matchedCount === 0) {
        throw new Error(`Course with id ${courseId} not found`);
    }

    return updated;
}

/**
 * Reads defaultConversationMode for chat init (no migration side effect if config missing).
 */
export async function getDefaultConversationModeForCourse(
    ctx: MongoDalContext,
    courseId: string
): Promise<ConversationModeId> {
    const config = await ensureSystemPromptConfig(ctx, courseId);
    return conversationModePrompts.resolveModeId(config.defaultConversationMode);
}
