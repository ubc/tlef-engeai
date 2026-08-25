// public/scripts/feature/model-setting.ts
/**
 * Model Settings — per-feature LLM model + reasoning pickers persisted on the course.
 *
 * Catalog (model ids, labels, costTier, app reasoning options) loads from
 * GET `/api/courses/:courseId/llm-model-catalog`. Brain icons are client-derived
 * from costTier and reasoning id — not from the API. Saves via PATCH llm-settings.
 * Writing Feedback, Guided Pathway, and Memory Agent rows stay visible but are
 * non-interactive until the matching Extra Feature capability is enabled.
 *
 * @author: EngE-AI Team
 * @date: 2026-08-05
 * @version: 5.0.0
 * @description: Dashboard Model Settings with per-feature persistence.
 */

import {
    activeCourse,
    AppReasoningLevel,
    CourseLlmModelId,
    CourseLlmSettings,
    FeatureLlmSelection,
    LlmFeatureKey,
    LlmModelCatalogApiResponse,
    LlmModelDashboardCatalogEntry,
    LlmReasoningCatalogOption,
} from '../types.js';
import { showErrorModal } from '../ui/modal-overlay.js';
import { showErrorToast, showSuccessToast } from '../ui/toast-notification.js';

type PickerKind = 'reasoning' | 'model';

type FeatureLlmSettingsMap = Record<LlmFeatureKey, FeatureLlmSelection>;

/** Course Extra Feature keys that gate Model Settings row interactivity. */
type GatedCapabilityKey = 'writingFeedback' | 'guidedPathway' | 'memoryAgent' | 'scenarioGeneration';

interface FeatureCatalogEntry {
    key: LlmFeatureKey;
    label: string;
    /** When set, row is interactive only if that course capability is enabled. */
    requiresCapability?: GatedCapabilityKey;
}

const FEATURE_CATALOG: FeatureCatalogEntry[] = [
    { key: 'chat', label: 'Chat' },
    { key: 'scenarioGeneration', label: 'Scenario Generation', requiresCapability: 'scenarioGeneration' },
    { key: 'writingFeedback', label: 'Writing Feedback', requiresCapability: 'writingFeedback' },
    { key: 'guidedPathway', label: 'Guided Pathway', requiresCapability: 'guidedPathway' },
    { key: 'memoryAgent', label: 'Memory Agent', requiresCapability: 'memoryAgent' },
];

/** Reasoning picker — app levels only; none = no brain icon. */
const REASONING_BRAIN_COUNT: Record<AppReasoningLevel, number> = {
    none: 0,
    low: 1,
    medium: 2,
    high: 3,
};

/** Short badge on a model the platform cannot currently serve. */
const MODEL_UNAVAILABLE_NOTE = 'Unavailable';

/** Full explanation, surfaced as the disabled option's tooltip. */
const MODEL_UNAVAILABLE_HINT =
    'This model is temporarily unavailable on the platform API key and cannot be selected right now.';

/** Model row — replaces former $ / $$ / $$$ costLabel from API. */
const COST_TIER_BRAIN_COUNT: Record<'low' | 'medium' | 'high', number> = {
    low: 1,
    medium: 2,
    high: 3,
};

let modelCatalog: LlmModelDashboardCatalogEntry[] = [];
let defaultSelection: FeatureLlmSelection = {
    modelId: 'gpt-5.6-luna',
    reasoningLevel: 'none',
};

let featureSettings: FeatureLlmSettingsMap | null = null;
let persistedSnapshot: FeatureLlmSettingsMap | null = null;
let currentCourseRef: activeCourse | null = null;
let canManageState = false;
let openPickerId: string | null = null;
let documentClickBound = false;
let isSaving = false;

/**
 * getAffectedFeaturesCopy — short list of features that consume LLM settings.
 */
export function getAffectedFeaturesCopy(): string {
    return 'Chat, Writing Feedback, Scenario Generation, Guided Pathway, and Memory Agent';
}

/**
 * initializeModelSettings - load catalog from API, render pickers, wire Save.
 *
 * @param currentClass - Active course whose llmSettings hydrate the pickers
 * @param canManage - Whether the current user may PATCH llm-settings
 */
