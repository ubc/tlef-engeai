/**
 * ModelSelectionService — course per-feature LLM catalog, cache, and provider options.
 *
 * Owns the server catalog (models + supported reasoning), validates instructor
 * selections, persists resolution via EngEAI_MongoDB on cold miss, and keeps a
 * process-local Map keyed by courseId with 5-minute inactivity eviction
 * (ChatApp timer pattern). Callers must not re-read llmSettings from Mongo when
 * the Map already has the course.
 *
 * @author: gatahcha
 * @date: 2026-08-04
 * @version: 1.1.0
 * @description: Singleton model selection catalog + courseId cache for LLM features.
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
} from './model-selection-list';
import { VALID_MODEL_IDS, VALID_REASONING_LEVELS } from '../model-selection/model-selection-service';
import { isMockResponse } from '../helpers/mock-response';
import { appLogger } from '../utils/logger';

/** Feature keys that each store an independent model + reasoning selection. */
export const LLM_FEATURE_KEYS: readonly LlmFeatureKey[] = [
    'chat',
    'scenarioGeneration',
    'writingFeedback',
    'guidedPathway',
] as const;

/** Platform default when Mongo has no usable settings — one copy of DEFAULT_FEATURE_SELECTION per feature. */
export const DEFAULT_COURSE_LLM_SETTINGS: CourseLlmSettings = {
    chat: { ...DEFAULT_FEATURE_SELECTION },
    scenarioGeneration: { ...DEFAULT_FEATURE_SELECTION },
    writingFeedback: { ...DEFAULT_FEATURE_SELECTION },
    guidedPathway: { ...DEFAULT_FEATURE_SELECTION },
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
 * - Legacy flat llmSettings hydration to all four features
 * - Toolkit LLMOptions construction (model + optional reasoningEffort; no temperature with reasoning)
 *
 * @author: EngE-AI Team
 * @version: 1.1.0
 * @since: 2026-08-04
 */
export class ModelSelectionService {
    private static instance: ModelSelectionService | null = null;

    /** courseId → validated per-feature settings currently used by this process */
    private courseSettingsById = new Map<string, CourseLlmSettings>();
    /** courseId → inactivity cleanup timer (5 minutes, ChatApp pattern) */
    private courseSettingsTimers = new Map<string, NodeJS.Timeout>();
    private courseSettingsInactivityTimeout = 5 * 60 * 1000;

    /** Injectable for tests; defaults to EngEAI_MongoDB.getActiveCourse. */
    private courseLoader: CourseLoader | null = null;

    private constructor() {}

    /**
     * getInstance - returns the process-wide ModelSelectionService singleton.
     *
     * Creates the instance on first call; subsequent callers share the same cache Maps.
     *
     * @returns Shared singleton instance
     */
    static getInstance(): ModelSelectionService {
        // Create once if this process has not initialized the singleton yet
        if (!ModelSelectionService.instance) {
            ModelSelectionService.instance = new ModelSelectionService();
        }
        return ModelSelectionService.instance;
    }

    /**
     * resetInstanceForTests - drops the singleton and clears caches (tests only).
     *
     * Clears inactivity timers first so leftover timeouts cannot mutate a new instance.
     */
    static resetInstanceForTests(): void {
        // Evict all cached courses and clear timers before dropping the singleton
        if (ModelSelectionService.instance) {
            ModelSelectionService.instance.clearAllCaches();
        }
        ModelSelectionService.instance = null;
    }

    /**
     * setCourseLoaderForTests - injects a Mongo stub for cache-hit assertions.
     *
     * @param loader - Async course loader, or null to restore EngEAI_MongoDB default
     */
    setCourseLoaderForTests(loader: CourseLoader | null): void {
        this.courseLoader = loader;
    }

    /**
     * getCatalog - returns the server-owned model catalog for validation and internals.
     *
     * Includes verbatim provider `supportedReasoningLevels` (may include xhigh/max).
     * Dashboard UI should use {@link getDashboardCatalog} instead.
     *
     * @returns Catalog entries with provider-supported reasoning levels
     */
    getCatalog(): readonly LlmModelCatalogEntry[] {
        return LLM_MODEL_CATALOG;
    }

    /**
     * getDashboardCatalog - slim catalog payload for the Model Settings dashboard.
     *
     * Maps each server catalog row to id/label/costTier plus app-only reasoning options.
     * Brain icons are client-derived — not included in this response.
     *
     * @returns Models with reasoningOptions and the platform defaultSelection
     */
    getDashboardCatalog(): LlmModelCatalogApiResponse {
        // Project each catalog entry into the dashboard API shape
        return {
            models: LLM_MODEL_CATALOG.map(toDashboardCatalogEntry),
            defaultSelection: { ...DEFAULT_FEATURE_SELECTION },
        };
    }

    /**
     * getSettingsForCourse - returns validated per-feature LLM settings for one course.
     *
     * Cache-first: Map hit resets the 5-minute inactivity timer and returns immediately.
     * On miss, loads `activeCourse.llmSettings` from Mongo, normalizes (legacy flat → four
     * features), caches under courseId, starts a new timer, then returns.
     *
     * @param courseId - Active course id used as the Map key
     * @returns Resolved chat / scenario / writing / pathway selections
     * @throws When the course cannot be loaded from Mongo (or the test loader)
     */
    async getSettingsForCourse(courseId: string): Promise<CourseLlmSettings> {
        // Prefer the in-memory Map entry for this process
        const cached = this.courseSettingsById.get(courseId);
        if (cached) {
            // Touch the inactivity timer so active courses stay warm
            this.resetCourseSettingsTimer(courseId);
            return cached;
        }

        // Cold miss: load Mongo, normalize, then cache under courseId
        const fromDb = await this.loadAndNormalizeFromMongo(courseId);
        this.courseSettingsById.set(courseId, fromDb);
        this.resetCourseSettingsTimer(courseId);
        return fromDb;
    }

    /**
     * setCachedSettings - replaces the Map entry after a successful instructor PATCH.
     *
     * Does not write Mongo — the route must persist first, then call this to refresh
     * the process cache. Clones settings so callers cannot mutate the Map entry by reference.
     *
     * @param courseId - Course id Map key
     * @param settings - Already-validated per-feature settings
     */
    setCachedSettings(courseId: string, settings: CourseLlmSettings): void {
        // Store a shallow clone so external mutation cannot corrupt the cache
        this.courseSettingsById.set(courseId, cloneSettings(settings));
        this.resetCourseSettingsTimer(courseId);
    }

    /**
     * invalidateCourse - drops Map entry and timer so the next get reloads Mongo.
     *
     * @param courseId - Course id to evict
     */
    invalidateCourse(courseId: string): void {
        // Clear timer first so a pending eviction cannot race a later re-insert
        this.clearTimer(courseId);
        this.courseSettingsById.delete(courseId);
    }

    /**
     * buildFeatureLlmCallOptions - cache-first toolkit LLMOptions for one feature.
     *
     * Loads settings via {@link getSettingsForCourse}, then delegates to
     * {@link buildProviderOptions} for model / reasoningEffort assembly.
     *
     * @param courseId - Active course id
     * @param feature - Which feature row to apply (chat, scenario, writing, pathway)
     * @param baseOptions - Existing provider options merged first (e.g. Ollama num_ctx)
     * @returns Provider options including model and optional reasoningEffort
     */
    async buildFeatureLlmCallOptions(
        courseId: string,
        feature: LlmFeatureKey,
        baseOptions?: LLMOptions
    ): Promise<LLMOptions> {
        // Resolve (or load) this course's per-feature settings
        const settings = await this.getSettingsForCourse(courseId);
        // Build toolkit options from the selected feature row
        return this.buildProviderOptions(feature, settings, baseOptions);
    }

    /**
     * buildProviderOptions - builds toolkit LLMOptions from already-resolved settings.
     *
     * Picks the feature selection, sets `model`, and emits `reasoningEffort` only when
     * the catalog lists native reasoning for that model and the level is allowed.
     * When reasoning is set, strips `temperature` (toolkit: gpt-5-class models reject both).
     * Under MOCK_RESPONSE, logs model + reasoningEffort for verification without a live call.
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
        // Fall back to platform default if the feature row is somehow missing
        const selection = settings[feature] ?? DEFAULT_FEATURE_SELECTION;

        // Start from caller base options, then pin the catalog model id as the provider model
        const options: LLMOptions = {
            ...baseOptions,
            model: this.mapModelIdToProviderModel(selection.modelId),
        };

        // Look up provider-supported reasoning for this model
        const entry = LLM_MODEL_CATALOG.find((e) => e.id === selection.modelId);
        if (
            entry &&
            entry.supportedReasoningLevels.length > 0 &&
            entry.supportedReasoningLevels.includes(selection.reasoningLevel)
        ) {
            // Native reasoning models: pass reasoningEffort and drop temperature
            options.reasoningEffort = selection.reasoningLevel;
            delete options.temperature;
        }

        // Mock mode: log resolved options so instructors can verify settings without an API call
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
     * Uses {@link DEFAULT_COURSE_LLM_SETTINGS} instead of Mongo — for callers that
     * cannot resolve a course (e.g. pathway evaluation before course lookup succeeds).
     *
     * @param feature - Feature key
     * @param baseOptions - Existing provider options merged first
     * @returns Options from DEFAULT_COURSE_LLM_SETTINGS for that feature
     */
    buildDefaultProviderOptions(feature: LlmFeatureKey, baseOptions?: LLMOptions): LLMOptions {
        return this.buildProviderOptions(feature, DEFAULT_COURSE_LLM_SETTINGS, baseOptions);
    }

    /**
     * normalizeStoredSettings - expands legacy flat or partial Mongo rows to all four features.
     *
     * Never throws: invalid or missing input becomes {@link DEFAULT_COURSE_LLM_SETTINGS}.
     * Legacy flat `{ modelId, reasoningLevel }` is cloned onto every feature key.
     * Per-feature objects are sanitized independently via {@link sanitizeFeatureSelection}.
     *
     * @param stored - Raw llmSettings from Mongo (unknown shape)
     * @returns Validated CourseLlmSettings ready for cache / callers
     */
    normalizeStoredSettings(stored: unknown): CourseLlmSettings {
        // Missing or non-object → full platform defaults
        if (!stored || typeof stored !== 'object') {
            return cloneSettings(DEFAULT_COURSE_LLM_SETTINGS);
        }

        const record = stored as Record<string, unknown>;

        // Legacy flat shape: one model/reasoning applied to all four features
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
                updatedAt: record.updatedAt instanceof Date ? record.updatedAt : undefined,
                updatedBy: typeof record.updatedBy === 'string' ? record.updatedBy : undefined,
            };
        }

        // Modern per-feature shape: sanitize each feature independently
        return {
            chat: sanitizeFeatureSelection(record.chat),
            scenarioGeneration: sanitizeFeatureSelection(record.scenarioGeneration),
            writingFeedback: sanitizeFeatureSelection(record.writingFeedback),
            guidedPathway: sanitizeFeatureSelection(record.guidedPathway),
            updatedAt: record.updatedAt instanceof Date ? record.updatedAt : undefined,
            updatedBy: typeof record.updatedBy === 'string' ? record.updatedBy : undefined,
        };
    }

    /**
     * parseUpdateRequest - validates a full per-feature PATCH body or returns an error.
     *
     * Requires all four feature keys. Each feature must pass
     * {@link parseFeatureSelectionStrict} (AppReasoningLevel ∩ provider catalog).
     *
     * @param body - Request body from PATCH llm-settings
     * @returns `{ ok: true, settings }` or `{ ok: false, error }` with a feature-prefixed message
     */
    parseUpdateRequest(
        body: unknown
    ):
        | { ok: true; settings: UpdateCourseLlmSettingsRequest }
        | { ok: false; error: string } {
        // Reject non-objects before reading feature keys
        if (!body || typeof body !== 'object') {
            return {
                ok: false,
                error: 'Request body must include chat, scenarioGeneration, writingFeedback, and guidedPathway',
            };
        }

        const record = body as Record<string, unknown>;
        const result: Partial<UpdateCourseLlmSettingsRequest> = {};

        // Validate every feature key; fail fast on the first invalid selection
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
     * Copies validated feature selections and stamps provenance. Does not write Mongo.
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
            updatedAt: now,
            updatedBy: actorUserId,
        };
    }

    /**
     * mapModelIdToProviderModel - maps UI catalog ids to provider model strings.
     *
     * Today catalog ids match OpenAI model strings 1:1; keep this hook if mapping diverges.
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
     * App levels are none|low|medium|high only — not provider-only xhigh/max.
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
     * Checks the full provider list (may include xhigh/max), not only APP_REASONING_LEVELS.
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
     * hasCachedCourseForTests - whether the course is currently in the process Map (tests only).
     *
     * @param courseId - Course id to probe
     * @returns True when the Map has an entry for courseId
     */
    hasCachedCourseForTests(courseId: string): boolean {
        return this.courseSettingsById.has(courseId);
    }

    /**
     * loadAndNormalizeFromMongo - cold-path load: fetch course then normalize llmSettings.
     *
     * @param courseId - Active course id
     * @returns Normalized settings for caching
     * @throws When the course document is missing
     */
    private async loadAndNormalizeFromMongo(courseId: string): Promise<CourseLlmSettings> {
        // Load the course document (or test stub)
        const course = await this.loadCourse(courseId);
        if (!course) {
            throw new Error(`Course not found: ${courseId}`);
        }
        // Expand legacy / clamp invalid selections before caching
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
        // Prefer injectable loader in tests
        if (this.courseLoader) {
            return this.courseLoader(courseId);
        }
        // Production: read active-course-list via the Mongo façade
        const mongo = await EngEAI_MongoDB.getInstance();
        return (await mongo.getActiveCourse(courseId)) as Pick<
            activeCourse,
            'id' | 'llmSettings'
        > | null;
    }

    /**
     * resetCourseSettingsTimer - replaces the 5-minute inactivity eviction timer for a course.
     *
     * @param courseId - Course whose cache entry should expire after inactivity
     */
    private resetCourseSettingsTimer(courseId: string): void {
        // Cancel any existing timer before scheduling a fresh one
        this.clearTimer(courseId);
        const timer = setTimeout(() => {
            // Evict Map entry and timer bookkeeping after inactivity
            this.courseSettingsById.delete(courseId);
            this.courseSettingsTimers.delete(courseId);
        }, this.courseSettingsInactivityTimeout);
        // Unref so idle cache timers do not keep the process alive in tests/scripts
        if (typeof timer.unref === 'function') {
            timer.unref();
        }
        this.courseSettingsTimers.set(courseId, timer);
    }

    /**
     * clearTimer - clears one course's inactivity timeout if present.
     *
     * @param courseId - Course whose timer to clear
     */
    private clearTimer(courseId: string): void {
        const existing = this.courseSettingsTimers.get(courseId);
        if (existing) {
            clearTimeout(existing);
            this.courseSettingsTimers.delete(courseId);
        }
    }

    /**
     * clearAllCaches - clears every course timer and empties the settings Map (tests / reset).
     */
    private clearAllCaches(): void {
        // Clear timers first so none fire after the Map is emptied
        for (const courseId of Array.from(this.courseSettingsTimers.keys())) {
            this.clearTimer(courseId);
        }
        this.courseSettingsById.clear();
    }
}

