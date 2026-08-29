/**
 * ModelSelectionService — course per-feature LLM catalog, cache, and provider options.
 *
 * Owns the server catalog (models + supported reasoning), validates instructor
 * selections, and resolves `activeCourse.llmSettings` via a process-local Map
 * keyed by courseId with 5-minute inactivity eviction. Concurrent cold misses
 * share one in-flight Mongo load. After a successful instructor PATCH, callers
 * must write Mongo first then {@link setCachedSettings} (single-process freshness).
 *
 * @author: gatahcha
 * @date: 2026-08-04
 * @version: 2.1.0
 * @description: Singleton model selection catalog + courseId Map cache for LLM features.
 */

import type {
    activeCourse,
    AppReasoningLevel,
    CourseLlmModelId,
    CourseLlmSettings,
    FeatureLlmSelection,
    LlmFeatureKey,
    LlmModelCatalogApiResponse,
    LlmModelCatalogEntry,
    ProviderReasoningLevel,
    UpdateCourseLlmSettingsRequest,
} from '../types/shared';
import type { LLMOptions } from 'ubc-genai-toolkit-llm';
import { EngEAI_MongoDB } from '../db/enge-ai-mongodb';
import {
    APP_REASONING_LEVELS,
    DEFAULT_FEATURE_SELECTION,
    LLM_MODEL_CATALOG,
    toDashboardCatalogEntry,
    VALID_MODEL_IDS,
    VALID_REASONING_LEVELS,
} from './model-selection-list';
import { isMockResponse } from '../helpers/mock-response';
import { appLogger } from '../utils/logger';

/** Feature keys that each store an independent model + reasoning selection. */
export const LLM_FEATURE_KEYS: readonly LlmFeatureKey[] = [
    'chat',
    'scenarioGeneration',
    'writingFeedback',
    'guidedPathway',
    'memoryAgent',
] as const;

/** Platform default when Mongo has no usable settings — one copy of DEFAULT_FEATURE_SELECTION per feature. */
export const DEFAULT_COURSE_LLM_SETTINGS: CourseLlmSettings = {
    chat: { ...DEFAULT_FEATURE_SELECTION },
    scenarioGeneration: { ...DEFAULT_FEATURE_SELECTION },
    writingFeedback: { ...DEFAULT_FEATURE_SELECTION },
    guidedPathway: { ...DEFAULT_FEATURE_SELECTION },
    memoryAgent: { ...DEFAULT_FEATURE_SELECTION },
};

export {
    DEFAULT_FEATURE_SELECTION,
    LLM_MODEL_CATALOG,
} from './model-selection-list';

/** Injectable course loader for tests; production uses EngEAI_MongoDB.getActiveCourse. */
type CourseLoader = (courseId: string) => Promise<Pick<activeCourse, 'id' | 'llmSettings'> | null>;

/**
 * ModelSelectionService
 *
 * Singleton catalog + resolver for course feature LLM settings.
 *
 * Key Features:
 * - Server-owned model catalog with per-model supported reasoning levels
 * - Cache-first Map keyed by courseId with 5-minute inactivity eviction
 * - Cold-miss single-flight dedupe; write-through via setCachedSettings after PATCH
 * - Legacy flat llmSettings hydration to all five features
 * - Toolkit LLMOptions construction (model + optional reasoningEffort; no temperature with reasoning)
 *
 * @author: EngE-AI Team
 * @version: 2.1.0
 * @since: 2026-08-04
 */
export class ModelSelectionService {
    private static instance: ModelSelectionService | null = null;

    /** courseId → validated per-feature settings currently used by this process */
    private courseSettingsById = new Map<string, CourseLlmSettings>();
    /** courseId → inactivity cleanup timer (5 minutes) */
    private courseSettingsTimers = new Map<string, NodeJS.Timeout>();
    private courseSettingsInactivityTimeout = 5 * 60 * 1000;

    /** courseId → in-flight Mongo normalize Promise (cleared when settled) */
    private inflightLoads = new Map<string, Promise<CourseLlmSettings>>();