export async function initializeModelSettings(currentClass: activeCourse, canManage: boolean): Promise<void> {
    canManageState = canManage;
    currentCourseRef = currentClass;

    const container = document.getElementById('modelSettingFeatures');
    if (container) {
        container.innerHTML = '<p class="dashboard-accordion-note">Loading model catalog…</p>';
    }

    try {
        const response = await fetch(
            `/api/courses/${encodeURIComponent(currentClass.id)}/llm-model-catalog`,
            { credentials: 'same-origin' }
        );
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(result.error || 'Failed to load model catalog');
        }
        const data = result.data as LlmModelCatalogApiResponse;
        modelCatalog = data.models ?? [];
        defaultSelection = data.defaultSelection ?? defaultSelection;
    } catch (error) {
        if (container) container.innerHTML = '';
        await showErrorModal(
            'Model Catalog Unavailable',
            error instanceof Error ? error.message : 'Failed to load model catalog.'
        );
        return;
    }

    featureSettings = hydrateFeatureSettings(currentClass.llmSettings);
    persistedSnapshot = cloneFeatureMap(featureSettings);
    renderFeatureRows();
    wireSave();
    ensureDocumentClickHandler();
}

/**
 * refreshModelSettingsVisibility - update row interactivity after capability toggles.
 *
 * Keeps in-memory selections and DOM rows so inactive shade can transition;
 * falls back to a full render when rows are missing.
 *
 * @param currentClass - Course with updated features map
 */
export function refreshModelSettingsVisibility(currentClass: activeCourse): void {
    currentCourseRef = currentClass;
    if (!featureSettings || modelCatalog.length === 0) return;

    const container = document.getElementById('modelSettingFeatures');
    if (!container?.querySelector('.model-feature-row')) {
        renderFeatureRows();
        return;
    }

    syncFeatureRowInteractivity(container);
    updateSaveButtonState();
}

/**
 * syncFeatureRowInteractivity - toggle inactive shade / picker disabled in place.
 *
 * Avoids full innerHTML replace so CSS opacity/background transitions play.
 */
function syncFeatureRowInteractivity(container: HTMLElement): void {
    for (const feature of FEATURE_CATALOG) {
        const row = container.querySelector(
            `.model-feature-row[data-feature="${feature.key}"]`
        ) as HTMLElement | null;
        if (!row) continue;

        const interactive = isFeatureInteractive(feature);
        const inactive = !interactive;
        const hintId = `model-inactive-hint-${feature.key}`;

        row.classList.toggle('model-feature-row--inactive', inactive);

        if (inactive) {
            row.setAttribute('tabindex', '0');
            row.setAttribute('aria-disabled', 'true');
            row.setAttribute('aria-describedby', hintId);
            row.setAttribute('data-inactive-hint', inactiveHintText(feature.label));
            const existingHint = row.querySelector(`#${hintId}`);
            if (existingHint) {
                existingHint.textContent = inactiveHintText(feature.label);
            } else {
                const hint = document.createElement('span');
                hint.id = hintId;
                hint.className = 'model-feature-inactive-hint';
                hint.setAttribute('role', 'tooltip');
                hint.textContent = inactiveHintText(feature.label);
                row.appendChild(hint);
            }
        } else {
            row.removeAttribute('tabindex');
            row.removeAttribute('aria-disabled');
            row.removeAttribute('aria-describedby');
            row.removeAttribute('data-inactive-hint');
            row.querySelector(`#${hintId}`)?.remove();
        }

        row.querySelectorAll<HTMLButtonElement>('.model-picker-trigger').forEach((trigger) => {
            trigger.disabled = !canManageState || !interactive;
        });
    }
}

/**
 * isFeatureInteractive - whether Model Settings pickers for this row may open.
 *
 * Chat / Scenario Generation are always interactive. Gated Extra Feature rows
 * require the matching capability enabled.
 */
function isFeatureInteractive(feature: FeatureCatalogEntry): boolean {
    if (!feature.requiresCapability) return true;
    return currentCourseRef?.features?.[feature.requiresCapability]?.enabled === true;
}

