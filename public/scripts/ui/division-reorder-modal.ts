/**
 * Reorder-only modal for top-level topic/week instances.
 */

import {
    attachRowDragReorder,
    createCatalogModalChrome,
    createDragHandle,
    getCatalogModalMount,
    isOrderDirty,
} from './catalog-modal-shell.js';

export interface DivisionReorderSaveResult {
    orderedIds: string[];
    changed: boolean;
}

export interface DivisionReorderModalOptions {
    courseId: string;
    frameType: 'byWeek' | 'byTopic';
    instances: Array<{ id: string; title: string; sectionCount: number }>;
    onSave?: (result: DivisionReorderSaveResult) => void | Promise<void>;
    onDismiss?: () => void | Promise<void>;
}

interface DivisionRow {
    id: string;
    title: string;
    sectionCount: number;
}

function divisionCopy(frameType: 'byWeek' | 'byTopic'): { title: string; intro: string } {
    if (frameType === 'byWeek') {
        return {
            title: 'Arrange Weeks',
            intro: 'Drag weeks to reorder them. Changes apply when you click Save.',
        };
    }
    return {
        title: 'Arrange Topics',
        intro: 'Drag topics to reorder them. Changes apply when you click Save.',
    };
}

function sectionCountLabel(count: number): string {
    return count === 1 ? '1 section' : `${count} sections`;
}

export async function openDivisionReorderModal(options: DivisionReorderModalOptions): Promise<void> {
    const mount = getCatalogModalMount();
    if (!mount) {
        console.error('Division reorder modal mount could not be created.');
        return;
    }

    const copy = divisionCopy(options.frameType);
    const initialOrder = options.instances.map((i) => i.id);
    const rows: DivisionRow[] = options.instances.map((instance) => ({ ...instance }));

    let dragIndex: number | null = null;

    const chrome = createCatalogModalChrome({
        title: copy.title,
        intro: copy.intro,
        titleId: 'division-reorder-title',
        variant: 'division',
        onDismiss: options.onDismiss,
    });

    const { list, saveBtn, dismissBtn, closeModal, showError, clearError } = chrome;

    const syncSaveState = () => {
        saveBtn.disabled = !isOrderDirty(
            initialOrder,
            rows.map((r) => r.id)
        );
    };

    const moveRow = (from: number, to: number) => {
        if (from < 0 || from >= rows.length || to < 0 || to >= rows.length) return;
        const [moved] = rows.splice(from, 1);
        rows.splice(to, 0, moved);
        renderRows();
        syncSaveState();
    };

    const renderRows = () => {
        list.innerHTML = '';

        rows.forEach((row, index) => {
            const li = document.createElement('li');
            li.className = 'catalog-modal__row catalog-modal__row--division';
            li.dataset.rowId = row.id;
            li.draggable = true;

            const handle = createDragHandle();

            const titleEl = document.createElement('span');
            titleEl.className = 'catalog-modal__label';
            titleEl.textContent = row.title;

            const meta = document.createElement('span');
            meta.className = 'catalog-modal__meta';
            meta.textContent = sectionCountLabel(row.sectionCount);

            attachRowDragReorder(li, index, row.id, handle, {
                canDrag: () => true,
                getDragIndex: () => dragIndex,
                setDragIndex: (value) => {
                    dragIndex = value;
                },
                onMove: moveRow,
                list,
            });

            li.appendChild(handle);
            li.appendChild(titleEl);
            li.appendChild(meta);
            list.appendChild(li);
        });

        syncSaveState();
    };

    saveBtn.addEventListener('click', async () => {
        if (!isOrderDirty(initialOrder, rows.map((r) => r.id))) return;

        clearError();
        saveBtn.disabled = true;
        dismissBtn.disabled = true;
        saveBtn.textContent = 'Saving...';

        try {
            const orderedIds = rows.map((r) => r.id);
            const response = await fetch(
                `/api/courses/${options.courseId}/topic-or-week-instances/reorder`,
                {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ orderedIds }),
                }
            );
            const result = await response.json();
            if (!result.success) {
                throw new Error(result.error || 'Failed to reorder weeks/topics');
            }

            if (options.onSave) {
                await options.onSave({
                    orderedIds,
                    changed: result.changed !== false,
                });
            }

            await closeModal(false);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to save changes';
            showError(message);
            saveBtn.disabled = false;
            dismissBtn.disabled = false;
            saveBtn.textContent = 'Save';
            syncSaveState();
        }
    });

    renderRows();
}
