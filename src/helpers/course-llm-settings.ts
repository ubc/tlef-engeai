/**
 * Course LLM settings — resolve, validate, and map instructor model choices to provider calls.
 *
 * @description: Shared resolver for course-wide model + reasoning used by Chat, Writing Feedback,
 * Scenario Generation, and Guided Pathway classifier calls.
 */

import type {
    activeCourse,
    CourseLlmModelId,
    CourseLlmSettings,
    CourseReasoningLevel,
} from '../types/shared';
import { loadConfig } from '../utils/config';

export const DEFAULT_COURSE_LLM_SETTINGS: CourseLlmSettings = {
    modelId: 'gpt-5.4-mini',
    reasoningLevel: 'medium',
};

const VALID_MODEL_IDS: readonly CourseLlmModelId[] = ['gpt-5.6-luna', 'gpt-5.4-mini', 'gpt-4o-mini'];
const VALID_REASONING_LEVELS: readonly CourseReasoningLevel[] = ['low', 'medium', 'high'];

/** Env var per catalog id; falls back to LLM_DEFAULT_MODEL then catalog default string. */
const MODEL_ENV_KEYS: Record<CourseLlmModelId, string> = {
    'gpt-5.6-luna': 'LLM_MODEL_GPT_56_LUNA',
    'gpt-5.4-mini': 'LLM_MODEL_GPT_54_MINI',
    'gpt-4o-mini': 'LLM_MODEL_GPT_4O_MINI',
};

const MODEL_FALLBACK_STRINGS: Record<CourseLlmModelId, string> = {
    'gpt-5.6-luna': 'gpt-5.6-luna',
    'gpt-5.4-mini': 'gpt-5.4-mini',
    'gpt-4o-mini': 'gpt-4o-mini',
};

/** ponytail: temperature heuristic until provider exposes native reasoning effort. */
const REASONING_TEMPERATURE: Record<CourseReasoningLevel, number> = {
    low: 0.3,
    medium: 0.7,
    high: 0.9,
};

/**
 * resolveCourseLlmSettings — missing or partial course settings resolve to the platform default.
 */
export function resolveCourseLlmSettings(
    course: Pick<activeCourse, 'llmSettings'> | null | undefined
): CourseLlmSettings {
    const stored = course?.llmSettings;
    if (!stored?.modelId || !stored.reasoningLevel) {
        return { ...DEFAULT_COURSE_LLM_SETTINGS };
    }
    return {
        modelId: isCourseLlmModelId(stored.modelId) ? stored.modelId : DEFAULT_COURSE_LLM_SETTINGS.modelId,
        reasoningLevel: isCourseReasoningLevel(stored.reasoningLevel)
            ? stored.reasoningLevel
            : DEFAULT_COURSE_LLM_SETTINGS.reasoningLevel,
        updatedAt: stored.updatedAt,
        updatedBy: stored.updatedBy,
    };
}

/**
 * mapModelIdToProviderModel — maps UI catalog ids to provider model strings the env accepts.
 */
export function mapModelIdToProviderModel(modelId: CourseLlmModelId): string {
    const envKey = MODEL_ENV_KEYS[modelId];
    const fromEnv = process.env[envKey]?.trim();
    if (fromEnv) return fromEnv;

    if (modelId === 'gpt-5.4-mini') {
        const globalDefault = process.env.LLM_DEFAULT_MODEL?.trim() || loadConfig().llmConfig.defaultModel;
        if (globalDefault) return globalDefault;
    }

    return MODEL_FALLBACK_STRINGS[modelId];
}

/**
 * mapReasoningLevelToTemperature — maps persisted reasoning level to a supported call param.
 */
export function mapReasoningLevelToTemperature(level: CourseReasoningLevel): number {
    return REASONING_TEMPERATURE[level];
}

/**
 * buildLlmCallOptions — merges course settings into LLM call options (model + temperature).
 */
export function buildLlmCallOptions(
    course: Pick<activeCourse, 'llmSettings'> | null | undefined,
    baseOptions?: Record<string, unknown>
): Record<string, unknown> {
    const settings = resolveCourseLlmSettings(course);
    return {
        ...baseOptions,
        model: mapModelIdToProviderModel(settings.modelId),
        temperature: mapReasoningLevelToTemperature(settings.reasoningLevel),
    };
}

/**
 * updateCourseLlmSettings — builds the next persisted settings object for PATCH.
 */
export function updateCourseLlmSettings(
    modelId: CourseLlmModelId,
    reasoningLevel: CourseReasoningLevel,
    actorUserId: string,
    now: Date = new Date()
): CourseLlmSettings {
    return { modelId, reasoningLevel, updatedAt: now, updatedBy: actorUserId };
}

export function isCourseLlmModelId(value: unknown): value is CourseLlmModelId {
    return typeof value === 'string' && (VALID_MODEL_IDS as readonly string[]).includes(value);
}

export function isCourseReasoningLevel(value: unknown): value is CourseReasoningLevel {
    return typeof value === 'string' && (VALID_REASONING_LEVELS as readonly string[]).includes(value);
}