function inactiveHintText(label: string): string {
    return `${label} is deactivated`;
}

function findModelEntry(modelId: CourseLlmModelId): LlmModelDashboardCatalogEntry | undefined {
    return modelCatalog.find((m) => m.id === modelId);
}

/** Catalog rows an instructor may actually choose (server rejects the rest on PATCH). */
function selectableModels(): LlmModelDashboardCatalogEntry[] {
    return modelCatalog.filter((m) => !m.unavailable);
}

/**
 * findSelectableModelEntry - catalog lookup that refuses withheld models.
 *
 * Used wherever a model becomes the *selected* value, so an `unavailable` row can be
 * listed in the popover without ever being adopted as a feature's selection.
 */
function findSelectableModelEntry(
    modelId: CourseLlmModelId
): LlmModelDashboardCatalogEntry | undefined {
    const entry = findModelEntry(modelId);
    return entry && !entry.unavailable ? entry : undefined;
}

function defaultModelEntry(): LlmModelDashboardCatalogEntry {
    return findSelectableModelEntry(defaultSelection.modelId) ?? selectableModels()[0];
}

function hydrateFeatureSettings(stored: CourseLlmSettings | undefined): FeatureLlmSettingsMap {
    if (stored && isPerFeatureSettings(stored)) {
        return {
            chat: sanitizeSelection(stored.chat),
            scenarioGeneration: sanitizeSelection(stored.scenarioGeneration),
            writingFeedback: sanitizeSelection(stored.writingFeedback),
            guidedPathway: sanitizeSelection(stored.guidedPathway),
            memoryAgent: sanitizeSelection(stored.memoryAgent),
        };
    }

    const legacy = stored as unknown as {
        modelId?: CourseLlmModelId;
        reasoningLevel?: AppReasoningLevel;
    } | undefined;
    const seed =
        legacy?.modelId && legacy?.reasoningLevel
            ? sanitizeSelection({ modelId: legacy.modelId, reasoningLevel: legacy.reasoningLevel })
            : { ...defaultSelection };

    return {
        chat: { ...seed },
        scenarioGeneration: { ...seed },
        writingFeedback: { ...seed },
        guidedPathway: { ...seed },
        memoryAgent: { ...seed },
    };
}

function isPerFeatureSettings(stored: CourseLlmSettings): boolean {
    return Boolean(
        stored.chat &&
            stored.scenarioGeneration &&
            stored.writingFeedback &&
            stored.guidedPathway &&
            stored.memoryAgent
    );
}

/**
 * clampReasoningForModel - pick a valid app reasoning level for the selected model.
 *
 * Empty reasoningOptions (no native reasoning) → `none`.
 */
function clampReasoningForModel(
    model: LlmModelDashboardCatalogEntry,
    current: AppReasoningLevel
): AppReasoningLevel {
    const allowed = model.reasoningOptions.map((o) => o.id);
    if (allowed.length === 0) return 'none';
    if (allowed.includes(current)) return current;
    return allowed[0] ?? defaultSelection.reasoningLevel;
}

function sanitizeSelection(selection: FeatureLlmSelection | undefined): FeatureLlmSelection {
    if (!selection) return { ...defaultSelection };
    // Withheld / unknown stored models fall back — the server clamps them the same way
    const model = findSelectableModelEntry(selection.modelId) ?? defaultModelEntry();
    if (!model) return { ...defaultSelection };
    return {
        modelId: model.id,
        reasoningLevel: clampReasoningForModel(model, selection.reasoningLevel),
    };
}

function cloneFeatureMap(map: FeatureLlmSettingsMap): FeatureLlmSettingsMap {
    return {
        chat: { ...map.chat },
        scenarioGeneration: { ...map.scenarioGeneration },
        writingFeedback: { ...map.writingFeedback },
        guidedPathway: { ...map.guidedPathway },
        memoryAgent: { ...map.memoryAgent },
    };
}

function pickerId(featureKey: LlmFeatureKey, kind: PickerKind): string {
    return `${featureKey}-${kind}`;
}

function reasoningLabelFor(model: LlmModelDashboardCatalogEntry, level: AppReasoningLevel): string {
    return model.reasoningOptions.find((o) => o.id === level)?.label ?? level;
}

