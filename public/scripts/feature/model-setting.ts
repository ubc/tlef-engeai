// public/scripts/feature/model-setting.ts
/**
 * Model Settings — per-feature LLM model + reasoning popover pickers (frontend preview).
 *
 * @description: Compact row layout with chat-mode-style dropdowns; Save disabled until backend supports per-feature persistence.
 */

import {
    activeCourse,
    CourseLlmModelId,
    CourseLlmSettings,
    CourseReasoningLevel,
} from '../types.js';

type LlmFeatureKey = 'chat' | 'scenarioGeneration' | 'writingFeedback' | 'guidedPathway';
type PickerKind = 'reasoning' | 'model';

interface FeatureLlmSelection {
    modelId: CourseLlmModelId;
    reasoningLevel: CourseReasoningLevel;
}

type FeatureLlmSettingsMap = Record<LlmFeatureKey, FeatureLlmSelection>;

interface ModelCatalogEntry {
    id: CourseLlmModelId;
    label: string;
    cost: string;
}

interface ReasoningCatalogEntry {
    id: CourseReasoningLevel;
    label: string;
    brains: number;
}

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

const MODEL_CATALOG: ModelCatalogEntry[] = [
    { id: 'gpt-5.6-luna', label: 'GPT 5.6 Luna', cost: '$$$' },
    { id: 'gpt-5.4-mini', label: 'GPT 5.4 Mini', cost: '$$' },
    { id: 'gpt-4o-mini', label: 'GPT 4o Mini', cost: '$' },
];

const REASONING_CATALOG: ReasoningCatalogEntry[] = [
    { id: 'low', label: 'Low', brains: 1 },
    { id: 'medium', label: 'Medium', brains: 2 },
    { id: 'high', label: 'High', brains: 3 },
];

const DEFAULT_SELECTION: FeatureLlmSelection = {
    modelId: 'gpt-5.4-mini',
    reasoningLevel: 'medium',
};

let featureSettings: FeatureLlmSettingsMap | null = null;
let canManageState = false;
let openPickerId: string | null = null;
let documentClickBound = false;

/**
 * getAffectedFeaturesCopy — short list of features that consume LLM settings.
 */
export function getAffectedFeaturesCopy(): string {
    return 'Chat, Writing Feedback, Scenario Generation, and Guided Pathway';
}

/**
 * initializeModelSettings - render per-feature popover pickers and wire preview-only state.
 */
export function initializeModelSettings(currentClass: activeCourse, canManage: boolean): void {
    canManageState = canManage;
    featureSettings = hydrateFeatureSettings(currentClass.llmSettings);
    renderFeatureRows();
    wireSavePreview();
    ensureDocumentClickHandler();
}

function hydrateFeatureSettings(stored: CourseLlmSettings | undefined): FeatureLlmSettingsMap {
    const seed: FeatureLlmSelection = stored?.modelId && stored.reasoningLevel
        ? { modelId: stored.modelId, reasoningLevel: stored.reasoningLevel }
        : { ...DEFAULT_SELECTION };

    return {
        chat: { ...seed },
        scenarioGeneration: { ...seed },
        writingFeedback: { ...seed },
        guidedPathway: { ...seed },
    };
}

function pickerId(featureKey: LlmFeatureKey, kind: PickerKind): string {
    return `${featureKey}-${kind}`;
}

function renderFeatureRows(): void {
    const container = document.getElementById('modelSettingFeatures');
    if (!container || !featureSettings) return;

    closeOpenPicker();

    container.innerHTML = FEATURE_CATALOG.map((feature) => {
        const selection = featureSettings![feature.key];
        const reasoningLabel = REASONING_CATALOG.find((r) => r.id === selection.reasoningLevel)?.label ?? 'Medium';
        const modelLabel = MODEL_CATALOG.find((m) => m.id === selection.modelId)?.label ?? 'GPT 5.4 Mini';

        return `
        <div class="model-feature-row" data-feature="${feature.key}">
            <span class="model-feature-title">${escapeHtml(feature.label)}</span>
            <div class="model-feature-pickers">
                ${renderPickerWrap(feature.key, 'reasoning', reasoningLabel, selection.reasoningLevel)}
                ${renderPickerWrap(feature.key, 'model', modelLabel, selection.modelId)}
            </div>
        </div>`;
    }).join('');

    wirePickerInteractions(container);
}

function renderPickerWrap(
    featureKey: LlmFeatureKey,
    kind: PickerKind,
    label: string,
    selectedValue: string
): string {
    const id = pickerId(featureKey, kind);
    const options =
        kind === 'reasoning'
            ? REASONING_CATALOG.map((level) => renderReasoningOption(featureKey, level, selectedValue as CourseReasoningLevel)).join('')
            : MODEL_CATALOG.map((model) => renderModelOption(featureKey, model, selectedValue as CourseLlmModelId)).join('');

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
    model: ModelCatalogEntry,
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
            <span class="model-cost">${model.cost}</span>
            ${selected ? '<span class="model-picker-option-check" aria-hidden="true">✓</span>' : ''}
        </button>`;
}

function renderReasoningOption(
    featureKey: LlmFeatureKey,
    level: ReasoningCatalogEntry,
    selectedLevel: CourseReasoningLevel
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
            <span class="model-reasoning-brains" aria-hidden="true">${renderBrainIcons(level.brains)}</span>
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
    } else if (kind === 'reasoning' && isReasoningLevel(value)) {
        featureSettings[featureKey].reasoningLevel = value;
    } else {
        return;
    }

    closeOpenPicker();
    renderFeatureRows();
}

function wireSavePreview(): void {
    const saveBtn = document.getElementById('saveModelSettings') as HTMLButtonElement | null;
    const taNote = document.getElementById('dashboard-model-ta-note');

    if (saveBtn) saveBtn.disabled = true;
    if (taNote) taNote.hidden = canManageState;
}

function renderBrainIcons(count: number): string {
    const icon = `<svg class="model-brain-icon" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M12 3c-1.5 0-2.8.8-3.5 2-.6-.3-1.3-.5-2-.5C4.5 4.5 3 6 3 8c0 1.2.5 2.2 1.3 3-.8.8-1.3 1.8-1.3 3 0 2 1.5 3.5 3.5 3.5.7 0 1.4-.2 2-.5.7 1.2 2 2 3.5 2 1.5 0 2.8-.8 3.5-2 .6.3 1.3.5 2 .5 2 0 3.5-1.5 3.5-3.5 0-1.2-.5-2.2-1.3-3 .8-.8 1.3-1.8 1.3-3 0-2-1.5-3.5-3.5-3.5-.7 0-1.4.2-2 .5C14.8 3.8 13.5 3 12 3z"/></svg>`;
    return Array.from({ length: count }, () => icon).join('');
}

function isModelId(value: string): value is CourseLlmModelId {
    return MODEL_CATALOG.some((m) => m.id === value);
}

function isReasoningLevel(value: string): value is CourseReasoningLevel {
    return REASONING_CATALOG.some((r) => r.id === value);
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