    /** Injectable for tests; defaults to EngEAI_MongoDB.getActiveCourse. */
    private courseLoader: CourseLoader | null = null;

    private constructor() {}

    /**
     * getInstance - returns the process-wide ModelSelectionService singleton.
     *
     * @returns Shared singleton instance
     */
    static getInstance(): ModelSelectionService {
        if (!ModelSelectionService.instance) {
            ModelSelectionService.instance = new ModelSelectionService();
        }
        return ModelSelectionService.instance;
    }

    /**
     * resetInstanceForTests - drops the singleton and clears caches (tests only).
     */
    static resetInstanceForTests(): void {
        if (ModelSelectionService.instance) {
            ModelSelectionService.instance.clearAllCaches();
        }
        ModelSelectionService.instance = null;
    }

    /**
     * setCourseLoaderForTests - injects a Mongo stub for load assertions.
     *
     * @param loader - Async course loader, or null to restore EngEAI_MongoDB default
     */
    setCourseLoaderForTests(loader: CourseLoader | null): void {
        this.courseLoader = loader;
    }

    /**
     * getCatalog - returns the server-owned model catalog for validation and internals.
     *
     * @returns Catalog entries with provider-supported reasoning levels
     */
    getCatalog(): readonly LlmModelCatalogEntry[] {
        return LLM_MODEL_CATALOG;
    }

    /**
     * getDashboardCatalog - slim catalog payload for the Model Settings dashboard.
     *
     * @returns Models with reasoningOptions and the platform defaultSelection
     */
    getDashboardCatalog(): LlmModelCatalogApiResponse {
        // Every model ships; withheld ones carry `unavailable` so the picker greys them out
        return {
            models: LLM_MODEL_CATALOG.map(toDashboardCatalogEntry),
            defaultSelection: { ...DEFAULT_FEATURE_SELECTION },
        };
    }

    /**
     * getSettingsForCourse - returns validated per-feature LLM settings for one course.
     *
     * Cache-first: Map hit resets the 5-minute inactivity timer and returns immediately.
     * On miss, single-flight loads Mongo, normalizes, caches under courseId, starts a timer.
     *
     * @param courseId - Active course id used as the Map key
     * @returns Resolved per-feature selections
     * @throws When the course cannot be loaded from Mongo (or the test loader)
     */
    async getSettingsForCourse(courseId: string): Promise<CourseLlmSettings> {
        const cached = this.courseSettingsById.get(courseId);
        if (cached) {
            this.resetCourseSettingsTimer(courseId);
            return cached;
        }

        const existing = this.inflightLoads.get(courseId);
        if (existing) {
            return existing;
        }

        const pending = this.loadAndNormalizeFromMongo(courseId)
            .then((fromDb) => {
                this.courseSettingsById.set(courseId, fromDb);
                this.resetCourseSettingsTimer(courseId);
                return fromDb;
            })
            .finally(() => {
                this.inflightLoads.delete(courseId);
            });
        this.inflightLoads.set(courseId, pending);
        return pending;
    }

    /**
     * setCachedSettings - replaces the Map entry after a successful instructor PATCH.
     *
     * Does not write Mongo — the route must persist first, then call this.
     * Clones settings so callers cannot mutate the Map entry by reference.
     *
     * @param courseId - Course id Map key
     * @param settings - Already-validated per-feature settings
     */
    setCachedSettings(courseId: string, settings: CourseLlmSettings): void {
        this.courseSettingsById.set(courseId, cloneSettings(settings));
        this.resetCourseSettingsTimer(courseId);
    }

    /**
     * invalidateCourse - drops Map entry and timer so the next get reloads Mongo.
     *
     * @param courseId - Course id to evict
     */
    invalidateCourse(courseId: string): void {
        this.clearTimer(courseId);
        this.courseSettingsById.delete(courseId);
    }

    /**
     * hasCachedCourseForTests - whether the course is currently in the process Map (tests only).
     *
     * @param courseId - Course id to probe
     * @returns True when the Map has an entry for courseId
     */
    hasCachedCourseForTests(courseId: string): boolean {
        return this.courseSettingsById.has(courseId);
    }

