/**
 * Shared edit modal for learning objectives and struggle topics.
 */

import { renderFeatherIcons } from '../api/api.js';
import type { CatalogKind } from '../feature/catalog-section.js';

const CATALOG_MODAL_MOUNT_ID = 'catalog-edit-modal-mount';
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

function getModalMount(): HTMLElement | null {
    let el = document.getElementById(CATALOG_MODAL_MOUNT_ID);
    if (!el) {
        el = document.createElement('div');
        el.id = CATALOG_MODAL_MOUNT_ID;
        el.setAttribute('aria-hidden', 'true');
        document.body.appendChild(el);
    }
    return el;
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
    const mount = getModalMount();
    if (!mount) {
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

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay upload-modal-overlay catalog-edit-modal-overlay struggle-review-modal-overlay';
    mount.innerHTML = '';
    mount.appendChild(overlay);
    document.body.classList.add('modal-open');

    const modal = document.createElement('div');
    modal.className = 'modal-container catalog-edit-modal struggle-review-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'catalog-edit-title');
    overlay.appendChild(modal);
    overlay.offsetHeight;
    overlay.classList.add('show');

    const header = document.createElement('div');
    header.className = 'struggle-review-header catalog-edit-header';
    const titleEl = document.createElement('h2');
    titleEl.id = 'catalog-edit-title';
    titleEl.className = 'struggle-review-title catalog-edit-title';
    titleEl.textContent = copy.title;

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'struggle-review-close-btn catalog-edit-close-btn';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.textContent = '×';

    header.appendChild(titleEl);
    header.appendChild(closeBtn);

    const body = document.createElement('div');
    body.className = 'modal-body struggle-review-body catalog-edit-body';

    const intro = document.createElement('p');
    intro.className = 'struggle-review-intro catalog-edit-intro';
    intro.textContent = `${copy.intro} Section: ${options.sectionTitle}.`;
    body.appendChild(intro);

    const list = document.createElement('ul');
    list.className = 'struggle-review-list catalog-edit-list';
    list.setAttribute('role', 'list');
    body.appendChild(list);

    const addRowBtn = document.createElement('button');
    addRowBtn.type = 'button';
    addRowBtn.className = 'catalog-edit-add-btn';
    addRowBtn.textContent = `+ ${copy.addButton}`;
    body.appendChild(addRowBtn);

    const errorBox = document.createElement('div');
    errorBox.className = 'struggle-review-error catalog-edit-error';
    errorBox.hidden = true;
    body.appendChild(errorBox);

    const footer = document.createElement('div');
    footer.className = 'modal-footer struggle-review-footer catalog-edit-footer';

    const dismissBtn = document.createElement('button');
    dismissBtn.type = 'button';
    dismissBtn.className = 'struggle-review-dismiss-btn catalog-edit-dismiss-btn';
    dismissBtn.textContent = 'Dismiss';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'struggle-review-save-btn catalog-edit-save-btn';
    saveBtn.textContent = 'Save';
    saveBtn.disabled = true;

    footer.appendChild(dismissBtn);
    footer.appendChild(saveBtn);

    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);

    const measureEl = document.createElement('span');
    measureEl.className = 'struggle-review-input-measure catalog-edit-input-measure';
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
        list.querySelectorAll<HTMLInputElement>('.catalog-edit-input').forEach((input) => {
            const wrap = input.closest('.catalog-edit-input-wrap') as HTMLElement | null;
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

    const showError = (message: string) => {
        errorBox.textContent = message;
        errorBox.hidden = false;
    };

    const clearError = () => {
        errorBox.textContent = '';
        errorBox.hidden = true;
    };

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
        const input = list.querySelector<HTMLInputElement>(`[data-row-id="${rowId}"] .catalog-edit-input`);
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
            li.className = 'struggle-review-row catalog-edit-row';
            if (animateRowId === row.id) {
                li.classList.add('catalog-edit-row-enter');
            }
            li.dataset.rowId = row.id;
            li.draggable = editingRowId === null;

            const handle = document.createElement('button');
            handle.type = 'button';
            handle.className = 'struggle-review-drag-handle catalog-edit-drag-handle';
            handle.setAttribute('aria-label', 'Drag to reorder');
            handle.setAttribute('aria-grabbed', 'false');
            handle.textContent = '⋮⋮';

            const inputWrap = document.createElement('div');
            inputWrap.className = 'struggle-review-input-wrap catalog-edit-input-wrap';

            const isEditing = editingRowId === row.id;

            if (isEditing) {
                const input = document.createElement('input');
                input.type = 'text';
                input.className = 'struggle-review-input catalog-edit-input';
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
                labelWrap.className = 'catalog-edit-label-wrap';

                const labelEl = document.createElement('span');
                labelEl.className = 'catalog-edit-label';
                labelEl.textContent = row.label || '(empty)';
                labelEl.addEventListener('dblclick', (e) => {
                    e.stopPropagation();
                    startEdit(row.id);
                });

                const penBtn = document.createElement('button');
                penBtn.type = 'button';
                penBtn.className = 'catalog-edit-pen-btn';
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
            removeBtn.className = 'struggle-review-remove-btn catalog-edit-remove-btn';
            removeBtn.innerHTML = '<i data-feather="trash-2"></i>';
            removeBtn.setAttribute('aria-label', `Remove item ${index + 1}`);
            removeBtn.addEventListener('click', () => {
                row.removed = true;
                if (editingRowId === row.id) editingRowId = null;
                renderRows();
                syncSaveState();
            });

            li.addEventListener('dragstart', (event) => {
                if (editingRowId !== null) {
                    event.preventDefault();
                    return;
                }
                dragIndex = index;
                handle.setAttribute('aria-grabbed', 'true');
                li.classList.add('dragging');
                if (event.dataTransfer) {
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', row.id);
                }
            });

            li.addEventListener('dragend', () => {
                dragIndex = null;
                handle.setAttribute('aria-grabbed', 'false');
                li.classList.remove('dragging');
                list.querySelectorAll('.drop-target').forEach((el) => el.classList.remove('drop-target'));
            });

            li.addEventListener('dragover', (event) => {
                event.preventDefault();
                if (dragIndex !== null && dragIndex !== index) {
                    li.classList.add('drop-target');
                }
            });

            li.addEventListener('dragleave', () => li.classList.remove('drop-target'));

            li.addEventListener('drop', (event) => {
                event.preventDefault();
                li.classList.remove('drop-target');
                if (dragIndex !== null && dragIndex !== index) {
                    moveRow(dragIndex, index);
                }
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

    const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            void closeModal(true);
        }
    };

    const closeModal = async (dismissed: boolean) => {
        document.removeEventListener('keydown', onKeyDown);
        listResizeObserver.disconnect();
        if (widthSyncRaf !== 0) {
            cancelAnimationFrame(widthSyncRaf);
            widthSyncRaf = 0;
        }
        overlay.classList.remove('show');
        document.body.classList.remove('modal-open');
        setTimeout(() => {
            mount.innerHTML = '';
        }, 200);
        if (dismissed && options.onDismiss) {
            await options.onDismiss();
        }
    };

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

    dismissBtn.addEventListener('click', () => void closeModal(true));
    closeBtn.addEventListener('click', () => void closeModal(true));
    document.addEventListener('keydown', onKeyDown);
    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) void closeModal(true);
    });

    renderRows();
}
