/**
 * System Prompts Management (v2)
 *
 * Mode dropdown, structured/plain editors, manual save, download, kebab actions.
 */

import {
    activeCourse,
    ConversationModeId,
    CourseSystemPromptConfig,
    SystemPromptModule,
} from '../types.js';
import { renderFeatherIcons } from '../api/api.js';
import { showConfirmModal, showSimpleErrorModal } from '../ui/modal-overlay.js';
import { showErrorToast, showSuccessToast } from '../ui/toast-notification.js';

const RESERVED_MODULE_ID_PREFIXES = ['_system_', '_runtime_'] as const;

interface ModeStateWithDisplay {
    usePlatformDefault: boolean;
    modules: SystemPromptModule[];
    updatedAt: string;
    platformDefaultVersion?: string;
    displayModules: SystemPromptModule[];
}

interface ConfigApiResponse {
    success: boolean;
    data?: CourseSystemPromptConfig & {
        modes: {
            socratic: ModeStateWithDisplay;
            explanatory: ModeStateWithDisplay;
        };
    };
    error?: string;
}

let currentCourse: activeCourse | null = null;
let config: ConfigApiResponse['data'] | null = null;
let activeMode: ConversationModeId = 'socratic';
let activeEditor: 'structured' | 'plain' = 'structured';
let workingModules: SystemPromptModule[] = [];
let plainXmlDraft = '';
let hasUnsavedChanges = false;
let isSaving = false;
/** Aborts UI listeners from the previous mount when the component HTML is reloaded. */
let uiListenersAbort: AbortController | null = null;

const NEW_MODULE_BODY_TEMPLATE = '*Module Purpose*\nDescribe what this module controls in conversation.\n\n*Module Content*\n';

const MODULE_TEXTAREA_MAX_HEIGHT_PX = 500;

/** Grows with content up to {@link MODULE_TEXTAREA_MAX_HEIGHT_PX}, then scrolls. */
function autoResizeModuleTextarea(textarea: HTMLTextAreaElement): void {
    textarea.style.height = 'auto';
    const contentHeight = textarea.scrollHeight;
    const capped = Math.min(contentHeight, MODULE_TEXTAREA_MAX_HEIGHT_PX);
    textarea.style.height = `${capped}px`;
    textarea.classList.toggle('is-scrollable', contentHeight > MODULE_TEXTAREA_MAX_HEIGHT_PX);
}

function nextUntitledModuleId(): string {
    const untitledPattern = /^untitled_(\d+)$/i;
    let maxOrder = 0;
    for (const mod of workingModules) {
        const match = mod.id.match(untitledPattern);
        if (match) {
            maxOrder = Math.max(maxOrder, parseInt(match[1], 10));
        }
    }
    return `untitled_${maxOrder + 1}`;
}

interface SaveActiveModeOptions {
    /** Persist even when hasUnsavedChanges is false (e.g. after delete). */
    force?: boolean;
    /** Optional toast after a successful save. */
    successToast?: string;
    /** Keep these module ids expanded after re-render. */
    preserveExpandedIds?: string[];
}

interface RenderStructuredModulesOptions {
    /** Module index to show expanded (e.g. newly added). */
    expandIndex?: number;
    /** Module index to scroll into view after render. */
    scrollToIndex?: number;
    /** Module ids to show expanded (preserves accordion state across re-render). */
    expandModuleIds?: string[];
}

function getModeState(mode: ConversationModeId): ModeStateWithDisplay | null {
    return config?.modes[mode] ?? null;
}

function getDisplayModules(mode: ConversationModeId): SystemPromptModule[] {
    const modeState = getModeState(mode);
    if (!modeState) {
        return [];
    }
    if (modeState.usePlatformDefault) {
        const fromApi = modeState.displayModules;
        const fromMongo = modeState.modules;
        const source =
            fromApi && fromApi.length > 0
                ? fromApi
                : fromMongo && fromMongo.length > 0
                  ? fromMongo
                  : [];
        return [...source].sort((a, b) => a.sortOrder - b.sortOrder);
    }
    return [...modeState.modules].sort((a, b) => a.sortOrder - b.sortOrder);
}

function getModeMenuLabel(mode: ConversationModeId): string {
    const base = mode === 'socratic' ? 'Socratic' : 'Explanatory';
    return config?.defaultConversationMode === mode ? `${base} (default)` : base;
}