function renderFeatureRows(): void {
    const container = document.getElementById('modelSettingFeatures');
    if (!container || !featureSettings || modelCatalog.length === 0) return;

    closeOpenPicker();

    container.innerHTML = FEATURE_CATALOG.map((feature) => {
        const selection = featureSettings![feature.key];
        const modelEntry = findSelectableModelEntry(selection.modelId) ?? defaultModelEntry();
        const reasoningLabel = reasoningLabelFor(modelEntry, selection.reasoningLevel);
        const modelLabel = modelEntry.label;
        const interactive = isFeatureInteractive(feature);
        const inactive = !interactive;
        const hintId = `model-inactive-hint-${feature.key}`;
        const reasoningPicker =
            modelEntry.reasoningOptions.length > 0
                ? renderPickerField(
                      'Reasoning',
                      renderPickerWrap(
                          feature.key,
                          'reasoning',
                          reasoningLabel,
                          selection.reasoningLevel,
                          interactive
                      )
                  )
                : '';

        return `
        <div
            class="model-feature-row${inactive ? ' model-feature-row--inactive' : ''}"
            data-feature="${feature.key}"
            ${inactive ? `tabindex="0" aria-disabled="true" aria-describedby="${hintId}" data-inactive-hint="${escapeHtml(inactiveHintText(feature.label))}"` : ''}
        >
            <span class="model-feature-title">${escapeHtml(feature.label)}</span>
            <div class="model-feature-pickers">
                ${reasoningPicker}
                ${renderPickerField(
                    'Model',
                    renderPickerWrap(feature.key, 'model', modelLabel, selection.modelId, interactive)
                )}
            </div>
            ${
                inactive
                    ? `<span id="${hintId}" class="model-feature-inactive-hint" role="tooltip">${escapeHtml(inactiveHintText(feature.label))}</span>`
                    : ''
            }
        </div>`;
    }).join('');

    wirePickerInteractions(container);
    updateSaveButtonState();
}

/** Visible "Reasoning:" / "Model:" prefix beside each picker. */
function renderPickerField(kindLabel: string, pickerHtml: string): string {
    return `
        <div class="model-picker-field">
            <span class="model-picker-field-label">${escapeHtml(kindLabel)}:</span>
            ${pickerHtml}
        </div>`;
}

function renderPickerWrap(
    featureKey: LlmFeatureKey,
    kind: PickerKind,
    label: string,
    selectedValue: string,
    interactive: boolean
): string {
    const id = pickerId(featureKey, kind);
    const selection = featureSettings![featureKey];
    const modelEntry = findSelectableModelEntry(selection.modelId) ?? defaultModelEntry();
    const kindLabel = kind === 'reasoning' ? 'Reasoning' : 'Model';
    const canOpen = canManageState && interactive;

    const options =
        kind === 'reasoning'
            ? modelEntry.reasoningOptions
                  .map((level) => renderReasoningOption(featureKey, level, selectedValue as AppReasoningLevel))
                  .join('')
            : modelCatalog
                  .map((model) => renderModelOption(featureKey, model, selectedValue as CourseLlmModelId))
                  .join('');

    return `
        <div class="model-picker-wrap" data-picker-id="${id}">
            <button
                type="button"
                class="model-picker-trigger"
                id="trigger-${id}"
                aria-label="${escapeHtml(kindLabel)}: ${escapeHtml(label)}"
                aria-haspopup="listbox"
                aria-expanded="false"
                aria-controls="popover-${id}"
                ${canOpen ? '' : 'disabled'}
            >
                <span class="model-picker-label">${escapeHtml(label)}</span>
            </button>
            <div class="model-picker-popover" id="popover-${id}" role="listbox" hidden>
                ${options}
            </div>
        </div>`;
}