    /**
     * buildFeatureLlmCallOptions - toolkit LLMOptions for one feature via cache/Mongo settings.
     *
     * @param courseId - Active course id
     * @param feature - Which feature row to apply
     * @param baseOptions - Existing provider options merged first (e.g. Ollama num_ctx)
     * @returns Provider options including model and optional reasoningEffort
     */
    async buildFeatureLlmCallOptions(
        courseId: string,
        feature: LlmFeatureKey,
        baseOptions?: LLMOptions
    ): Promise<LLMOptions> {
        const settings = await this.getSettingsForCourse(courseId);
        return this.buildProviderOptions(feature, settings, baseOptions);
    }

    /**
     * buildProviderOptions - builds toolkit LLMOptions from already-resolved settings.
     *
     * @param feature - Feature key whose selection to apply
     * @param settings - Validated per-feature settings
     * @param baseOptions - Merged first; model/reasoning from settings override
     * @returns Provider-ready options for the feature selection
     */
    buildProviderOptions(
        feature: LlmFeatureKey,
        settings: CourseLlmSettings,
        baseOptions?: LLMOptions
    ): LLMOptions {
        const selection = settings[feature] ?? DEFAULT_FEATURE_SELECTION;

        const options: LLMOptions = {
            ...baseOptions,
            model: this.mapModelIdToProviderModel(selection.modelId),
        };

        const entry = LLM_MODEL_CATALOG.find((e) => e.id === selection.modelId);
        if (
            entry &&
            entry.supportedReasoningLevels.length > 0 &&
            entry.supportedReasoningLevels.includes(selection.reasoningLevel)
        ) {
            options.reasoningEffort = selection.reasoningLevel;
            delete options.temperature;
        }

        if (isMockResponse()) {
            appLogger.log(
                `[MOCK-RESPONSE][${feature}] model=${String(options.model)} reasoningEffort=${
                    options.reasoningEffort ?? '(omitted — model has no native reasoning)'
                }`
            );
        }

        return options;
    }

    /**
     * buildDefaultProviderOptions - platform defaults when course id is unavailable.
     *
     * @param feature - Feature key
     * @param baseOptions - Existing provider options merged first
     * @returns Options from DEFAULT_COURSE_LLM_SETTINGS for that feature
     */
    buildDefaultProviderOptions(feature: LlmFeatureKey, baseOptions?: LLMOptions): LLMOptions {
        return this.buildProviderOptions(feature, DEFAULT_COURSE_LLM_SETTINGS, baseOptions);
    }

    /**
     * normalizeStoredSettings - expands legacy flat or partial Mongo rows to all five features.
     *
     * @param stored - Raw llmSettings from Mongo (unknown shape)
     * @returns Validated CourseLlmSettings ready for callers
     */
    normalizeStoredSettings(stored: unknown): CourseLlmSettings {
        if (!stored || typeof stored !== 'object') {
            return cloneSettings(DEFAULT_COURSE_LLM_SETTINGS);
        }

        const record = stored as Record<string, unknown>;

        if (isLegacyFlatSettings(record)) {
            const seed = sanitizeFeatureSelection({
                modelId: record.modelId,
                reasoningLevel: record.reasoningLevel,
            });
            return {
                chat: { ...seed },
                scenarioGeneration: { ...seed },
                writingFeedback: { ...seed },
                guidedPathway: { ...seed },
                memoryAgent: { ...seed },
                updatedAt: record.updatedAt instanceof Date ? record.updatedAt : undefined,
                updatedBy: typeof record.updatedBy === 'string' ? record.updatedBy : undefined,
            };
        }

        return {
            chat: sanitizeFeatureSelection(record.chat),
            scenarioGeneration: sanitizeFeatureSelection(record.scenarioGeneration),
            writingFeedback: sanitizeFeatureSelection(record.writingFeedback),
            guidedPathway: sanitizeFeatureSelection(record.guidedPathway),
            memoryAgent: sanitizeFeatureSelection(record.memoryAgent),
            updatedAt: record.updatedAt instanceof Date ? record.updatedAt : undefined,
            updatedBy: typeof record.updatedBy === 'string' ? record.updatedBy : undefined,
        };
    }

