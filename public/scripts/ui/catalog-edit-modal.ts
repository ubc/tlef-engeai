/**
 * Shared edit modal for learning objectives and struggle topics.
 */

import { renderFeatherIcons } from '../api/api.js';
import type { CatalogKind } from '../feature/catalog-section.js';
import {
    attachRowDragReorder,
    createCatalogModalChrome,
    createDragHandle,
    getCatalogModalMount,
} from './catalog-modal-shell.js';

const MAX_LABEL_LENGTH = 300;

export interface CatalogEditModalOptions {
    kind: CatalogKind;
    sectionTitle: string;
    courseId: string;
    topicOrWeekId: string;
    itemId: string;
    items: Array<{ id: string; label: string }>;
    onSave?: () => void | Promise<void>;
    onDismiss?: () => void | Promise<void>;
}

interface CatalogEditRow {
    id: string;
    label: string;
    originalLabel: string;
    isNew: boolean;
    removed: boolean;
}

function catalogCopy(kind: CatalogKind): {
    title: string;
    intro: string;
    addButton: string;
    emptyError: string;
    lengthError: string;
} {
    if (kind === 'learning-objectives') {
        return {
            title: 'Edit Learning Objectives',
            intro: 'Edit, reorder, add, or remove learning objectives before saving.',
            addButton: 'Add learning objective',
            emptyError: 'Learning objective labels cannot be empty.',
            lengthError: 'Learning objective labels must be 300 characters or fewer.',
        };
    }
    return {
        title: 'Edit Struggle Topics',
        intro: 'Edit, reorder, add, or remove struggle topics before saving.',
        addButton: 'Add struggle topic',
        emptyError: 'Struggle topic labels cannot be empty.',
        lengthError: 'Struggle topic labels must be 300 characters or fewer.',
    };
}