function modulesToPlainXml(mode: ConversationModeId, modules: SystemPromptModule[]): string {
    const sorted = [...modules].sort((a, b) => a.sortOrder - b.sortOrder);
    const body = sorted
        .map((m) => `<module id="${m.id}">\n${m.body}\n</module>`)
        .join('\n');
    return `<system_prompt mode="${mode}">\n${body}\n</system_prompt>`;
}

function getPlainContentForDownload(): string {
    if (activeEditor === 'plain') {
        const textarea = document.getElementById('system-prompt-plain-textarea') as HTMLTextAreaElement | null;
        return textarea?.value ?? plainXmlDraft;
    }
    return modulesToPlainXml(activeMode, workingModules);
}

function isReservedModuleId(id: string): boolean {
    return RESERVED_MODULE_ID_PREFIXES.some((prefix) => id.startsWith(prefix));
}

function normalizeModuleId(raw: string): string {
    return raw.trim().replace(/\s+/g, '_');
}

function validateModuleId(id: string, index: number): string | null {
    if (!id) {
        return 'Module id cannot be empty';
    }
    if (isReservedModuleId(id)) {
        return 'This id uses a reserved prefix (_system_ or _runtime_)';
    }
    const duplicate = workingModules.some((m, i) => i !== index && m.id === id);
    if (duplicate) {
        return 'Module id must be unique';
    }
    return null;
}

function setSaveStatus(text: string, className?: string): void {
    const el = document.getElementById('system-prompt-save-status');
    if (!el) {
        return;
    }
    el.textContent = text;
    el.className = 'system-prompt-save-status';
    if (className) {
        el.classList.add(className);
    }
}

function updateSaveButtonState(): void {
    const btn = document.getElementById('system-prompt-save-btn') as HTMLButtonElement | null;
    if (!btn) {
        return;
    }
    btn.disabled = !hasUnsavedChanges || isSaving;
}

function markDirty(): void {
    hasUnsavedChanges = true;
    setSaveStatus('Unsaved changes');
    updateSaveButtonState();
}

function closeAllDropdowns(): void {
    document.querySelectorAll('.system-prompt-dropdown.is-open').forEach((el) => {
        el.classList.remove('is-open');
        const trigger = el.querySelector<HTMLButtonElement>('[aria-expanded]');
        if (trigger) {
            trigger.setAttribute('aria-expanded', 'false');
        }
    });
    document.querySelectorAll('.system-prompt-menu').forEach((menu) => {
        menu.classList.add('hidden');
    });
}

function toggleDropdown(dropdownId: string): void {
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown) {
        return;
    }
    const isOpen = dropdown.classList.contains('is-open');
    closeAllDropdowns();
    if (!isOpen) {
        dropdown.classList.add('is-open');
        const menu = dropdown.querySelector('.system-prompt-menu');
        menu?.classList.remove('hidden');
        const trigger = dropdown.querySelector<HTMLButtonElement>('[aria-expanded]');
        trigger?.setAttribute('aria-expanded', 'true');
    }
}

function setupDropdownListeners(signal: AbortSignal): void {
    document.getElementById('system-prompt-mode-trigger')?.addEventListener(
        'click',
        (e) => {
            e.stopPropagation();
            toggleDropdown('system-prompt-mode-dropdown');
        },
        { signal }
    );

    document.getElementById('system-prompt-kebab-btn')?.addEventListener(
        'click',
        (e) => {
            e.stopPropagation();
            toggleDropdown('system-prompt-kebab-dropdown');
        },
        { signal }
    );

    document.addEventListener(
        'click',
        () => {
            closeAllDropdowns();
        },
        { signal }
    );

    document.addEventListener(
        'keydown',
        (e) => {
            if (e.key === 'Escape') {
                closeAllDropdowns();
            }
        },
        { signal }
    );
}

async function fetchConfig(): Promise<void> {
    if (!currentCourse?.id) {
        return;
    }
    const response = await fetch(`/api/courses/${currentCourse.id}/system-prompts/config`);
    const result = (await response.json()) as ConfigApiResponse;
    if (!result.success || !result.data) {
        throw new Error(result.error ?? 'Failed to load system prompt config');
    }
    config = result.data;
}