    /**
     * parseUpdateRequest - validates a full per-feature PATCH body or returns an error.
     *
     * Requires all five feature keys.
     *
     * @param body - Request body from PATCH llm-settings
     * @returns `{ ok: true, settings }` or `{ ok: false, error }`
     */
    parseUpdateRequest(
        body: unknown
    ):
        | { ok: true; settings: UpdateCourseLlmSettingsRequest }
        | { ok: false; error: string } {
        if (!body || typeof body !== 'object') {
            return {
                ok: false,
                error:
                    'Request body must include chat, scenarioGeneration, writingFeedback, guidedPathway, and memoryAgent',
            };
        }

        const record = body as Record<string, unknown>;
        const result: Partial<UpdateCourseLlmSettingsRequest> = {};

        for (const key of LLM_FEATURE_KEYS) {
            const parsed = parseFeatureSelectionStrict(record[key]);
            if (!parsed.ok) {
                return { ok: false, error: `${key}: ${parsed.error}` };
            }
            result[key] = parsed.selection;
        }

        return { ok: true, settings: result as UpdateCourseLlmSettingsRequest };
    }

    /**
     * updateCourseLlmSettings - builds the next persisted settings object for PATCH.
     *
     * @param features - Validated per-feature selections from parseUpdateRequest
     * @param actorUserId - Roster user id of the instructor/admin who saved
     * @param now - Provenance timestamp (defaults to now)
     * @returns Object ready to write to activeCourse.llmSettings
     */
    updateCourseLlmSettings(
        features: UpdateCourseLlmSettingsRequest,
        actorUserId: string,
        now: Date = new Date()
    ): CourseLlmSettings {
        return {
            chat: { ...features.chat },
            scenarioGeneration: { ...features.scenarioGeneration },
            writingFeedback: { ...features.writingFeedback },
            guidedPathway: { ...features.guidedPathway },
            memoryAgent: { ...features.memoryAgent },
            updatedAt: now,
            updatedBy: actorUserId,
        };
    }

    /**
     * mapModelIdToProviderModel - maps UI catalog ids to provider model strings.
     *
     * @param modelId - Catalog id from FeatureLlmSelection
     * @returns Provider model string passed to ubc-genai-toolkit-llm
     */
    mapModelIdToProviderModel(modelId: CourseLlmModelId): string {
        return modelId;
    }

    /**
     * isCourseLlmModelId - type guard for catalog model ids.
     *
     * @param value - Candidate from request body or storage
     * @returns True when value is a known CourseLlmModelId
     */
    isCourseLlmModelId(value: unknown): value is CourseLlmModelId {
        return typeof value === 'string' && (VALID_MODEL_IDS as readonly string[]).includes(value);
    }

    /**
     * isAppReasoningLevel - type guard for app UI / persisted reasoning levels.
     *
     * @param value - Candidate from request body or storage
     * @returns True when value is an AppReasoningLevel
     */
    isAppReasoningLevel(value: unknown): value is AppReasoningLevel {
        return typeof value === 'string' && (VALID_REASONING_LEVELS as readonly string[]).includes(value);
    }

    /**
     * isReasoningSupported - whether the provider catalog advertises this model–reasoning pair.
     *
     * @param modelId - Catalog model
     * @param level - Requested reasoning (may include provider-only levels)
     * @returns True when the catalog lists the level for the model
     */
    isReasoningSupported(modelId: CourseLlmModelId, level: ProviderReasoningLevel): boolean {
        const entry = LLM_MODEL_CATALOG.find((e) => e.id === modelId);
        return Boolean(entry?.supportedReasoningLevels.includes(level));
    }