function renderModelOption(
    featureKey: LlmFeatureKey,
    model: LlmModelDashboardCatalogEntry,
    selectedId: CourseLlmModelId
): string {
    const unavailable = model.unavailable === true;
    const selected = !unavailable && model.id === selectedId;
    return `
        <button
            type="button"
            class="model-picker-option${unavailable ? ' model-picker-option--unavailable' : ''}"
            role="option"
            data-feature="${featureKey}"
            data-kind="model"
            data-value="${model.id}"
            aria-selected="${selected}"
            ${unavailable ? `disabled aria-disabled="true" title="${escapeHtml(MODEL_UNAVAILABLE_HINT)}"` : ''}
        >
            <span class="model-picker-option-title">${escapeHtml(model.label)}</span>
            ${
                unavailable
                    ? `<span class="model-picker-option-note">${escapeHtml(MODEL_UNAVAILABLE_NOTE)}</span>`
                    : `<span class="model-reasoning-brains" aria-hidden="true">${renderBrainIcons(COST_TIER_BRAIN_COUNT[model.costTier])}</span>`
            }
            ${selected ? '<span class="model-picker-option-check" aria-hidden="true">✓</span>' : ''}
        </button>`;
}

function renderReasoningOption(
    featureKey: LlmFeatureKey,
    level: LlmReasoningCatalogOption,
    selectedLevel: AppReasoningLevel
): string {
    const selected = level.id === selectedLevel;
    return `
        <button
            type="button"
            class="model-picker-option"
            role="option"
            data-feature="${featureKey}"
            data-kind="reasoning"
            data-value="${level.id}"
            aria-selected="${selected}"
        >
            <span class="model-picker-option-title">${escapeHtml(level.label)}</span>
            <span class="model-reasoning-brains" aria-hidden="true">${renderBrainIcons(REASONING_BRAIN_COUNT[level.id])}</span>
            ${selected ? '<span class="model-picker-option-check" aria-hidden="true">✓</span>' : ''}
        </button>`;
}

function wirePickerInteractions(container: HTMLElement): void {
    container.querySelectorAll<HTMLButtonElement>('.model-picker-trigger').forEach((trigger) => {
        trigger.addEventListener('click', (event) => {
            event.stopPropagation();
            if (!canManageState || trigger.disabled) return;
            const wrap = trigger.closest('.model-picker-wrap');
            const pickerIdAttr = wrap?.getAttribute('data-picker-id');
            if (!pickerIdAttr) return;
            if (openPickerId === pickerIdAttr) {
                closeOpenPicker();
            } else {
                openPicker(pickerIdAttr);
            }
        });
    });

    container.querySelectorAll<HTMLButtonElement>('.model-picker-option').forEach((option) => {
        option.addEventListener('click', (event) => {
            event.stopPropagation();
            handleOptionSelect(option);
        });
    });
}

function openPicker(id: string): void {
    closeOpenPicker();
    const popover = document.getElementById(`popover-${id}`);
    const trigger = document.getElementById(`trigger-${id}`) as HTMLButtonElement | null;
    if (!popover || !trigger) return;

    popover.hidden = false;
    popover.classList.add('is-open');
    trigger.setAttribute('aria-expanded', 'true');
    openPickerId = id;
}

function closeOpenPicker(): void {
    if (!openPickerId) return;

    const popover = document.getElementById(`popover-${openPickerId}`);
    const trigger = document.getElementById(`trigger-${openPickerId}`) as HTMLButtonElement | null;
    popover?.classList.remove('is-open');
    if (popover) popover.hidden = true;
    trigger?.setAttribute('aria-expanded', 'false');
    openPickerId = null;
}

function ensureDocumentClickHandler(): void {
    if (documentClickBound) return;
    documentClickBound = true;
    document.addEventListener('click', () => closeOpenPicker());
}

function handleOptionSelect(option: HTMLButtonElement): void {
    if (!canManageState || !featureSettings) return;

    const featureKey = option.dataset.feature as LlmFeatureKey;
    const kind = option.dataset.kind as PickerKind;
    const value = option.dataset.value;
    if (!featureKey || !kind || !value || !featureSettings[featureKey]) return;

    const catalogEntry = FEATURE_CATALOG.find((f) => f.key === featureKey);
    if (catalogEntry && !isFeatureInteractive(catalogEntry)) return;

    if (kind === 'model' && isModelId(value)) {
        featureSettings[featureKey].modelId = value;
        const model = findSelectableModelEntry(value)!;
        featureSettings[featureKey].reasoningLevel = clampReasoningForModel(
            model,
            featureSettings[featureKey].reasoningLevel
        );
    } else if (kind === 'reasoning' && isReasoningLevel(value)) {
        featureSettings[featureKey].reasoningLevel = value;
    } else {
        return;
    }

    closeOpenPicker();
    renderFeatureRows();
}