function resolveInitialActiveMode(data: NonNullable<ConfigApiResponse['data']>): ConversationModeId {
    const socraticDefault = data.modes.socratic.usePlatformDefault;
    const explanatoryDefault = data.modes.explanatory.usePlatformDefault;
    if (socraticDefault && !explanatoryDefault) {
        return 'socratic';
    }
    if (explanatoryDefault && !socraticDefault) {
        return 'explanatory';
    }
    return data.defaultConversationMode === 'explanatory' ? 'explanatory' : 'socratic';
}

async function restoreFromServer(): Promise<void> {
    try {
        await fetchConfig();
        syncWorkingModulesFromConfig();
        updateModeDropdownLabels();
        if (activeEditor === 'structured') {
            renderStructuredModules();
        } else {
            const textarea = document.getElementById('system-prompt-plain-textarea') as HTMLTextAreaElement | null;
            if (textarea) {
                textarea.value = plainXmlDraft;
            }
        }
        updateSaveButtonState();
    } catch (error) {
        showErrorToast(
            error instanceof Error ? error.message : 'Could not restore system prompt from server'
        );
    }
}

async function saveActiveMode(options: SaveActiveModeOptions = {}): Promise<boolean> {
    const { force = false, successToast, preserveExpandedIds } = options;

    if (!currentCourse?.id) {
        return false;
    }
    if (isSaving) {
        return false;
    }
    if (!force && !hasUnsavedChanges) {
        return true;
    }

    isSaving = true;
    setSaveStatus('Saving…', 'is-saving');
    updateSaveButtonState();

    try {
        let modules = workingModules;
        if (activeEditor === 'plain') {
            const textarea = document.getElementById('system-prompt-plain-textarea') as HTMLTextAreaElement | null;
            if (textarea) {
                plainXmlDraft = textarea.value;
            }
            const validateRes = await fetch(
                `/api/courses/${currentCourse.id}/system-prompts/config/validate-plain`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ xml: plainXmlDraft }),
                }
            );
            const validateData = (await validateRes.json()) as {
                ok?: boolean;
                modules?: SystemPromptModule[];
                warnings?: string[];
            };
            showPlainWarnings(validateData.warnings ?? [], !validateData.ok);
            if (!validateData.ok || !validateData.modules) {
                setSaveStatus('Fix plain XML', 'is-error');
                return false;
            }
            modules = validateData.modules.map((m, index) => ({
                ...m,
                sortOrder: index,
            }));
            workingModules = modules;
        }

        const response = await fetch(
            `/api/courses/${currentCourse.id}/system-prompts/config/modes/${activeMode}`,
            {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    modules,
                    usePlatformDefault: false,
                }),
            }
        );
        const result = (await response.json()) as ConfigApiResponse;
        if (!response.ok || !result.success || !result.data) {
            throw new Error(result.error ?? 'Save failed');
        }

        config = result.data;
        hasUnsavedChanges = false;
        syncWorkingModulesFromConfig();
        setSaveStatus('Saved', 'is-saved');
        updateModeDropdownLabels();
        if (activeEditor === 'structured') {
            const renderOptions: RenderStructuredModulesOptions = {};
            if (preserveExpandedIds && preserveExpandedIds.length > 0) {
                renderOptions.expandModuleIds = preserveExpandedIds;
            }
            renderStructuredModules(renderOptions);
        } else {
            const textarea = document.getElementById('system-prompt-plain-textarea') as HTMLTextAreaElement | null;
            if (textarea) {
                textarea.value = plainXmlDraft;
            }
        }
        if (successToast) {
            showSuccessToast(successToast);
        }
        updateSaveButtonState();
        return true;
    } catch (error) {
        setSaveStatus('Save failed', 'is-error');
        showErrorToast(error instanceof Error ? error.message : 'Save failed');
        updateSaveButtonState();
        return false;
    } finally {
        isSaving = false;
        updateSaveButtonState();
    }
}

function showPlainWarnings(warnings: string[], isError: boolean): void {
    const el = document.getElementById('system-prompt-plain-warnings');
    if (!el) {
        return;
    }
    if (warnings.length === 0) {
        el.classList.add('hidden');
        el.textContent = '';
        return;
    }
    el.classList.remove('hidden');
    el.textContent = (isError ? 'Validation failed: ' : 'Warnings: ') + warnings.join(' · ');
}

function syncWorkingModulesFromConfig(): void {
    workingModules = getDisplayModules(activeMode).map((m, index) => ({
        id: m.id,
        body: m.body,
        sortOrder: index,
    }));
    plainXmlDraft = modulesToPlainXml(activeMode, workingModules);
}

