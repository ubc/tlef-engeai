// public/scripts/feature/model-setting.ts
/**
 * Model Settings — per-feature LLM model + reasoning pickers persisted on the course.
 *
 * Catalog (model ids, labels, costTier, app reasoning options) loads from
 * GET `/api/courses/:courseId/llm-model-catalog`. Brain icons are client-derived
 * from costTier and reasoning id — not from the API. Saves via PATCH llm-settings.
 *
 * @author: EngE-AI Team
 * @date: 2026-08-05
 * @version: 4.0.0
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

type PickerKind = 'reasoning' | 'model';

type FeatureLlmSettingsMap = Record<LlmFeatureKey, FeatureLlmSelection>;

interface FeatureCatalogEntry {
    key: LlmFeatureKey;
    label: string;
}

const FEATURE_CATALOG: FeatureCatalogEntry[] = [
    { key: 'chat', label: 'Chat' },
    { key: 'scenarioGeneration', label: 'Scenario Generation' },
    { key: 'writingFeedback', label: 'Writing Feedback' },
    { key: 'guidedPathway', label: 'Guided Pathway' },
];

/** Reasoning picker — app levels only; none = no brain icon. */
const REASONING_BRAIN_COUNT: Record<AppReasoningLevel, number> = {
    none: 0,
    low: 1,
    medium: 2,
    high: 3,
};

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
    return 'Chat, Writing Feedback, Scenario Generation, and Guided Pathway';
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

function findModelEntry(modelId: CourseLlmModelId): LlmModelDashboardCatalogEntry | undefined {
    return modelCatalog.find((m) => m.id === modelId);
}

function defaultModelEntry(): LlmModelDashboardCatalogEntry {
    return findModelEntry(defaultSelection.modelId) ?? modelCatalog[1] ?? modelCatalog[0];
}

function hydrateFeatureSettings(stored: CourseLlmSettings | undefined): FeatureLlmSettingsMap {
    if (stored && isPerFeatureSettings(stored)) {
        return {
            chat: sanitizeSelection(stored.chat),
            scenarioGeneration: sanitizeSelection(stored.scenarioGeneration),
            writingFeedback: sanitizeSelection(stored.writingFeedback),
            guidedPathway: sanitizeSelection(stored.guidedPathway),
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
    };
}

function isPerFeatureSettings(stored: CourseLlmSettings): boolean {
    return Boolean(
        stored.chat &&
            stored.scenarioGeneration &&
            stored.writingFeedback &&
            stored.guidedPathway
    );
}

function sanitizeSelection(selection: FeatureLlmSelection | undefined): FeatureLlmSelection {
    if (!selection) return { ...defaultSelection };
    const model = findModelEntry(selection.modelId) ?? defaultModelEntry();
    const allowed = model.reasoningOptions.map((o) => o.id);
    const reasoning = allowed.includes(selection.reasoningLevel)
        ? selection.reasoningLevel
        : allowed[0] ?? defaultSelection.reasoningLevel;
    return { modelId: model.id, reasoningLevel: reasoning };
}

function cloneFeatureMap(map: FeatureLlmSettingsMap): FeatureLlmSettingsMap {
    return {
        chat: { ...map.chat },
        scenarioGeneration: { ...map.scenarioGeneration },
        writingFeedback: { ...map.writingFeedback },
        guidedPathway: { ...map.guidedPathway },
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
        const modelEntry = findModelEntry(selection.modelId) ?? defaultModelEntry();
        const reasoningLabel = reasoningLabelFor(modelEntry, selection.reasoningLevel);
        const modelLabel = modelEntry.label;
        const reasoningPicker =
            modelEntry.reasoningOptions.length > 0
                ? renderPickerWrap(feature.key, 'reasoning', reasoningLabel, selection.reasoningLevel)
                : '';

        return `
        <div class="model-feature-row" data-feature="${feature.key}">
            <span class="model-feature-title">${escapeHtml(feature.label)}</span>
            <div class="model-feature-pickers">
                ${reasoningPicker}
                ${renderPickerWrap(feature.key, 'model', modelLabel, selection.modelId)}
            </div>
        </div>`;
    }).join('');

    wirePickerInteractions(container);
    updateSaveButtonState();
}

function renderPickerWrap(
    featureKey: LlmFeatureKey,
    kind: PickerKind,
    label: string,
    selectedValue: string
): string {
    const id = pickerId(featureKey, kind);
    const selection = featureSettings![featureKey];
    const modelEntry = findModelEntry(selection.modelId) ?? defaultModelEntry();

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
                aria-haspopup="listbox"
                aria-expanded="false"
                aria-controls="popover-${id}"
                ${canManageState ? '' : 'disabled'}
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
    const selected = model.id === selectedId;
    return `
        <button
            type="button"
            class="model-picker-option"
            role="option"
            data-feature="${featureKey}"
            data-kind="model"
            data-value="${model.id}"
            aria-selected="${selected}"
        >
            <span class="model-picker-option-title">${escapeHtml(model.label)}</span>
            <span class="model-reasoning-brains" aria-hidden="true">${renderBrainIcons(COST_TIER_BRAIN_COUNT[model.costTier])}</span>
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
            if (!canManageState) return;
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

    if (kind === 'model' && isModelId(value)) {
        featureSettings[featureKey].modelId = value;
        const model = findModelEntry(value)!;
        const allowed = model.reasoningOptions.map((o) => o.id);
        if (allowed.length > 0 && !allowed.includes(featureSettings[featureKey].reasoningLevel)) {
            featureSettings[featureKey].reasoningLevel = allowed[0];
        }
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
    const statusEl = ensureStatusElement();

    if (taNote) taNote.hidden = canManageState;
    if (statusEl) statusEl.textContent = '';

    saveBtn?.replaceWith(saveBtn.cloneNode(true));
    const freshSaveBtn = document.getElementById('saveModelSettings') as HTMLButtonElement | null;

    freshSaveBtn?.addEventListener('click', async () => {
        if (!canManageState || !featureSettings || !currentCourseRef || isSaving) return;

        isSaving = true;
        updateSaveButtonState();
        if (statusEl) statusEl.textContent = 'Saving…';

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
            if (statusEl) statusEl.textContent = 'Model settings saved.';
        } catch (error) {
            if (persistedSnapshot) {
                featureSettings = cloneFeatureMap(persistedSnapshot);
                renderFeatureRows();
            }
            await showErrorModal(
                'Save Failed',
                error instanceof Error ? error.message : 'Failed to save model settings.'
            );
            if (statusEl) statusEl.textContent = 'Model settings were not changed.';
        } finally {
            isSaving = false;
            updateSaveButtonState();
        }
    });

    updateSaveButtonState();
}

function ensureStatusElement(): HTMLElement | null {
    const bodyInner = document.querySelector('#dashboard-model-body .dashboard-accordion-body-inner');
    if (!bodyInner) return document.getElementById('settingsModelStatus');

    let statusEl = document.getElementById('settingsModelStatus');
    if (!statusEl) {
        statusEl = document.createElement('p');
        statusEl.id = 'settingsModelStatus';
        statusEl.className = 'dashboard-accordion-note';
        statusEl.setAttribute('aria-live', 'polite');
        const saveBtn = document.getElementById('saveModelSettings');
        if (saveBtn?.parentElement) {
            saveBtn.parentElement.insertBefore(statusEl, saveBtn.nextSibling);
        } else {
            bodyInner.appendChild(statusEl);
        }
    }
    return statusEl;
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
    return modelCatalog.some((m) => m.id === value);
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