    /**
     * loadAndNormalizeFromMongo - fetch course then normalize llmSettings.
     *
     * @param courseId - Active course id
     * @returns Normalized settings
     * @throws When the course document is missing
     */
    private async loadAndNormalizeFromMongo(courseId: string): Promise<CourseLlmSettings> {
        const course = await this.loadCourse(courseId);
        if (!course) {
            throw new Error(`Course not found: ${courseId}`);
        }
        return this.normalizeStoredSettings(course.llmSettings);
    }

    /**
     * loadCourse - resolves course id + llmSettings via test loader or EngEAI_MongoDB.
     *
     * @param courseId - Active course id
     * @returns Course stub or null when missing
     */
    private async loadCourse(
        courseId: string
    ): Promise<Pick<activeCourse, 'id' | 'llmSettings'> | null> {
        if (this.courseLoader) {
            return this.courseLoader(courseId);
        }
        const mongo = await EngEAI_MongoDB.getInstance();
        return (await mongo.getActiveCourse(courseId)) as Pick<
            activeCourse,
            'id' | 'llmSettings'
        > | null;
    }

    /**
     * clearAllCaches - clears Map, timers, and in-flight loads (tests / reset).
     */
    private clearAllCaches(): void {
        for (const courseId of this.courseSettingsTimers.keys()) {
            this.clearTimer(courseId);
        }
        this.courseSettingsById.clear();
        this.inflightLoads.clear();
    }

    /**
     * resetCourseSettingsTimer - (re)starts the 5-minute inactivity eviction timer.
     *
     * @param courseId - Course id whose Map lifetime to renew
     */
    private resetCourseSettingsTimer(courseId: string): void {
        this.clearTimer(courseId);
        const timer = setTimeout(() => {
            this.courseSettingsById.delete(courseId);
            this.courseSettingsTimers.delete(courseId);
        }, this.courseSettingsInactivityTimeout);
        timer.unref?.();
        this.courseSettingsTimers.set(courseId, timer);
    }

    /**
     * clearTimer - cancels and drops the inactivity timer for one course.
     *
     * @param courseId - Course id whose timer to clear
     */
    private clearTimer(courseId: string): void {
        const existing = this.courseSettingsTimers.get(courseId);
        if (existing) {
            clearTimeout(existing);
            this.courseSettingsTimers.delete(courseId);
        }
    }
}

/**
 * cloneSettings - shallow-clones CourseLlmSettings.
 *
 * @param settings - Settings to clone
 * @returns New object with cloned feature rows
 */
function cloneSettings(settings: CourseLlmSettings): CourseLlmSettings {
    return {
        chat: { ...settings.chat },
        scenarioGeneration: { ...settings.scenarioGeneration },
        writingFeedback: { ...settings.writingFeedback },
        guidedPathway: { ...settings.guidedPathway },
        memoryAgent: { ...settings.memoryAgent },
        updatedAt: settings.updatedAt,
        updatedBy: settings.updatedBy,
    };
}

/**
 * isLegacyFlatSettings - detects pre-per-feature `{ modelId, reasoningLevel }` Mongo rows.
 *
 * @param record - Raw llmSettings object
 * @returns True when the row should be expanded to all five features
 */
function isLegacyFlatSettings(
    record: Record<string, unknown>
): record is { modelId: unknown; reasoningLevel: unknown; updatedAt?: unknown; updatedBy?: unknown } {
    const hasFlat = 'modelId' in record && 'reasoningLevel' in record;
    const hasFeature = LLM_FEATURE_KEYS.some((k) => k in record && record[k] != null);
    return hasFlat && !hasFeature;
}

/**
 * appAllowedReasoningLevels - APP_REASONING_LEVELS ∩ provider supportedReasoningLevels.
 *
 * @param entry - Server catalog entry for one model
 * @returns App levels instructors may pick for this model
 */
function appAllowedReasoningLevels(entry: LlmModelCatalogEntry): AppReasoningLevel[] {
    return APP_REASONING_LEVELS.filter((level) => entry.supportedReasoningLevels.includes(level));
}

/**
 * sanitizeFeatureSelection - clamps one feature selection to a valid catalog pair (lenient).
 *
 * @param value - Unknown feature row from Mongo or legacy seed
 * @returns Always a valid FeatureLlmSelection (never throws)
 */