function apiPaths(
    kind: CatalogKind,
    courseId: string,
    topicOrWeekId: string,
    itemId: string
): { base: string; reorder: string; createBody: (label: string, id: string) => object; updateBody: (label: string) => object } {
    if (kind === 'learning-objectives') {
        const base = `/api/courses/${courseId}/topic-or-week-instances/${topicOrWeekId}/items/${itemId}/objectives`;
        return {
            base,
            reorder: `${base}/reorder`,
            createBody: (label, id) => ({
                learningObjective: {
                    id,
                    LearningObjective: label,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
            }),
            updateBody: (label) => ({ updateData: { LearningObjective: label } }),
        };
    }
    const base = `/api/courses/${courseId}/topic-or-week-instances/${topicOrWeekId}/items/${itemId}/struggle-topics`;
    return {
        base,
        reorder: `${base}/reorder`,
        createBody: (label, id) => ({
            struggleTopic: {
                id,
                struggleTopic: label,
                createdAt: new Date(),
                updatedAt: new Date(),
            },
        }),
        updateBody: (label) => ({ updateData: { struggleTopic: label } }),
    };
}

function activeRows(rows: CatalogEditRow[]): CatalogEditRow[] {
    return rows.filter((row) => !row.removed);
}

function isCatalogDirty(rows: CatalogEditRow[], initialOrder: string[]): boolean {
    const visible = activeRows(rows);
    const currentOrder = visible.map((r) => r.id);

    if (visible.some((r) => r.isNew)) return true;
    if (rows.some((r) => r.removed && !r.isNew)) return true;
    if (visible.some((r) => !r.isNew && r.label.trim() !== r.originalLabel.trim())) return true;

    if (currentOrder.length !== initialOrder.length) return true;
    return currentOrder.some((id, i) => id !== initialOrder[i]);
}

function newTempId(): string {
    return `tmp-${crypto.randomUUID()}`;
}

function newServerId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export async function openCatalogEditModal(options: CatalogEditModalOptions): Promise<void> {
    if (!getCatalogModalMount()) {
        console.error('Catalog edit modal mount could not be created.');
        return;
    }

    const copy = catalogCopy(options.kind);
    const paths = apiPaths(options.kind, options.courseId, options.topicOrWeekId, options.itemId);
    const initialOrder = options.items.map((i) => i.id);

    const rows: CatalogEditRow[] = options.items.map((item) => ({
        id: item.id,
        label: item.label,
        originalLabel: item.label,
        isNew: false,
        removed: false,
    }));

    let dragIndex: number | null = null;
    let editingRowId: string | null = null;
    let animateRowId: string | null = null;

    const chrome = createCatalogModalChrome({
        title: copy.title,
        intro: `${copy.intro} Section: ${options.sectionTitle}.`,
        onDismiss: options.onDismiss,
    });

    const { modal, body, list, saveBtn, dismissBtn, closeModal, showError, clearError, registerCleanup } =
        chrome;

    const addRowBtn = document.createElement('button');
    addRowBtn.type = 'button';
    addRowBtn.className = 'catalog-modal__add';
    addRowBtn.textContent = `+ ${copy.addButton}`;
    body.insertBefore(addRowBtn, chrome.errorBox);

    const measureEl = document.createElement('span');
    measureEl.className = 'catalog-modal__input-measure';
    measureEl.setAttribute('aria-hidden', 'true');
    modal.appendChild(measureEl);

    let widthSyncRaf = 0;

    const measureInputTextWidth = (text: string): number => {
        measureEl.textContent = text.length > 0 ? text : '\u00a0';
        return measureEl.offsetWidth;
    };

    const syncInputWidth = (input: HTMLInputElement, wrap: HTMLElement): void => {
        const wrapWidth = wrap.clientWidth;
        if (wrapWidth <= 0) return;
        const halfWidth = wrapWidth * 0.5;
        const textWidth = measureInputTextWidth(input.value);
        if (textWidth < halfWidth) {
            input.style.width = '50%';
        } else {
            input.style.width = `${Math.min(textWidth + 10, wrapWidth)}px`;
        }
    };

    const syncAllInputWidths = (): void => {
        list.querySelectorAll<HTMLInputElement>('.catalog-modal__input').forEach((input) => {
            const wrap = input.closest('.catalog-modal__input-wrap') as HTMLElement | null;
            if (wrap) syncInputWidth(input, wrap);
        });
    };

    const scheduleWidthSync = (): void => {
        if (widthSyncRaf !== 0) return;
        widthSyncRaf = requestAnimationFrame(() => {
            widthSyncRaf = 0;
            syncAllInputWidths();
        });
    };

    const listResizeObserver = new ResizeObserver(() => scheduleWidthSync());
    listResizeObserver.observe(list);
    registerCleanup(() => listResizeObserver.disconnect());

    const syncSaveState = () => {
        saveBtn.disabled = !isCatalogDirty(rows, initialOrder);
        const hasEmptyNew = activeRows(rows).some((r) => r.isNew && !r.label.trim());
        addRowBtn.disabled = hasEmptyNew;
    };

    const commitEdit = (rowId: string) => {
        if (editingRowId === rowId) {
            editingRowId = null;
            renderRows();
        }
    };

    const startEdit = (rowId: string) => {
        editingRowId = rowId;
        renderRows();
        const input = list.querySelector<HTMLInputElement>(`[data-row-id="${rowId}"] .catalog-modal__input`);
        input?.focus();
        input?.select();
    };

    const moveRow = (from: number, to: number) => {
        const visible = activeRows(rows);
        if (from < 0 || from >= visible.length || to < 0 || to >= visible.length) return;
        const [moved] = visible.splice(from, 1);
        visible.splice(to, 0, moved);
        const removed = rows.filter((r) => r.removed);
        rows.length = 0;
        rows.push(...visible, ...removed);
        renderRows();
        syncSaveState();
    };

    const renderRows = () => {
        list.innerHTML = '';
        const visible = activeRows(rows);

        visible.forEach((row, index) => {
            const li = document.createElement('li');
            li.className = 'catalog-modal__row';
            if (animateRowId === row.id) {
                li.classList.add('catalog-modal__row--enter');
            }
            li.dataset.rowId = row.id;
            li.draggable = editingRowId === null;

            const handle = createDragHandle();

            const inputWrap = document.createElement('div');
            inputWrap.className = 'catalog-modal__input-wrap';

            const isEditing = editingRowId === row.id;

            if (isEditing) {
                const input = document.createElement('input');
                input.type = 'text';
                input.className = 'catalog-modal__input';
                input.value = row.label;
                input.maxLength = MAX_LABEL_LENGTH;
                input.setAttribute('aria-label', `Item ${index + 1}`);
                input.addEventListener('input', () => {
                    row.label = input.value;
                    scheduleWidthSync();
                    syncSaveState();
                });
                input.addEventListener('blur', () => commitEdit(row.id));
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        commitEdit(row.id);
                    }
                });
                inputWrap.appendChild(input);
            } else {
                const labelWrap = document.createElement('div');
                labelWrap.className = 'catalog-modal__label-wrap';

                const labelEl = document.createElement('span');
                labelEl.className = 'catalog-modal__label';
                labelEl.textContent = row.label || '(empty)';
                labelEl.addEventListener('dblclick', (e) => {
                    e.stopPropagation();
                    startEdit(row.id);
                });

                const penBtn = document.createElement('button');
                penBtn.type = 'button';
                penBtn.className = 'catalog-modal__pen';
                penBtn.setAttribute('aria-label', `Edit item ${index + 1}`);
                penBtn.innerHTML = '<i data-feather="edit-2"></i>';
                penBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    startEdit(row.id);
                });

                labelWrap.appendChild(labelEl);
                labelWrap.appendChild(penBtn);
                inputWrap.appendChild(labelWrap);
            }

            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'catalog-modal__remove';
            removeBtn.innerHTML = '<i data-feather="trash-2"></i>';
            removeBtn.setAttribute('aria-label', `Remove item ${index + 1}`);
            removeBtn.addEventListener('click', () => {
                row.removed = true;
                if (editingRowId === row.id) editingRowId = null;
                renderRows();
                syncSaveState();
            });

            attachRowDragReorder(li, index, row.id, handle, {
                canDrag: () => editingRowId === null,
                getDragIndex: () => dragIndex,
                setDragIndex: (value) => {
                    dragIndex = value;
                },
                onMove: moveRow,
                list,
            });

            li.appendChild(handle);
            li.appendChild(inputWrap);
            li.appendChild(removeBtn);
            list.appendChild(li);
        });

        if (animateRowId) {
            requestAnimationFrame(() => {
                animateRowId = null;
            });
        }

        renderFeatherIcons();
        scheduleWidthSync();
        syncSaveState();
    };

    registerCleanup(() => {
        if (widthSyncRaf !== 0) {
            cancelAnimationFrame(widthSyncRaf);
            widthSyncRaf = 0;
        }
    });

    addRowBtn.addEventListener('click', () => {
        const id = newTempId();
        rows.push({
            id,
            label: '',
            originalLabel: '',
            isNew: true,
            removed: false,
        });
        animateRowId = id;
        editingRowId = id;
        renderRows();
        syncSaveState();
    });

    saveBtn.addEventListener('click', async () => {
        if (!isCatalogDirty(rows, initialOrder)) return;

        clearError();
        const visible = activeRows(rows);

        for (const row of visible) {
            const trimmed = row.label.trim();
            if (!trimmed) {
                showError(copy.emptyError);
                return;
            }
            if (trimmed.length > MAX_LABEL_LENGTH) {
                showError(copy.lengthError);
                return;
            }
        }

        saveBtn.disabled = true;
        dismissBtn.disabled = true;
        addRowBtn.disabled = true;
        saveBtn.textContent = 'Saving...';

        try {
            const idMap = new Map<string, string>();

            for (const row of visible) {
                if (row.isNew) {
                    const serverId = newServerId();
                    const trimmed = row.label.trim();
                    const response = await fetch(paths.base, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(paths.createBody(trimmed, serverId)),
                    });
                    const result = await response.json();
                    if (!result.success) {
                        throw new Error(result.error || 'Failed to create item');
                    }
                    idMap.set(row.id, serverId);
                } else {
                    idMap.set(row.id, row.id);
                }
            }

            for (const row of rows) {
                if (row.removed && !row.isNew) {
                    const response = await fetch(`${paths.base}/${row.id}`, {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                    });
                    const result = await response.json();
                    if (!result.success) {
                        throw new Error(result.error || `Failed to delete item ${row.id}`);
                    }
                }
            }

            for (const row of visible) {
                if (row.isNew) continue;
                const trimmed = row.label.trim();
                if (trimmed !== row.originalLabel.trim()) {
                    const response = await fetch(`${paths.base}/${row.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(paths.updateBody(trimmed)),
                    });
                    const result = await response.json();
                    if (!result.success) {
                        throw new Error(result.error || `Failed to update item ${row.id}`);
                    }
                }
            }

            const finalIds = visible.map((r) => idMap.get(r.id) ?? r.id);
            const orderChanged =
                finalIds.length !== initialOrder.length ||
                finalIds.some((id, i) => id !== initialOrder[i]);

            if (finalIds.length > 0 && orderChanged) {
                const response = await fetch(paths.reorder, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ orderedIds: finalIds }),
                });
                const result = await response.json();
                if (!result.success) {
                    throw new Error(result.error || 'Failed to reorder items');
                }
            }

            if (options.onSave) {
                await options.onSave();
            }

            await closeModal(false);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to save changes';
            showError(message);
            saveBtn.disabled = false;
            dismissBtn.disabled = false;
            addRowBtn.disabled = false;
            saveBtn.textContent = 'Save';
            syncSaveState();
        }
    });

    renderRows();
}