/**
 * cloneSettings - shallow-clones CourseLlmSettings so Map entries are not shared by reference.
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
        updatedAt: settings.updatedAt,
        updatedBy: settings.updatedBy,
    };
}

/**
 * isLegacyFlatSettings - detects pre-per-feature `{ modelId, reasoningLevel }` Mongo rows.
 *
 * True only when flat keys exist and no modern feature key is present.
 *
 * @param record - Raw llmSettings object
 * @returns True when the row should be expanded to all four features
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
 * Used on read paths (normalize). Invalid model/reasoning fall back to defaults;
 * reasoning outside APP ∩ provider is clamped to default or the first allowed level.
 *
 * @param value - Unknown feature row from Mongo or legacy seed
 * @returns Always a valid FeatureLlmSelection (never throws)
 */
function sanitizeFeatureSelection(value: unknown): FeatureLlmSelection {
    // Non-object → full platform default selection
    if (!value || typeof value !== 'object') {
        return { ...DEFAULT_FEATURE_SELECTION };
    }

    const record = value as Record<string, unknown>;

    // Accept catalog model id or fall back to default
    const modelId = isCourseLlmModelIdValue(record.modelId)
        ? record.modelId
        : DEFAULT_FEATURE_SELECTION.modelId;

    // Accept app reasoning level or fall back to default
    let reasoningLevel = isAppReasoningLevelValue(record.reasoningLevel)
        ? record.reasoningLevel
        : DEFAULT_FEATURE_SELECTION.reasoningLevel;

    // When the model supports reasoning, clamp to APP ∩ provider for that model
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
 * Rejects unknown model ids, non-app reasoning levels, and app levels not listed
 * on the model's provider catalog when the model supports reasoning.
 *
 * @param value - One feature object from the PATCH body
 * @returns `{ ok: true, selection }` or `{ ok: false, error }` with a human-readable reason
 */
function parseFeatureSelectionStrict(
    value: unknown
): { ok: true; selection: FeatureLlmSelection } | { ok: false; error: string } {
    // Require a plain object with the expected fields
    if (!value || typeof value !== 'object') {
        return { ok: false, error: 'must be an object with modelId and reasoningLevel' };
    }

    const record = value as Record<string, unknown>;

    // modelId must be in the server catalog
    if (!isCourseLlmModelIdValue(record.modelId)) {
        return { ok: false, error: 'modelId must be a supported catalog id' };
    }

    // reasoningLevel must be an app-persisted level (not xhigh/max)
    if (!isAppReasoningLevelValue(record.reasoningLevel)) {
        return { ok: false, error: 'reasoningLevel must be none, low, medium, or high' };
    }

    // When the model lists provider reasoning, the app level must be in that intersection
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