function updateModeDropdownLabels(): void {
    const triggerLabel = document.getElementById('system-prompt-mode-trigger-label');
    const trigger = document.getElementById('system-prompt-mode-trigger');
    const label = getModeMenuLabel(activeMode);
    if (triggerLabel) {
        triggerLabel.textContent = label;
    }
    if (trigger) {
        trigger.title = label;
    }

    document.querySelectorAll('.system-prompt-menu-item[data-mode]').forEach((item) => {
        const el = item as HTMLButtonElement;
        const mode = el.dataset.mode as ConversationModeId;
        if (mode !== 'socratic' && mode !== 'explanatory') {
            return;
        }
        const itemLabel = getModeMenuLabel(mode);
        el.textContent = itemLabel;
        el.title = itemLabel;
        const isSelected = mode === activeMode;
        el.setAttribute('aria-current', isSelected ? 'true' : 'false');
    });
}

async function syncPlainToWorkingModules(): Promise<boolean> {
    if (!currentCourse?.id) {
        return false;
    }
    const textarea = document.getElementById('system-prompt-plain-textarea') as HTMLTextAreaElement | null;
    if (textarea) {
        plainXmlDraft = textarea.value;
    }
    if (!hasUnsavedChanges) {
        return true;
    }
    const validateRes = await fetch(
        `/api/courses/${currentCourse.id}/system-prompts/config/validate-plain`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ xml: plainXmlDraft }),
        }
    );
    const validateData = (await validateRes.json()) as {
        ok?: boolean;
        modules?: SystemPromptModule[];
        warnings?: string[];
    };
    showPlainWarnings(validateData.warnings ?? [], !validateData.ok);
    if (!validateData.ok || !validateData.modules) {
        return false;
    }
    workingModules = validateData.modules.map((m, index) => ({
        ...m,
        sortOrder: index,
    }));
    return true;
}