function sanitizeFeatureSelection(value: unknown): FeatureLlmSelection {
    if (!value || typeof value !== 'object') {
        return { ...DEFAULT_FEATURE_SELECTION };
    }

    const record = value as Record<string, unknown>;

    const modelId = isCourseLlmModelIdValue(record.modelId)
        ? record.modelId
        : DEFAULT_FEATURE_SELECTION.modelId;

    let reasoningLevel = isAppReasoningLevelValue(record.reasoningLevel)
        ? record.reasoningLevel
        : DEFAULT_FEATURE_SELECTION.reasoningLevel;

    const entry = LLM_MODEL_CATALOG.find((e) => e.id === modelId);
    if (entry && entry.supportedReasoningLevels.length > 0) {
        const allowed = appAllowedReasoningLevels(entry);
        if (!allowed.includes(reasoningLevel)) {
            reasoningLevel = allowed.includes(DEFAULT_FEATURE_SELECTION.reasoningLevel)
                ? DEFAULT_FEATURE_SELECTION.reasoningLevel
                : allowed[0] ?? DEFAULT_FEATURE_SELECTION.reasoningLevel;
        }
    }

    return { modelId, reasoningLevel };
}

/**
 * parseFeatureSelectionStrict - validates one feature selection for PATCH (strict).
 *
 * @param value - One feature object from the PATCH body
 * @returns `{ ok: true, selection }` or `{ ok: false, error }`
 */
function parseFeatureSelectionStrict(
    value: unknown
): { ok: true; selection: FeatureLlmSelection } | { ok: false; error: string } {
    if (!value || typeof value !== 'object') {
        return { ok: false, error: 'must be an object with modelId and reasoningLevel' };
    }

    const record = value as Record<string, unknown>;

    if (!isCourseLlmModelIdValue(record.modelId)) {
        return { ok: false, error: 'modelId must be a supported catalog id' };
    }

    if (!isAppReasoningLevelValue(record.reasoningLevel)) {
        return { ok: false, error: 'reasoningLevel must be none, low, medium, or high' };
    }

    const entry = LLM_MODEL_CATALOG.find((e) => e.id === record.modelId);
    if (
        entry &&
        entry.supportedReasoningLevels.length > 0 &&
        !appAllowedReasoningLevels(entry).includes(record.reasoningLevel)
    ) {
        return {
            ok: false,
            error: `reasoningLevel ${record.reasoningLevel} is not supported for ${record.modelId}`,
        };
    }

    return {
        ok: true,
        selection: { modelId: record.modelId, reasoningLevel: record.reasoningLevel },
    };
}

/**
 * isCourseLlmModelIdValue - module-local type guard using VALID_MODEL_IDS.
 *
 * @param value - Candidate
 * @returns True when value is a CourseLlmModelId
 */
function isCourseLlmModelIdValue(value: unknown): value is CourseLlmModelId {
    return typeof value === 'string' && (VALID_MODEL_IDS as readonly string[]).includes(value);
}

/**
 * isAppReasoningLevelValue - module-local type guard using VALID_REASONING_LEVELS.
 *
 * @param value - Candidate
 * @returns True when value is an AppReasoningLevel
 */
function isAppReasoningLevelValue(value: unknown): value is AppReasoningLevel {
    return typeof value === 'string' && (VALID_REASONING_LEVELS as readonly string[]).includes(value);
}

/**
 * isCourseLlmModelId - module-level convenience wrapper over the singleton.
 *
 * @param value - Candidate
 * @returns True when value is a catalog model id
 */
export function isCourseLlmModelId(value: unknown): value is CourseLlmModelId {
    return ModelSelectionService.getInstance().isCourseLlmModelId(value);
}

/**
 * isAppReasoningLevel - module-level convenience wrapper over the singleton.
 *
 * @param value - Candidate
 * @returns True when value is none|low|medium|high
 */
export function isAppReasoningLevel(value: unknown): value is AppReasoningLevel {
    return ModelSelectionService.getInstance().isAppReasoningLevel(value);
}