function wireSave(): void {
    const saveBtn = document.getElementById('saveModelSettings') as HTMLButtonElement | null;
    const taNote = document.getElementById('dashboard-model-ta-note');

    if (taNote) taNote.hidden = canManageState;

    saveBtn?.replaceWith(saveBtn.cloneNode(true));
    const freshSaveBtn = document.getElementById('saveModelSettings') as HTMLButtonElement | null;

    freshSaveBtn?.addEventListener('click', async () => {
        if (!canManageState || !featureSettings || !currentCourseRef || isSaving) return;

        isSaving = true;
        updateSaveButtonState();

        try {
            const response = await fetch(
                `/api/courses/${encodeURIComponent(currentCourseRef.id)}/llm-settings`,
                {
                    method: 'PATCH',
                    credentials: 'same-origin',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat: featureSettings.chat,
                        scenarioGeneration: featureSettings.scenarioGeneration,
                        writingFeedback: featureSettings.writingFeedback,
                        guidedPathway: featureSettings.guidedPathway,
                        memoryAgent: featureSettings.memoryAgent,
                    }),
                }
            );
            const result = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(result.error || 'Failed to save model settings');
            }

            const updated = result.data as activeCourse | undefined;
            if (updated?.llmSettings) {
                currentCourseRef.llmSettings = updated.llmSettings;
                featureSettings = hydrateFeatureSettings(updated.llmSettings);
            } else {
                currentCourseRef.llmSettings = {
                    ...cloneFeatureMap(featureSettings),
                };
            }
            persistedSnapshot = cloneFeatureMap(featureSettings);
            renderFeatureRows();
            showSuccessToast('Model settings saved.');
        } catch (error) {
            if (persistedSnapshot) {
                featureSettings = cloneFeatureMap(persistedSnapshot);
                renderFeatureRows();
            }
            await showErrorModal(
                'Save Failed',
                error instanceof Error ? error.message : 'Failed to save model settings.'
            );
            showErrorToast('Model settings were not changed.');
        } finally {
            isSaving = false;
            updateSaveButtonState();
        }
    });

    updateSaveButtonState();
}

function updateSaveButtonState(): void {
    const saveBtn = document.getElementById('saveModelSettings') as HTMLButtonElement | null;
    if (!saveBtn) return;

    const dirty =
        Boolean(featureSettings && persistedSnapshot) &&
        JSON.stringify(featureSettings) !== JSON.stringify(persistedSnapshot);

    saveBtn.disabled = !canManageState || isSaving || !dirty;
}

function renderBrainIcons(count: number): string {
    if (count <= 0) return '';
    const icon = `<svg class="model-brain-icon" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M12 3c-1.5 0-2.8.8-3.5 2-.6-.3-1.3-.5-2-.5C4.5 4.5 3 6 3 8c0 1.2.5 2.2 1.3 3-.8.8-1.3 1.8-1.3 3 0 2 1.5 3.5 3.5 3.5.7 0 1.4-.2 2-.5.7 1.2 2 2 3.5 2 1.5 0 2.8-.8 3.5-2 .6.3 1.3.5 2 .5 2 0 3.5-1.5 3.5-3.5 0-1.2-.5-2.2-1.3-3 .8-.8 1.3-1.8 1.3-3 0-2-1.5-3.5-3.5-3.5-.7 0-1.4.2-2 .5C14.8 3.8 13.5 3 12 3z"/></svg>`;
    return Array.from({ length: count }, () => icon).join('');
}

function isModelId(value: string): value is CourseLlmModelId {
    return selectableModels().some((m) => m.id === value);
}

function isReasoningLevel(value: string): value is AppReasoningLevel {
    return modelCatalog.some((m) => m.reasoningOptions.some((o) => o.id === value));
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
