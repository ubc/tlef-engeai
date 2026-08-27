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
 *
 * Only `gpt-5.6-luna` advertises reasoning, and that is a hard constraint of the pinned
 * toolkit, not just a provider fact. `ubc-genai-toolkit-llm@0.5.0` decides reasoning
 * capability from the model id alone (`getOpenAIReasoningCapability` in
 * providers/openai-compat-mapping): only ids starting `gpt-5` / `o1` / `o3` / `o4-mini`
 * are reasoning-capable, and sending `reasoningEffort` for anything else throws a
 * client-side `APIError` 400 before the request is issued. Both the `openai` and
 * `ubc-llm-sandbox` providers share that gate, so a non-empty list on the Qwen or
 * local-mini ids would break every call for those models the moment they are enabled.
 *
 * That matches the provider behaviour independently: Qwen3 ignores `reasoning_effort`
 * entirely — its thinking is a chat-template flag (`chat_template_kwargs.enable_thinking`),
 * not an effort scale. NOTE: Qwen therefore *thinks by default* and we send nothing to
 * stop it. Turning thinking off needs a toolkit new enough to translate
 * `reasoningEffort: 'none'` into that flag; 0.5.0 has no such translation. Revisit these
 * lists on a toolkit upgrade. `gpt-4.1-mini-engeai-local` is not a reasoning model at all.
 */
export const LLM_MODEL_SPECS: Record<CourseLlmModelId, LlmModelSpec> = {
    'gpt-5.6-luna': {
        label: 'GPT 5.6 Luna',
        costTier: 'high',
        supportedReasoningLevels: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
    },
    'qwen3.8-27b': {
        label: 'Qwen 3.8 27B',
        costTier: 'medium',
        supportedReasoningLevels: [],
    },
    'qwen3.6-35b-a3b': {
        label: 'Qwen 3.6 35B A3B',
        costTier: 'medium',
        supportedReasoningLevels: [],
    },
    'gpt-4.1-mini-engeai-local': {
        label: 'GPT 4.1 Mini (EngE-AI Local)',
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
 * TEMPORARILY_UNAVAILABLE_MODEL_IDS - models withheld from selection while the
 * platform LLM API key is provisioned for `gpt-5.6-luna` only.
 *
 * TEMPORARY: the incoming platform API adds `qwen3.8-27b`, `qwen3.6-35b-a3b`, and
 * `gpt-4.1-mini-engeai-local`. They ship in the catalog now so instructors can see
 * what is coming, but stay withheld until that API is live — remove the ids from
 * this list (leave it empty) at cutover. Entries stay in {@link LLM_MODEL_SPECS}
 * so labels, cost tiers, and provider reasoning lists survive the round trip.
 */
export const TEMPORARILY_UNAVAILABLE_MODEL_IDS: readonly CourseLlmModelId[] = [
    'qwen3.8-27b',
    'qwen3.6-35b-a3b',
    'gpt-4.1-mini-engeai-local',
] as const;

/**
 * SELECTABLE_MODEL_CATALOG - catalog entries instructors may actually pick.
 *
 * {@link LLM_MODEL_CATALOG} minus {@link TEMPORARILY_UNAVAILABLE_MODEL_IDS}. Drives
 * the dashboard picker payload and the model-id guards, so withheld models are
 * neither offered nor persistable while the key is limited.
 */
export const SELECTABLE_MODEL_CATALOG: readonly LlmModelCatalogEntry[] = LLM_MODEL_CATALOG.filter(
    (entry) => !TEMPORARILY_UNAVAILABLE_MODEL_IDS.includes(entry.id)
);

/** Valid model IDs — selectable entries only, so withheld models fail validation. */
export const VALID_MODEL_IDS: readonly CourseLlmModelId[] = SELECTABLE_MODEL_CATALOG.map((e) => e.id);

/** App UI / PATCH / persistence reasoning levels (not the full provider catalog). */
export const VALID_REASONING_LEVELS: readonly AppReasoningLevel[] = APP_REASONING_LEVELS;

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
 * Withheld models are still projected, flagged `unavailable` so the picker can grey
 * them out instead of hiding them.
 *
 * @param entry - Server catalog entry to project
 * @returns Dashboard picker row for GET llm-model-catalog
 */
export function toDashboardCatalogEntry(entry: LlmModelCatalogEntry): LlmModelDashboardCatalogEntry {
    const row: LlmModelDashboardCatalogEntry = {
        id: entry.id,
        label: entry.label,
        costTier: entry.costTier,
        // App ∩ provider options for the reasoning picker
        reasoningOptions: appReasoningOptionsForEntry(entry),
    };

    // Flag rather than omit — instructors see why a familiar model cannot be picked
    if (TEMPORARILY_UNAVAILABLE_MODEL_IDS.includes(entry.id)) {
        row.unavailable = true;
    }

    return row;
}