function renderStructuredModules(options: RenderStructuredModulesOptions = {}): void {
    const list = document.getElementById('system-prompt-modules-list');
    if (!list) {
        return;
    }
    list.innerHTML = '';

    workingModules.forEach((mod, index) => {
        const card = document.createElement('div');
        card.className = 'system-prompt-module-card';
        card.dataset.index = String(index);

        const header = document.createElement('div');
        header.className = 'system-prompt-module-header';

        const chevron = document.createElement('span');
        chevron.className = 'system-prompt-module-chevron';
        chevron.setAttribute('aria-hidden', 'true');
        chevron.textContent = '\u25BE';

        const idRow = document.createElement('div');
        idRow.className = 'system-prompt-module-id-row';

        const editIcon = document.createElement('span');
        editIcon.className = 'system-prompt-module-edit-icon';
        editIcon.title = 'Edit module id';
        editIcon.innerHTML = '<i data-feather="edit-2"></i>';

        const idLabel = document.createElement('span');
        idLabel.className = 'system-prompt-module-id';
        idLabel.textContent = mod.id;

        const startIdEdit = (e: Event) => {
            e.stopPropagation();
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'system-prompt-module-id-input';
            input.value = mod.id;
            idRow.replaceChild(input, idLabel);
            input.focus();
            input.select();

            const commitId = () => {
                const normalized = normalizeModuleId(input.value);
                const err = validateModuleId(normalized, index);
                if (err) {
                    showErrorToast(err);
                    idRow.replaceChild(idLabel, input);
                    idLabel.textContent = mod.id;
                    return;
                }
                workingModules[index] = { ...workingModules[index], id: normalized };
                idLabel.textContent = normalized;
                idRow.replaceChild(idLabel, input);
                plainXmlDraft = modulesToPlainXml(activeMode, workingModules);
                markDirty();
            };

            // Defer commit so a mousedown/click on the topbar (mode/kebab) is not lost to DOM swap.
            input.addEventListener('blur', () => {
                setTimeout(commitId, 0);
            });
            input.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter') {
                    ev.preventDefault();
                    input.blur();
                }
                if (ev.key === 'Escape') {
                    ev.preventDefault();
                    idRow.replaceChild(idLabel, input);
                    idLabel.textContent = mod.id;
                }
                ev.stopPropagation();
            });
            input.addEventListener('click', (ev) => ev.stopPropagation());
        };

        editIcon.addEventListener('click', startIdEdit);

        idRow.appendChild(idLabel);

        const headerActions = document.createElement('div');
        headerActions.className = 'system-prompt-module-header-actions';

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'system-prompt-module-remove';
        removeBtn.title = 'Remove module';
        removeBtn.innerHTML = '<i data-feather="trash-2"></i>';
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            void handleRemoveModule(index);
        });

        headerActions.appendChild(editIcon);
        headerActions.appendChild(removeBtn);

        header.appendChild(chevron);
        header.appendChild(idRow);
        header.appendChild(headerActions);

        const startCollapsed =
            options.expandIndex !== index &&
            !(options.expandModuleIds?.includes(mod.id) ?? false);
        header.setAttribute('aria-expanded', startCollapsed ? 'false' : 'true');

        const bodyWrap = document.createElement('div');
        bodyWrap.className = 'system-prompt-module-body-wrap';
        if (startCollapsed) {
            bodyWrap.classList.add('is-collapsed');
        }

        const bodyInner = document.createElement('div');
        bodyInner.className = 'system-prompt-module-body-inner';

        const textarea = document.createElement('textarea');
        textarea.className = 'system-prompt-module-textarea';
        textarea.value = mod.body;
        textarea.addEventListener('input', () => {
            workingModules[index] = { ...workingModules[index], body: textarea.value };
            plainXmlDraft = modulesToPlainXml(activeMode, workingModules);
            markDirty();
            autoResizeModuleTextarea(textarea);
        });
        textarea.addEventListener('click', (ev) => ev.stopPropagation());

        bodyInner.appendChild(textarea);
        bodyWrap.appendChild(bodyInner);

        header.addEventListener('click', (e) => {
            if ((e.target as HTMLElement).closest('.system-prompt-module-header-actions')) {
                return;
            }
            if (isSaving) {
                return;
            }
            const nowCollapsed = bodyWrap.classList.toggle('is-collapsed');
            header.setAttribute('aria-expanded', nowCollapsed ? 'false' : 'true');
            if (!nowCollapsed) {
                requestAnimationFrame(() => autoResizeModuleTextarea(textarea));
            } else if (hasUnsavedChanges) {
                void saveActiveMode({ successToast: 'System prompt saved' });
            }
        });

        card.appendChild(header);
        card.appendChild(bodyWrap);
        list.appendChild(card);

        if (!startCollapsed) {
            requestAnimationFrame(() => autoResizeModuleTextarea(textarea));
        }
    });

    renderFeatherIcons();

    if (options.scrollToIndex !== undefined) {
        const scrollIndex = options.scrollToIndex;
        requestAnimationFrame(() => {
            const card = list.querySelector<HTMLElement>(
                `.system-prompt-module-card[data-index="${scrollIndex}"]`
            );
            card?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
    }
}

function switchMode(mode: ConversationModeId): void {
    if (mode === activeMode) {
        return;
    }
    activeMode = mode;
    hasUnsavedChanges = false;
    syncWorkingModulesFromConfig();
    updateModeDropdownLabels();
    if (activeEditor === 'structured') {
        renderStructuredModules();
    } else {
        const textarea = document.getElementById('system-prompt-plain-textarea') as HTMLTextAreaElement | null;
        if (textarea) {
            textarea.value = plainXmlDraft;
        }
    }
    showPlainWarnings([], false);
    setSaveStatus('');
    updateSaveButtonState();
}

async function requestModeSwitch(target: ConversationModeId): Promise<void> {
    if (target === activeMode) {
        closeAllDropdowns();
        return;
    }

    if (hasUnsavedChanges) {
        const currentLabel = getModeMenuLabel(activeMode);
        const targetLabel = getModeMenuLabel(target);
        const result = await showConfirmModal(
            'Unsaved changes',
            `You have unsaved changes in ${currentLabel}. Save before switching to ${targetLabel}?`,
            'Save and switch',
            'Cancel'
        );
        if (result.action !== 'save-and-switch') {
            closeAllDropdowns();
            return;
        }
        const saved = await saveActiveMode();
        if (!saved) {
            closeAllDropdowns();
            return;
        }
    }

    closeAllDropdowns();
    switchMode(target);
}

async function switchEditor(editor: 'structured' | 'plain'): Promise<void> {
    if (editor === activeEditor) {
        return;
    }
    if (editor === 'plain') {
        plainXmlDraft = modulesToPlainXml(activeMode, workingModules);
        const textarea = document.getElementById('system-prompt-plain-textarea') as HTMLTextAreaElement | null;
        if (textarea) {
            textarea.value = plainXmlDraft;
        }
    } else {
        const synced = await syncPlainToWorkingModules();
        if (!synced && hasUnsavedChanges) {
            return;
        }
        renderStructuredModules();
    }

    activeEditor = editor;
    document.querySelectorAll('.system-prompt-editor-tab').forEach((tab) => {
        const el = tab as HTMLButtonElement;
        const isActive = el.dataset.editor === editor;
        el.classList.toggle('active', isActive);
        el.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    document.getElementById('system-prompt-structured-panel')?.classList.toggle('hidden', editor !== 'structured');
    document.getElementById('system-prompt-plain-panel')?.classList.toggle('hidden', editor !== 'plain');
}

async function handleResetMode(): Promise<void> {
    if (!currentCourse?.id || isSaving) {
        return;
    }
    closeAllDropdowns();
    const result = await showConfirmModal(
        'Reset to defaults',
        `Reset ${getModeMenuLabel(activeMode)} to platform defaults? Your course-specific edits for this mode will be discarded.`,
        'Reset',
        'Cancel',
        'danger'
    );
    if (result.action !== 'reset') {
        return;
    }

    isSaving = true;
    setSaveStatus('Resetting…', 'is-saving');
    updateSaveButtonState();

    try {
        const response = await fetch(
            `/api/courses/${currentCourse.id}/system-prompts/config/modes/${activeMode}/reset`,
            { method: 'POST' }
        );
        const apiResult = (await response.json()) as ConfigApiResponse;
        if (!response.ok || !apiResult.success || !apiResult.data) {
            throw new Error(apiResult.error ?? 'Reset failed');
        }
        const resetModeState = apiResult.data.modes[activeMode];
        if (!resetModeState.usePlatformDefault) {
            throw new Error('Reset did not apply on server');
        }

        config = apiResult.data;
        hasUnsavedChanges = false;
        syncWorkingModulesFromConfig();
        if (getDisplayModules(activeMode).length === 0) {
            throw new Error('Reset succeeded but platform defaults could not be loaded for display');
        }
        updateModeDropdownLabels();
        if (activeEditor === 'structured') {
            renderStructuredModules();
        } else {
            const textarea = document.getElementById('system-prompt-plain-textarea') as HTMLTextAreaElement | null;
            if (textarea) {
                textarea.value = plainXmlDraft;
            }
        }
        setSaveStatus('Saved', 'is-saved');
        showSuccessToast('System prompt reset to platform defaults');
    } catch (error) {
        setSaveStatus('Reset failed', 'is-error');
        showErrorToast(error instanceof Error ? error.message : 'Reset failed');
    } finally {
        isSaving = false;
        updateSaveButtonState();
    }
}

async function handleSetDefaultChatMode(): Promise<void> {
    if (!currentCourse?.id) {
        return;
    }
    closeAllDropdowns();
    const result = await showConfirmModal(
        'Set default for new chats',
        `Set ${getModeMenuLabel(activeMode)} as the default conversation mode for new student chats? Students can still change mode per chat.`,
        'Set default',
        'Cancel'
    );
    if (result.action !== 'set-default') {
        return;
    }

    const response = await fetch(
        `/api/courses/${currentCourse.id}/system-prompts/config/default-conversation-mode`,
        {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: activeMode }),
        }
    );
    const apiResult = (await response.json()) as ConfigApiResponse;
    if (!apiResult.success || !apiResult.data) {
        showErrorToast(apiResult.error ?? 'Failed to set default mode');
        return;
    }
    config = apiResult.data;
    updateModeDropdownLabels();
    showSuccessToast(`${getModeMenuLabel(activeMode)} is now the default for new chats`);
}

function handleDownload(): void {
    closeAllDropdowns();
    const content = getPlainContentForDownload();
    const courseId = currentCourse?.id ?? 'course';
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `system-prompt-${activeMode}-${courseId}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
}

function handleAddModule(): void {
    const newIndex = workingModules.length;
    workingModules.push({
        id: nextUntitledModuleId(),
        body: NEW_MODULE_BODY_TEMPLATE,
        sortOrder: newIndex,
    });
    plainXmlDraft = modulesToPlainXml(activeMode, workingModules);
    if (activeEditor === 'structured') {
        renderStructuredModules({ expandIndex: newIndex, scrollToIndex: newIndex });
    } else {
        const textarea = document.getElementById('system-prompt-plain-textarea') as HTMLTextAreaElement | null;
        if (textarea) {
            textarea.value = plainXmlDraft;
        }
    }
    markDirty();
}

async function handleRemoveModule(index: number): Promise<void> {
    const result = await showConfirmModal(
        'Remove module',
        'Remove this module from the system prompt?',
        'Remove',
        'Cancel',
        'danger'
    );
    if (result.action !== 'remove') {
        return;
    }
    workingModules.splice(index, 1);
    workingModules = workingModules.map((m, i) => ({ ...m, sortOrder: i }));
    plainXmlDraft = modulesToPlainXml(activeMode, workingModules);
    hasUnsavedChanges = true;
    const saved = await saveActiveMode({ force: true });
    if (!saved) {
        await restoreFromServer();
    }
}

function setupEventListeners(): void {
    uiListenersAbort?.abort();
    uiListenersAbort = new AbortController();
    const { signal } = uiListenersAbort;

    setupDropdownListeners(signal);

    document.querySelectorAll('.system-prompt-menu-item[data-mode]').forEach((item) => {
        item.addEventListener(
            'click',
            (e) => {
                e.stopPropagation();
                const mode = (item as HTMLButtonElement).dataset.mode as ConversationModeId;
                if (mode === 'socratic' || mode === 'explanatory') {
                    void requestModeSwitch(mode);
                }
            },
            { signal }
        );
    });

    document.querySelectorAll('.system-prompt-menu-item[data-kebab-action]').forEach((item) => {
        item.addEventListener(
            'click',
            (e) => {
                e.stopPropagation();
                const action = (item as HTMLButtonElement).dataset.kebabAction;
                if (action === 'reset') {
                    void handleResetMode();
                } else if (action === 'set-default') {
                    void handleSetDefaultChatMode();
                }
            },
            { signal }
        );
    });

    document.getElementById('system-prompt-download-btn')?.addEventListener(
        'click',
        () => {
            handleDownload();
        },
        { signal }
    );

    document.querySelectorAll('.system-prompt-editor-tab').forEach((tab) => {
        tab.addEventListener(
            'click',
            () => {
                const editor = (tab as HTMLButtonElement).dataset.editor as 'structured' | 'plain';
                if (editor === 'structured' || editor === 'plain') {
                    void switchEditor(editor);
                }
            },
            { signal }
        );
    });

    document.getElementById('system-prompt-save-btn')?.addEventListener(
        'click',
        () => {
            void saveActiveMode();
        },
        { signal }
    );

    document.getElementById('system-prompt-add-module-btn')?.addEventListener(
        'click',
        () => {
            handleAddModule();
        },
        { signal }
    );

    const plainTextarea = document.getElementById('system-prompt-plain-textarea') as HTMLTextAreaElement | null;
    plainTextarea?.addEventListener(
        'input',
        () => {
            plainXmlDraft = plainTextarea.value;
            markDirty();
        },
        { signal }
    );
}

export async function initializeSystemPrompts(course: activeCourse): Promise<void> {
    currentCourse = course;

    if (!course.id || course.id.trim() === '') {
        await showSimpleErrorModal(
            'Cannot load system prompts: Course ID is missing. Please refresh the page.',
            'Initialization Error'
        );
        return;
    }

    setupEventListeners();

    try {
        await fetchConfig();
        activeMode = resolveInitialActiveMode(config!);
        syncWorkingModulesFromConfig();
        updateModeDropdownLabels();
        renderStructuredModules();
        updateSaveButtonState();
        renderFeatherIcons();
    } catch (error) {
        await showSimpleErrorModal(
            error instanceof Error ? error.message : 'Failed to load system prompts',
            'Load Error'
        );
    }
}

export async function flushSystemPromptOnLeave(): Promise<void> {
    if (!hasUnsavedChanges) {
        return;
    }
    const saved = await saveActiveMode();
    if (!saved) {
        showErrorToast('Could not save system prompt changes before leaving');
    }
}

export function hasUnsavedSystemPromptChanges(): boolean {
    return hasUnsavedChanges;
}

export function resetUnsavedSystemPromptChanges(): void {
    hasUnsavedChanges = false;
    setSaveStatus('');
    updateSaveButtonState();
}
