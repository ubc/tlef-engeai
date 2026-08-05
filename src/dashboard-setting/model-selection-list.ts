/**
 * Model selection list — server-owned LLM catalog and platform defaults.
 *
 * Provider `supportedReasoningLevels` are verbatim from OpenAI docs.
 * App UI / persistence use APP_REASONING_LEVELS only (none/low/medium/high).
 * Dashboard API projects via {@link toDashboardCatalogEntry} (no brains / $ labels).
 *
 * @author: EngE-AI Team
 * @date: 2026-08-05
 * @version: 2.1.0
 * @description: LLM_MODEL_SPECS Record, derived catalog, dashboard API helpers.
 */

import type {
    AppReasoningLevel,
    CourseLlmModelId,
    FeatureLlmSelection,
    LlmModelCatalogEntry,
    LlmModelDashboardCatalogEntry,
    LlmReasoningCatalogOption,
    ProviderReasoningLevel,
} from '../types/shared';

/** App UI + PATCH + persistence — instructors never pick xhigh/max. */
export const APP_REASONING_LEVELS: readonly AppReasoningLevel[] = [
    'none',
    'low',
    'medium',
    'high',
] as const;

/** Platform default feature selection when Mongo has no usable row. */
export const DEFAULT_FEATURE_SELECTION: FeatureLlmSelection = {
    modelId: 'gpt-5.6-luna',
    reasoningLevel: 'none',
};

/** One model's display metadata + verbatim provider reasoning list. */
type LlmModelSpec = {
    label: string;
    costTier: 'low' | 'medium' | 'high';
    /** Verbatim provider-supported reasoning levels from OpenAI docs. */
    supportedReasoningLevels: readonly ProviderReasoningLevel[];
};

/**
 * Per-model specs — `supportedReasoningLevels` are official provider lists:
 * - gpt-5.6-luna: https://developers.openai.com/api/docs/models/gpt-5.6-luna
 * - gpt-5.4-mini: https://developers.openai.com/api/docs/models/gpt-5.4-mini
 * - gpt-4o-mini: https://developers.openai.com/api/docs/models/gpt-4o-mini
 */
export const LLM_MODEL_SPECS: Record<CourseLlmModelId, LlmModelSpec> = {
    'gpt-5.6-luna': {
        label: 'GPT 5.6 Luna',
        costTier: 'high',
        supportedReasoningLevels: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
    },
    'gpt-5.4-mini': {
        label: 'GPT 5.4 Mini',
        costTier: 'medium',
        supportedReasoningLevels: ['none', 'low', 'medium', 'high', 'xhigh'],
    },
    'gpt-4o-mini': {
        label: 'GPT 4o Mini',
        costTier: 'low',
        supportedReasoningLevels: [],
    },
};

/**
 * LLM_MODEL_CATALOG - array form of {@link LLM_MODEL_SPECS} for iteration and validation.
 *
 * Each entry copies the provider reasoning list verbatim (not truncated to APP levels).
 */
export const LLM_MODEL_CATALOG: readonly LlmModelCatalogEntry[] = (
    Object.entries(LLM_MODEL_SPECS) as [CourseLlmModelId, LlmModelSpec][]
).map(([id, spec]) => ({
    id,
    label: spec.label,
    costTier: spec.costTier,
    supportedReasoningLevels: [...spec.supportedReasoningLevels],
}));

/**
 * formatReasoningLabel - human label for an app reasoning level id.
 *
 * @param level - App reasoning id (none|low|medium|high)
 * @returns Capitalized label for dashboard option rows
 */
export function formatReasoningLabel(level: AppReasoningLevel): string {
    return level.charAt(0).toUpperCase() + level.slice(1);
}

/**
 * appReasoningOptionsForEntry - APP ∩ provider reasoning options for one catalog model.
 *
 * Filters {@link APP_REASONING_LEVELS} to levels listed on the provider catalog entry,
 * then attaches display labels. Brain counts are computed client-side — not returned here.
 *
 * @param entry - Server catalog entry with verbatim supportedReasoningLevels
 * @returns Dashboard reasoning options (may be empty for models without native reasoning)
 */
export function appReasoningOptionsForEntry(entry: LlmModelCatalogEntry): LlmReasoningCatalogOption[] {
    // Keep only app-persisted levels that the provider also advertises
    return APP_REASONING_LEVELS.filter((id) => entry.supportedReasoningLevels.includes(id)).map(
        (id) => ({
            id,
            label: formatReasoningLabel(id),
        })
    );
}

/**
 * toDashboardCatalogEntry - map one server catalog entry to the dashboard API shape.
 *
 * Facts only: id, label, costTier, app reasoning options. No `$` cost labels or brainCount.
 *
 * @param entry - Server catalog entry to project
 * @returns Dashboard picker row for GET llm-model-catalog
 */
export function toDashboardCatalogEntry(entry: LlmModelCatalogEntry): LlmModelDashboardCatalogEntry {
    return {
        id: entry.id,
        label: entry.label,
        costTier: entry.costTier,
        // App ∩ provider options for the reasoning picker
        reasoningOptions: appReasoningOptionsForEntry(entry),
    };
}
